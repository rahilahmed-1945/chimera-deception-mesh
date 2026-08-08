import { connectNats, subscribeEvents, type NatsConnection } from '@chimera/transport';
import pino from 'pino';
import { enrichEvent } from './enrich.js';
import { ensureBucket } from './storage.js';
import { storeTranscript } from './transcript.js';

const log = pino({ name: 'worker-enrich' });
const natsUrl = process.env.NATS_URL ?? 'nats://localhost:4222';

async function main(): Promise<void> {
  // Always-on consumer of the existing event spine (D1/D2). No JetStream.
  const nc: NatsConnection = await connectNats(natsUrl, 'worker-enrich');
  await ensureBucket().catch((err) => log.error({ err }, 'ensureBucket failed'));
  log.info('connected to NATS; enriching events');

  await subscribeEvents(nc, async (event) => {
    try {
      await enrichEvent(event, log);
      // On session end, assemble + store the SSH transcript.
      if (event.kind === 'disconnect') await storeTranscript(event, log);
    } catch (err) {
      log.error({ err }, 'processing failed; continuing');
    }
  });

  const shutdown = async (): Promise<void> => {
    log.info('shutting down worker-enrich');
    await nc.drain().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  log.error({ err }, 'worker-enrich failed to start');
  process.exit(1);
});
