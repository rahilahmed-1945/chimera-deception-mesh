// Shape of a persisted event. REST rows also carry `decoyType` (from the join);
// WebSocket frames do not (the WS payload is unchanged) — it is derived client-side.
export interface EventRow {
  id: string;
  tenantId: string;
  decoyId: string;
  attackerId: string;
  kind: string;
  sourceIp: string;
  sourcePort: number | null;
  techniques: string[];
  transcriptKey: string | null;
  payload: Record<string, unknown>;
  createdAt: string; // ISO-8601
  decoyType?: string;
}

export interface Stats {
  totalEvents: number;
  uniqueAttackers: number;
  decoys: number;
  lastHour: number;
}

// Enriched single-event response from GET /events/:id (event + attacker geo/reputation).
export interface EventDetail extends EventRow {
  countryCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  reputation: string | null;
}
