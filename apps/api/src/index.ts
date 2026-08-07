import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './env.js';
import { startEventSpine } from './events.js';
import { authRoutes } from './routes/auth.js';
import { registerWebSocket } from './ws.js';

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: true });

// Liveness probe.
app.get('/healthz', async () => ({
  status: 'ok',
  service: 'api',
}));

// Auth + protected route (M1).
await app.register(authRoutes);

// Event spine (M2): WebSocket endpoint for the dashboard + NATS ingestion.
await registerWebSocket(app);

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Start ingestion after the server is listening; a late/absent NATS must not
// take down the HTTP/WebSocket server.
startEventSpine().catch((err) => {
  app.log.error({ err }, 'event spine failed to start');
});
