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
  // Present on search results (joined attacker reputation); absent on live list
  // rows. Rendered only when set.
  reputation?: string | null;
  // Attacker geo coordinates (null until enriched). Present on every
  // frontend-facing event: REST list, search, WS live, and detail.
  latitude: number | null;
  longitude: number | null;
}

export interface Stats {
  totalEvents: number;
  uniqueAttackers: number;
  decoys: number;
  lastHour: number;
}

// Enriched single-event response from GET /events/:id. latitude/longitude are
// inherited from EventRow; this adds the remaining attacker fields.
export interface EventDetail extends EventRow {
  countryCode: string | null;
  city: string | null;
  reputation: string | null;
}

export interface Template {
  id: string;
  key: string;
  name: string;
  protocol: string;
  defaultPort: number;
  description: string | null;
  createdAt: string;
}

export interface Decoy {
  id: string;
  tenantId: string;
  templateId: string;
  name: string;
  status: string;
  lastEventAt: string | null;
  createdAt: string;
  protocol: string;
}

export interface Facet {
  value: string;
  count: number;
}

export interface SearchResponse {
  results: (EventRow & { reputation: string | null })[];
  facets: { kind: Facet[]; decoyType: Facet[]; reputation: Facet[] };
}

export interface SearchParams {
  q?: string;
  kind?: string;
  decoyType?: string;
  reputation?: string;
}
