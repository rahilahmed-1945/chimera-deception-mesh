import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({
  logger: true,
});

await app.register(cors, { origin: true });

// M0 liveness probe. The real control-plane routes (auth, decoys, events,
// WebSocket) are added from M1 onward.
app.get('/healthz', async () => ({
  status: 'ok',
  service: 'api',
}));

const port = Number(process.env.PORT ?? 3000);
const host = '0.0.0.0';

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
