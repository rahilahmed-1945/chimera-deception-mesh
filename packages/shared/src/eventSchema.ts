import { z } from 'zod';

/**
 * The Chimera event contract.
 *
 * This is the single wire schema spoken by every service on the event spine:
 *   decoy -> NATS -> api -> worker-enrich
 * Keeping it in one shared package is what prevents the services from drifting.
 *
 * M0 defines the base envelope. Kind-specific payload validation and the
 * enrichment fields (geo, reputation, MITRE technique) are layered on in later
 * milestones without breaking this envelope.
 */

/** The kind of decoy that observed the event. */
export const decoyType = z.enum(['ssh', 'http']);
export type DecoyType = z.infer<typeof decoyType>;

/** What happened. */
export const eventKind = z.enum([
  'connection', // a source opened a connection to a decoy
  'auth_attempt', // a login / credential attempt
  'command', // a command was entered in a session
  'http_request', // an HTTP request hit the http decoy
  'disconnect', // the source disconnected
]);
export type EventKind = z.infer<typeof eventKind>;

/**
 * A single deception event as emitted by a decoy.
 * `payload` is intentionally open-ended in M0 (kind-specific shapes are
 * tightened later); everything above it is stable.
 */
export const deceptionEventSchema = z.object({
  /** Unique event id (UUID v4). */
  id: z.string().uuid(),
  /** Which decoy instance emitted this. */
  decoyId: z.string().min(1),
  /** The decoy's protocol family. */
  decoyType: decoyType,
  /** What kind of event this is. */
  kind: eventKind,
  /** Attacker source IP. */
  sourceIp: z.string().min(1),
  /** Attacker source port, when known. */
  sourcePort: z.number().int().nonnegative().optional(),
  /** Event time (ISO-8601). */
  timestamp: z.string().datetime(),
  /** Kind-specific details (credentials, command, path, headers, ...). */
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type DeceptionEvent = z.input<typeof deceptionEventSchema>;
export type DeceptionEventParsed = z.output<typeof deceptionEventSchema>;

/** Parse + validate an unknown value into a DeceptionEvent (throws on failure). */
export function parseDeceptionEvent(value: unknown): DeceptionEventParsed {
  return deceptionEventSchema.parse(value);
}
