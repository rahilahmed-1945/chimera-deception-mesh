import { count, desc, eq, getTableColumns, gt, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { attackers, decoyTemplates, decoys, events } from '../db/schema.js';

const listQuery = z.object({
  limit: z.coerce.number().int().positive().max(200).default(100),
  before: z.string().datetime().optional(),
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // Recent events, newest first. Minimal join adds `decoyType` (template
  // protocol) for display only — the WebSocket payload is unchanged.
  app.get('/events', async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const { limit, before } = parsed.data;

    const rows = await db
      .select({ ...getTableColumns(events), decoyType: decoyTemplates.protocol })
      .from(events)
      .innerJoin(decoys, eq(events.decoyId, decoys.id))
      .innerJoin(decoyTemplates, eq(decoys.templateId, decoyTemplates.id))
      .where(before ? lt(events.createdAt, new Date(before)) : undefined)
      .orderBy(desc(events.createdAt), desc(events.id))
      .limit(limit);

    return reply.send(rows);
  });

  // Basic dashboard counters.
  app.get('/stats', async (_req, reply) => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [[totals], [attackerCount], [decoyCount], [recent]] = await Promise.all([
      db.select({ c: count() }).from(events),
      db.select({ c: count() }).from(attackers),
      db.select({ c: count() }).from(decoys),
      db.select({ c: count() }).from(events).where(gt(events.createdAt, hourAgo)),
    ]);

    return reply.send({
      totalEvents: totals.c,
      uniqueAttackers: attackerCount.c,
      decoys: decoyCount.c,
      lastHour: recent.c,
    });
  });
}
