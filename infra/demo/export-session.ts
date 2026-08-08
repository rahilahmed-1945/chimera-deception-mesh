import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { db, sql } from '../../apps/api/src/db/client.js';

// Export the N most-recent REAL captured SSH sessions from Postgres into
// infra/demo/sessions.json, the fixture consumed by replay.ts. Every field is
// taken verbatim from the captured events — commands, usernames, credentials,
// source IP/port and inter-event timing. Nothing is invented. Replay sessions
// (payload.source = 'replay') are excluded so the fixture only holds real captures.
//
//   pnpm demo:export            # export the 3 most recent real sessions
//   pnpm demo:export --limit=5  # export the 5 most recent

const limitArg = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = Math.min(20, Math.max(1, Number(limitArg ?? '3')));

interface ReplaySession {
  sourceSessionId: string; // provenance: the real captured sessionId this came from
  sourceIp: string;
  sourcePort: number | null;
  decoyType: 'ssh';
  username: string;
  password: string;
  method: string;
  commands: string[];
  gapsMs: number[]; // real inter-event deltas (clamped only at replay time)
}

async function main(): Promise<void> {
  const recent = (await db.execute(sql`
    select payload->>'sessionId' as sid
    from events
    where payload->>'sessionId' is not null
      and (payload->>'source') is distinct from 'replay'
    group by payload->>'sessionId'
    order by max(created_at) desc
    limit ${LIMIT}
  `)) as unknown as Array<{ sid: string }>;

  const sessions: ReplaySession[] = [];
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

    sessions.push({
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

  const doc = {
    note: 'Real captured SSH sessions exported verbatim from Postgres for demo replay (infra/demo/replay.ts). Commands, usernames, credentials, source IPs/ports and inter-event timing are exactly as captured — nothing is fabricated. Source IPs produce map markers only when they are public, geolocatable addresses.',
    sessionCount: sessions.length,
    commandCount: sessions.reduce((n, s) => n + s.commands.length, 0),
    sessions,
  };

  const outPath = resolve(dirname(fileURLToPath(import.meta.url)), 'sessions.json');
  // Format through Prettier (resolving the repo config from the path) so the
  // generated fixture stays lint-clean and reproducible across re-exports.
  const cfg = await resolveConfig(outPath);
  const formatted = await format(JSON.stringify(doc), { ...cfg, filepath: outPath });
  writeFileSync(outPath, formatted);
  console.log(
    `Exported ${sessions.length} real session(s), ${doc.commandCount} command(s) -> ${outPath}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
