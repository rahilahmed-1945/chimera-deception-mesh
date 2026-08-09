<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onDestroy, onMount } from 'svelte';
  import { store } from '$lib/stores/events.svelte';
  import type { EventRow } from '$lib/types';
  import StatusPill from './StatusPill.svelte';

  // Offline MapLibre style.
  // No external tile server / API key required.
  const DARK_STYLE = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#081018',
        },
      },
    ],
  };

  // Genuinely-recent events flash.
  const FRESH_MS = 10_000;

  let container: HTMLDivElement;
  let map = $state<maplibregl.Map | undefined>(undefined);
  let resizeObserver: ResizeObserver | undefined;

  // Internal mapping: event id -> map marker.
  const markers = new Map<string, maplibregl.Marker>();

  // HUD state.
  let nowTick = $state(Date.now());
  let clockTick: ReturnType<typeof setInterval> | undefined;

  const events = $derived(store.events);
  const liveEvents = $derived(events.length);

  // Distinct genuine actor IPs — infrastructure/health-check traffic excluded.
  const activeSources = $derived(
    new Set(events.filter((e) => e.payload?.source !== 'health-check').map((e) => e.sourceIp)).size,
  );

  const perMin = $derived(
    events.reduce((n, e) => (nowTick - Date.parse(e.createdAt) < 60_000 ? n + 1 : n), 0),
  );

  const selected = $derived(store.selected);

  // Events with coordinates.
  const plotted = $derived(events.filter((e) => e.latitude != null && e.longitude != null).length);

  // Basemap load fallback.
  let mapReadyFallback: ReturnType<typeof setTimeout> | undefined;

  // Live telemetry flash.
  let liveFlash = $state(false);
  let prevSeq: number | undefined = undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const seq = store.liveSeq;

    if (prevSeq !== undefined && seq > prevSeq) {
      liveFlash = false;

      requestAnimationFrame(() => (liveFlash = true));

      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (liveFlash = false), 900);
    }

    prevSeq = seq;
  });

  onMount(() => {
    // Initialize MapLibre once.
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

    map.on('load', () => {
      store.setMapReady();
    });

    // Never leave the UI stuck on "Initializing".
    mapReadyFallback = setTimeout(() => {
      store.setMapReady();
    }, 4000);

    // Clicking empty map clears selection.
    map.on('click', () => store.select(null));

    // Keep canvas sized correctly.
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

  // ---------------------------------------------------------------------------
  // MARKERS
  // ---------------------------------------------------------------------------

  function ensureMarker(m: maplibregl.Map, e: EventRow): void {
    if (e.latitude == null || e.longitude == null) return;
    if (markers.has(e.id)) return;

    const el = document.createElement('div');

    const fresh = Date.now() - Date.parse(e.createdAt) < FRESH_MS;

    el.className = fresh ? 'chimera-marker is-fresh' : 'chimera-marker';

    // Marker click selects the event.
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      store.select(e.id);
    });

    const marker = new maplibregl.Marker({
      element: el,
    })
      .setLngLat([e.longitude, e.latitude])
      .addTo(m);

    markers.set(e.id, marker);
  }

  // Sync markers with the existing event store.
  $effect(() => {
    const m = map;
    const evs = store.events;

    if (!m) return;

    for (const e of evs) {
      ensureMarker(m, e);
    }
  });

  // ---------------------------------------------------------------------------
  // SELECTION
  // ---------------------------------------------------------------------------

  let highlightedId: string | null = null;

  $effect(() => {
    const m = map;
    const selectedId = store.selectedId;

    if (!m) return;
    if (selectedId === highlightedId) return;

    // Remove previous highlight.
    if (highlightedId) {
      markers.get(highlightedId)?.getElement().classList.remove('is-selected');
    }

    highlightedId = selectedId;

    if (!selectedId) return;

    const marker = markers.get(selectedId);

    // Selected event may not have coordinates.
    if (!marker) return;

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
  <!-- MapLibre canvas -->
  <div bind:this={container} class="bg-surface-inset absolute inset-0"></div>

  <!--
    Offline world silhouette.

    This is deliberately local so the demo does not depend on:
    - OpenFreeMap
    - Mapbox
    - API keys
    - external tile servers
  -->
  <div
    class="chimera-world-placeholder pointer-events-none absolute inset-0 z-[1]"
    aria-hidden="true"
  >
    <svg viewBox="0 0 1000 500" class="h-full w-full" preserveAspectRatio="none">
      <!-- subtle latitude lines -->
      <g class="chimera-map-latitudes">
        <line x1="0" y1="100" x2="1000" y2="100" />
        <line x1="0" y1="150" x2="1000" y2="150" />
        <line x1="0" y1="200" x2="1000" y2="200" />
        <line x1="0" y1="250" x2="1000" y2="250" />
        <line x1="0" y1="300" x2="1000" y2="300" />
        <line x1="0" y1="350" x2="1000" y2="350" />
        <line x1="0" y1="400" x2="1000" y2="400" />
      </g>

      <!-- subtle longitude lines -->
      <g class="chimera-map-longitudes">
        <line x1="100" y1="0" x2="100" y2="500" />
        <line x1="200" y1="0" x2="200" y2="500" />
        <line x1="300" y1="0" x2="300" y2="500" />
        <line x1="400" y1="0" x2="400" y2="500" />
        <line x1="500" y1="0" x2="500" y2="500" />
        <line x1="600" y1="0" x2="600" y2="500" />
        <line x1="700" y1="0" x2="700" y2="500" />
        <line x1="800" y1="0" x2="800" y2="500" />
        <line x1="900" y1="0" x2="900" y2="500" />
      </g>

      <!-- simplified world landmass silhouette -->
      <g class="chimera-world-land" fill="currentColor" stroke="currentColor">
        <!-- North America -->
        <path
          d="
            M70 125
            L95 105
            L135 95
            L175 105
            L195 125
            L185 145
            L160 145
            L150 165
            L125 155
            L105 175
            L80 165
            L90 145
            L65 145
            Z
          "
        />

        <!-- South America -->
        <path
          d="
            M245 225
            L270 235
            L285 265
            L275 300
            L255 335
            L235 365
            L220 345
            L225 310
            L215 275
            L225 245
            Z
          "
        />

        <!-- Europe -->
        <path
          d="
            M425 125
            L450 105
            L480 108
            L500 125
            L490 145
            L465 145
            L450 160
            L430 150
            Z
          "
        />

        <!-- Africa -->
        <path
          d="
            M445 175
            L480 165
            L515 180
            L530 220
            L515 265
            L490 315
            L465 300
            L450 260
            L435 220
            Z
          "
        />

        <!-- Asia -->
        <path
          d="
            M505 105
            L550 90
            L600 100
            L640 115
            L680 105
            L725 125
            L755 150
            L735 175
            L700 170
            L670 190
            L630 175
            L600 190
            L565 170
            L530 165
            L510 145
            Z
          "
        />

        <!-- India / Southeast Asia -->
        <path
          d="
            M620 180
            L650 190
            L665 215
            L650 235
            L630 220
            L620 200
            Z
          "
        />

        <!-- Australia -->
        <path
          d="
            M760 305
            L800 290
            L850 300
            L880 325
            L870 350
            L830 365
            L790 350
            L765 330
            Z
          "
        />

        <!-- Greenland -->
        <path
          d="
            M305 55
            L345 45
            L380 60
            L370 90
            L330 100
            L300 85
            Z
          "
        />

        <!-- Japan -->
        <path
          d="
            M755 175
            L765 185
            L760 200
            L750 190
            Z
          "
        />

        <!-- Madagascar -->
        <path
          d="
            M535 285
            L545 300
            L540 325
            L530 315
            Z
          "
        />
      </g>
    </svg>
  </div>

  <!-- Centered state -->
  {#if !store.mapReady}
    <div
      class="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 text-center"
    >
      <span class="t-micro text-text-secondary"> Threat surface </span>

      <span class="t-micro flex items-center gap-2">
        <span class="bg-warn h-1.5 w-1.5 animate-pulse rounded-full"></span>

        Initializing…
      </span>
    </div>
  {:else if liveEvents > 0 && plotted === 0}
    <div
      class="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 text-center"
    >
      <span class="t-micro text-text-secondary"> No geolocated activity </span>

      <span class="text-text-muted max-w-[16rem] text-[11px]">
        Activity has been captured, but no source coordinates are available yet.
      </span>
    </div>
  {/if}

  <!-- Decorative grid -->
  <div class="chimera-map-grid pointer-events-none absolute inset-0 z-10"></div>

  <div class="chimera-map-vignette pointer-events-none absolute inset-0 z-10"></div>

  <!-- HUD: top-left -->
  <div
    class="border-border-subtle bg-surface-page/50 pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 backdrop-blur-sm"
  >
    <svg class="text-accent shrink-0" width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M9 1 L17 9 L9 17 L1 9 Z" fill="none" stroke="currentColor" stroke-width="1.4" />

      <circle cx="9" cy="9" r="1.8" fill="currentColor" />
    </svg>

    <span class="t-micro text-text-secondary"> Global Threat Telemetry </span>

    <StatusPill
      tone={store.wsStatus === 'open' ? 'ok' : 'warn'}
      label={store.wsStatus === 'open' ? 'LIVE' : 'RECONNECTING'}
      pulse={store.wsStatus === 'open'}
    />
  </div>

  <!-- HUD: top-right -->
  <div
    class="pointer-events-none absolute top-3 right-3 z-20 hidden flex-col items-end gap-1 text-right sm:flex"
  >
    <span class="t-micro flex items-center gap-1.5">
      <span class="bg-threat inline-block h-2 w-2 rounded-full"></span>
      Live attack
    </span>

    <span class="t-micro flex items-center gap-1.5">
      <span class="ring-threat-bright inline-block h-2 w-2 rounded-full ring-2"></span>
      Selected
    </span>
  </div>

  <!-- HUD: bottom-left -->
  <div
    class="border-border-subtle bg-surface-page/50 pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap items-end gap-x-5 gap-y-2 rounded-md border px-3 py-2 backdrop-blur-sm"
  >
    <div class="flex flex-col">
      <span class="t-micro"> Live Events </span>

      <span class="t-data text-text-primary text-sm" class:chimera-hud-flash={liveFlash}>
        {liveEvents}
      </span>
    </div>

    <div class="hidden flex-col sm:flex">
      <span class="t-micro"> Events / Min </span>

      <span class="t-data text-text-primary text-sm">
        {perMin}
      </span>
    </div>

    <div class="flex flex-col">
      <span class="t-micro"> Active Sources </span>

      <span class="t-data text-text-primary text-sm">
        {activeSources}
      </span>
    </div>

    <div class="hidden flex-col sm:flex">
      <span class="t-micro"> Map </span>

      <span class="t-data text-text-secondary text-sm"> GLOBAL </span>
    </div>

    {#if selected}
      <div class="flex flex-col">
        <span class="t-micro"> Src </span>

        <span class="t-data text-accent text-sm">
          {selected.sourceIp}
        </span>
      </div>
    {/if}
  </div>
</section>

<style>
  /*
   * Offline world map fallback.
   */

  .chimera-world-placeholder {
    color: rgba(100, 116, 139, 0.32);
  }

  .chimera-map-latitudes,
  .chimera-map-longitudes {
    stroke: rgba(100, 116, 139, 0.12);
    stroke-width: 0.7;
    fill: none;
  }

  .chimera-world-land {
    fill: rgba(100, 116, 139, 0.18);
    stroke: rgba(148, 163, 184, 0.25);
    stroke-width: 1;
    stroke-linejoin: round;
  }

  /*
   * Keep MapLibre's canvas and markers above the SVG silhouette.
   */

  :global(.maplibregl-canvas-container) {
    z-index: 2;
  }

  :global(.maplibregl-marker) {
    z-index: 5;
  }

  /*
   * Make the MapLibre canvas transparent so the SVG world can be seen.
   */

  :global(.maplibregl-canvas) {
    background: transparent !important;
  }
</style>
