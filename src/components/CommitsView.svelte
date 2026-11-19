<script lang="ts">
  // Commits as a compact list, one row per commit, grouped by day: a dot coloured by what its review found, the
  // message, who, the id, issue and AI tags, and when. Clicking a commit puts it on the stage (CommitStage), where
  // its changes, issues and fixes float together and ← → walk the history.
  import { app, selectCommit } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import BranchPicker from './BranchPicker.svelte';
  import CommitStage from './CommitStage.svelte';

  let q = $state('');
  const list = $derived(app.shownCommits.filter((c) => !q.trim() || `${c.commit.message} ${c.commit.author} ${c.commit.sha}`.toLowerCase().includes(q.trim().toLowerCase())));
  type Row = (typeof app.commits)[number];
  const issuesIn = (c: Row) => Object.values(c.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const STATUS: Record<string, string> = { queued: 'Waiting', running: 'Reviewing', done: 'Reviewed', failed: 'Failed' };
  const dayOf = (ms: number) => {
    const d = new Date(ms), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const days = $derived.by(() => {
    const out: { day: string; items: { c: Row; n: number }[] }[] = [];
    list.forEach((c, n) => {
      const day = dayOf(c.commit.time);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push({ c, n });
    });
    return out;
  });
  const tone = (c: Row) => (c.status === 'running' || c.status === 'queued' ? 'busy' : c.status === 'failed' ? 'bad' : issuesIn(c) ? 'warn' : 'ok');
  const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const withIssues = $derived(list.filter((c) => issuesIn(c)).length);
  const readByAI = $derived(list.filter((c) => c.model).length);
  function openCommit(sha: string) { void selectCommit(sha, true); app.commitStage = true; }
  function keys(e: KeyboardEvent) {
    if (app.commitStage || app.fix || app.focus || app.fileShown) return;
    if ((e.target as Element | null)?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Enter' && app.selectedSha) { e.preventDefault(); app.commitStage = true; return; }
    if (e.key !== 'j' && e.key !== 'k') return;
    const i = list.findIndex((c) => c.commit.sha === app.selectedSha);
    const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'j' ? 1 : -1)))];
    if (next) { e.preventDefault(); void selectCommit(next.commit.sha, true); document.getElementById(`c-${next.commit.sha}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
</script>

<svelte:window onkeydown={keys} />
<div class="commits">
  <header class="top">
    <div class="title">
      <h1>Commits</h1>
      <p>{list.length} commits · <b class="warn">{withIssues}</b> with issues · <b class="ai">{readByAI}</b> read by the AI</p>
    </div>
    <div class="tools">
      <input placeholder="Search commits…" bind:value={q} spellcheck="false" />
      <div class="seg">
        <button class:on={app.history === 'everyone'} onclick={() => (app.history = 'everyone')}>All</button>
        <button class:on={app.history === 'mine'} disabled={!app.myCommits.length} onclick={() => (app.history = 'mine')}>Mine</button>
      </div>
      {#if app.featureOn('branchSwitcher')}<BranchPicker />{/if}
    </div>
  </header>

  <div class="list">
    {#each days as g (g.day)}
      <p class="day">{g.day}</p>
      <div class="group">
        {#each g.items as { c } (c.commit.sha)}
          {@const k = issuesIn(c)}
          <button id="c-{c.commit.sha}" class="row {tone(c)}" class:on={c.commit.sha === app.selectedSha} onclick={() => openCommit(c.commit.sha)}>
            <span class="dot" title={STATUS[c.status ?? 'queued']}></span>
            <span class="msg" title={c.commit.message}>{c.commit.message}</span>
            <span class="who"><i class="av">{initials(c.commit.author)}</i><span>{c.commit.author}</span></span>
            <span class="sha mono">{c.commit.shortSha}</span>
            <span class="tags">
              {#if k}<i class="ui-pill cnt">{k} issue{k === 1 ? '' : 's'}</i>{:else if c.status === 'done'}<i class="ui-pill good">clean</i>{/if}
              {#if c.model}<i class="ui-pill ai">AI</i>{/if}
              {#if c.status === 'running' || c.status === 'queued'}<i class="ui-pill">{STATUS[c.status]}</i>{/if}
              {#if c.risk === 'high'}<i class="ui-pill warn">risky</i>{/if}
            </span>
            <span class="time">{ago(c.commit.time)}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty">{q ? 'No commit matches.' : 'No commits yet.'}</p>
    {/each}
  </div>
</div>
<CommitStage />

<style>
  .commits { flex: 1; min-height: 0; overflow: auto; position: relative; }
  .commits::before { content: ''; position: fixed; left: 50%; top: -20vh; width: 70vw; height: 60vh; transform: translateX(-35%); pointer-events: none;
    background: radial-gradient(closest-side, rgba(139, 116, 255, 0.10), transparent); z-index: 0; }
  :global([data-theme='light']) .commits::before { display: none; }
  .top { position: sticky; top: 0; z-index: 3; display: flex; align-items: flex-end; gap: 20px; flex-wrap: wrap; padding: 26px 32px 16px;
    background: linear-gradient(var(--bg) 70%, transparent); }
  .title { flex: 1; min-width: 220px; }
  h1 { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -0.03em; }
  .title p { margin: 4px 0 0; font-size: 13px; color: var(--text-3); }
  .title b { font-weight: 600; } .title .warn { color: var(--sev-high); } .title .ai { color: var(--accent-text); }
  .tools { display: flex; align-items: center; gap: 10px; }
  .tools input { width: 240px; height: 34px; padding: 0 12px; border-radius: 11px; border: 1px solid var(--border); background: var(--glass); color: var(--text); font-size: 13px; box-shadow: var(--elev-1); }
  .tools input:focus { outline: none; border-color: var(--accent); }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-2); box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4); }
  .seg button { border: 0; background: none; padding: 4px 10px; border-radius: 7px; font-size: 12px; color: var(--text-2); }
  .seg button.on { background: var(--surface-3); color: var(--text); box-shadow: inset 0 1px 0 var(--edge); }
  .seg button:disabled { opacity: 0.4; }

  /* One row per commit, grouped by day, inside one floating panel per day. */
  .list { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 0 32px 80px; }
  .day { margin: 18px 4px 8px; }
  .day { font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-3); }
  .group { border-radius: 16px; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-1); overflow: hidden; }
  .row { --c: var(--good); display: grid; grid-template-columns: 10px minmax(0, 1fr) 150px 74px 150px 60px; align-items: center; gap: 14px;
    width: 100%; height: 46px; padding: 0 16px; border: 0; border-top: 1px solid var(--border); background: none; color: inherit; text-align: left; transition: background 0.12s; }
  .row:first-child { border-top: 0; }
  .row.warn { --c: var(--sev-high); } .row.bad { --c: var(--bad); } .row.busy { --c: var(--accent); }
  .row:hover { background: var(--surface-2); }
  .row.on { background: color-mix(in srgb, var(--c) 9%, transparent); box-shadow: inset 3px 0 0 var(--c); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px color-mix(in srgb, var(--c) 70%, transparent); }
  .row.busy .dot { animation: beat 1.3s ease-in-out infinite; }
  @keyframes beat { 50% { transform: scale(1.5); } }
  .msg { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 12.5px; color: var(--text-2); }
  .who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .av { flex-shrink: 0; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font: 600 9px var(--font); font-style: normal; color: #fff; background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge); }
  .sha { font-size: 12px; color: var(--text-3); }
  .tags { display: flex; gap: 5px; overflow: hidden; }
  .tags i { font-style: normal; }
  .cnt { color: #1b1206; background: var(--sev-high); }
  .time { font-size: 12px; color: var(--text-3); text-align: right; font-variant-numeric: tabular-nums; }
  .empty { text-align: center; color: var(--text-3); padding: 40px; }
  @media (max-width: 900px) {
    .row { grid-template-columns: 10px minmax(0, 1fr) auto 50px; }
    .who, .sha { display: none; }
  }
</style>
