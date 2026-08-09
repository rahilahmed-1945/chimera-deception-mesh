<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { EventRow } from '$lib/types';
  import StatusPill from './StatusPill.svelte';

  let {
    events,
    selectedId,
    onselect,
    liveSeq,
    streamLabel,
    live,
    emptyTitle,
    emptyHint,
  }: {
    events: EventRow[];
    selectedId: string | null;
    onselect: (id: string) => void;
    // Optional live-event signal (dashboard only). When it increases, rows that
    // are new since the last render get a short entrance/highlight (U4). Omitted
    // on /intel, so search results never animate.
    liveSeq?: number;
    // When provided, render the operational header + internal scroll region
    // (dashboard). Omitted on /intel, which keeps its own plain results panel.
    streamLabel?: string;
    // WS connectivity for the header indicator (dashboard only).
    live?: boolean;
    // Empty-state override (e.g. /intel "No matches"). Defaults to a live-aware
    // operational message on the dashboard feed.
    emptyTitle?: string;
    emptyHint?: string;
  } = $props();

  // --- Live-row highlight (U4 architecture, unchanged) -----------------------
  const HIGHLIGHT_MS = 1100;
  const highlighted = new SvelteSet<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let prevIds = new Set<string>();
  let lastSeq: number | undefined = undefined;

  function markNew(id: string): void {
    highlighted.add(id);
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        highlighted.delete(id);
        timers.delete(id);
      }, HIGHLIGHT_MS),
    );
  }

  // Highlight only rows that arrived via a genuine live increment (never on the
  // first render or on any hydration/reconnect where liveSeq is unchanged).
  $effect(() => {
    const seq = liveSeq;
    const curIds = new Set(events.map((e) => e.id));
    if (lastSeq !== undefined && seq !== undefined && seq > lastSeq) {
      for (const e of events) if (!prevIds.has(e.id)) markNew(e.id);
    }
    lastSeq = seq;
    prevIds = curIds;
  });

  onDestroy(() => {
    for (const t of timers.values()) clearTimeout(t);
  });

  // --- Presentation helpers (real data only) ---------------------------------
  interface KindStyle {
    label: string;
    dot: string;
    text: string;
  }
  const KIND: Record<string, KindStyle> = {
    connection: { label: 'CONNECTION', dot: 'bg-accent', text: 'text-accent' },
    auth_attempt: { label: 'AUTH', dot: 'bg-warn', text: 'text-warn' },
    command: { label: 'COMMAND', dot: 'bg-text-secondary', text: 'text-text-primary' },
    http_request: { label: 'HTTP', dot: 'bg-accent', text: 'text-accent' },
    disconnect: { label: 'DISCONNECT', dot: 'bg-text-muted', text: 'text-text-muted' },
  };
  const kindOf = (k: string): KindStyle =>
    KIND[k] ?? { label: k.toUpperCase(), dot: 'bg-text-muted', text: 'text-text-muted' };

  const hms = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour12: false });

  const source = (e: EventRow): string =>
    e.sourceIp ? `${e.sourceIp}${e.sourcePort ? ':' + e.sourcePort : ''}` : 'UNKNOWN SOURCE';

  // One-line contextual preview from REAL payload fields; null => no preview.
  function preview(e: EventRow): string | null {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    switch (e.kind) {
      case 'command':
        return typeof p.command === 'string' && p.command.length > 0 ? p.command : null;
      case 'auth_attempt': {
        const u = typeof p.username === 'string' ? p.username : null;
        const m = typeof p.method === 'string' ? p.method : 'password';
        return u ? `${u} · ${m}` : `${m} authentication`;
      }
      case 'http_request': {
        const m = typeof p.method === 'string' ? p.method : '';
        const path = typeof p.path === 'string' ? p.path : '';
        const s = `${m} ${path}`.trim();
        return s.length > 0 ? s : null;
      }
      case 'connection':
        return 'session opened';
      case 'disconnect':
        return 'session closed';
      default:
        return null;
    }
  }
</script>

{#snippet feedRows()}
  {#each events as event (event.id)}
    {@const k = kindOf(event.kind)}
    {@const pv = preview(event)}
    {@const sel = selectedId === event.id}
    <li>
      <button
        type="button"
        onclick={() => onselect(event.id)}
        aria-current={sel ? 'true' : undefined}
        class="hover:bg-surface-elevated/60 flex w-full flex-col gap-0.5 border-l-2 px-3 py-2 text-left transition-colors {sel
          ? 'border-l-accent bg-surface-elevated'
          : 'border-l-transparent'}"
        class:chimera-row-new={highlighted.has(event.id)}
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="h-1.5 w-1.5 shrink-0 rounded-full {k.dot}" aria-hidden="true"></span>
          <span class="t-data shrink-0 text-[11px] text-text-muted">{hms(event.createdAt)}</span>
          <span class="t-micro shrink-0 {k.text}">{k.label}</span>
          <span
            class="t-data min-w-0 truncate text-xs {event.sourceIp
              ? 'text-text-primary'
              : 'text-text-muted'}">{source(event)}</span
          >
          {#if event.reputation}
            <span class="t-micro bg-warn/15 text-warn shrink-0 rounded px-1 leading-none"
              >{event.reputation}</span
            >
          {/if}
          {#if event.decoyType}
            <span class="t-micro ml-auto shrink-0 text-text-muted">{event.decoyType}</span>
          {/if}
        </div>
        {#if pv}
          <div class="t-data truncate pl-[1.1rem] text-[11px] text-text-secondary">{pv}</div>
        {/if}
      </button>
    </li>
  {:else}
    <li class="px-3 py-10 text-center">
      <div class="t-micro text-text-secondary">
        {emptyTitle ?? (live === false ? 'Event stream unavailable' : 'Awaiting telemetry')}
      </div>
      <p class="text-text-muted mx-auto mt-1.5 max-w-[18rem] text-xs">
        {emptyHint ??
          (live === false
            ? 'The live event stream is offline.'
            : 'No captured activity has reached the console yet.')}
      </p>
    </li>
  {/each}
{/snippet}

{#if streamLabel}
  <section
    class="border-border-subtle bg-surface-panel flex flex-col overflow-hidden rounded-lg border"
  >
    <header class="border-border-subtle flex items-center justify-between gap-2 border-b px-3 py-2">
      <span class="t-micro text-text-secondary">{streamLabel}</span>
      <div class="flex items-center gap-3">
        {#if live !== undefined}
          <StatusPill
            tone={live ? 'ok' : 'warn'}
            label={live ? 'LIVE' : 'RECONNECTING'}
            pulse={live}
          />
        {/if}
        <span class="t-micro">
          <span class="t-data text-text-secondary">{events.length}</span> buffered
        </span>
      </div>
    </header>
    <div class="max-h-[32rem] overflow-y-auto">
      <ul class="divide-border-subtle divide-y">{@render feedRows()}</ul>
    </div>
  </section>
{:else}
  <ul
    class="divide-border-subtle border-border-subtle bg-surface-panel divide-y overflow-hidden rounded-lg border"
  >
    {@render feedRows()}
  </ul>
{/if}
