<script lang="ts">
  // Small reusable status pill: a toned dot + micro label. The live variant
  // gently pulses (decorative; disabled under prefers-reduced-motion via U1).
  let {
    tone = 'muted',
    label,
    pulse = false,
  }: {
    tone?: 'ok' | 'warn' | 'muted' | 'accent';
    label: string;
    pulse?: boolean;
  } = $props();

  const dot: Record<string, string> = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    muted: 'bg-text-muted',
    accent: 'bg-accent',
  };
  const text: Record<string, string> = {
    ok: 'text-ok',
    warn: 'text-warn',
    muted: 'text-text-muted',
    accent: 'text-accent',
  };
</script>

<span
  role="status"
  aria-label={label}
  class="border-border-subtle bg-surface-inset inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5"
>
  <span class="relative flex h-1.5 w-1.5">
    {#if pulse}
      <span
        class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 {dot[tone]}"
      ></span>
    {/if}
    <span class="relative inline-flex h-1.5 w-1.5 rounded-full {dot[tone]}"></span>
  </span>
  <span class="t-micro {text[tone]}">{label}</span>
</span>
