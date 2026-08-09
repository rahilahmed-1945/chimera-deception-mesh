import type {
  Decoy,
  EventDetail,
  EventRow,
  SearchParams,
  SearchResponse,
  Stats,
  Template,
} from './types';

// API base URL from the environment (VITE_API_URL). The development value lives
// in apps/web/.env.development; set VITE_API_URL at build time for production.
// Empty => same-origin (relative) requests, so no host is hardcoded.
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export async function fetchRecentEvents(limit = 100): Promise<EventRow[]> {
  const res = await fetch(`${API_BASE}/events?limit=${limit}`);
  if (!res.ok) throw new Error(`GET /events failed: ${res.status}`);
  return (await res.json()) as EventRow[];
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`GET /stats failed: ${res.status}`);
  return (await res.json()) as Stats;
}

export async function fetchEventDetail(id: string): Promise<EventDetail> {
  const res = await fetch(`${API_BASE}/events/${id}`);
  if (!res.ok) throw new Error(`GET /events/${id} failed: ${res.status}`);
  return (await res.json()) as EventDetail;
}

// Fetch an event's session transcript text. Two hops: ask our API for a
// short-lived signed URL, then GET that exact URL from the browser. Returns the
// raw transcript text, or null when the transcript isn't available yet (409/404
// — a normal "not ready" state, not an error). Both fetches honour `signal` so a
// superseded selection can abort in flight. The signed URL is never logged.
export async function fetchEventTranscript(
  id: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/events/${id}/transcript`, { signal });
  if (res.status === 409 || res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /events/${id}/transcript failed: ${res.status}`);
  const { url } = (await res.json()) as { url: string; expiresIn: number };
  const obj = await fetch(url, { signal });
  if (!obj.ok) throw new Error(`transcript object fetch failed: ${obj.status}`);
  return obj.text();
}

export async function fetchTemplates(): Promise<Template[]> {
  const res = await fetch(`${API_BASE}/templates`);
  if (!res.ok) throw new Error(`GET /templates failed: ${res.status}`);
  return (await res.json()) as Template[];
}

export async function fetchDecoys(): Promise<Decoy[]> {
  const res = await fetch(`${API_BASE}/decoys`);
  if (!res.ok) throw new Error(`GET /decoys failed: ${res.status}`);
  return (await res.json()) as Decoy[];
}

export async function deployDecoy(templateId: string): Promise<Decoy> {
  const res = await fetch(`${API_BASE}/decoys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ templateId }),
  });
  if (!res.ok) throw new Error(`POST /decoys failed: ${res.status}`);
  return (await res.json()) as Decoy;
}

export async function destroyDecoy(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/decoys/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE /decoys/${id} failed: ${res.status}`);
}

export async function search(params: SearchParams): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.kind) qs.set('kind', params.kind);
  if (params.decoyType) qs.set('decoyType', params.decoyType);
  if (params.reputation) qs.set('reputation', params.reputation);
  const res = await fetch(`${API_BASE}/search?${qs.toString()}`);
  if (!res.ok) throw new Error(`GET /search failed: ${res.status}`);
  return (await res.json()) as SearchResponse;
}
