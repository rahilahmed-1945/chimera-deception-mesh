import type { EventDetail, EventRow, Stats } from './types';

// Defaults to the local API; override at build time with VITE_API_URL.
const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

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
