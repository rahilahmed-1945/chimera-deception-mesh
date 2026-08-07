<script lang="ts">
  import type { Stats } from '$lib/types';

  let { stats }: { stats: Stats | null } = $props();

  const cards = $derived([
    { label: 'Total events', value: stats?.totalEvents ?? '—' },
    { label: 'Unique attackers', value: stats?.uniqueAttackers ?? '—' },
    { label: 'Decoys', value: stats?.decoys ?? '—' },
    { label: 'Last hour', value: stats?.lastHour ?? '—' },
  ]);
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
  {#each cards as card (card.label)}
    <div class="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div class="text-2xl font-semibold text-neutral-100">{card.value}</div>
      <div class="mt-1 text-xs text-neutral-500">{card.label}</div>
    </div>
  {/each}
</div>
