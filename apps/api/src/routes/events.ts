import { count, countDistinct, desc, eq, getTableColumns, gt, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { attackers, decoyTemplates, decoys, events } from '../db/schema.js';
import { STATS_CACHE_KEY, STATS_CACHE_TTL, cacheGetJson, cacheSetJson } from '../cache.js';
import { TRANSCRIPT_URL_TTL, signTranscriptUrl } from '../storage.js';

interface Stats {
  totalEvents: number;
  uniqueAttackers: number;
  decoys: number;
  lastHour: number;
}

const listQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).default(100),
  before: z.string().datetime().optional(),
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // Recent events, newest first. Joins add `decoyType` (template protocol) and
  // the attacker's geo coordinates (latitude/longitude, null until enriched) so
  // historical events expose the same coordinates as live WebSocket events.
  app.get('/events', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const { limit, before } = parsed.data;

    const rows = await db
      .select({
        ...getTableColumns(events),
        decoyType: decoyTemplates.protocol,
        latitude: attackers.latitude,
        longitude: attackers.longitude,
      })
      .from(events)
      .innerJoin(decoys, eq(events.decoyId, decoys.id))
      .innerJoin(decoyTemplates, eq(decoys.templateId, decoyTemplates.id))
      .innerJoin(attackers, eq(events.attackerId, attackers.id))
      .where(before ? lt(events.createdAt, new Date(before)) : undefined)
      .orderBy(desc(events.createdAt), desc(events.id))
      .limit(limit);

    return reply.send(rows);
  });

  // One enriched event for the detail drawer: joins the attacker's geo +
  // reputation (populated asynchronously by worker-enrich). Read-only.
  app.get('/events/:id', async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }

    const [row] = await db
      .select({
        ...getTableColumns(events),
        decoyType: decoyTemplates.protocol,
        countryCode: attackers.countryCode,
        city: attackers.city,
        latitude: attackers.latitude,
        longitude: attackers.longitude,
        reputation: attackers.reputation,
      })
      .from(events)
      .innerJoin(decoys, eq(events.decoyId, decoys.id))
      .innerJoin(decoyTemplates, eq(decoys.templateId, decoyTemplates.id))
      .innerJoin(attackers, eq(events.attackerId, attackers.id))
      .where(eq(events.id, params.data.id))
      .limit(1);

    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send(row);
  });

  // Signed URL for an event's session transcript. The client supplies only the
  // event id; the API signs the transcript_key stored on that event row (never a
  // client-supplied object key). 404 unknown event, 409 no transcript yet.
  app.get('/events/:id/transcript', async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }

    const [row] = await db
      .select({ transcriptKey: events.transcriptKey })
      .from(events)
      .where(eq(events.id, params.data.id))
      .limit(1);

    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (!row.transcriptKey) {
      return reply.code(409).send({ error: 'transcript_not_available' });
    }

    const url = await signTranscriptUrl(row.transcriptKey);
    return reply.send({ url, expiresIn: TRANSCRIPT_URL_TTL });
  });

  // Basic dashboard counters. Read-through Valkey cache (short TTL): derived
  // counters only, never event truth. A miss (or any Valkey failure) computes
  // from Postgres — the single source of truth — then best-effort caches it.
  app.get('/stats', async (_req, reply) => {
    const cached = await cacheGetJson<Stats>(STATS_CACHE_KEY);
    if (cached) return reply.send(cached);

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [[totals], [attackerCount], [decoyCount], [recent]] = await Promise.all([
      db.select({ c: count() }).from(events),
      // Unique actors = attackers with at least one genuine (non-health-check)
      // event. Infrastructure/health-check traffic is excluded so Zerops probes
      // never inflate the actor count; the attacker row itself is preserved.
      db
        .select({ c: countDistinct(events.attackerId) })
        .from(events)
        .where(sql`${events.payload}->>'source' is distinct from 'health-check'`),
      db.select({ c: count() }).from(decoys),
      db.select({ c: count() }).from(events).where(gt(events.createdAt, hourAgo)),
    ]);

    const stats: Stats = {
      totalEvents: totals.c,
      uniqueAttackers: attackerCount.c,
      decoys: decoyCount.c,
      lastHour: recent.c,
    };
    await cacheSetJson(STATS_CACHE_KEY, stats, STATS_CACHE_TTL);
    return reply.send(stats);
  });
}
