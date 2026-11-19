<script lang="ts">
  // A fix being prepared in the background: a small bubble at the bottom right with its progress. When the fix is
  // ready it says so; a click brings the fix back. The × stops it.
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, closeFix } from '../lib/store.svelte';
  import Orb from './Orb.svelte';

  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 500); return () => clearInterval(t); });
  const f = $derived(app.fix);
  const secs = $derived(f?.started ? Math.max(0, Math.round((now - f.started) / 1000)) : 0);
  const kind = $derived(!f ? '' : f.error ? 'error' : f.proposal ? 'ready' : 'working');
</script>

{#if f && app.fixHidden}
  <div class="bubble {kind}" transition:fly={{ y: 24, duration: 300, easing: cubicOut }}>
    <button class="main" onclick={() => (app.fixHidden = false)} title="Open the fix">
      {#if kind === 'working'}<Orb mood="writing" size={26} label="Preparing a fix" />{:else}<span class="dot"></span>{/if}
      <span class="txt">
        <b>{kind === 'ready' ? 'Fix ready' : kind === 'error' ? 'Fix failed' : 'Preparing a fix'}</b>
        <span class="t">{f.finding.title}</span>
      </span>
      <span class="side">{kind === 'working' ? `${secs} s` : kind === 'ready' ? 'Review →' : 'See why'}</span>
    </button>
    <button class="x" aria-label="Stop and discard" title="Stop and discard" onclick={closeFix}>×</button>
  </div>
{/if}

<style>
  .bubble { position: fixed; right: 20px; bottom: 20px; z-index: 65; display: flex; align-items: center; max-width: min(420px, calc(100vw - 40px));
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
