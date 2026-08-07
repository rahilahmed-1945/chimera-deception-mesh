import formbody from '@fastify/formbody';
import type { DeceptionEvent } from '@chimera/shared';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import { buildHttpRequestEvent } from './events.js';

export interface HttpDecoyOptions {
  port: number;
  decoyId: string;
  publish: (event: DeceptionEvent) => void;
  log: Logger;
}

// A deliberately minimal fake admin console. It never authenticates anyone.
const LOGIN_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Admin Console</title></head>
<body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;justify-content:center;padding-top:80px">
  <form method="post" action="/login" style="border:1px solid #333;padding:24px;border-radius:8px;min-width:260px">
    <h2 style="margin-top:0">Admin Login</h2>
    <p><input name="username" placeholder="Username" style="width:100%;padding:8px"></p>
    <p><input name="password" type="password" placeholder="Password" style="width:100%;padding:8px"></p>
    <button type="submit" style="padding:8px 16px">Sign in</button>
  </form>
</body></html>`;

const CAPTURED_HEADERS = ['user-agent', 'referer', 'x-forwarded-for', 'authorization'];

/** Start the HTTP honeypot. Captures every request; always rejects login. */
export async function startHttpDecoy(opts: HttpDecoyOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(formbody);

  // Capture every request (body is parsed by the time preHandler runs).
  app.addHook('preHandler', async (req: FastifyRequest) => {
    try {
      const headers: Record<string, string> = {};
      for (const h of CAPTURED_HEADERS) {
        const v = req.headers[h];
        if (typeof v === 'string') headers[h] = v;
      }
      opts.publish(
        buildHttpRequestEvent({
          decoyId: opts.decoyId,
          sourceIp: req.ip,
          sourcePort: req.socket.remotePort,
          method: req.method,
          path: req.url,
          headers,
          query: (req.query as Record<string, unknown>) ?? {},
          body: (req.body as Record<string, unknown>) ?? {},
        }),
      );
    } catch (err) {
      opts.log.error({ err }, 'failed to publish http capture; continuing');
    }
  });

  app.get('/', async (_req, reply) => reply.type('text/html').send(LOGIN_PAGE));
  app.post('/login', async (_req, reply) =>
    reply.code(401).type('text/html').send('<p>Invalid credentials</p>'),
  );
  app.setNotFoundHandler(async (_req, reply) => reply.code(404).type('text/html').send(LOGIN_PAGE));

  await app.listen({ port: opts.port, host: '0.0.0.0' });
  opts.log.info({ port: opts.port }, 'http decoy listening');
  return app;
}
