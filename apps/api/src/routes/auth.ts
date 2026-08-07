import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { tenants, users } from '../db/schema.js';
import {
  hashPassword,
  signToken,
  verifyPassword,
  verifyToken,
  type JwtClaims,
} from '../services/auth.js';

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/** Extract + verify the bearer token; sends 401 and returns null on failure. */
async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<JwtClaims | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    await reply.code(401).send({ error: 'missing_token' });
    return null;
  }
  try {
    return await verifyToken(header.slice('Bearer '.length));
  } catch {
    await reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Register: creates a tenant + user (single-org per registration in Phase 1).
  app.post('/auth/register', async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'email_taken' });
    }

    const passwordHash = await hashPassword(password);
    const [tenant] = await db.insert(tenants).values({ name: email }).returning();
    const [user] = await db
      .insert(users)
      .values({ tenantId: tenant.id, email, passwordHash })
      .returning();

    const token = await signToken({ sub: user.id, tenantId: user.tenantId, email: user.email });
    return reply
      .code(201)
      .send({ token, user: { id: user.id, email: user.email, tenantId: user.tenantId } });
  });

  // Login: verify credentials, return a fresh JWT.
  app.post('/auth/login', async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body' });
    }
    const { email, password } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }

    const token = await signToken({ sub: user.id, tenantId: user.tenantId, email: user.email });
    return reply.send({
      token,
      user: { id: user.id, email: user.email, tenantId: user.tenantId },
    });
  });

  // Protected route: echoes the authenticated identity.
  app.get('/me', async (req, reply) => {
    const claims = await authenticate(req, reply);
    if (!claims) return reply; // 401 already sent
    return reply.send({
      user: { id: claims.sub, email: claims.email, tenantId: claims.tenantId },
    });
  });
}
