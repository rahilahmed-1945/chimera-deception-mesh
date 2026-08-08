<script lang="ts">
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { store } from '$lib/stores/events.svelte';
  import StatusPill from './StatusPill.svelte';

  // Live UTC clock — browser timer only, no network. SSR-safe (onMount).
  let clock = $state('--:--:--');
  // Browser online/offline, only to distinguish RECONNECTING vs OFFLINE. This
  // reads the existing WS state (store.wsStatus); it never opens a socket.
  let online = $state(true);

  onMount(() => {
    const tick = () => (clock = new Date().toISOString().slice(11, 19));
    tick();
    const timer = setInterval(tick, 1000);

    online = navigator.onLine;
    const goOnline = () => (online = true);
    const goOffline = () => (online = false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  });

  // Map the existing WS state onto operator-facing states. Red is NOT used here
  // — infrastructure state is never a threat. CONNECTING is the first connect;
  // RECONNECTING only after we've been live at least once (honest distinction).
  const ws = $derived(
    store.wsStatus === 'open'
      ? { tone: 'ok' as const, label: 'LIVE', pulse: true }
      : !online
        ? { tone: 'muted' as const, label: 'OFFLINE', pulse: false }
        : store.hasConnected
          ? { tone: 'warn' as const, label: 'RECONNECTING', pulse: false }
          : { tone: 'warn' as const, label: 'CONNECTING', pulse: false },
  );

  const path = $derived($page.url.pathname);
  const isOverview = $derived(path === '/');
  const isIntel = $derived(path.startsWith('/intel'));
  const s = $derived(store.stats);

  // Coalesced live-event notification: one toast per burst, counting new events
  // within a rolling window, auto-hiding ~1.2s after the last one. Keyed off the
  // genuine live signal (store.liveSeq) — never on hydration/reconnect.
  let notifShow = $state(false);
  let notifCount = $state(0);
  let notifLastSeq: number | undefined = undefined;
  let notifHide: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const seq = store.liveSeq;
    if (notifLastSeq !== undefined && seq > notifLastSeq) {
      if (!notifShow) notifCount = 0; // start of a fresh burst
      notifCount += seq - notifLastSeq;
      notifShow = true;
      clearTimeout(notifHide);
      notifHide = setTimeout(() => (notifShow = false), 1200);
    }
    notifLastSeq = seq;
  });

  onDestroy(() => clearTimeout(notifHide));

  const notifLabel = $derived(notifCount > 1 ? `${notifCount} NEW EVENTS` : 'THREAT DETECTED');
</script>

<header
  class="border-border-subtle bg-surface-panel/80 sticky top-0 z-40 border-b backdrop-blur-md"
>
  <div class="mx-auto flex h-14 w-full max-w-[120rem] items-center gap-2 px-4 sm:gap-4 sm:px-6">
    <!-- Brand: compact geometric node mark + wordmark -->
    <a href="/" class="flex items-center gap-2.5" aria-label="Chimera — Overview">
      <svg
        class="text-accent shrink-0"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        aria-hidden="true"
      >
        <path d="M9 1 L17 9 L9 17 L1 9 Z" fill="none" stroke="currentColor" stroke-width="1.4" />
        <circle cx="9" cy="9" r="1.8" fill="currentColor" />
      </svg>
      <span class="text-text-primary text-sm font-semibold tracking-tight">Chimera</span>
      <span class="t-micro hidden leading-none sm:inline">Deception Mesh</span>
    </a>

    <!-- Primary nav — always accessible (compact on mobile, no menu needed). -->
    <nav class="ml-0.5 flex items-center gap-0.5 sm:ml-1 sm:gap-1" aria-label="Primary">
      <a
        href="/"
        aria-current={isOverview ? 'page' : undefined}
        class="rounded px-2.5 py-1.5 text-xs transition-colors {isOverview
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-muted hover:text-text-secondary'}">Overview</a
      >
      <a
        href="/intel"
        aria-current={isIntel ? 'page' : undefined}
        class="rounded px-2.5 py-1.5 text-xs transition-colors {isIntel
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-muted hover:text-text-secondary'}">Intel</a
      >
    </nav>

    <!-- Operational cluster: counters · clock · WS status -->
    <div class="ml-auto flex items-center gap-3 sm:gap-4">
      <div class="hidden items-center gap-2.5 md:flex">
        <span class="flex items-baseline gap-1.5">
          <span class="t-micro">Events</span>
          <span class="t-data text-text-secondary text-xs">{s?.totalEvents ?? '—'}</span>
        </span>
        <span class="text-border-hairline" aria-hidden="true">·</span>
        <span class="flex items-baseline gap-1.5">
          <span class="t-micro">Actors</span>
          <span class="t-data text-text-secondary text-xs">{s?.uniqueAttackers ?? '—'}</span>
        </span>
        <span class="text-border-hairline" aria-hidden="true">·</span>
        <span class="flex items-baseline gap-1.5">
          <span class="t-micro">Decoys</span>
          <span class="t-data text-text-secondary text-xs">{s?.decoys ?? '—'}</span>
        </span>
      </div>

      <span
        class="t-data text-text-secondary hidden text-xs lg:inline-flex lg:items-baseline lg:gap-1.5"
      >
        <span class="text-text-muted">UTC</span>
        {clock}
      </span>

      <StatusPill tone={ws.tone} label={ws.label} pulse={ws.pulse} />
    </div>
  </div>

  <!-- Coalesced live-event toast: overlay anchored below the bar (no reflow,
       does not replace the WS pill). Polite live region announces once per burst. -->
  <div
    class="pointer-events-none absolute top-full right-4 mt-1 sm:right-6"
    aria-live="polite"
    aria-atomic="true"
  >
    {#if notifShow}
      <span
        class="chimera-notif-in border-border-threat bg-surface-panel/90 text-threat inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-md"
      >
        <span class="bg-threat inline-block h-1.5 w-1.5 rounded-full"></span>
        <span class="t-micro text-threat">{notifLabel}</span>
      </span>
    {/if}
  </div>
</header>
