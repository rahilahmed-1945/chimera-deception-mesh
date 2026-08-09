import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  connectNats,
  publishEvent,
  type NatsConnection,
} from '../../packages/transport/src/index.js';
import { parseDeceptionEvent } from '../../packages/shared/src/index.js';
import {
  buildConnectionEvent,
  buildAuthAttemptEvent,
  buildCommandEvent,
  buildDisconnectEvent,
  type SshSession,
} from '../../apps/decoys/ssh/src/events.js';

// P13 — Demo replay. Re-plays REAL captured SSH sessions through the SAME
// pipeline as the live decoys: publishEvent -> NATS -> API ingest -> Postgres ->
// worker -> WebSocket. Nothing is fabricated: sessions come from the bundled
// fixture (infra/demo/sessions.json, exported by export-session.ts) or, with
// --from-db, are read live from Postgres. Every session gets a FRESH sessionId
// and every event a FRESH id, so replays never collide with real captures or
// each other. The only added fields are payload.source='replay' and
// payload.replayId. Commands are DATA and are never executed.
//
//   pnpm demo:replay                 # replay each fixture session once, then exit
//   pnpm demo:replay --from-db       # replay recent real sessions read from Postgres
//   pnpm demo:replay --count=6       # replay 6 sessions (cycling the set), hard-capped
//   pnpm demo:replay --limit=5       # (with --from-db) how many recent sessions to read

const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';
// The real ssh decoy these sessions belong to; ingest resolves tenant from it.
const DECOY_ID = process.env.DEMO_DECOY_ID ?? '00000000-0000-0000-0000-0000000000d1';

const GAP_MIN = 150; // clamp: keep the feed readable, never faster than real
const GAP_MAX = 2500; // clamp: never stall the demo on a long real pause
const SESSION_GAP = 1200; // pause between sessions
const HARD_CAP = 100; // absolute upper bound on sessions per invocation, ever

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const fromDb = process.argv.includes('--from-db');
const limit = Math.min(20, Math.max(1, Number(arg('limit') ?? '3')));
const countArg = arg('count');

interface ReplaySession {
  sourceSessionId: string;
  sourceIp: string;
  sourcePort: number | null;
  decoyType: 'ssh';
  username: string;
  password: string;
  method: string;
  commands: string[];
  gapsMs: number[];
}

let stopping = false;
const timers = new Set<ReturnType<typeof setTimeout>>();

function sleep(ms: number): Promise<void> {
  return new Promise((res) => {
    const t = setTimeout(() => {
      timers.delete(t);
      res();
    }, ms);
    timers.add(t);
  });
}

const clampGap = (ms: number): number =>
  Math.min(GAP_MAX, Math.max(GAP_MIN, Math.round(ms) || GAP_MIN));

function loadFromFixture(): ReplaySession[] {
  const p = resolve(dirname(fileURLToPath(import.meta.url)), 'sessions.json');
  const doc = JSON.parse(readFileSync(p, 'utf8')) as { sessions: ReplaySession[] };
  return doc.sessions ?? [];
}

async function loadFromDb(): Promise<ReplaySession[]> {
  // Lazy import so the fixture path never touches Postgres/env.
  const { db, sql } = await import('../../apps/api/src/db/client.js');
  const recent = (await db.execute(sql`
    select payload->>'sessionId' as sid
    from events
    where payload->>'sessionId' is not null
      and (payload->>'source') is distinct from 'replay'
    group by payload->>'sessionId'
    order by max(created_at) desc
    limit ${limit}
  `)) as unknown as Array<{ sid: string }>;

  const out: ReplaySession[] = [];
  for (const { sid } of recent) {
    const rows = (await db.execute(sql`
      select kind, source_ip, source_port, payload,
             extract(epoch from created_at) * 1000 as ms
      from events
      where payload->>'sessionId' = ${sid}
      order by created_at asc, id asc
    `)) as unknown as Array<{
      kind: string;
      source_ip: string;
      source_port: number | null;
      payload: Record<string, unknown>;
      ms: string;
    }>;
    if (rows.length === 0) continue;
    const auth = rows.find((r) => r.kind === 'auth_attempt');
    const commands = rows
      .filter((r) => r.kind === 'command')
      .map((r) => String(r.payload?.command ?? ''));
    const times = rows.map((r) => Number(r.ms));
    const gapsMs = times.slice(1).map((t, i) => Math.max(0, Math.round(t - times[i])));
    out.push({
      sourceSessionId: sid,
      sourceIp: rows[0].source_ip,
      sourcePort: rows[0].source_port ?? null,
      decoyType: 'ssh',
      username: String(auth?.payload?.username ?? 'root'),
      password: String(auth?.payload?.password ?? ''),
      method: String(auth?.payload?.method ?? 'password'),
      commands,
      gapsMs,
    });
  }
  return out;
}

async function replaySession(nc: NatsConnection, s: ReplaySession): Promise<number> {
  const replayId = randomUUID();
  const session: SshSession = {
    sessionId: randomUUID(), // fresh — never reuses the captured sessionId
    decoyId: DECOY_ID,
    sourceIp: s.sourceIp,
    sourcePort: s.sourcePort ?? undefined,
  };

  // Canonical ordering, built with the REAL decoy builders: connection ->
  // auth_attempt -> command(s) -> disconnect. Each step is built just before it
  // is emitted so its wire timestamp reflects the emit moment (the persisted
  // createdAt comes from the DB at ingest regardless).
  const steps: Array<() => ReturnType<typeof buildConnectionEvent>> = [
    () => buildConnectionEvent(session),
    () =>
      buildAuthAttemptEvent(session, {
        username: s.username,
        password: s.password,
        method: s.method,
      }),
    ...s.commands.map((c) => () => buildCommandEvent(session, c)),
    () => buildDisconnectEvent(session),
  ];

  let emitted = 0;
  for (let i = 0; i < steps.length; i++) {
    if (stopping) break;
    if (i > 0) await sleep(clampGap(s.gapsMs[i - 1] ?? GAP_MIN));
    if (stopping) break;
    const evt = steps[i]();
    evt.payload = { ...evt.payload, source: 'replay', replayId };
    parseDeceptionEvent(evt); // validate against the shared schema (throws if bad)
    publishEvent(nc, evt);
    emitted++;
  }
  return emitted;
}

async function main(): Promise<void> {
  const all = fromDb ? await loadFromDb() : loadFromFixture();
  if (all.length === 0) {
    console.error(
      fromDb
        ? 'No real sessions found in Postgres to replay.'
        : 'No sessions in infra/demo/sessions.json — run `pnpm demo:export` first.',
    );
    process.exit(1);
  }

  // Bounded plan: default replays each session once; --count N cycles the set up
  // to N, hard-capped at HARD_CAP. No infinite loop, ever.
  const requested = countArg ? Math.max(1, Number(countArg)) : all.length;
  const total = Math.min(HARD_CAP, requested);
  const plan: ReplaySession[] = [];
  for (let i = 0; i < total; i++) plan.push(all[i % all.length]);

  const nc = await connectNats(NATS_URL, 'demo-replay');
  const onSignal = (): void => {
    stopping = true;
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  console.log(
    `Replaying ${plan.length} real captured session(s) (source=${fromDb ? 'postgres' : 'fixture'}) via NATS ${NATS_URL} …`,
  );

  let sessions = 0;
  let commands = 0;
  for (let i = 0; i < plan.length; i++) {
    if (stopping) break;
    const s = plan[i];
    const emitted = await replaySession(nc, s);
    if (stopping && emitted < s.commands.length + 3) {
      console.log(`  interrupted during session ${i + 1}`);
      break;
    }
    sessions++;
    commands += s.commands.length;
    console.log(
      `  session ${i + 1}/${plan.length}: ${s.username}@${s.sourceIp} · ${s.commands.length} command(s)`,
    );
    if (i < plan.length - 1 && !stopping) await sleep(SESSION_GAP);
  }

  for (const t of timers) clearTimeout(t);
  timers.clear();
  await nc.flush();
  await nc.drain();
  console.log(
    `${stopping ? 'Replay stopped (signal)' : 'Replay complete'} — ${sessions} session(s), ${commands} command(s) published; NATS drained.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
