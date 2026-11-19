<script lang="ts">
  // Every issue on one page. Filters are a single row of chips; each issue opens in place.
  import { app } from '../lib/store.svelte';
  import { groups } from '../lib/groups';
  import { SEVERITIES } from '../lib/theme';
  import IssueCard from './IssueCard.svelte';
  import type { Issue, Severity } from '../lib/types';

  let view = $state<Issue["state"]>("open");
  let sev = $state<Severity | null>(null);
  let q = $state('');
  const all = $derived(app.issueList?.issues ?? []);
  const base = $derived(groups(all, view));
  const bySource = (g: Issue[]) => !app.foundBy || g.some((i) => i.source === app.foundBy);
  const match = (g: Issue[]) => !q.trim() || g.some((i) => `${i.title} ${i.path} ${i.ref ?? ''} ${i.detail}`.toLowerCase().includes(q.trim().toLowerCase()));
  const shown = $derived(base.filter((g) => bySource(g) && match(g) && (!sev || g[0].severity === sev)));
  const count = (f: (g: Issue[]) => boolean) => base.filter((g) => f(g) && match(g)).length;
  const levels = $derived(SEVERITIES.map((s) => [s, count((g) => g[0].severity === s && bySource(g))] as const).filter(([, n]) => n));
  const sections = $derived(SEVERITIES.map((s) => ({ s, list: shown.filter((g) => g[0].severity === s) })).filter((x) => x.list.length));
  const LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
  import { ago } from '../lib/theme';
  // Board (a floating column per severity) or the plain list; remembered.
  let layout = $state<'board' | 'list'>('board');
  try { if (localStorage.getItem('codist.issuesLayout') === 'list') layout = 'list'; } catch { /* storage blocked */ }
  $effect(() => { try { localStorage.setItem('codist.issuesLayout', layout); } catch { /* storage blocked */ } });
  // Where the issues are: the files with the most, for a quick filter.
  const files = $derived([...shown.reduce((m, g) => m.set(g[0].path, (m.get(g[0].path) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8));
  const cols = $derived(['critical', 'high', 'medium', 'low'].map((sv) => ({ s: sv as Severity, list: shown.filter((g) => (sv === 'low' ? g[0].severity === 'low' || g[0].severity === 'info' : g[0].severity === sv)) })).filter((c) => c.list.length || c.s === 'high' || c.s === 'medium'));
</script>

<div class="ipage">
  <div class="top">
    <h1>Issues</h1>
    <div class="seg">
      {#each [['open', 'Open'], ['resolved', 'Fixed'], ['ignored', 'Hidden']] as [v, l]}
        <button class:on={view === v} onclick={() => (view = v as Issue["state"])}>{l} <i>{groups(all, v as Issue['state']).length}</i></button>
      {/each}
    </div>
    
    <div class="seg lay">
      <button class:on={layout === 'board'} onclick={() => (layout = 'board')}>Board</button>
      <button class:on={layout === 'list'} onclick={() => (layout = 'list')}>List</button>
    </div>
    <input class="search" placeholder="Search issues, files, rules…" bind:value={q} spellcheck="false" />
  </div>
  <div class="fchips">
    <button class="fchip" class:on={!app.foundBy} onclick={() => (app.foundBy = null)}>Everything <i>{count(() => true)}</i></button>
    <button class="fchip ai" class:on={app.foundBy === 'llm'} onclick={() => (app.foundBy = app.foundBy === 'llm' ? null : 'llm')}>Found by AI <i>{count((g) => g.some((x) => x.source === 'llm'))}</i></button>
    <button class="fchip" class:on={app.foundBy === 'rule'} onclick={() => (app.foundBy = app.foundBy === 'rule' ? null : 'rule')}>Code checks <i>{count((g) => g.some((x) => x.source === 'rule'))}</i></button>
    <span class="sep"></span>
    {#each levels as [s, n]}
      <button class="fchip lvl {s}" class:on={sev === s} onclick={() => (sev = sev === s ? null : s)}><span class="d"></span>{LABEL[s]} <i>{n}</i></button>
    {/each}
  </div>

  {#if files.length && layout === 'board'}
    <div class="where">
      <span class="wl">Where they are</span>
      {#each files as [path, n]}
        <button class="wf" class:on={q === path.slice(path.lastIndexOf('/') + 1)} onclick={() => (q = q === path.slice(path.lastIndexOf('/') + 1) ? '' : path.slice(path.lastIndexOf('/') + 1))}>
          <span class="mono">{path.slice(path.lastIndexOf('/') + 1)}</span><i>{n}</i>
        </button>
      {/each}
    </div>
  {/if}
  {#if !app.issueList}
    <p class="empty">Loading…</p>
  {:else if !shown.length}
    <div class="none"><b>{q || sev || app.foundBy ? 'Nothing matches.' : view === "open" ? "No open issues." : "Nothing here."}</b></div>
  {:else if layout === 'board'}
    <div class="board" style:--n={cols.length}>
      {#each cols as col, ci (col.s)}
        <section class="col {col.s}" style:animation-delay="{-ci * 2.3}s">
          <header><span class="bar"></span><h2>{LABEL[col.s]}</h2><i>{col.list.length}</i></header>
          <div class="tiles">
            {#each col.list as g (g[0].id)}
              {@const i = g[0]}
              <button class="tile" onclick={() => (app.focus = g)}>
                <span class="tt">{i.title}</span>
                <span class="tm">
                  {#if i.source === 'llm'}<span class="ai">AI</span>{:else}<span class="chk">check</span>{/if}
                  <span class="mono">{i.path.slice(i.path.lastIndexOf('/') + 1)}:{i.line}</span>
                  {#if g.length > 1}<span>×{g.length}</span>{/if}
                </span>
                {#if i.detail}<span class="td">{i.detail}</span>{/if}
                <span class="ta">{i.firstTime ? ago(i.firstTime) : ''}{i.firstBy ? ` · ${i.firstBy}` : ''}</span>
              </button>
            {:else}
              <p class="quiet">None</p>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    {#each sections as sec (sec.s)}
      <section>
        <h2>{LABEL[sec.s]} <i>{sec.list.length}</i></h2>
        <div class="list">{#each sec.list as g (g[0].id)}<IssueCard {g} />{/each}</div>
      </section>
    {/each}
  {/if}
</div>

<style>
  .ipage { flex: 1; min-height: 0; overflow: auto; padding: 28px clamp(16px, 4vw, 56px) 48px; max-width: 1100px; width: 100%; margin: 0 auto; }
  .top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h1 { margin: 0 8px 0 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 11px; background: var(--surface-2); box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4); }
  .seg button { border: 0; background: none; height: 28px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; color: var(--text-2); }
  .seg button.on { background: var(--surface-3); color: var(--text); box-shadow: inset 0 1px 0 var(--edge), 0 2px 6px -2px rgba(0, 0, 0, 0.6); }
  .seg i, .fchip i, h2 i { font-style: normal; color: var(--text-3); margin-left: 3px; font-variant-numeric: tabular-nums; }
  .search { margin-left: auto; flex: 0 1 300px; min-width: 0; height: 34px; padding: 0 14px; border-radius: 11px; border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font-size: 13px; }
  .search:focus { outline: none; border-color: rgba(124, 92, 255, 0.6); box-shadow: 0 0 0 3px rgba(124, 92, 255, 0.15); }
  .fchips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 18px 0 22px; }
  .fchip { font: 12.5px var(--font); display: flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--border);
    background: none; font-size: 12.5px; color: var(--text-2); transition: all 0.15s; }
  .fchip:hover { color: var(--text); border-color: var(--border-strong); }
  .fchip.on { color: var(--text); background: var(--surface-3); border-color: var(--border-strong); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4); }
  .fchip.ai.on { color: #fff; border-color: transparent; background: var(--accent); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 2px 0 var(--accent-edge); }
  .fchip.ai.on i { color: rgba(255, 255, 255, 0.8); }
  .sep { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
  .lvl .d { width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
  .critical { --c: var(--sev-critical); } .high { --c: var(--sev-high); } .medium { --c: var(--sev-medium); } .low, .info { --c: var(--sev-low); }
  section { margin-bottom: 22px; }
  h2 { margin: 0 0 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .none { padding: 40px; text-align: center; color: var(--text-2); border: 1px dashed var(--border-strong); border-radius: 16px; }
  .empty { color: var(--text-3); }
  .ipage:has(.board) { max-width: 1400px; }
  .lay { margin-left: auto; } .lay + .search { margin-left: 0; }
  .where { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: -8px 0 20px; }
  .wl { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); margin-right: 4px; }
  .wf { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 99px; border: 1px solid var(--border); background: var(--glass); font: 11.5px var(--font); color: var(--text-2); box-shadow: var(--elev-1); }
  .wf i { font-style: normal; font-weight: 600; color: var(--sev-high); } .wf.on { border-color: var(--accent); color: var(--text); }
  .board { display: grid; grid-template-columns: repeat(var(--n), minmax(240px, 1fr)); gap: 16px; align-items: start; }
  .col { --c: var(--sev-medium); border-radius: 18px; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-2), 0 0 50px -24px color-mix(in srgb, var(--c) 55%, transparent);
    padding: 12px; animation: drift 11s ease-in-out infinite; }
  .col.critical { --c: var(--sev-critical); } .col.high { --c: var(--sev-high); } .col.low { --c: var(--sev-low); }
  @keyframes drift { 50% { transform: translateY(-5px); } }
  .col header { display: flex; align-items: center; gap: 8px; padding: 2px 4px 10px; }
  .col .bar { width: 4px; height: 16px; border-radius: 2px; background: var(--c); box-shadow: 0 0 10px var(--c); }
  .col h2 { margin: 0; flex: 1; }
  .col header i { font-style: normal; font-size: 12px; font-weight: 600; color: var(--text-2); }
  .tiles { display: flex; flex-direction: column; gap: 8px; max-height: calc(100vh - 290px); overflow: auto; }
  .tile { display: flex; flex-direction: column; gap: 6px; padding: 12px 13px; border-radius: 13px; border: 1px solid var(--border); background: var(--surface); text-align: left; color: inherit;
    box-shadow: var(--elev-1); transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
  .tile:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 50%, var(--border)); box-shadow: var(--elev-2), 0 0 30px -12px color-mix(in srgb, var(--c) 60%, transparent); }
  .tt { font-size: 13px; font-weight: 500; line-height: 1.35; }
  .tm { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; color: var(--text-3); }
  .tm .ai { padding: 0 7px; border-radius: 99px; font-weight: 600; color: #fff; background: var(--accent); }
  .tm .chk { padding: 0 7px; border-radius: 99px; color: var(--text-2); background: var(--surface-3); }
  .td { font-size: 11.5px; line-height: 1.45; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ta { font-size: 10.5px; color: var(--text-3); }
  .quiet { margin: 6px 4px; font-size: 12px; color: var(--text-3); }
  @media (prefers-reduced-motion: reduce) { .col { animation: none; } }
  @media (max-width: 1000px) { .board { grid-template-columns: 1fr; } }
</style>
