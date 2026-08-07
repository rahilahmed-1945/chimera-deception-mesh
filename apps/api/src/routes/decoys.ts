import { desc, eq, getTableColumns } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { decoyTemplates, decoys } from '../db/schema.js';

// Tenant that owns provisioned decoys (single-tenant demo, D2).
const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID ?? '00000000-0000-0000-0000-0000000000a1';

export async function decoyRoutes(app: FastifyInstance): Promise<void> {
  // Catalog for the deploy modal.
  app.get('/templates', async (_req, reply) => {
    const rows = await db.select().from(decoyTemplates).orderBy(decoyTemplates.name);
    return reply.send(rows);
  });

  // List provisioned decoys (with protocol for display).
  app.get('/decoys', async (_req, reply) => {
    const rows = await db
      .select({ ...getTableColumns(decoys), protocol: decoyTemplates.protocol })
      .from(decoys)
      .innerJoin(decoyTemplates, eq(decoys.templateId, decoyTemplates.id))
      .orderBy(desc(decoys.createdAt));
    return reply.send(rows);
  });

  const provisionBody = z.object({
    templateId: z.string().uuid(),
    name: z.string().min(1).max(64).optional(),
  });

  // Provision a decoy from a template (pre-provisioned fallback, D1).
  app.post('/decoys', async (req, reply) => {
    const parsed = provisionBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const [tpl] = await db
      .select()
      .from(decoyTemplates)
      .where(eq(decoyTemplates.id, parsed.data.templateId))
      .limit(1);
    if (!tpl) {
      return reply.code(404).send({ error: 'template_not_found' });
    }
    const name = parsed.data.name ?? `${tpl.key}-decoy-${Date.now().toString(36)}`;
    const [row] = await db
      .insert(decoys)
      .values({ tenantId: DEMO_TENANT_ID, templateId: tpl.id, name })
      .returning();
    return reply.code(201).send({ ...row, protocol: tpl.protocol });
  });

  // Destroy a decoy (soft: status -> destroyed).
  app.delete('/decoys/:id', async (req, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    const [row] = await db
      .update(decoys)
      .set({ status: 'destroyed' })
      .where(eq(decoys.id, params.data.id))
      .returning({ id: decoys.id });
    if (!row) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return reply.send({ id: row.id, status: 'destroyed' });
  });
}
