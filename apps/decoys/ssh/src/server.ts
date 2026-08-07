import { randomUUID } from 'node:crypto';
import type { DeceptionEvent } from '@chimera/shared';
import type { Logger } from 'pino';
import ssh2 from 'ssh2';
import type { Connection, Server } from 'ssh2';
import { buildAuthAttemptEvent, buildConnectionEvent, type SshSession } from './events.js';
import { loadHostKey } from './hostkey.js';

export interface SshDecoyOptions {
  port: number;
  decoyId: string;
  publish: (event: DeceptionEvent) => void;
  log: Logger;
  ident?: string;
}

/** Start the SSH honeypot. Rejects all authentication; captures every attempt. */
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

  safePublish(opts, buildConnectionEvent(session));

  client.on('authentication', (ctx) => {
    if (ctx.method === 'password') {
      safePublish(
        opts,
        buildAuthAttemptEvent(session, {
          username: ctx.username,
          password: ctx.password,
          method: 'password',
        }),
      );
      ctx.reject();
      return;
    }
    // Funnel every other method toward password so credentials get captured.
    ctx.reject(['password']);
  });

  client.on('error', (err: Error) =>
    opts.log.warn({ err, ip: session.sourceIp }, 'ssh client error'),
  );
  // 'disconnect' events are deferred to a later milestone (decision).
}

/** Publishing must never take down the honeypot — log and continue. */
function safePublish(opts: SshDecoyOptions, event: DeceptionEvent): void {
  try {
    opts.publish(event);
  } catch (err) {
    opts.log.error({ err }, 'failed to publish captured event; continuing');
  }
}
