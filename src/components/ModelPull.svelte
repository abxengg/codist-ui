<script lang="ts">
  // Shown where the AI would be when Ollama runs but does not have the model: one button to download it, then how
  // far along it is. Ollama downloads; Codist starts reviewing as soon as it is done.
  import { api } from '../lib/api';
  import { app, pull } from '../lib/store.svelte';

  let { compact = false }: { compact?: boolean } = $props();
  let asking = $state(false);
  let failed = $state('');

  // A download started from another tab or before a reload is picked up.
  $effect(() => { if (app.status?.canPull && !pull.state) void api.pullState().then((s) => { if (s.running || s.error) pull.state = s; }).catch(() => {}); });

  async function start() {
    asking = true; failed = '';
    try { pull.state = await api.pull(); } catch (e) { failed = (e as Error).message; }
    asking = false;
  }
  const p = $derived(pull.state);
  const pct = $derived(p && p.total ? Math.min(100, (p.completed / p.total) * 100) : 0);
  const gb = (n: number) => (n / 1e9).toFixed(n > 1e10 ? 0 : 1);
  const words = $derived(!p ? '' : p.total && (p.status === 'downloading' || p.status.startsWith('pulling ')) ? `${gb(p.completed)} of ${gb(p.total)} GB` : p.status === 'starting' ? 'Asking Ollama…' : p.status);
</script>

{#if app.status?.canPull || p?.running}
  <div class="pull" class:compact>
    {#if p?.running}
      <div class="row"><b>Downloading {app.status?.model}</b><span class="mono">{words}</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(pct)}><i style:width="{pct}%" class:wait={!p.total}></i></div>
      {#if !compact}<p>Codist keeps checking your code meanwhile. The AI starts reviewing when this is done.</p>{/if}
    {:else}
      <div class="row">
        <span><b>{app.status?.model}</b> is not downloaded yet.{#if !compact} It runs on this computer; your code stays here.{/if}</span>
        <button class="go" onclick={start} disabled={asking}>{asking ? 'Starting…' : 'Download it'}</button>
      </div>
      {#if p?.error || failed}<p class="err">{p?.error || failed}</p>{/if}
    {/if}
  </div>
{/if}

<style>
  .pull { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--glass); box-shadow: var(--elev-1); max-width: 560px; }
  .pull.compact { margin-top: 8px; padding: 9px 11px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--text-2); }
  .row b { color: var(--text); font-weight: 600; }
  .row .mono { font-size: 12px; color: var(--text-3); }
  .go { flex-shrink: 0; height: 30px; padding: 0 14px; border: 0; border-radius: 9px; font: 600 12.5px var(--font); color: #fff; background: var(--accent); box-shadow: var(--glow); }
  .go:disabled { opacity: 0.6; }
  .bar { height: 6px; border-radius: 3px; background: var(--surface-3); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--accent-text)); transition: width 0.4s ease; }
  .bar i.wait { width: 30% !important; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
  p { margin: 0; font-size: 12px; color: var(--text-3); }
  .err { color: var(--bad); }
</style>
