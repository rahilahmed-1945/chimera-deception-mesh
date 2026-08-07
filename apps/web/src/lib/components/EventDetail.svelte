<script lang="ts">
  import { fetchEventDetail } from '$lib/api';
  import type { EventDetail, EventRow } from '$lib/types';

  let { event }: { event: EventRow | null } = $props();

  let detail = $state<EventDetail | null>(null);

  const MITRE_NAMES: Record<string, string> = {
    'T1110.001': 'Password Guessing',
    'T1021.004': 'Remote Services: SSH',
  };

  // Fetch enrichment (geo/reputation/techniques) whenever the selection changes.
  $effect(() => {
    const id = event?.id;
    detail = null;
    if (!id) return;
    let cancelled = false;
    fetchEventDetail(id)
      .then((d) => {
        if (!cancelled) detail = d;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  });

  const techniques = $derived(detail?.techniques ?? event?.techniques ?? []);
  const location = $derived(
    detail?.city && detail.city.length > 0
      ? `${detail.city}, ${detail.countryCode ?? ''}`
      : (detail?.countryCode ?? null),
  );
</script>

{#if event}
  <div class="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
    <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      <span class="text-neutral-500">kind</span>
      <span class="text-neutral-200">{event.kind}</span>
      <span class="text-neutral-500">decoy</span>
      <span class="text-neutral-200">{detail?.decoyType ?? event.decoyType ?? '—'}</span>
      <span class="text-neutral-500">source</span>
      <span class="font-mono text-neutral-200">
        {event.sourceIp}{event.sourcePort ? ':' + event.sourcePort : ''}
      </span>
      <span class="text-neutral-500">location</span>
      <span class="text-neutral-200">{location ?? '—'}</span>
      <span class="text-neutral-500">reputation</span>
      <span class="text-neutral-200">
        {#if detail?.reputation}
          <span class="rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-300">
            {detail.reputation}
          </span>
        {:else}
          —
        {/if}
      </span>
      <span class="text-neutral-500">time</span>
      <span class="text-neutral-200">{new Date(event.createdAt).toLocaleString()}</span>
      <span class="text-neutral-500">id</span>
      <span class="truncate font-mono text-neutral-400">{event.id}</span>
    </div>

    <div>
      <div class="mb-1 text-xs text-neutral-500">techniques (MITRE ATT&CK)</div>
      {#if techniques.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each techniques as t (t)}
            <span class="rounded bg-sky-900/50 px-1.5 py-0.5 text-[10px] text-sky-300">
              {t}{MITRE_NAMES[t] ? ' · ' + MITRE_NAMES[t] : ''}
            </span>
          {/each}
        </div>
      {:else}
        <div class="text-xs text-neutral-600">none yet</div>
      {/if}
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
