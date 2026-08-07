import { connectNats, type NatsConnection } from '@chimera/transport';
import type { DeceptionEvent } from '@chimera/shared';
import pino from 'pino';
import { publishCapturedEvent } from './publisher.js';
import { startHttpDecoy } from './server.js';

const log = pino({ name: 'decoy-http' });

const port = Number(process.env.DECOY_HTTP_PORT ?? 8080);
const decoyId = process.env.DECOY_HTTP_ID ?? '00000000-0000-0000-0000-0000000000d2';
const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';

let nc: NatsConnection | null = null;

const publish = (event: DeceptionEvent): void => {
  if (!nc) {
    log.warn('NATS not connected; dropping captured event');
    return;
  }
  publishCapturedEvent(nc, event);
};

const app = await startHttpDecoy({ port, decoyId, publish, log });

// Connect to NATS in the background: the HTTP server must keep accepting
// requests even if NATS is down, and a publish failure must never crash it.
connectNats(natsUrl, 'decoy-http')
  .then((conn) => {
    nc = conn;
    log.info('connected to NATS');
  })
  .catch((err) => log.error({ err }, 'NATS connection failed'));

async function shutdown(): Promise<void> {
  log.info('shutting down decoy-http');
  await app.close().catch(() => undefined);
  if (nc) await nc.drain().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
