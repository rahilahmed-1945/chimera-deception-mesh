import { randomUUID } from 'node:crypto';
import { publishEvent, type NatsConnection } from '@chimera/transport';
import type { DeceptionEvent } from '@chimera/shared';
import { buildAuthAttemptEvent } from './events.js';

// The demo decoy that seed-demo.ts provisions; overridable via DECOY_ID.
const DEMO_DECOY_ID = process.env.DECOY_ID ?? '00000000-0000-0000-0000-0000000000d1';

/** Publish a captured deception event through the (unchanged) M2 transport layer. */
export function publishCapturedEvent(nc: NatsConnection, event: DeceptionEvent): void {
  publishEvent(nc, event);
}

/** Demo event reused by the M2 smoke test (dev-publish), via the central builder. */
export function buildDemoEvent(): DeceptionEvent {
  return buildAuthAttemptEvent(
    {
      sessionId: randomUUID(),
      decoyId: DEMO_DECOY_ID,
      sourceIp: '203.0.113.42',
      sourcePort: 54321,
    },
    { username: 'root', password: 'hunter2' },
  );
}

export function publishDemoEvent(nc: NatsConnection): void {
  publishCapturedEvent(nc, buildDemoEvent());
}
