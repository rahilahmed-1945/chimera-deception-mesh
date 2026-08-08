import {
  connect,
  JSONCodec,
  type ConnectionOptions,
  type NatsConnection,
  type Subscription,
} from 'nats';
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
  const options: ConnectionOptions = {
    servers: url,
    name,
    reconnect: true,
    maxReconnectAttempts: -1,
    waitOnFirstConnect: true,
  };
  // nats.js does not read credentials embedded in the server URL (it strips the
  // userinfo when parsing host:port). Managed brokers like Zerops require auth
  // and expose a credentialed URL (nats://user:pass@host:4222), so lift any
  // user:pass into explicit auth options. A URL without credentials is left
  // untouched, so local dev (nats://localhost:4222) stays unauthenticated.
  try {
    const parsed = new URL(url);
    if (parsed.username) {
      options.user = decodeURIComponent(parsed.username);
      if (parsed.password) options.pass = decodeURIComponent(parsed.password);
      options.servers = `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // Non-URL server string (bare host:port) — leave `servers` as given.
  }
  return connect(options);
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
