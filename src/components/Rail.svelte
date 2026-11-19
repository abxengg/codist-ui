<script lang="ts">
  // The sidebar: the mark and name, every screen with a live count, and the AI's state at the bottom. It folds to
  // icons only and remembers that.
  import { app, setTheme } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import Orb from './Orb.svelte';
  import Logo from './Logo.svelte';
  import type { Mode } from '../lib/types';

  let folded = $state(false);
  try { folded = localStorage.getItem('codist.railFolded') === '1'; } catch { /* storage blocked */ }
  $effect(() => { try { localStorage.setItem('codist.railFolded', folded ? '1' : '0'); } catch { /* storage blocked */ } });
  $effect(() => { void folded; requestAnimationFrame(() => window.dispatchEvent(new Event('codist:resize'))); });

  const ITEMS: { mode: Mode; label: string; d: string; group: 'work' | 'see' }[] = [
    { mode: 'now', label: 'Now', group: 'work', d: 'M8 3.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6ZM8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z' },
    { mode: 'issues', label: 'Issues', group: 'work', d: 'M8 2.2 13.8 5v3.4c0 3-2.4 4.9-5.8 5.9-3.4-1-5.8-2.9-5.8-5.9V5L8 2.2ZM8 5.4v3.4M8 10.6v.1' },
    { mode: 'commits', label: 'Commits', group: 'work', d: 'M8 1.8v3.4M8 10.8v3.4M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z' },
    { mode: 'incidents', label: 'Incidents', group: 'work', d: 'M8 2.4 14.2 13H1.8L8 2.4ZM8 6.5v3M8 11.2v.1' },
    { mode: 'map', label: 'Map', group: 'see', d: 'M4 4.5a1.75 1.75 0 1 0 0-.01M12 3.5a1.75 1.75 0 1 0 0-.01M12 12.5a1.75 1.75 0 1 0 0-.01M5.6 4.9l4.8-1M5.4 5.6l5.2 5.8' },
    { mode: 'activity', label: 'Activity', group: 'see', d: 'M1.8 8.5h2.7L6.3 3.5l3.2 9 1.9-4h2.8' },
    { mode: 'repo', label: 'Repository', group: 'see', d: 'M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5V14l-5-2.5L3 14V3.5Z' },
  ];
  const shown = (g: 'work' | 'see') => ITEMS.filter((i) => i.group === g && (['now', 'issues', 'commits', 'map'].includes(i.mode) || app.menuOn(i.mode)));
  const open = $derived(app.issueList?.issues.filter((i) => i.state === 'open').length ?? 0);
  const analysing = $derived(app.incidents.filter((i) => i.status === 'analysing').length);
  const count = (m: Mode) => (m === 'issues' ? open : m === 'commits' ? live.waiting : m === 'incidents' ? analysing : 0);
</script>

<nav class="side" class:folded aria-label="Screens">
  <div class="brand">
    <button class="home" onclick={() => (app.mode = 'now')} aria-label="Codist, home"><Logo size={folded ? 30 : 32} />{#if !folded}<span class="name">Codist</span>{/if}</button>
    {#if !folded}<button class="fold" title="Fold the sidebar" aria-label="Fold the sidebar" onclick={() => (folded = true)}>‹</button>{/if}
  </div>
  {#if !folded && app.status}<div class="where"><span class="repo">{app.status.repo}</span><span class="mono br">{app.status.branch}</span></div>{/if}

  {#each [['work', 'Work'], ['see', 'See']] as [g, title]}
    <div class="group">
      {#if !folded}<p class="gt">{title}</p>{/if}
      {#each shown(g as 'work' | 'see') as it}
        {@const n = count(it.mode)}
        <button class="item" class:on={app.mode === it.mode} aria-current={app.mode === it.mode ? 'page' : undefined} onclick={() => (app.mode = it.mode)} title={folded ? it.label : undefined}>
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d={it.d} /></svg>
          {#if !folded}<span class="label">{it.label}</span>{/if}
          {#if n}<i class="badge" class:dotonly={folded}>{folded ? '' : n > 99 ? '99+' : n}</i>{/if}
        </button>
      {/each}
    </div>
  {/each}

  <div class="foot">
    <button class="ai" onclick={() => (app.mode = 'activity')} title={live.sentence}>
      <Orb mood={live.mood} size={folded ? 26 : 30} label={live.sentence} />
      {#if !folded}<span class="ait"><b>{live.sentence}</b><small>{app.status?.llmProblem ? 'code checks only' : app.status?.model ?? 'connecting'}</small></span>{/if}
    </button>
    <div class="tools">
      <button class="tb" title="Use the {app.theme === 'dark' ? 'light' : 'dark'} appearance" aria-label="Change appearance" onclick={() => setTheme(app.theme === 'dark' ? 'light' : 'dark')}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="5.5"/><path d="M8 2.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none"/></svg>
        {#if !folded}<span>{app.theme === 'dark' ? 'Dark' : 'Light'}</span>{/if}
      </button>
      {#if folded}<button class="tb" title="Unfold the sidebar" aria-label="Unfold the sidebar" onclick={() => (folded = false)}>›</button>{/if}
    </div>
  </div>
</nav>

<style>
  .side { display: flex; flex-direction: column; width: 228px; flex-shrink: 0; padding: 14px 12px 12px; gap: 4px; background: var(--rail-bg, var(--sidebar));
    border-right: 1px solid var(--border); box-shadow: 8px 0 30px -18px rgba(0, 0, 0, 0.8); position: relative; z-index: 20; transition: width 0.22s ease; overflow: hidden; }
  .side.folded { width: 68px; align-items: center; }
  .brand { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 6px; width: 100%; }
  .home { display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 0; color: var(--text); }
  .folded .brand { justify-content: center; }
  .name { font-size: 20px; font-weight: 650; letter-spacing: -0.03em; }
  .fold { width: 26px; height: 26px; border: 0; border-radius: 8px; background: none; color: var(--text-3); font-size: 18px; line-height: 1; }
  .fold:hover { background: var(--hover); color: var(--text); }
  .where { display: flex; flex-direction: column; gap: 1px; padding: 0 6px 10px; margin-bottom: 4px; border-bottom: 1px solid var(--border); }
  .repo { font-size: 12.5px; font-weight: 600; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .br { font-size: 11px; color: var(--accent-text); }
  .group { display: flex; flex-direction: column; gap: 2px; width: 100%; margin-top: 8px; }
  .gt { margin: 0 0 4px 10px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
  .item { position: relative; display: flex; align-items: center; gap: 11px; width: 100%; height: 36px; padding: 0 10px; border: 0; border-radius: 10px;
    background: none; color: var(--text-2); font: 500 13px var(--font); text-align: left; transition: background 0.15s, color 0.15s, box-shadow 0.15s; }
  .folded .item { width: 42px; justify-content: center; padding: 0; }
  .item:hover { background: var(--hover); color: var(--text); }
  .item.on { color: var(--text); background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4), 0 6px 14px -6px rgba(0, 0, 0, 0.6), var(--glow); }
  .item.on svg { color: var(--accent-text); }
  .label { flex: 1; }
  .badge { min-width: 20px; height: 18px; padding: 0 6px; border-radius: 9px; font: 600 10.5px/18px var(--font); font-style: normal; text-align: center; color: #fff; background: var(--accent); }
  .badge.dotonly { position: absolute; top: 6px; right: 6px; min-width: 0; width: 7px; height: 7px; padding: 0; box-shadow: 0 0 6px var(--accent); }
  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .ai { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--glass); box-shadow: var(--elev-1); text-align: left; color: inherit; }
  .folded .ai { justify-content: center; padding: 8px 0; }
  .ait { display: flex; flex-direction: column; min-width: 0; }
  .ait b { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ait small { font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tools { display: flex; gap: 4px; }
  .folded .tools { flex-direction: column; align-items: center; }
  .tb { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 10px; border: 0; border-radius: 8px; background: none; color: var(--text-3); font: 12px var(--font); }
  .tb:hover { background: var(--hover); color: var(--text); }
</style>
