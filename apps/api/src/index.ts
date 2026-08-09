import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './env.js';
import { startEventSpine } from './events.js';
import { authRoutes } from './routes/auth.js';
import { decoyRoutes } from './routes/decoys.js';
import { eventRoutes } from './routes/events.js';
import { searchRoutes } from './routes/search.js';
import { registerWebSocket } from './ws.js';

const app = Fastify({
  logger: true,
});

// CORS: allow the deployed dashboard origin and local development. Requests with
// no Origin (curl, health checks, server-to-server) are allowed; any other
// browser origin is rejected. WebSocket handling is registered separately below
// and is unaffected by this.
const allowedOrigins = ['https://web-2c44.prg1.zerops.app'];
const isLocalOrigin = (origin: string): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
await app.register(cors, {
  origin(origin, cb) {
    cb(null, !origin || allowedOrigins.includes(origin) || isLocalOrigin(origin));
  },
});

// Liveness probe.
app.get('/healthz', async () => ({
  status: 'ok',
  service: 'api',
}));

// Auth + protected route (M1).
await app.register(authRoutes);

// Dashboard read API (M4): recent events + basic stats.
await app.register(eventRoutes);

// Deploy flow + Intel Explorer search (M6).
await app.register(decoyRoutes);
await app.register(searchRoutes);

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
