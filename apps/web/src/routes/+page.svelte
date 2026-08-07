<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchRecentEvents, fetchStats } from '$lib/api';
  import DecoysPanel from '$lib/components/DecoysPanel.svelte';
  import EventDetail from '$lib/components/EventDetail.svelte';
  import EventList from '$lib/components/EventList.svelte';
  import KpiCards from '$lib/components/KpiCards.svelte';
  import { store } from '$lib/stores/events.svelte';
  import type { EventRow } from '$lib/types';
  import { connectEvents } from '$lib/ws';

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
      disconnect();
      clearInterval(statsTimer);
    };
  });
</script>

<div class="min-h-screen p-6">
  <header class="mb-6 flex items-baseline justify-between">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-neutral-100">Chimera</h1>
      <p class="text-sm text-neutral-500">Deception Mesh — live events</p>
    </div>
    <div class="flex items-baseline gap-4">
      <a href="/intel" class="text-xs text-sky-400 hover:underline">Intel Explorer →</a>
      <span class="text-xs {store.wsStatus === 'open' ? 'text-emerald-400' : 'text-red-400'}">
        ● {store.wsStatus === 'open' ? 'live' : 'reconnecting…'}
      </span>
    </div>
  </header>

  {#if store.restError}
    <div class="mb-4 rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">
      {store.restError} ·
      <button type="button" class="underline" onclick={hydrate}>retry</button>
    </div>
  {/if}

  <KpiCards stats={store.stats} />

  <div class="mt-4">
    <DecoysPanel />
  </div>

  <div class="mt-6 grid gap-4 lg:grid-cols-[1fr_20rem]">
    <EventList events={store.events} selectedId={store.selectedId} onselect={store.select} />
    <EventDetail event={store.selected} />
  </div>
</div>
