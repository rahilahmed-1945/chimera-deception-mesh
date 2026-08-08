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

<div class="px-3 py-3">
  <div class="t-micro mb-2">{title}</div>
  {#if facets.length === 0}
    <div class="text-text-disabled text-xs">—</div>
  {:else}
    <ul class="space-y-0.5">
      {#each facets as f (f.value)}
        {@const on = selected === f.value}
        <li>
          <button
            type="button"
            aria-pressed={on}
            onclick={() => onselect(on ? null : f.value)}
            class="hover:bg-surface-elevated/60 flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-xs transition-colors"
          >
            <!-- Checkbox indicator: selection is shown by shape (fill + check),
                 not colour alone. -->
            <span
              class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border {on
                ? 'border-accent bg-accent/80'
                : 'border-border-hairline'}"
            >
              {#if on}
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                  <path
                    d="M1 4 L3 6 L7 2"
                    fill="none"
                    stroke="var(--color-surface-page)"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            </span>
            <span class="min-w-0 flex-1 truncate {on ? 'text-text-primary' : 'text-text-secondary'}"
              >{f.value}</span
            >
            <span class="t-data text-text-muted shrink-0">{f.count}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
