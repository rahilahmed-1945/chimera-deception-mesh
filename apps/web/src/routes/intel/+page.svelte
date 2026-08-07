<script lang="ts">
  import { search } from '$lib/api';
  import EventList from '$lib/components/EventList.svelte';
  import Facets from '$lib/components/Facets.svelte';
  import type { SearchResponse } from '$lib/types';

  let q = $state('');
  let kind = $state<string | null>(null);
  let decoyType = $state<string | null>(null);
  let reputation = $state<string | null>(null);
  let data = $state<SearchResponse | null>(null);
  let selectedId = $state<string | null>(null);

  async function run(): Promise<void> {
    try {
      data = await search({
        q: q || undefined,
        kind: kind ?? undefined,
        decoyType: decoyType ?? undefined,
        reputation: reputation ?? undefined,
      });
    } catch {
      // ignore — best-effort
    }
  }

  // Re-run whenever the query text or any facet changes.
  $effect(() => {
    // establish reactive dependencies
    void q;
    void kind;
    void decoyType;
    void reputation;
    run();
  });
</script>

<div class="min-h-screen p-6">
  <header class="mb-4 flex items-baseline gap-4">
    <h1 class="text-2xl font-semibold tracking-tight text-neutral-100">Intel Explorer</h1>
    <a href="/" class="text-xs text-sky-400 hover:underline">← Dashboard</a>
  </header>

  <input
    bind:value={q}
    placeholder="Search events (username, ip, path, technique…)"
    class="mb-4 w-full rounded border border-neutral-700 bg-neutral-950 p-2 text-sm text-neutral-100"
  />

  <div class="grid gap-4 lg:grid-cols-[14rem_1fr]">
    <aside class="space-y-4">
      <Facets
        title="kind"
        facets={data?.facets.kind ?? []}
        selected={kind}
        onselect={(v) => (kind = v)}
      />
      <Facets
        title="decoy"
        facets={data?.facets.decoyType ?? []}
        selected={decoyType}
        onselect={(v) => (decoyType = v)}
      />
      <Facets
        title="reputation"
        facets={data?.facets.reputation ?? []}
        selected={reputation}
        onselect={(v) => (reputation = v)}
      />
    </aside>
    <div>
      <p class="mb-2 text-xs text-neutral-500">{data?.results.length ?? 0} results</p>
      <EventList events={data?.results ?? []} {selectedId} onselect={(id) => (selectedId = id)} />
    </div>
  </div>
</div>
