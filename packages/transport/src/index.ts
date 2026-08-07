import { connect, JSONCodec, type NatsConnection, type Subscription } from 'nats';
import {
  EVENT_SUBJECT,
  parseDeceptionEvent,
  type DeceptionEvent,
  type DeceptionEventParsed,
} from '@chimera/shared';

/**
 * Chimera event transport — the NATS layer for the event spine.
 *
 * This package deliberately lives OUTSIDE @chimera/shared: shared holds only
 * schemas/contracts, this holds the wire transport. M2 uses core NATS pub/sub
 * (JetStream is introduced later when a durable consumer needs it).
 */

export type { NatsConnection, Subscription } from 'nats';

const codec = JSONCodec<unknown>();

export async function connectNats(url: string, name: string): Promise<NatsConnection> {
  return connect({
    servers: url,
    name,
    reconnect: true,
    maxReconnectAttempts: -1,
    waitOnFirstConnect: true,
  });
}

export function publishEvent(nc: NatsConnection, event: DeceptionEvent): void {
  nc.publish(EVENT_SUBJECT, codec.encode(event));
}

/**
 * Subscribe to the event subject. Each message is JSON-decoded and validated
 * against the shared schema before `handler` is called. Invalid or failing
 * messages are logged and skipped so the subscriber never dies.
 */
export async function subscribeEvents(
  nc: NatsConnection,
  handler: (event: DeceptionEventParsed) => Promise<void> | void,
): Promise<Subscription> {
  const sub = nc.subscribe(EVENT_SUBJECT);
  void (async () => {
    for await (const msg of sub) {
      try {
        const event = parseDeceptionEvent(codec.decode(msg.data));
        await handler(event);
      } catch (err) {
        console.error('[transport] dropped invalid/failed event', err);
      }
    }
  })();
  return sub;
}
