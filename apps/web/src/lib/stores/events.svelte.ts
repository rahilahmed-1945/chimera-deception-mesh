import type { EventRow, Stats } from '../types';

const MAX = 200;

// Reactive dashboard state (single source of truth). Both REST hydration and
// live WebSocket frames flow through here, deduplicated by event id.
let events = $state<EventRow[]>([]);
let selectedId = $state<string | null>(null);
let stats = $state<Stats | null>(null);
let wsStatus = $state<'open' | 'closed'>('closed');
// True once the WS has opened at least once — lets the UI distinguish the
// initial CONNECTING state from a later RECONNECTING state (honestly).
let hasConnected = $state(false);
// True once the real MapLibre basemap has loaded (drives the map init state and
// the presentation entry's honest "threat map" readiness signal).
let mapReady = $state(false);
let restError = $state<string | null>(null);
// Monotonic counter bumped once per genuinely-new live event (addLive only).
// The live-attack choreography (U4) keys off changes to this — NEVER off event
// count, so hydration/refresh/reconnect backfill never trigger it.
let liveSeq = $state(0);

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
  get hasConnected() {
    return hasConnected;
  },
  get mapReady() {
    return mapReady;
  },
  setMapReady(): void {
    mapReady = true;
  },
  get restError() {
    return restError;
  },
  get liveSeq() {
    return liveSeq;
  },

  /**
   * Merge a REST snapshot: upsert by id so re-hydration (refresh / WS reconnect)
   * refreshes existing events with newer data — notably GeoIP coordinates that
   * arrived after the live frame. Live-only events (newer than the snapshot) are
   * preserved. Deduped by id, enriched, kept newest-first and capped.
   */
  hydrate(rows: EventRow[]): void {
    for (const r of rows) remember(r);
    const byId = new Map(events.map((e) => [e.id, e]));
    for (const r of rows) {
      byId.set(r.id, enrich(r));
      seen.add(r.id);
    }
    events = [...byId.values()].sort(byNewest).slice(0, MAX);
    restError = null;
  },

  /** Insert one live event (deduped, newest-first, capped). */
  addLive(raw: EventRow): void {
    remember(raw);
    if (seen.has(raw.id)) return;
    seen.add(raw.id);
    events = [enrich(raw), ...events].slice(0, MAX);
    if (stats) stats = { ...stats, totalEvents: stats.totalEvents + 1 };
    // Genuinely-new live ATTACK event: signal the choreography exactly once.
    // Infrastructure/health-check traffic is captured and shown in the feed, but
    // never raises the attack signal (no THREAT DETECTED / live-attack pulse).
    if (raw.payload?.source !== 'health-check') liveSeq += 1;
  },

  select(id: string | null): void {
    selectedId = id;
  },
  setStats(s: Stats): void {
    stats = s;
  },
  setStatus(s: 'open' | 'closed'): void {
    wsStatus = s;
    if (s === 'open') hasConnected = true;
  },
  setError(msg: string | null): void {
    restError = msg;
  },
};
