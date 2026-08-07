import { connectNats, subscribeEvents } from '@chimera/transport';
import type { DeceptionEventParsed } from '@chimera/shared';
import { eq, sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { attackers, decoys, events } from './db/schema.js';
import { env } from './env.js';
import { broadcast } from './ws.js';

/** Connect to NATS and start ingesting events into Postgres + the dashboard. */
export async function startEventSpine(): Promise<void> {
  const nc = await connectNats(env.NATS_URL, 'api');
  await subscribeEvents(nc, ingest);
}

/**
 * The ingestion flow: resolve decoy -> tenant, upsert the attacker, persist the
 * event, bump the decoy's recency, then broadcast the persisted row.
 */
async function ingest(event: DeceptionEventParsed): Promise<void> {
  const [decoy] = await db
    .select({ id: decoys.id, tenantId: decoys.tenantId })
    .from(decoys)
    .where(eq(decoys.id, event.decoyId))
    .limit(1);

  if (!decoy) {
    console.warn(`[events] unknown decoyId ${event.decoyId}; skipping`);
    return;
  }

  const [attacker] = await db
    .insert(attackers)
    .values({ tenantId: decoy.tenantId, ip: event.sourceIp, eventCount: 1 })
    .onConflictDoUpdate({
      target: [attackers.tenantId, attackers.ip],
      set: { lastSeenAt: new Date(), eventCount: sql`${attackers.eventCount} + 1` },
    })
    .returning({ id: attackers.id });

  const [row] = await db
    .insert(events)
    .values({
      id: event.id,
      tenantId: decoy.tenantId,
      decoyId: decoy.id,
      attackerId: attacker.id,
      kind: event.kind,
      sourceIp: event.sourceIp,
      sourcePort: event.sourcePort,
      payload: event.payload,
    })
    .returning();

  await db.update(decoys).set({ lastEventAt: new Date() }).where(eq(decoys.id, decoy.id));

  broadcast(row);
}
