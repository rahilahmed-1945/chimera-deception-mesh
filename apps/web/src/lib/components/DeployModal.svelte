<script lang="ts">
  import { deployDecoy, fetchTemplates } from '$lib/api';
  import type { Template } from '$lib/types';

  let { onclose, ondeployed }: { onclose: () => void; ondeployed: () => void } = $props();

  let templates = $state<Template[]>([]);
  let selected = $state<string>('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    fetchTemplates()
      .then((t) => {
        templates = t;
        if (t[0]) selected = t[0].id;
      })
      .catch((e) => (error = e instanceof Error ? e.message : 'failed to load templates'));
  });

  async function deploy(): Promise<void> {
    if (!selected) return;
    busy = true;
    error = null;
    try {
      await deployDecoy(selected);
      ondeployed();
      onclose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'deploy failed';
    } finally {
      busy = false;
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
>
  <div
    class="border-border-hairline bg-surface-elevated my-auto max-h-[90vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-lg border p-5"
  >
    <h2 class="t-section text-text-primary text-lg">Deploy a decoy</h2>
    {#if error}<p class="text-threat text-xs">{error}</p>{/if}
    <label class="text-text-secondary block text-sm">
      Template
      <select
        bind:value={selected}
        class="border-border-hairline bg-surface-inset text-text-primary mt-1 w-full rounded border p-2"
      >
        {#each templates as t (t.id)}
          <option value={t.id}>{t.name} (:{t.defaultPort})</option>
        {/each}
      </select>
    </label>
    <div class="flex justify-end gap-2">
      <button
        type="button"
        onclick={onclose}
        class="text-text-secondary hover:text-text-primary rounded-md px-3 py-2 text-sm transition-colors"
        >Cancel</button
      >
      <button
        type="button"
        onclick={deploy}
        disabled={busy || !selected}
        class="border-accent/30 bg-accent/15 text-accent hover:bg-accent/25 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50"
      >
        {busy ? 'Deploying…' : 'Deploy'}
      </button>
    </div>
  </div>
</div>
