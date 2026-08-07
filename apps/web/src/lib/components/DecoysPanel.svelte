<script lang="ts">
  import { destroyDecoy, fetchDecoys } from '$lib/api';
  import type { Decoy } from '$lib/types';
  import DeployModal from './DeployModal.svelte';

  let decoys = $state<Decoy[]>([]);
  let showDeploy = $state(false);

  async function refresh(): Promise<void> {
    try {
      decoys = await fetchDecoys();
    } catch {
      // ignore — panel is best-effort
    }
  }

  $effect(() => {
    refresh();
  });

  async function remove(id: string): Promise<void> {
    try {
      await destroyDecoy(id);
      await refresh();
    } catch {
      // ignore
    }
  }
</script>

<div class="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
  <div class="mb-3 flex items-center justify-between">
    <h2 class="text-sm font-semibold text-neutral-200">Decoys</h2>
    <button
      type="button"
      onclick={() => (showDeploy = true)}
      class="rounded bg-sky-700 px-2.5 py-1 text-xs text-white hover:bg-sky-600">Deploy</button
    >
  </div>
  <ul class="space-y-1">
    {#each decoys as d (d.id)}
      <li class="flex items-center gap-2 text-xs">
        <span class="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-neutral-300"
          >{d.protocol}</span
        >
        <span class="text-neutral-200">{d.name}</span>
        <span class="text-[10px] {d.status === 'active' ? 'text-emerald-400' : 'text-neutral-500'}"
          >{d.status}</span
        >
        {#if d.status === 'active'}
          <button
            type="button"
            onclick={() => remove(d.id)}
            class="ml-auto text-[10px] text-red-400 hover:text-red-300">destroy</button
          >
        {/if}
      </li>
    {:else}
      <li class="text-xs text-neutral-600">No decoys</li>
    {/each}
  </ul>
</div>

{#if showDeploy}
  <DeployModal onclose={() => (showDeploy = false)} ondeployed={refresh} />
{/if}
