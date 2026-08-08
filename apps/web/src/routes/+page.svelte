<script lang="ts">
  import DecoysPanel from '$lib/components/DecoysPanel.svelte';
  import EventDetail from '$lib/components/EventDetail.svelte';
  import EventList from '$lib/components/EventList.svelte';
  import KpiCards from '$lib/components/KpiCards.svelte';
  import WorldMap from '$lib/components/WorldMap.svelte';
  import { store } from '$lib/stores/events.svelte';

  // The live data plane (WS + stats polling + hydrate/reconnect) is owned by the
  // shell (+layout.svelte); this page renders the console from the shared store.
</script>

<div class="space-y-4">
  <KpiCards stats={store.stats} liveSeq={store.liveSeq} events={store.events} />

  <!-- Command-center grid: map is the primary hero column with the live feed
       beneath it; the right rail carries decoys + the investigation panel.
       Stacks to a single column below xl (no horizontal overflow). -->
  <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <div class="flex min-w-0 flex-col gap-4">
      <WorldMap />
      <EventList
        events={store.events}
        selectedId={store.selectedId}
        onselect={store.select}
        liveSeq={store.liveSeq}
        streamLabel="Event stream"
        live={store.wsStatus === 'open'}
      />
    </div>
    <div class="flex flex-col gap-4">
      <DecoysPanel />
      <EventDetail event={store.selected} onclose={() => store.select(null)} />
    </div>
  </div>
</div>
