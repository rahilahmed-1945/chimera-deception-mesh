import { connectNats, type NatsConnection } from '@chimera/transport';
import type { DeceptionEvent } from '@chimera/shared';
import pino from 'pino';
import { publishCapturedEvent } from './publisher.js';
import { startSshDecoy } from './server.js';

const log = pino({ name: 'decoy-ssh' });

const port = Number(process.env.DECOY_SSH_PORT ?? 2222);
const decoyId = process.env.DECOY_ID ?? '00000000-0000-0000-0000-0000000000d1';
const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';

let nc: NatsConnection | null = null;

const publish = (event: DeceptionEvent): void => {
  if (!nc) {
    log.warn('NATS not connected; dropping captured event');
    return;
  }
  publishCapturedEvent(nc, event);
};

const server = startSshDecoy({ port, decoyId, publish, log });

// Connect to NATS in the background: the SSH server must keep accepting
// connections even if NATS is down, and a publish failure must never crash it.
connectNats(natsUrl, 'decoy-ssh')
  .then((conn) => {
    nc = conn;
    log.info('connected to NATS');
  })
  .catch((err) => log.error({ err }, 'NATS connection failed'));

async function shutdown(): Promise<void> {
  log.info('shutting down decoy-ssh');
  server.close();
  if (nc) await nc.drain().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
