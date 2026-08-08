<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onDestroy, onMount } from 'svelte';
  import { store } from '$lib/stores/events.svelte';
  import type { EventRow } from '$lib/types';
  import StatusPill from './StatusPill.svelte';

  // Free dark basemap, no API key (client fetches tiles).
  const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  // Genuinely-recent events flash; older (historical) events just appear. Using
  // createdAt recency is robust regardless of hydrate/live arrival order.
  const FRESH_MS = 10_000;

  let container: HTMLDivElement;
  let map = $state<maplibregl.Map | undefined>(undefined);
  let resizeObserver: ResizeObserver | undefined;

  // Internal mapping: event id -> its map marker (single source for dedup;
  // markers are never removed in P6).
  const markers = new Map<string, maplibregl.Marker>();

  // --- HUD state (derived from the SAME store; no polling, no API calls) ------
  // A single lightweight 5s local tick keeps the rolling events/min window
  // truthful over time. It is not a network poll and not a per-frame loop.
  let nowTick = $state(Date.now());
  let clockTick: ReturnType<typeof setInterval> | undefined;

  const events = $derived(store.events);
  const liveEvents = $derived(events.length);
  const activeSources = $derived(new Set(events.map((e) => e.sourceIp)).size);
  const perMin = $derived(
    events.reduce((n, e) => (nowTick - Date.parse(e.createdAt) < 60_000 ? n + 1 : n), 0),
  );
  const selected = $derived(store.selected);
  // Events currently plotted (coordinate-bearing). Lets us honestly distinguish
  // "no activity" from "activity exists but has no coordinates yet".
  const plotted = $derived(events.filter((e) => e.latitude != null && e.longitude != null).length);
  // Basemap load state lives in the store (shared with the presentation entry).
  let mapReadyFallback: ReturnType<typeof setTimeout> | undefined;

  // Restrained "telemetry received" cue: briefly flash the live counter on a
  // genuine live event. Keyed off store.liveSeq (U4) so hydration/reconnect
  // backfill never flashes. Event-driven (no loop). U4 owns the full sequence.
  let liveFlash = $state(false);
  let prevSeq: number | undefined = undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const seq = store.liveSeq;
    if (prevSeq !== undefined && seq > prevSeq) {
      liveFlash = false;
      // re-arm on the next frame so the animation retriggers
      requestAnimationFrame(() => (liveFlash = true));
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (liveFlash = false), 900);
    }
    prevSeq = seq;
  });

  onMount(() => {
    // Initialize once. Whole world on first load; controls kept minimal.
    map = new maplibregl.Map({
      container,
      style: DARK_STYLE,
      center: [0, 20],
      zoom: 1.3,
      dragRotate: false,
      pitchWithRotate: false,
      renderWorldCopies: true,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disable();
    map.on('load', () => store.setMapReady());
    // Safety net: never show "initializing" indefinitely if 'load' is slow.
    mapReadyFallback = setTimeout(() => store.setMapReady(), 4000);

    // Clicking empty map (not a marker) clears the current selection.
    map.on('click', () => store.select(null));

    // Keep the canvas sized to its (grid/flex) container, not only the window.
    resizeObserver = new ResizeObserver(() => map?.resize());
    resizeObserver.observe(container);

    clockTick = setInterval(() => (nowTick = Date.now()), 5000);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    clearInterval(clockTick);
    clearTimeout(flashTimer);
    clearTimeout(mapReadyFallback);
    map?.remove();
    map = undefined;
  });

  // --- Marker lifecycle (create + track), separate from animation (CSS) -------
  // Ensure a marker exists for an event that has coordinates. Idempotent: an
  // event already placed is left stable (no duplicate, no reposition). Events
  // without coordinates are ignored until coordinates exist (re-evaluated on the
  // next store change, e.g. GeoIP arriving via re-hydration).
  function ensureMarker(m: maplibregl.Map, e: EventRow): void {
    if (e.latitude == null || e.longitude == null) return;
    if (markers.has(e.id)) return;

    const el = document.createElement('div');
    // Animation is declarative CSS; lifecycle only chooses whether to flash.
    const fresh = Date.now() - Date.parse(e.createdAt) < FRESH_MS;
    el.className = fresh ? 'chimera-marker is-fresh' : 'chimera-marker';

    // Clicking a marker selects its event (opens the shared drawer + highlights).
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      store.select(e.id);
    });

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([e.longitude, e.latitude])
      .addTo(m);
    markers.set(e.id, marker);
  }

  // Sync markers with the existing store. Re-runs on map init and on every
  // hydrate/live change (initial load, live events, refresh, reconnect).
  $effect(() => {
    const m = map;
    const evs = store.events;
    if (!m) return;
    for (const e of evs) ensureMarker(m, e);
  });

  // --- Selection (reflect the shared store; drive highlight + fly-to) ---------
  // Exactly one marker is highlighted at a time. Reacts to store.selectedId,
  // whether set by a marker click or a feed-row click.
  let highlightedId: string | null = null;
  $effect(() => {
    const m = map;
    const selectedId = store.selectedId;
    if (!m) return;
    if (selectedId === highlightedId) return;

    if (highlightedId) {
      markers.get(highlightedId)?.getElement().classList.remove('is-selected');
    }
    highlightedId = selectedId;
    if (!selectedId) return;

    const marker = markers.get(selectedId);
    if (!marker) return; // selected event has no marker (e.g. no coordinates)
    marker.getElement().classList.add('is-selected');
    m.flyTo({
      center: marker.getLngLat(),
      zoom: Math.max(m.getZoom(), 3.5),
      duration: 900,
      essential: true,
    });
  });
</script>

<section
  class="chimera-map-hero border-border-subtle bg-surface-inset relative h-[clamp(24rem,60vh,44rem)] w-full overflow-hidden rounded-lg border"
  aria-label="Global attack telemetry map"
>
  <!-- Map canvas fills the hero; overlays sit above it (pointer-events-none). -->
  <div bind:this={container} class="bg-surface-inset absolute inset-0"></div>

  <!-- Centered state: basemap initializing, or activity without coordinates. -->
  {#if !store.mapReady}
    <div
      class="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 text-center"
    >
      <span class="t-micro text-text-secondary">Threat surface</span>
      <span class="t-micro flex items-center gap-2">
        <span class="bg-warn h-1.5 w-1.5 animate-pulse rounded-full"></span> Initializing…
      </span>
    </div>
  {:else if liveEvents > 0 && plotted === 0}
    <div
      class="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 text-center"
    >
      <span class="t-micro text-text-secondary">No geolocated activity</span>
      <span class="text-text-muted max-w-[16rem] text-[11px]">
        Activity has been captured, but no source coordinates are available yet.
      </span>
    </div>
  {/if}

  <!-- Decorative depth: faint coordinate grid + edge vignette. -->
  <div class="chimera-map-grid pointer-events-none absolute inset-0 z-10"></div>
  <div class="chimera-map-vignette pointer-events-none absolute inset-0 z-10"></div>

  <!-- HUD: top-left telemetry label + live status -->
  <div
    class="border-border-subtle bg-surface-page/50 pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 backdrop-blur-sm"
  >
    <svg class="text-accent shrink-0" width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 1 L17 9 L9 17 L1 9 Z" fill="none" stroke="currentColor" stroke-width="1.4" />
      <circle cx="9" cy="9" r="1.8" fill="currentColor" />
    </svg>
    <span class="t-micro text-text-secondary">Global Threat Telemetry</span>
    <StatusPill
      tone={store.wsStatus === 'open' ? 'ok' : 'warn'}
      label={store.wsStatus === 'open' ? 'LIVE' : 'RECONNECTING'}
      pulse={store.wsStatus === 'open'}
    />
  </div>

  <!-- HUD: top-right legend (very subtle; hidden on small screens) -->
  <div
    class="pointer-events-none absolute top-3 right-3 z-20 hidden flex-col items-end gap-1 text-right sm:flex"
  >
    <span class="t-micro flex items-center gap-1.5">
      <span class="bg-threat inline-block h-2 w-2 rounded-full"></span> Live attack
    </span>
    <span class="t-micro flex items-center gap-1.5">
      <span class="ring-threat-bright inline-block h-2 w-2 rounded-full ring-2"></span> Selected
    </span>
  </div>

  <!-- HUD: bottom-left operational readout (real store metrics) -->
  <div
    class="border-border-subtle bg-surface-page/50 pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap items-end gap-x-5 gap-y-2 rounded-md border px-3 py-2 backdrop-blur-sm"
  >
    <div class="flex flex-col">
      <span class="t-micro">Live Events</span>
      <span class="t-data text-text-primary text-sm" class:chimera-hud-flash={liveFlash}
        >{liveEvents}</span
      >
    </div>
    <div class="hidden flex-col sm:flex">
      <span class="t-micro">Events / Min</span>
      <span class="t-data text-text-primary text-sm">{perMin}</span>
    </div>
    <div class="flex flex-col">
      <span class="t-micro">Active Sources</span>
      <span class="t-data text-text-primary text-sm">{activeSources}</span>
    </div>
    <div class="hidden flex-col sm:flex">
      <span class="t-micro">Map</span>
      <span class="t-data text-text-secondary text-sm">GLOBAL</span>
    </div>
    {#if selected}
      <div class="flex flex-col">
        <span class="t-micro">Src</span>
        <span class="t-data text-accent text-sm">{selected.sourceIp}</span>
      </div>
    {/if}
  </div>
</section>
