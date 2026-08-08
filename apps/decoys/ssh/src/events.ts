import { randomUUID } from 'node:crypto';
import type { DeceptionEvent, EventKind } from '@chimera/shared';

/**
 * Single source of truth for constructing the SSH honeypot's DeceptionEvents
 * (connection, auth attempt, command, disconnect).
 */

export interface SshSession {
  sessionId: string;
  decoyId: string;
  sourceIp: string;
  sourcePort?: number;
}

const MAX_FIELD = 512;
const clamp = (value: string): string =>
  value.length > MAX_FIELD ? value.slice(0, MAX_FIELD) : value;

function sshEvent(
  session: SshSession,
  kind: EventKind,
  payload: Record<string, unknown>,
): DeceptionEvent {
  return {
    id: randomUUID(),
    decoyId: session.decoyId,
    decoyType: 'ssh',
    kind,
    sourceIp: session.sourceIp,
    sourcePort: session.sourcePort,
    timestamp: new Date().toISOString(),
    payload: { sessionId: session.sessionId, ...payload },
  };
}

export function buildConnectionEvent(session: SshSession): DeceptionEvent {
  return sshEvent(session, 'connection', {});
}

export function buildAuthAttemptEvent(
  session: SshSession,
  attempt: { username: string; password: string; method?: string },
): DeceptionEvent {
  return sshEvent(session, 'auth_attempt', {
    username: clamp(attempt.username),
    password: clamp(attempt.password),
    method: attempt.method ?? 'password',
  });
}

export function buildCommandEvent(session: SshSession, command: string): DeceptionEvent {
  return sshEvent(session, 'command', { command: clamp(command) });
}

export function buildDisconnectEvent(session: SshSession): DeceptionEvent {
  return sshEvent(session, 'disconnect', {});
}
