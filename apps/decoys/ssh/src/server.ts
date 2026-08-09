import { randomUUID } from 'node:crypto';
import type { DeceptionEvent } from '@chimera/shared';
import type { Logger } from 'pino';
import ssh2 from 'ssh2';
import type { Connection, Server } from 'ssh2';
import {
  buildAuthAttemptEvent,
  buildConnectionEvent,
  buildDisconnectEvent,
  type SshSession,
} from './events.js';
import { loadHostKey } from './hostkey.js';
import { runExec, runFakeShell } from './shell.js';

export interface SshDecoyOptions {
  port: number;
  decoyId: string;
  publish: (event: DeceptionEvent) => void;
  log: Logger;
  ident?: string;
}

/**
 * Start the SSH honeypot. Accepts password logins into a fake shell; captures
 * authentication attempts, typed commands, and the session lifecycle.
 */
export function startSshDecoy(opts: SshDecoyOptions): Server {
  const hostKey = loadHostKey();

  const server = new ssh2.Server(
    { hostKeys: [hostKey], ident: opts.ident ?? 'OpenSSH_8.9p1' },
    (client, info) => handleClient(client, info, opts),
  );

  server.on('error', (err: Error) => opts.log.error({ err }, 'ssh server error'));
  server.listen(opts.port, '0.0.0.0', () => {
    opts.log.info({ port: opts.port }, 'ssh decoy listening');
  });

  return server;
}

function handleClient(
  client: Connection,
  info: { ip: string; port: number },
  opts: SshDecoyOptions,
): void {
  const session: SshSession = {
    sessionId: randomUUID(),
    decoyId: opts.decoyId,
    sourceIp: info.ip,
    sourcePort: info.port,
  };
  let username = 'root';

  // Emit the disconnect event exactly once when the session ends.
  let disconnected = false;
  const emitDisconnect = (): void => {
    if (disconnected) return;
    disconnected = true;
    safePublish(opts, buildDisconnectEvent(session));
  };

  safePublish(opts, buildConnectionEvent(session));

  client.on('authentication', (ctx) => {
    if (ctx.method === 'password') {
      username = ctx.username || 'root';
      safePublish(
        opts,
        buildAuthAttemptEvent(session, {
          username: ctx.username,
          password: ctx.password,
          method: 'password',
        }),
      );
      // Grant the login so the attacker enters the fake shell (creds captured
      // above). The shell never executes anything — see shell.ts.
      ctx.accept();
      return;
    }
    // Funnel every other method toward password so credentials get captured.
    ctx.reject(['password']);
  });

  client.on('ready', () => {
    client.on('session', (accept) => {
      const sshSession = accept();
      sshSession.on('pty', (ptyAccept) => ptyAccept());
      sshSession.on('shell', (shellAccept) => {
        runFakeShell(shellAccept(), {
          session,
          username,
          emit: (event) => safePublish(opts, event),
          onEnd: emitDisconnect,
        });
      });
      sshSession.on('exec', (execAccept, _reject, execInfo) => {
        runExec(execAccept(), session, username, execInfo.command, (event) =>
          safePublish(opts, event),
        );
        emitDisconnect();
      });
    });
  });

  client.on('close', emitDisconnect);
  client.on('end', emitDisconnect);
  client.on('error', (err: Error) =>
    opts.log.warn({ err, ip: session.sourceIp }, 'ssh client error'),
  );
}

/** Publishing must never take down the honeypot — log and continue. */
function safePublish(opts: SshDecoyOptions, event: DeceptionEvent): void {
  try {
    opts.publish(event);
  } catch (err) {
    opts.log.error({ err }, 'failed to publish captured event; continuing');
  }
}
