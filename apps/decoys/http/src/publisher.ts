import { publishEvent, type NatsConnection } from '@chimera/transport';
import type { DeceptionEvent } from '@chimera/shared';

/** Publish a captured deception event through the (unchanged) transport layer. */
export function publishCapturedEvent(nc: NatsConnection, event: DeceptionEvent): void {
  publishEvent(nc, event);
}
