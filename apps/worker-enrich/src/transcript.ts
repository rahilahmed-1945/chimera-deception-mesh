import type { DeceptionEventParsed } from '@chimera/shared';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { db, decoys, events } from './db.js';
import { putTranscript } from './storage.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface SessionRow {
  id: string;
  kind: string;
  sourceIp: string;
  createdAt: Date;
  payload: unknown;
}

const pstr = (payload: unknown, key: string): string | undefined => {
  const v = (payload as Record<string, unknown> | null | undefined)?.[key];
  return typeof v === 'string' ? v : undefined;
};

// Deterministic, tenant-scoped key -> re-processing overwrites the same object.
const transcriptKeyFor = (tenantId: string, sessionId: string): string =>
  `transcripts/${tenantId}/${sessionId}.txt`;

async function loadSessionEvents(tenantId: string, sessionId: string): Promise<SessionRow[]> {
  return db
    .select({
      id: events.id,
      kind: events.kind,
      sourceIp: events.sourceIp,
      createdAt: events.createdAt,
      payload: events.payload,
    })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), sql`${events.payload}->>'sessionId' = ${sessionId}`))
    .orderBy(asc(events.createdAt), asc(events.id));
}

/** Assemble a human-readable transcript from persisted command events only. */
function buildTranscript(rows: SessionRow[], sessionId: string): string {
  const commands = rows.filter((r) => r.kind === 'command');
  const username = pstr(rows.find((r) => r.kind === 'auth_attempt')?.payload, 'username') ?? 'root';
  const sourceIp = rows[0]?.sourceIp ?? 'unknown';
  const started = rows[0]?.createdAt?.toISOString() ?? '';
  const disconnect = rows.find((r) => r.kind === 'disconnect');
  const ended =
    disconnect?.createdAt?.toISOString() ?? rows[rows.length - 1]?.createdAt?.toISOString() ?? '';
  const symbol = username === 'root' ? '#' : '$';
  const prompt = `${username}@chimera:~${symbol} `;

  const header = [
    'CHIMERA SSH SESSION',
    '===================',
    `Session: ${sessionId}`,
    `Source:  ${sourceIp}`,
    `Started: ${started}`,
    `Ended:   ${ended}`,
    `Commands: ${commands.length}`,
    '(Note: this decoy captures typed commands, not command output.)',
    '',
  ];
  const body = commands.map((c) => `${prompt}${pstr(c.payload, 'command') ?? ''}`);
  return [...header, ...body].join('\n') + '\n';
}

/**
 * On session end (a `disconnect` event) assemble the ordered command events for
 * the session into a transcript, store it in object storage, and persist the
 * transcript_key across the session's event rows. Idempotent.
 */
export async function storeTranscript(event: DeceptionEventParsed, log: Logger): Promise<void> {
  const sessionId = pstr(event.payload, 'sessionId');
  if (!sessionId) return;

  const [decoy] = await db
    .select({ tenantId: decoys.tenantId })
    .from(decoys)
    .where(eq(decoys.id, event.decoyId))
    .limit(1);
  if (!decoy) {
    log.warn({ decoyId: event.decoyId }, 'unknown decoy; skipping transcript');
    return;
  }
  const tenantId = decoy.tenantId;

  // Idempotency: if this session already has a transcript, do nothing.
  const [existing] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        sql`${events.payload}->>'sessionId' = ${sessionId}`,
        isNotNull(events.transcriptKey),
      ),
    )
    .limit(1);
  if (existing) {
    log.info({ sessionId }, 'transcript already stored; skipping');
    return;
  }

  // The worker may reach `disconnect` before the API has persisted the last
  // commands (both consume the same ordered stream). Wait for a stable count.
  let rows = await loadSessionEvents(tenantId, sessionId);
  for (let attempt = 0; attempt < 6; attempt++) {
    const before = rows.filter((r) => r.kind === 'command').length;
    await sleep(300);
    rows = await loadSessionEvents(tenantId, sessionId);
    if (rows.filter((r) => r.kind === 'command').length === before) break;
  }

  const key = transcriptKeyFor(tenantId, sessionId);
  await putTranscript(key, buildTranscript(rows, sessionId));

  // Persist transcript_key ONLY on this session's rows; other fields untouched.
  await db
    .update(events)
    .set({ transcriptKey: key })
    .where(and(eq(events.tenantId, tenantId), sql`${events.payload}->>'sessionId' = ${sessionId}`));

  log.info(
    { sessionId, key, commands: rows.filter((r) => r.kind === 'command').length },
    'transcript stored',
  );
}
