<script lang="ts">
  import type { EventRow } from '$lib/types';

  let { event }: { event: EventRow | null } = $props();
</script>

{#if event}
  <div class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
    <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      <span class="text-neutral-500">kind</span>
      <span class="text-neutral-200">{event.kind}</span>
      <span class="text-neutral-500">decoy</span>
      <span class="text-neutral-200">{event.decoyType ?? '—'}</span>
      <span class="text-neutral-500">source</span>
      <span class="font-mono text-neutral-200">
        {event.sourceIp}{event.sourcePort ? ':' + event.sourcePort : ''}
      </span>
      <span class="text-neutral-500">time</span>
      <span class="text-neutral-200">{new Date(event.createdAt).toLocaleString()}</span>
      <span class="text-neutral-500">id</span>
      <span class="truncate font-mono text-neutral-400">{event.id}</span>
    </div>
    <div>
      <div class="mb-1 text-xs text-neutral-500">payload</div>
      <pre
        class="overflow-x-auto rounded bg-neutral-950 p-3 text-xs text-neutral-300">{JSON.stringify(
          event.payload,
          null,
          2,
        )}</pre>
    </div>
  </div>
{:else}
  <div
    class="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-600"
  >
    Select an event to view details
  </div>
{/if}
