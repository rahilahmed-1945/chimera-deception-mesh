<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { EventRow, Stats } from '$lib/types';

  // Real values come from /stats (store.stats). liveSeq (U4) drives the brief
  // live acknowledgement. events (optional) feeds ONLY the Last-hour activity
  // sparkline — derived locally from real createdAt timestamps, no API/interval.
  let {
    stats,
    liveSeq,
    events = [],
  }: { stats: Stats | null; liveSeq?: number; events?: EventRow[] } = $props();

  type Accent = 'cyan' | 'neutral' | 'warn' | 'ok';
  interface Card {
    key: string;
    label: string;
    value: number | null;
    sub: string;
    accent: Accent;
    live: boolean;
    spark?: boolean;
  }

  const cards = $derived<Card[]>([
    {
      key: 'events',
      label: 'Total events',
      value: stats?.totalEvents ?? null,
      sub: 'All captured',
      accent: 'cyan',
      live: true,
    },
    {
      key: 'actors',
      label: 'Unique actors',
      value: stats?.uniqueAttackers ?? null,
      sub: 'Distinct sources',
      accent: 'neutral',
      live: false,
    },
    {
      key: 'hour',
      label: 'Last hour',
      value: stats?.lastHour ?? null,
      sub: 'Recent activity',
      accent: 'warn',
      live: true,
      spark: true,
    },
    {
      key: 'decoys',
      label: 'Active decoys',
      value: stats?.decoys ?? null,
      sub: 'Operational',
      accent: 'ok',
      live: false,
    },
  ]);

  const barCls: Record<Accent, string> = {
    cyan: 'bg-accent/60',
    neutral: 'bg-border-hairline',
    warn: 'bg-warn/60',
    ok: 'bg-ok/70',
  };
  const dotCls: Record<Accent, string> = {
    cyan: 'bg-accent',
    neutral: 'bg-text-muted',
    warn: 'bg-warn',
    ok: 'bg-ok',
  };

  const fmt = (v: number | null): string => (v == null ? '—' : v.toLocaleString('en-US'));

  // Last-hour activity shape from the real event buffer (most-recent on the
  // right). Recomputes when events change; no timer, no fabricated values.
  const BINS = 14;
  const spark = $derived.by(() => {
    const now = Date.now();
    const window = 3_600_000;
    const size = window / BINS;
    const bins = new Array<number>(BINS).fill(0);
    for (const e of events) {
      const age = now - Date.parse(e.createdAt);
      if (age >= 0 && age < window) {
        const idx = BINS - 1 - Math.floor(age / size);
        if (idx >= 0 && idx < BINS) bins[idx] += 1;
      }
    }
    const max = Math.max(1, ...bins);
    return bins.map((c) => c / max);
  });

  // U4 live acknowledgement (unchanged architecture; refined visuals in CSS).
  let ack = $state(false);
  let lastSeq: number | undefined = undefined;
  let ackTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const seq = liveSeq;
    if (lastSeq !== undefined && seq !== undefined && seq > lastSeq) {
      ack = true;
      clearTimeout(ackTimer);
      ackTimer = setTimeout(() => (ack = false), 900);
    }
    lastSeq = seq;
  });

  onDestroy(() => clearTimeout(ackTimer));
</script>

<dl class="grid grid-cols-2 gap-2 lg:grid-cols-4">
  {#each cards as card (card.key)}
    <div
      class="chimera-kpi-cell border-border-subtle bg-surface-panel relative overflow-hidden rounded-md border p-3.5"
      class:chimera-kpi-ack={ack && card.live}
    >
      <!-- semantic accent rail (meaning is also carried by the labels) -->
      <span class="absolute inset-y-0 left-0 w-[2px] {barCls[card.accent]}" aria-hidden="true"
      ></span>

      <dt class="flex items-center gap-1.5">
        <span
          class="h-1.5 w-1.5 shrink-0 rounded-full {dotCls[card.accent]}"
          class:animate-pulse={ack && card.live}
          aria-hidden="true"
        ></span>
        <span class="t-micro">{card.label}</span>
        {#if card.live}
          <span
            class="t-micro text-accent ml-auto transition-opacity duration-300"
            style:opacity={ack ? 1 : 0}
            aria-hidden="true">● live</span
          >
        {/if}
      </dt>

      <dd class="mt-1.5 flex items-end justify-between gap-2">
        {#if card.value == null}
          <!-- Compact loading placeholder (no fabricated number). -->
          <span
            class="bg-surface-elevated inline-block h-6 w-14 animate-pulse rounded"
            aria-hidden="true"
          ></span>
          <span class="sr-only">Loading</span>
        {:else}
          {#key card.value}
            <span class="chimera-num t-data text-text-primary text-2xl leading-none font-semibold"
              >{fmt(card.value)}</span
            >
          {/key}
        {/if}
        {#if card.spark}
          <div class="flex h-6 items-end gap-[2px]" aria-hidden="true">
            {#each spark as h, i (i)}
              <span
                class="bg-warn/45 w-[3px] rounded-sm"
                style="height: {Math.max(10, Math.round(h * 100))}%"
              ></span>
            {/each}
          </div>
        {/if}
      </dd>

      <dd class="t-micro mt-1.5 opacity-70">{card.sub}</dd>
    </div>
  {/each}
</dl>
