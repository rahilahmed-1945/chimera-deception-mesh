<script lang="ts">
  import type { EventRow } from '$lib/types';
  import { relativeTime } from '$lib/time';

  let {
    events,
    selectedId,
    onselect,
  }: {
    events: EventRow[];
    selectedId: string | null;
    onselect: (id: string) => void;
  } = $props();
</script>

<ul class="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
  {#each events as event (event.id)}
    <li>
      <button
        type="button"
        onclick={() => onselect(event.id)}
        class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-900 {selectedId ===
        event.id
          ? 'bg-neutral-900'
          : ''}"
      >
        <span class="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-neutral-300">
          {event.kind}
        </span>
        {#if event.decoyType}
          <span class="text-[10px] text-neutral-500">{event.decoyType}</span>
        {/if}
        <span class="font-mono text-xs text-neutral-200">
          {event.sourceIp}{event.sourcePort ? ':' + event.sourcePort : ''}
        </span>
        {#if event.payload?.username}
          <span class="truncate text-xs text-neutral-400">{String(event.payload.username)}</span>
        {/if}
        <span class="ml-auto whitespace-nowrap text-[10px] text-neutral-600">
          {relativeTime(event.createdAt)}
        </span>
      </button>
    </li>
  {:else}
    <li class="px-3 py-10 text-center text-sm text-neutral-600">No events yet</li>
  {/each}
</ul>
