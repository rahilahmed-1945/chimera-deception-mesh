<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { fetchRecentEvents, fetchStats } from '$lib/api';
  import TopBar from '$lib/components/TopBar.svelte';
  import { store } from '$lib/stores/events.svelte';
  import type { EventRow } from '$lib/types';
  import { connectEvents } from '$lib/ws';

  let { children } = $props();

  // Presentation entry: the first-impression layer over the live console. It is
  // dismissed by the CTA or any key (never traps), shows real store state, and
  // is shown once per page load. The dashboard renders live behind it.
  let entryVisible = $state(true);
  let entryHidden = $state(false);
  let reduceMotion = $state(false);
  let ctaEl = $state<HTMLButtonElement | undefined>(undefined);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function enterConsole(): void {
    if (entryHidden) return;
    // Immediately click-through + fade (CSS, applied to the still-mounted
    // element) so the overlay can never block the console; then unmount.
    entryHidden = true;
    hideTimer = setTimeout(() => (entryVisible = false), reduceMotion ? 0 : 320);
  }

  async function hydrate(): Promise<void> {
    try {
      const [rows, stats] = await Promise.all([fetchRecentEvents(100), fetchStats()]);
      store.hydrate(rows);
      store.setStats(stats);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'failed to load');
    }
  }

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mq.matches;
    const onMq = (): void => {
      reduceMotion = mq.matches;
    };
    mq.addEventListener('change', onMq);

    // Any key enters the console (does not trap keyboard focus).
    const onKey = (e: KeyboardEvent): void => {
      if (!entryVisible) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        enterConsole();
      }
    };
    window.addEventListener('keydown', onKey);
    queueMicrotask(() => ctaEl?.focus());

    let hadClosed = false;
    void hydrate();

    const disconnect = connectEvents({
      onEvent: (e) => store.addLive(e as EventRow),
      onStatus: (s) => {
        store.setStatus(s);
        if (s === 'closed') {
          hadClosed = true;
        } else if (s === 'open' && hadClosed) {
          // Re-hydrate from REST after every successful reconnect (backfill).
          hadClosed = false;
          void hydrate();
        }
      },
    });

    const statsTimer = setInterval(() => {
      fetchStats()
        .then(store.setStats)
        .catch(() => undefined);
    }, 10000);

    return () => {
      mq.removeEventListener('change', onMq);
      window.removeEventListener('keydown', onKey);
      clearTimeout(hideTimer);
      disconnect();
      clearInterval(statsTimer);
    };
  });

  // Honest readiness signals derived from real store state.
  const stats = $derived(store.stats);
  const statsReady = $derived(stats !== null);
  const streamReady = $derived(stats !== null || store.events.length > 0);
  const wsOpen = $derived(store.wsStatus === 'open');
  const fmt = (v: number | null | undefined): string =>
    v == null ? '—' : v.toLocaleString('en-US');
</script>

{#snippet readiness(label: string, state: string, tone: 'ok' | 'warn' | 'muted')}
  <div
    class="border-border-subtle flex items-center justify-between gap-3 border-b py-1.5 last:border-0"
  >
    <span class="t-micro">{label}</span>
    <span
      class="t-micro flex items-center gap-1.5 {tone === 'ok'
        ? 'text-ok'
        : tone === 'warn'
          ? 'text-warn'
          : 'text-text-muted'}"
    >
      <span
        class="h-1.5 w-1.5 rounded-full {tone === 'ok'
          ? 'bg-ok'
          : tone === 'warn'
            ? 'bg-warn'
            : 'bg-text-muted'} {tone === 'warn' && !reduceMotion ? 'animate-pulse' : ''}"
        aria-hidden="true"
      ></span>
      {state}
    </span>
  </div>
{/snippet}

<div class="flex min-h-screen flex-col">
  <TopBar />

  <!-- System diagnostics (non-blocking; amber — infra failure is not a threat). -->
  {#if store.restError}
    <div class="mx-auto w-full max-w-[120rem] px-4 pt-4 sm:px-6" role="status" aria-live="polite">
      <div
        class="border-warn/30 bg-warn/10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2"
      >
        <span class="t-micro text-warn">Telemetry service unavailable</span>
        <span class="text-text-secondary text-xs"
          >Live counters and history could not be retrieved.</span
        >
        <button
          type="button"
          onclick={hydrate}
          class="text-accent hover:text-accent/80 ml-auto text-xs underline-offset-2 hover:underline"
          >Retry</button
        >
      </div>
    </div>
  {:else if store.wsStatus === 'closed' && store.hasConnected}
    <div class="mx-auto w-full max-w-[120rem] px-4 pt-4 sm:px-6" role="status" aria-live="polite">
      <div class="border-warn/30 bg-warn/10 flex items-center gap-2 rounded-md border px-3 py-1.5">
        <span
          class="bg-warn h-1.5 w-1.5 rounded-full {reduceMotion ? '' : 'animate-pulse'}"
          aria-hidden="true"
        ></span>
        <span class="t-micro text-warn">Event stream reconnecting</span>
      </div>
    </div>
  {/if}

  <main class="mx-auto w-full max-w-[120rem] flex-1 px-4 py-5 sm:px-6">
    {@render children()}
  </main>
</div>

{#if entryVisible}
  <div
    class="bg-surface-page fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-y-auto px-6 py-10 transition-opacity duration-300 {entryHidden
      ? 'pointer-events-none opacity-0'
      : ''}"
    aria-label="Chimera — Deception Mesh"
  >
    <!-- Atmospheric depth: mesh grid + soft cyan glow (decorative). -->
    <div class="chimera-entry-grid pointer-events-none absolute inset-0" aria-hidden="true"></div>
    <div class="chimera-entry-glow pointer-events-none absolute inset-0" aria-hidden="true"></div>

    <div
      class="chimera-entry-content relative z-10 flex w-full max-w-md flex-col items-center text-center"
    >
      <div class="chimera-entry-mark text-accent">
        <svg width="46" height="46" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M9 1 L17 9 L9 17 L1 9 Z" fill="none" stroke="currentColor" stroke-width="1.1" />
          <path
            d="M9 4.5 L13.5 9 L9 13.5 L4.5 9 Z"
            fill="none"
            stroke="currentColor"
            stroke-width="0.8"
            opacity="0.5"
          />
          <circle cx="9" cy="9" r="1.6" fill="currentColor" />
        </svg>
      </div>

      <h1 class="text-text-primary mt-5 text-3xl font-semibold tracking-tight">Chimera</h1>
      <div class="t-micro mt-1">/ Deception Mesh</div>

      <p class="text-text-secondary mt-5 text-sm">Live deception telemetry</p>
      <p class="text-text-muted mt-1 max-w-sm text-xs">
        Real-world attack activity is being captured, enriched and investigated in real time.
      </p>

      <!-- Subsystem readiness — real store state (updates live as it comes online). -->
      <div class="mt-6 w-full max-w-xs" aria-hidden="true">
        {@render readiness(
          'Event stream',
          streamReady ? 'READY' : 'CONNECTING',
          streamReady ? 'ok' : 'warn',
        )}
        {@render readiness(
          'Threat map',
          store.mapReady ? 'READY' : 'INITIALIZING',
          store.mapReady ? 'ok' : 'warn',
        )}
        {@render readiness('WebSocket', wsOpen ? 'LIVE' : 'CONNECTING', wsOpen ? 'ok' : 'warn')}
        {@render readiness('Statistics', statsReady ? 'READY' : '—', statsReady ? 'ok' : 'muted')}
        {@render readiness(
          'Deception nodes',
          statsReady ? `${stats?.decoys} online` : '—',
          statsReady ? 'ok' : 'muted',
        )}
      </div>

      <!-- Real telemetry -->
      <div class="text-text-secondary mt-6 flex items-center gap-3 text-xs">
        <span class="flex items-baseline gap-1.5"
          ><span class="t-micro">Events</span><span class="t-data text-text-primary"
            >{fmt(stats?.totalEvents)}</span
          ></span
        >
        <span class="text-border-hairline" aria-hidden="true">·</span>
        <span class="flex items-baseline gap-1.5"
          ><span class="t-micro">Actors</span><span class="t-data text-text-primary"
            >{fmt(stats?.uniqueAttackers)}</span
          ></span
        >
        <span class="text-border-hairline" aria-hidden="true">·</span>
        <span class="flex items-baseline gap-1.5"
          ><span class="t-micro">Decoys</span><span class="t-data text-text-primary"
            >{fmt(stats?.decoys)}</span
          ></span
        >
      </div>

      <button
        bind:this={ctaEl}
        type="button"
        onclick={enterConsole}
        class="border-accent/30 bg-accent/15 text-accent hover:bg-accent/25 mt-8 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
      >
        Enter operations console →
      </button>
      <div class="t-micro mt-3">Press Enter or Esc to continue</div>
    </div>
  </div>
{/if}
