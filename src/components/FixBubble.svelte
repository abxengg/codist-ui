<script lang="ts">
  // Fixes being prepared in the background, one bubble each, stacked at the bottom right: working, ready or failed.
  // A click brings a fix onto the screen (the one there, if any, takes its place in the stack); the × stops it.
  // Starting a second fix never loses the first: it waits here.
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { app, closeFix, showQueuedFix, dropQueuedFix } from '../lib/store.svelte';
  import Orb from './Orb.svelte';

  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 500); return () => clearInterval(t); });
  type F = NonNullable<typeof app.fix>;
  const kindOf = (f: F) => (f.error ? 'error' : f.proposal ? 'ready' : 'working');
  const secs = (f: F) => (f.started ? Math.max(0, Math.round((now - f.started) / 1000)) : 0);
  // The fix on screen, when its window is closed, then every queued fix.
  const items = $derived([
    ...(app.fix && app.fixHidden ? [{ f: app.fix, key: 'cur', open: () => (app.fixHidden = false), stop: closeFix }] : []),
    ...app.fixQueue.map((f, i) => ({ f, key: `q${f.finding.path}:${f.finding.line}:${f.started ?? i}`, open: () => showQueuedFix(i), stop: () => dropQueuedFix(i) })),
  ]);
</script>

<div class="stack">
  {#each items as it (it.key)}
    {@const kind = kindOf(it.f)}
    <div class="bubble {kind}" animate:flip={{ duration: 250 }} transition:fly={{ y: 24, duration: 300, easing: cubicOut }}>
      <button class="main" onclick={it.open} title="Open the fix">
        {#if kind === 'working'}<Orb mood="writing" size={26} label="Preparing a fix" />{:else}<span class="dot"></span>{/if}
        <span class="txt">
          <b>{kind === 'ready' ? 'Fix ready' : kind === 'error' ? 'Fix failed' : 'Preparing a fix'}</b>
          <span class="t">{it.f.finding.title}</span>
        </span>
        <span class="side">{kind === 'working' ? `${secs(it.f)} s` : kind === 'ready' ? 'Review →' : 'See why'}</span>
      </button>
      <button class="x" aria-label="Stop and discard" title="Stop and discard" onclick={it.stop}>×</button>
    </div>
  {/each}
</div>

<style>
  .stack { position: fixed; right: 20px; bottom: 20px; z-index: 65; display: flex; flex-direction: column-reverse; gap: 8px; align-items: flex-end; pointer-events: none; }
  .bubble { pointer-events: auto; display: flex; align-items: center; max-width: min(420px, calc(100vw - 40px));
    border-radius: 18px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), var(--glow-soft); }
  .main { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 10px 6px 10px 14px; border: 0; background: none; text-align: left; }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .txt b { font-size: 12.5px; font-weight: 600; }
  .t { font-size: 12px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
  .side { margin-left: 8px; font-size: 12px; color: var(--text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ready .side { color: var(--accent-text); font-weight: 600; }
  .dot { width: 10px; height: 10px; margin: 0 8px; border-radius: 50%; background: var(--good); box-shadow: 0 0 12px var(--good); animation: pulse 1.6s ease-in-out infinite; }
  .error .dot { background: var(--bad); box-shadow: 0 0 12px var(--bad); animation: none; }
  .ready { border-color: color-mix(in srgb, var(--good) 45%, var(--border)); }
  @keyframes pulse { 50% { transform: scale(1.35); opacity: 0.7; } }
  .x { align-self: stretch; padding: 0 12px; border: 0; border-left: 1px solid var(--border); background: none; color: var(--text-3); font-size: 18px; }
  .x:hover { color: var(--text); }
</style>
