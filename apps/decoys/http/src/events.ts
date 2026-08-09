import { randomUUID } from 'node:crypto';
import type { DeceptionEvent } from '@chimera/shared';

/** Single source of truth for constructing HTTP-decoy DeceptionEvents. */

export interface HttpCapture {
  decoyId: string;
  sourceIp: string;
  sourcePort?: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
}

const MAX = 512;
const clamp = (value: string): string => (value.length > MAX ? value.slice(0, MAX) : value);

// Loopback / RFC1918 private / IPv6 ULA (Zerops' internal net, e.g. fda0:…).
const LOOPBACK_OR_PRIVATE =
  /^(127\.|::1$|::ffff:127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|f[cd])/i;

/**
 * A Zerops platform health probe: it self-identifies via its User-Agent AND
 * originates from the project's internal network. Requiring both means an
 * external attacker spoofing the User-Agent (public IP) is NOT misclassified as
 * infrastructure. Tagged events are still captured/stored/streamed — just
 * classified separately from genuine attacker activity via payload.source.
 */
function isZeropsHealthProbe(c: HttpCapture): boolean {
  const ua = c.headers['user-agent'] ?? '';
  return /Zerops-http-probe/i.test(ua) && LOOPBACK_OR_PRIVATE.test(c.sourceIp);
}

export function buildHttpRequestEvent(c: HttpCapture): DeceptionEvent {
  return {
    id: randomUUID(),
    decoyId: c.decoyId,
    decoyType: 'http',
    kind: 'http_request',
    sourceIp: c.sourceIp,
    sourcePort: c.sourcePort,
    timestamp: new Date().toISOString(),
    payload: {
      method: c.method,
      path: clamp(c.path),
      headers: c.headers,
      query: c.query,
      ...(Object.keys(c.body).length > 0 ? { body: c.body } : {}),
      ...(isZeropsHealthProbe(c) ? { source: 'health-check' } : {}),
    },
  };
}
