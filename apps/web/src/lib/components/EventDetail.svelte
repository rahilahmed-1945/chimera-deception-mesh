<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchEventDetail, fetchEventTranscript } from '$lib/api';
  import type { EventDetail, EventRow } from '$lib/types';

  let { event, onclose }: { event: EventRow | null; onclose?: () => void } = $props();

  // Real MITRE technique names (the worker emits exactly these codes).
  const MITRE_NAMES: Record<string, string> = {
    'T1110.001': 'Brute Force: Password Guessing',
    T1190: 'Exploit Public-Facing Application',
  };

  // Semantic event-kind identity (NOT a severity score).
  type Accent = 'accent' | 'warn' | 'neutral' | 'muted';
  interface KindStyle {
    label: string;
    activity: string;
    accent: Accent;
  }
  const KIND: Record<string, KindStyle> = {
    connection: { label: 'CONNECTION', activity: 'Session activity', accent: 'accent' },
    auth_attempt: { label: 'AUTH_ATTEMPT', activity: 'Authentication activity', accent: 'warn' },
    command: { label: 'COMMAND', activity: 'Command activity', accent: 'neutral' },
    http_request: { label: 'HTTP_REQUEST', activity: 'HTTP activity', accent: 'accent' },
    disconnect: { label: 'DISCONNECT', activity: 'Session termination', accent: 'muted' },
  };
  const kindOf = (k: string): KindStyle =>
    KIND[k] ?? { label: k.toUpperCase(), activity: 'Event activity', accent: 'muted' };

  const railCls: Record<Accent, string> = {
    accent: 'bg-accent',
    warn: 'bg-warn',
    neutral: 'bg-text-secondary',
    muted: 'bg-text-muted',
  };
  const textCls: Record<Accent, string> = {
    accent: 'text-accent',
    warn: 'text-warn',
    neutral: 'text-text-primary',
    muted: 'text-text-muted',
  };

  const hms = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour12: false });
  const dstr = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  function countryName(code: string | null | undefined): string | null {
    if (!code) return null;
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
    } catch {
      return code;
    }
  }

  // --- Enrichment (geo / reputation) -----------------------------------------
  type DetailState = 'idle' | 'loading' | 'ready' | 'error';
  let detail = $state<EventDetail | null>(null);
  let detailState = $state<DetailState>('idle');

  $effect(() => {
    const id = event?.id;
    detail = null;
    detailState = 'idle';
    if (!id) return;
    let cancelled = false;
    detailState = 'loading';
    fetchEventDetail(id)
      .then((d) => {
        if (cancelled) return;
        detail = d;
        detailState = 'ready';
      })
      .catch(() => {
        if (!cancelled) detailState = 'error';
      });
    return () => {
      cancelled = true;
    };
  });

  const techniques = $derived(detail?.techniques ?? event?.techniques ?? []);
  const country = $derived(countryName(detail?.countryCode));
  const lat = $derived(detail?.latitude ?? event?.latitude ?? null);
  const lon = $derived(detail?.longitude ?? event?.longitude ?? null);

  // --- Transcript (P10 — architecture preserved) -----------------------------
  const isSshEvent = $derived(event?.decoyType === 'ssh');

  type TranscriptState = 'idle' | 'loading' | 'ready' | 'not_available' | 'error';
  let transcript = $state<string | null>(null);
  let transcriptState = $state<TranscriptState>('idle');

  let replaying = $state(false);
  let revealed = $state(0);
  let replayTimer: ReturnType<typeof setInterval> | undefined;

  const lines = $derived(transcript ? transcript.split('\n') : []);
  const displayed = $derived(replaying ? lines.slice(0, revealed) : lines);
  const replayPct = $derived(lines.length > 0 ? Math.round((revealed / lines.length) * 100) : 0);

  // A prompt line looks like `<user>@chimera:~# ` (or `$ `). Splitting it lets us
  // dim the prompt and brighten the typed command WITHOUT altering the text.
  const PROMPT_RE = /^(\S+@chimera:~[#$]\s)(.*)$/;
  const splitLine = (l: string): { prompt: string; cmd: string } | null => {
    const m = PROMPT_RE.exec(l);
    return m ? { prompt: m[1], cmd: m[2] } : null;
  };

  // Authoritative session metadata parsed from the stored transcript header.
  const sessionShort = $derived(transcript?.match(/^Session:\s*(\S+)/m)?.[1]?.slice(0, 8) ?? null);
  const commandCount = $derived(
    Number(transcript?.match(/^Commands:\s*(\d+)/m)?.[1]) ||
      lines.filter((l) => PROMPT_RE.test(l)).length,
  );

  // Reduced motion: replay is progressive JS animation, so it's gated here (the
  // CSS cursor blink is handled by the global U1 reduced-motion rule).
  let reduceMotion = $state(false);
  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mq.matches;
    const on = () => (reduceMotion = mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  });

  function stopReplay(): void {
    if (replayTimer !== undefined) {
      clearInterval(replayTimer);
      replayTimer = undefined;
    }
    replaying = false;
    revealed = 0;
  }

  function startReplay(): void {
    stopReplay();
    if (lines.length === 0 || reduceMotion) return; // reduced motion => full view stays shown
    replaying = true;
    revealed = 0;
    replayTimer = setInterval(() => {
      revealed += 1;
      if (revealed >= lines.length) stopReplay();
    }, 120);
  }

  // Fetch transcript on selection change. Aborts in flight + clears replay so a
  // previous event's transcript can never leak into a newer selection.
  $effect(() => {
    const id = event?.id;
    const ssh = event?.decoyType === 'ssh';
    transcript = null;
    transcriptState = 'idle';
    stopReplay();
    if (!id || !ssh) return;

    const ac = new AbortController();
    transcriptState = 'loading';
    fetchEventTranscript(id, ac.signal)
      .then((text) => {
        if (ac.signal.aborted) return;
        if (text === null) {
          transcriptState = 'not_available';
        } else {
          transcript = text;
          transcriptState = 'ready';
        }
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        transcriptState = 'error';
      });

    return () => {
      ac.abort();
      stopReplay();
    };
  });
</script>

{#if event}
  {@const k = kindOf(event.kind)}
  <!-- Mobile only: dim backdrop behind the bottom sheet (tap to close). -->
  <div
    class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm xl:hidden"
    onclick={() => onclose?.()}
    role="presentation"
    aria-hidden="true"
  ></div>
  <!-- Bottom sheet on mobile; static rail panel at xl+. Same content + the same
       store.selected/onclose selection architecture — no second mobile state. -->
  <aside
    class="chimera-sheet bg-surface-panel divide-border-subtle fixed inset-x-0 bottom-0 z-50 max-h-[85vh] divide-y overflow-y-auto rounded-t-xl border-t border-border-hairline xl:static xl:z-auto xl:max-h-none xl:overflow-hidden xl:rounded-lg xl:border xl:border-border-subtle"
    aria-label="Event investigation"
  >
    <!-- ── Header / event identity ─────────────────────────────────────── -->
    <header class="relative py-4 pr-3 pl-5">
      <span class="absolute inset-y-0 left-0 w-[3px] {railCls[k.accent]}" aria-hidden="true"></span>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 shrink-0 rounded-full {railCls[k.accent]}" aria-hidden="true"
            ></span>
            <h2 class="t-data text-sm font-semibold tracking-wide {textCls[k.accent]}">
              {k.label}
            </h2>
          </div>
          <p class="text-text-secondary mt-1 text-xs">{k.activity}</p>
        </div>
        {#if onclose}
          <button
            type="button"
            onclick={onclose}
            aria-label="Close investigation"
            class="text-text-muted hover:text-text-primary hover:bg-surface-elevated -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M1 1 L13 13 M13 1 L1 13"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
        {/if}
      </div>
      <div class="mt-3 flex items-baseline gap-2">
        <span class="t-data text-text-primary truncate text-base">
          {event.sourceIp ?? 'UNKNOWN SOURCE'}{event.sourcePort ? ':' + event.sourcePort : ''}
        </span>
        {#if event.decoyType}
          <span
            class="border-border-hairline bg-surface-inset t-micro text-text-secondary ml-auto shrink-0 rounded border px-1.5 py-0.5"
            >{event.decoyType}</span
          >
        {/if}
      </div>
      <div class="t-data text-text-muted mt-1.5 text-[11px]">
        {hms(event.createdAt)} · {dstr(event.createdAt)}
      </div>
      <div class="t-data text-text-muted mt-2 truncate text-[10px]" title={event.id}>
        ID {event.id}
      </div>
    </header>

    <!-- ── Source ──────────────────────────────────────────────────────── -->
    <section class="px-5 py-3">
      <h3 class="t-micro mb-2">Source</h3>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="t-data text-sm {event.sourceIp ? 'text-text-primary' : 'text-text-muted'}"
          >{event.sourceIp ?? 'UNKNOWN'}</span
        >
        {#if event.sourcePort}<span class="t-data text-text-muted text-xs">:{event.sourcePort}</span
          >{/if}
        {#if event.decoyType}<span class="t-micro">{event.decoyType} decoy</span>{/if}
      </div>
      <div class="mt-2 flex items-center gap-2">
        <span class="t-micro">Reputation</span>
        {#if detailState === 'loading'}
          <span class="text-text-muted text-xs">checking…</span>
        {:else if detail?.reputation}
          <span class="bg-warn/15 text-warn t-micro rounded px-1.5 py-0.5 leading-none"
            >{detail.reputation}</span
          >
        {:else}
          <span class="text-text-muted text-xs">none</span>
        {/if}
      </div>
    </section>

    <!-- ── Location ────────────────────────────────────────────────────── -->
    <section class="px-5 py-3">
      <h3 class="t-micro mb-2">Location</h3>
      {#if detailState === 'loading'}
        <div class="text-text-muted text-xs">Enriching…</div>
      {:else if detailState === 'error'}
        <div class="text-text-muted text-xs">Enrichment unavailable</div>
      {:else if country || detail?.city}
        <div class="text-text-primary text-sm">
          {country ?? ''}{country && detail?.city ? ' · ' : ''}{detail?.city ?? ''}
        </div>
      {:else}
        <div class="text-text-muted text-xs">Not available</div>
      {/if}
      {#if lat != null && lon != null}
        <div class="mt-2 flex gap-6">
          <div>
            <div class="t-micro">Lat</div>
            <div class="t-data text-text-secondary text-xs">{lat.toFixed(3)}</div>
          </div>
          <div>
            <div class="t-micro">Lon</div>
            <div class="t-data text-text-secondary text-xs">{lon.toFixed(3)}</div>
          </div>
        </div>
      {/if}
    </section>

    <!-- ── MITRE ATT&CK ────────────────────────────────────────────────── -->
    <section class="px-5 py-3">
      <h3 class="t-micro mb-2">MITRE ATT&CK</h3>
      {#if techniques.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each techniques as t (t)}
            <span
              class="border-accent/25 bg-accent/10 inline-flex flex-col rounded border px-2 py-1 leading-tight"
            >
              <span class="t-data text-accent text-[11px]">{t}</span>
              {#if MITRE_NAMES[t]}<span class="t-micro mt-0.5">{MITRE_NAMES[t]}</span>{/if}
            </span>
          {/each}
        </div>
      {:else}
        <div class="text-text-muted text-xs">No techniques mapped</div>
      {/if}
    </section>

    <!-- ── Event payload ───────────────────────────────────────────────── -->
    <section class="px-5 py-3">
      <h3 class="t-micro mb-2">Event payload</h3>
      <pre
        class="border-border-hairline bg-surface-terminal text-text-secondary max-h-56 overflow-auto rounded border p-3 font-mono text-[11px] leading-relaxed">{JSON.stringify(
          event.payload,
          null,
          2,
        )}</pre>
    </section>

    <!-- ── Session transcript (SSH only, P10 preserved) ────────────────── -->
    {#if isSshEvent}
      <section class="px-5 py-3">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="flex items-baseline gap-2">
            <h3 class="t-micro">Session transcript</h3>
            {#if replaying}
              <span class="t-data text-text-muted text-[10px]"
                >REPLAY {revealed} / {lines.length}</span
              >
            {/if}
          </div>
          {#if transcriptState === 'ready' && !reduceMotion}
            {#if replaying}
              <button
                type="button"
                onclick={stopReplay}
                class="t-micro text-accent hover:text-accent/80 border-border-hairline rounded border px-2.5 py-1.5 transition-colors"
                >Show full</button
              >
            {:else}
              <button
                type="button"
                onclick={startReplay}
                class="t-micro text-accent hover:text-accent/80 border-border-hairline rounded border px-2.5 py-1.5 transition-colors"
                >▶ Replay</button
              >
            {/if}
          {/if}
        </div>

        {#if transcriptState === 'loading'}
          <div class="text-text-muted text-xs">SSH session · loading transcript…</div>
        {:else if transcriptState === 'not_available'}
          <div class="text-text-muted text-xs">No stored transcript for this session yet.</div>
        {:else if transcriptState === 'error'}
          <div class="text-threat/80 text-xs">Transcript unavailable.</div>
        {:else if transcriptState === 'ready'}
          <div
            class="border-border-hairline overflow-hidden rounded border {replaying
              ? 'chimera-terminal-live'
              : ''}"
          >
            <!-- title bar -->
            <div
              class="border-border-hairline bg-surface-elevated flex items-center gap-2 border-b px-3 py-1.5"
            >
              <div class="flex gap-1.5" aria-hidden="true">
                <span class="bg-threat/70 h-2 w-2 rounded-full"></span>
                <span class="bg-warn/70 h-2 w-2 rounded-full"></span>
                <span class="bg-ok/70 h-2 w-2 rounded-full"></span>
              </div>
              <span class="t-micro">SSH session</span>
              {#if sessionShort}
                <span class="t-data text-text-muted text-[10px]">{sessionShort}</span>
              {/if}
              <span class="t-micro ml-auto">{commandCount} cmd</span>
            </div>

            <!-- replay progress -->
            {#if replaying}
              <div class="bg-surface-inset h-[2px] w-full" aria-hidden="true">
                <div
                  class="bg-terminal-fg/60 h-full transition-[width] duration-100 ease-linear"
                  style="width: {replayPct}%"
                ></div>
              </div>
            {/if}

            <!-- terminal body: exact stored text, prompt dimmed vs command -->
            <div
              class="chimera-terminal-scan bg-surface-terminal text-terminal-fg relative max-h-72 overflow-auto p-3 font-mono text-[11px] leading-relaxed"
            >
              {#each displayed as ln, i (i)}
                {@const p = splitLine(ln)}
                <div class="break-words whitespace-pre-wrap">
                  {#if p}<span class="text-text-muted">{p.prompt}</span><span
                      class="text-terminal-fg">{p.cmd}</span
                    >{:else}<span class="text-text-secondary">{ln === '' ? ' ' : ln}</span
                    >{/if}{#if replaying && i === displayed.length - 1}<span
                      class="text-terminal-fg animate-pulse"
                      aria-hidden="true">▌</span
                    >{/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </section>
    {/if}
  </aside>
{:else}
  <!-- Empty state fills the desktop rail; on mobile there is simply no sheet. -->
  <aside
    class="border-border-subtle bg-surface-panel hidden rounded-lg border p-8 text-center xl:block"
    aria-label="Event investigation"
  >
    <div class="t-micro text-text-secondary">Select an event</div>
    <p class="text-text-muted mx-auto mt-2 max-w-[16rem] text-xs">
      Choose an event from the stream or map to inspect it.
    </p>
  </aside>
{/if}
