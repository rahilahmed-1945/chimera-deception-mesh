import { and, count, desc, eq, getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { attackers, decoyTemplates, decoys, events } from '../db/schema.js';

const searchQuery = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.string().max(40).optional(),
  decoyType: z.string().max(20).optional(),
  reputation: z.string().max(40).optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // Full-text Intel Explorer over the generated events.search_vector column
  // (physical column; not part of the Drizzle model — see the M6 migration).
  app.get('/search', async (req, reply) => {
    const parsed = searchQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', details: parsed.error.flatten() });
    }
    const { q, kind, decoyType, reputation, limit } = parsed.data;

    const fts: SQL | undefined =
      q && q.length > 0
        ? sql`"events"."search_vector" @@ plainto_tsquery('simple', ${q})`
        : undefined;

    const conds: SQL[] = [];
    if (fts) conds.push(fts);
    if (kind) conds.push(eq(events.kind, kind));
    if (decoyType) conds.push(eq(decoyTemplates.protocol, decoyType));
    if (reputation) conds.push(eq(attackers.reputation, reputation));

    const results = await db
      .select({
        ...getTableColumns(events),
        decoyType: decoyTemplates.protocol,
        reputation: attackers.reputation,
        latitude: attackers.latitude,
        longitude: attackers.longitude,
      })
      .from(events)
      .innerJoin(decoys, eq(events.decoyId, decoys.id))
      .innerJoin(decoyTemplates, eq(decoys.templateId, decoyTemplates.id))
      .innerJoin(attackers, eq(events.attackerId, attackers.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(events.createdAt))
      .limit(limit);

    // Facet counts over the text-query set (independent of the selected facets).
    const kindFacet = await db
      .select({ value: events.kind, count: count() })
      .from(events)
      .where(fts)
      .groupBy(events.kind);

    const decoyTypeFacet = await db
      .select({ value: decoyTemplates.protocol, count: count() })
      .from(events)
      .innerJoin(decoys, eq(events.decoyId, decoys.id))
      .innerJoin(decoyTemplates, eq(decoys.templateId, decoyTemplates.id))
      .where(fts)
      .groupBy(decoyTemplates.protocol);

    const repRows = await db
      .select({ value: attackers.reputation, count: count() })
      .from(events)
      .innerJoin(attackers, eq(events.attackerId, attackers.id))
      .where(fts)
      .groupBy(attackers.reputation);
    const reputationFacet = repRows
      .filter((r): r is { value: string; count: number } => r.value != null)
      .map((r) => ({ value: r.value, count: r.count }));

    return reply.send({
      results,
      facets: { kind: kindFacet, decoyType: decoyTypeFacet, reputation: reputationFacet },
    });
  });
}
