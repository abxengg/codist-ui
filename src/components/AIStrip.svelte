<script lang="ts">
  // The AI, visible on every page: while it reads, a thin lit strip runs across the top with the orb, the file it is
  // reading and how many commits wait after it. Clicking it opens the Activity page.
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import Orb from './Orb.svelte';

  // Only while the AI is really working: never for "All caught up", and not for a forced ?orb= preview.
  const running = $derived(live.call?.status === 'running');
  const elapsed = $derived(live.call ? Math.max(0, Math.round((live.now - live.call.at) / 1000)) : 0);
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

{#if running && app.mode !== 'activity'}
  <button class="strip" transition:slide={{ duration: 220, easing: cubicOut }} onclick={() => (app.mode = 'activity')} title="Open Activity">
    <Orb mood={live.mood} size={18} label="AI" />
    <span class="what">{live.sentence}</span>
    {#if live.call?.title && live.call.path}<span class="sub">{live.call.title}</span>{/if}
    <span class="right">
      {#if live.waiting > 1}<span class="sub">{live.waiting - 1} more waiting</span>{/if}
      <span class="t mono">{mm(elapsed)}</span>
    </span>
    <span class="bar"><i></i></span>
  </button>
{/if}

<style>
  .strip { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; height: 32px; padding: 0 16px; border: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border)); background: color-mix(in srgb, var(--accent) 8%, var(--bg)); color: var(--text); text-align: left; overflow: hidden; flex-shrink: 0; }
  .strip:hover { background: color-mix(in srgb, var(--accent) 13%, var(--bg)); }
  .what { font-size: 12.5px; font-weight: 600; color: var(--accent-text); white-space: nowrap; }
  .sub { font-size: 12px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .t { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
  /* A band of light that runs along the bottom edge while the AI works. */
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; overflow: hidden; }
  .bar i { position: absolute; top: 0; bottom: 0; width: 30%; background: var(--accent); box-shadow: 0 0 10px var(--accent); animation: run 1.8s ease-in-out infinite; }
  @keyframes run { from { left: -30%; } to { left: 100%; } }
  @media (prefers-reduced-motion: reduce) { .bar i { animation: none; left: 0; width: 100%; opacity: 0.5; } }
</style>
