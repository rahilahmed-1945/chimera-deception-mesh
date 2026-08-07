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
    },
  };
}
