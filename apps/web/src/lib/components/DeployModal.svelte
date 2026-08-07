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

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
  <div class="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
    <h2 class="text-lg font-semibold text-neutral-100">Deploy a decoy</h2>
    {#if error}<p class="text-xs text-red-400">{error}</p>{/if}
    <label class="block text-sm text-neutral-400">
      Template
      <select
        bind:value={selected}
        class="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 p-2 text-neutral-100"
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
        class="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200">Cancel</button
      >
      <button
        type="button"
        onclick={deploy}
        disabled={busy || !selected}
        class="rounded bg-sky-700 px-3 py-1.5 text-sm text-white hover:bg-sky-600 disabled:opacity-50"
      >
        {busy ? 'Deploying…' : 'Deploy'}
      </button>
    </div>
  </div>
</div>
