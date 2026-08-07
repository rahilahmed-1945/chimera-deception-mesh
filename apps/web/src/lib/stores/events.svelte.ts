import type { EventRow, Stats } from '../types';

const MAX = 200;

// Reactive dashboard state (single source of truth). Both REST hydration and
// live WebSocket frames flow through here, deduplicated by event id.
let events = $state<EventRow[]>([]);
let selectedId = $state<string | null>(null);
let stats = $state<Stats | null>(null);
let wsStatus = $state<'open' | 'closed'>('closed');
let restError = $state<string | null>(null);

const seen = new Set<string>();
const decoyTypeByDecoy = new Map<string, string>();

function remember(e: EventRow): void {
  if (e.decoyType) decoyTypeByDecoy.set(e.decoyId, e.decoyType);
}

function enrich(e: EventRow): EventRow {
  if (!e.decoyType) {
    const t = decoyTypeByDecoy.get(e.decoyId);
    if (t) return { ...e, decoyType: t };
  }
  return e;
}

const byNewest = (a: EventRow, b: EventRow): number =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;

export const store = {
  get events() {
    return events;
  },
  get selectedId() {
    return selectedId;
  },
  get selected() {
    return events.find((e) => e.id === selectedId) ?? null;
  },
  get stats() {
    return stats;
  },
  get wsStatus() {
    return wsStatus;
  },
  get restError() {
    return restError;
  },

  /** Merge a REST snapshot: dedupe by id, enrich existing rows, keep sorted. */
  hydrate(rows: EventRow[]): void {
    for (const r of rows) remember(r);
    const fresh = rows.filter((r) => !seen.has(r.id));
    for (const r of fresh) seen.add(r.id);
    events = [...events, ...fresh].map(enrich).sort(byNewest).slice(0, MAX);
    restError = null;
  },

  /** Insert one live event (deduped, newest-first, capped). */
  addLive(raw: EventRow): void {
    remember(raw);
    if (seen.has(raw.id)) return;
    seen.add(raw.id);
    events = [enrich(raw), ...events].slice(0, MAX);
    if (stats) stats = { ...stats, totalEvents: stats.totalEvents + 1 };
  },

  select(id: string | null): void {
    selectedId = id;
  },
  setStats(s: Stats): void {
    stats = s;
  },
  setStatus(s: 'open' | 'closed'): void {
    wsStatus = s;
  },
  setError(msg: string | null): void {
    restError = msg;
  },
};
