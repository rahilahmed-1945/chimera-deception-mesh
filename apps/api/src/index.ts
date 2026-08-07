import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './env.js';
import { authRoutes } from './routes/auth.js';

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: true });

// Liveness probe.
app.get('/healthz', async () => ({
  status: 'ok',
  service: 'api',
}));

// Auth + protected route (M1). The event/decoy/WebSocket routes arrive from M2.
await app.register(authRoutes);

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
