<script lang="ts">
  // The one row of navigation: a slim rail of icons, the AI's orb at the bottom. Every screen is one click away.
  import { app, setTheme } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import Orb from './Orb.svelte';
  import type { Mode } from '../lib/types';

  const ITEMS: { mode: Mode; label: string; d: string }[] = [
    { mode: 'now', label: 'Now', d: 'M8 3.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6ZM8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z' },
    { mode: 'issues', label: 'Issues', d: 'M8 2.2 13.8 5v3.4c0 3-2.4 4.9-5.8 5.9-3.4-1-5.8-2.9-5.8-5.9V5L8 2.2ZM8 5.4v3.4M8 10.6v.1' },
    { mode: 'commits', label: 'Commits', d: 'M8 1.8v3.4M8 10.8v3.4M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z' },
    { mode: 'map', label: 'Map', d: 'M4 4.5a1.75 1.75 0 1 0 0-.01M12 3.5a1.75 1.75 0 1 0 0-.01M12 12.5a1.75 1.75 0 1 0 0-.01M5.6 4.9l4.8-1M5.4 5.6l5.2 5.8' },
    { mode: 'incidents', label: 'Incidents', d: 'M8 2.4 14.2 13H1.8L8 2.4ZM8 6.5v3M8 11.2v.1' },
    { mode: 'activity', label: 'Activity', d: 'M1.8 8.5h2.7L6.3 3.5l3.2 9 1.9-4h2.8' },
    { mode: 'repo', label: 'Repository', d: 'M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5V14l-5-2.5L3 14V3.5Z' },
  ];
  const open = $derived(app.issueList?.issues.filter((i) => i.state === 'open').length ?? 0);
</script>

<nav class="rail" aria-label="Screens">
  <button class="mark" title="Now" onclick={() => (app.mode = 'now')} aria-label="Codist">
    <span class="dotmark"></span>
  </button>
  <div class="items">
    {#each ITEMS.filter((i) => i.mode === 'now' || i.mode === 'issues' || i.mode === 'commits' || i.mode === 'map' || app.menuOn(i.mode)) as it}
      <button class="item" class:on={app.mode === it.mode} aria-current={app.mode === it.mode ? 'page' : undefined} onclick={() => (app.mode = it.mode)}>
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d={it.d} /></svg>
        <span class="tip">{it.label}</span>
        {#if it.mode === 'issues' && open}<i class="badge">{open > 99 ? '99+' : open}</i>{/if}
      </button>
    {/each}
  </div>
  <div class="foot">
    <button class="mini" title={live.sentence} onclick={() => (app.mode = 'now')}>
      <Orb mood={live.mood} size={18} label={live.sentence} />
    </button>
    <button class="item small" title="Use the {app.theme === 'dark' ? 'light' : 'dark'} appearance" aria-label="Change appearance" onclick={() => setTheme(app.theme === 'dark' ? 'light' : 'dark')}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none"/></svg>
    </button>
  </div>
</nav>

<style>
  .rail { display: flex; flex-direction: column; align-items: center; width: 60px; flex-shrink: 0; padding: 12px 0 10px; gap: 10px;
    background: var(--rail-bg, var(--sidebar)); border-right: 1px solid var(--border); position: relative; z-index: 20; }
  .mark { width: 36px; height: 36px; display: grid; place-items: center; border: 0; background: none; border-radius: 12px; }
  .dotmark { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); }
  .items { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
  .item { position: relative; display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 12px; background: none;
    color: var(--text-3); transition: background 0.2s, color 0.2s; }
  .item:hover { color: var(--text); background: var(--hover); }
  .item.on { color: var(--text); background: var(--active); }
  .item.on::before { content: ''; position: absolute; left: -10px; top: 10px; bottom: 10px; width: 3px; border-radius: 3px;
    background: var(--accent); }
  .item.small { width: 32px; height: 32px; }
  .tip { position: absolute; left: 50px; top: 50%; transform: translateY(-50%) translateX(-4px); padding: 4px 9px; border-radius: 8px;
    background: var(--surface-3); color: var(--text); font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none;
    transition: opacity 0.15s, transform 0.15s; box-shadow: var(--shadow); }
  .item:hover .tip, .item:focus-visible .tip { opacity: 1; transform: translateY(-50%); }
  .badge { position: absolute; top: 3px; right: 1px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; font: 600 10px/16px var(--font);
    font-style: normal; color: #fff; background: var(--accent); }
  .foot { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .mini { border: 0; background: none; padding: 0; width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; }
</style>
