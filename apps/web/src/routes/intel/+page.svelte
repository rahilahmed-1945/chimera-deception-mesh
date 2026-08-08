<script lang="ts">
  import { search } from '$lib/api';
  import EventDetail from '$lib/components/EventDetail.svelte';
  import EventList from '$lib/components/EventList.svelte';
  import Facets from '$lib/components/Facets.svelte';
  import type { EventRow, SearchResponse } from '$lib/types';

  let q = $state('');
  let kind = $state<string | null>(null);
  let decoyType = $state<string | null>(null);
  let reputation = $state<string | null>(null);
  let data = $state<SearchResponse | null>(null);
  let selectedId = $state<string | null>(null);
  let searching = $state(false);
  let searchError = $state(false);
  let filtersOpen = $state(false);

  async function run(): Promise<void> {
    searching = true;
    try {
      data = await search({
        q: q || undefined,
        kind: kind ?? undefined,
        decoyType: decoyType ?? undefined,
        reputation: reputation ?? undefined,
      });
      searchError = false;
    } catch {
      searchError = true;
    } finally {
      searching = false;
    }
  }

  // Re-run whenever the query text or any facet changes.
  $effect(() => {
    void q;
    void kind;
    void decoyType;
    void reputation;
    run();
  });

  const results = $derived(data?.results ?? []);
  const hasFilters = $derived(!!(q || kind || decoyType || reputation));
  const activeFacets = $derived([kind, decoyType, reputation].filter(Boolean).length);
  // The selected result drives the SHARED EventDetail (search results aren't in
  // store.events, so selection stays local — no second drawer, no store mutation).
  const selectedResult = $derived<EventRow | null>(
    results.find((r) => r.id === selectedId) ?? null,
  );

  function clearFilters(): void {
    q = '';
    kind = null;
    decoyType = null;
    reputation = null;
  }
</script>

{#snippet chip(label: string, onremove: () => void)}
  <span
    class="border-border-hairline bg-surface-elevated t-micro text-text-secondary inline-flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-2.5"
  >
    {label}
    <button
      type="button"
      onclick={onremove}
      aria-label={'Remove filter ' + label}
      class="text-text-muted hover:text-text-primary hover:bg-surface-inset flex h-4 w-4 items-center justify-center rounded-full leading-none"
      >×</button
    >
  </span>
{/snippet}

<div class="space-y-4">
  <!-- ── Identity ────────────────────────────────────────────────────────── -->
  <header>
    <div class="flex items-baseline gap-3">
      <h1 class="t-title text-text-primary">Intelligence</h1>
      <span class="t-micro">Threat search &amp; triage</span>
    </div>
    <p class="text-text-muted mt-1 max-w-2xl text-xs">
      Search captured activity across the deception mesh — source IPs, commands, usernames, request
      paths, event IDs and MITRE techniques.
    </p>
  </header>

  <!-- ── Search command field ────────────────────────────────────────────── -->
  <div
    class="border-border-hairline bg-surface-inset focus-within:border-accent/60 flex items-center gap-2.5 rounded-lg border px-3 transition-colors"
  >
    <svg
      class="text-text-muted shrink-0"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
      <path d="M10.5 10.5 L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>
    <input
      bind:value={q}
      aria-label="Search captured activity"
      placeholder="source IP, command, username, path, technique…"
      class="text-text-primary placeholder:text-text-muted h-11 w-full bg-transparent text-sm outline-none"
    />
    {#if q}
      <button
        type="button"
        onclick={() => (q = '')}
        aria-label="Clear search"
        class="text-text-muted hover:text-text-primary hover:bg-surface-elevated flex h-7 w-7 shrink-0 items-center justify-center rounded"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M1 1 L11 11 M11 1 L1 11"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    {/if}
  </div>

  <!-- ── Active filters ──────────────────────────────────────────────────── -->
  {#if hasFilters}
    <div class="flex flex-wrap items-center gap-2">
      <span class="t-micro">Active</span>
      {#if q}{@render chip('“' + q + '”', () => (q = ''))}{/if}
      {#if kind}{@render chip(kind, () => (kind = null))}{/if}
      {#if decoyType}{@render chip(decoyType, () => (decoyType = null))}{/if}
      {#if reputation}{@render chip(reputation, () => (reputation = null))}{/if}
      <button
        type="button"
        onclick={clearFilters}
        class="t-micro text-accent hover:text-accent/80 transition-colors">Clear all</button
      >
    </div>
  {/if}

  <!-- Mobile: collapsible filter disclosure (rail is always shown at lg+). -->
  <button
    type="button"
    onclick={() => (filtersOpen = !filtersOpen)}
    aria-expanded={filtersOpen}
    class="border-border-hairline bg-surface-panel t-micro text-text-secondary flex w-full items-center justify-between rounded-md border px-3 py-2.5 lg:hidden"
  >
    <span>Filters{activeFacets ? ` · ${activeFacets} active` : ''}</span>
    <span aria-hidden="true">{filtersOpen ? '−' : '+'}</span>
  </button>

  <!-- ── Workbench: filters · results · investigation ────────────────────── -->
  <div
    class="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_22rem]"
  >
    <!-- Filter rail -->
    <aside
      class="border-border-subtle bg-surface-panel divide-border-subtle divide-y overflow-hidden rounded-lg border {filtersOpen
        ? 'block'
        : 'hidden'} lg:block"
      aria-label="Filters"
    >
      <Facets
        title="Event type"
        facets={data?.facets.kind ?? []}
        selected={kind}
        onselect={(v) => (kind = v)}
      />
      <Facets
        title="Decoy"
        facets={data?.facets.decoyType ?? []}
        selected={decoyType}
        onselect={(v) => (decoyType = v)}
      />
      <Facets
        title="Reputation"
        facets={data?.facets.reputation ?? []}
        selected={reputation}
        onselect={(v) => (reputation = v)}
      />
    </aside>

    <!-- Results -->
    <div class="min-w-0">
      <div
        class="border-border-subtle mb-3 flex items-baseline justify-between gap-2 border-b pb-2"
      >
        <div class="flex items-baseline gap-2">
          <h2 class="t-micro">Results</h2>
          <span class="t-data text-text-primary text-sm">{results.length}</span>
          <span class="t-micro">events</span>
        </div>
        <div class="flex items-center gap-2">
          {#if searching}
            <span class="bg-accent h-1.5 w-1.5 animate-pulse rounded-full" aria-hidden="true"
            ></span>
          {/if}
          <span class="t-micro">{hasFilters ? 'Filtered' : 'All activity'}</span>
        </div>
      </div>

      {#if searchError}
        <div
          class="border-warn/30 bg-warn/10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-3"
          role="status"
          aria-live="polite"
        >
          <span class="t-micro text-warn">Intelligence index unavailable</span>
          <span class="text-text-secondary text-xs">The search service could not be reached.</span>
          <button
            type="button"
            onclick={run}
            class="text-accent hover:text-accent/80 ml-auto text-xs hover:underline">Retry</button
          >
        </div>
      {:else if data === null && searching}
        <!-- Compact skeleton matching the result rows (initial load only). -->
        <div
          class="border-border-subtle bg-surface-panel divide-border-subtle divide-y overflow-hidden rounded-lg border"
        >
          {#each Array(6) as _, i (i)}
            <div class="flex flex-col gap-1.5 px-3 py-2.5">
              <div class="bg-surface-elevated h-3 w-2/3 animate-pulse rounded"></div>
              <div class="bg-surface-elevated h-2.5 w-1/3 animate-pulse rounded"></div>
            </div>
          {/each}
        </div>
      {:else}
        <EventList
          events={results}
          {selectedId}
          onselect={(id) => (selectedId = id)}
          emptyTitle="No matches"
          emptyHint={hasFilters
            ? 'No events match the current filters.'
            : 'No events have been captured yet.'}
        />
      {/if}
    </div>

    <!-- Investigation drawer: shared EventDetail (rail at xl+, bottom sheet
         below xl via its own responsive styling — no duplicate drawer). -->
    <EventDetail event={selectedResult} onclose={() => (selectedId = null)} />
  </div>
</div>
