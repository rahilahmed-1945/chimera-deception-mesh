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

<div class="border-border-subtle bg-surface-panel rounded-lg border p-4">
  <div class="mb-3 flex items-center justify-between">
    <h2 class="t-section text-text-primary">Decoys</h2>
    <button
      type="button"
      onclick={() => (showDeploy = true)}
      class="border-accent/30 bg-accent/15 text-accent hover:bg-accent/25 rounded-md border px-3 py-1.5 text-xs transition-colors"
      >Deploy</button
    >
  </div>
  <ul class="space-y-1">
    {#each decoys as d (d.id)}
      <li class="flex items-center gap-2 text-xs">
        <span
          class="t-micro bg-surface-inset text-text-secondary rounded px-1.5 py-0.5 leading-none"
          >{d.protocol}</span
        >
        <span class="text-text-primary">{d.name}</span>
        <span class="t-data text-[10px] {d.status === 'active' ? 'text-ok' : 'text-text-muted'}"
          >{d.status}</span
        >
        {#if d.status === 'active'}
          <button
            type="button"
            onclick={() => remove(d.id)}
            class="text-threat hover:text-threat-bright ml-auto text-[10px] transition-colors"
            >destroy</button
          >
        {/if}
      </li>
    {:else}
      <li class="text-xs text-text-muted">No decoys</li>
    {/each}
  </ul>
</div>

{#if showDeploy}
  <DeployModal onclose={() => (showDeploy = false)} ondeployed={refresh} />
{/if}
