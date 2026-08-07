import { randomUUID } from 'node:crypto';
import { publishEvent, type NatsConnection } from '@chimera/transport';
import type { DeceptionEvent } from '@chimera/shared';

// The demo decoy that seed-demo.ts provisions; the ingest side resolves the
// tenant from this id. Overridable via DECOY_ID (must match the seed).
const DEMO_DECOY_ID = process.env.DECOY_ID ?? '00000000-0000-0000-0000-0000000000d1';

/** Build one hardcoded, schema-valid demo event (M2 test payload). */
export function buildDemoEvent(): DeceptionEvent {
  return {
    id: randomUUID(),
    decoyId: DEMO_DECOY_ID,
    decoyType: 'ssh',
    kind: 'auth_attempt',
    sourceIp: '203.0.113.42',
    sourcePort: 54321,
    timestamp: new Date().toISOString(),
    payload: { username: 'root', password: 'hunter2' },
  };
}

/** Publish a single demo event to the spine. */
export function publishDemoEvent(nc: NatsConnection): void {
  publishEvent(nc, buildDemoEvent());
}
