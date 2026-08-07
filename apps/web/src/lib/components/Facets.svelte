<script lang="ts">
  import type { Facet } from '$lib/types';

  let {
    title,
    facets,
    selected,
    onselect,
  }: {
    title: string;
    facets: Facet[];
    selected: string | null;
    onselect: (value: string | null) => void;
  } = $props();
</script>

<div>
  <div class="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{title}</div>
  {#if facets.length === 0}
    <div class="text-xs text-neutral-700">—</div>
  {:else}
    <ul class="space-y-0.5">
      {#each facets as f (f.value)}
        <li>
          <button
            type="button"
            onclick={() => onselect(selected === f.value ? null : f.value)}
            class="flex w-full justify-between rounded px-1.5 py-0.5 text-xs {selected === f.value
              ? 'bg-sky-900/50 text-sky-300'
              : 'text-neutral-300 hover:bg-neutral-800'}"
          >
            <span>{f.value}</span><span class="text-neutral-500">{f.count}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
