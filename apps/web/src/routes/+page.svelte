<script lang="ts">
  import { onMount } from 'svelte';
  import { connectEvents } from '$lib/ws';

  let status = $state<'open' | 'closed'>('closed');
  let events = $state<unknown[]>([]);

  onMount(() =>
    connectEvents({
      onStatus: (s) => (status = s),
      onEvent: (e) => (events = [e, ...events].slice(0, 100)),
    }),
  );
</script>

<div class="min-h-screen p-8">
  <h1 class="text-2xl font-semibold tracking-tight text-neutral-100">Chimera</h1>
  <p class="mt-1 text-sm text-neutral-500">Event spine (M2)</p>
  <p class="mt-1 text-xs text-neutral-600">
    WebSocket:
    <span class={status === 'open' ? 'text-emerald-400' : 'text-red-400'}>{status}</span>
    · {events.length} event{events.length === 1 ? '' : 's'}
  </p>

  <ul class="mt-6 space-y-2 font-mono text-xs text-neutral-300">
    {#each events as event, i (i)}
      <li class="overflow-x-auto rounded border border-neutral-800 bg-neutral-900 p-2">
        {JSON.stringify(event)}
      </li>
    {/each}
  </ul>
</div>
