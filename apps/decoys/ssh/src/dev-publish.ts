import { connectNats } from '@chimera/transport';
import { publishDemoEvent } from './publisher.js';

// One-shot M2 test harness: connect, publish one demo event, drain, exit.
// This is NOT the SSH honeypot (that is M3) — just a NATS publish.
const NATS_URL = process.env.NATS_URL ?? 'nats://localhost:4222';

async function main() {
  const nc = await connectNats(NATS_URL, 'decoy-ssh-dev-publish');
  publishDemoEvent(nc);
  await nc.flush();
  await nc.drain();
  console.log('Published one demo event to the spine.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to publish demo event:', err);
  process.exit(1);
});
