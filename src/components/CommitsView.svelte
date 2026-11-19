<script lang="ts">
  // Commits as a timeline of light down the middle of the page: each commit a node on it, coloured by what its review
  // found, its card on alternating sides, grouped by day. Clicking a commit puts it on the stage (CommitStage), where
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

  <div class="track">
    <div class="spine" aria-hidden="true"></div>
    {#each days as g (g.day)}
      <p class="day"><span>{g.day}</span></p>
      {#each g.items as { c, n } (c.commit.sha)}
        {@const k = issuesIn(c)}
        <button id="c-{c.commit.sha}" class="node {tone(c)} {n % 2 ? 'r' : 'l'}" class:on={c.commit.sha === app.selectedSha} onclick={() => openCommit(c.commit.sha)}>
          <span class="pin" title={STATUS[c.status ?? 'queued']}></span>
          <span class="stem"></span>
          <span class="card">
            <span class="msg">{c.commit.message}</span>
            <span class="meta"><i class="av">{initials(c.commit.author)}</i>{c.commit.author} · {ago(c.commit.time)} · <span class="mono">{c.commit.shortSha}</span></span>
            <span class="tags">
              {#if k}<i class="ui-pill cnt">{k} issue{k === 1 ? '' : 's'}</i>{:else if c.status === 'done'}<i class="ui-pill good">clean</i>{/if}
              {#if c.model}<i class="ui-pill ai">AI read</i>{/if}
              {#if c.status === 'running' || c.status === 'queued'}<i class="ui-pill">{STATUS[c.status]}</i>{/if}
              {#if c.risk === 'high'}<i class="ui-pill warn">risky</i>{/if}
            </span>
          </span>
        </button>
      {/each}
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

  /* The spine down the middle, cards on alternating sides. */
  .track { position: relative; z-index: 1; max-width: 980px; margin: 0 auto; padding: 8px 32px 80px; }
  .spine { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; border-radius: 2px;
    background: linear-gradient(rgba(139, 124, 246, 0.55), rgba(139, 124, 246, 0.12)); box-shadow: 0 0 14px rgba(139, 124, 246, 0.35); }
  .day { position: relative; display: flex; justify-content: center; margin: 22px 0 12px; }
  .day span { padding: 3px 12px; border-radius: 99px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-2);
    background: var(--surface-2); border: 1px solid var(--border); box-shadow: var(--elev-1); }
  .node { --c: var(--good); position: relative; display: block; width: 50%; margin: 0 0 6px; padding: 0; border: 0; background: none; text-align: left; color: inherit; }
  .node.l { padding-right: 34px; } .node.r { margin-left: 50%; padding-left: 34px; }
  .node.warn { --c: var(--sev-high); } .node.bad { --c: var(--bad); } .node.busy { --c: var(--accent); }
  .pin { position: absolute; top: 20px; width: 12px; height: 12px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 4px var(--bg), 0 0 14px var(--c); z-index: 1; }
  .node.l .pin { right: -6px; } .node.r .pin { left: -6px; }
  .stem { position: absolute; top: 25px; width: 28px; height: 2px; background: color-mix(in srgb, var(--c) 45%, transparent); }
  .node.l .stem { right: 6px; } .node.r .stem { left: 6px; }
  .node.busy .pin { animation: beat 1.3s ease-in-out infinite; }
  @keyframes beat { 50% { transform: scale(1.4); } }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 12px 15px; border-radius: 14px; background: var(--glass); border: 1px solid var(--border);
    box-shadow: var(--elev-1); transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s; }
  .node:hover .card { transform: translateY(-2px); box-shadow: var(--elev-2), 0 0 34px -16px color-mix(in srgb, var(--c) 70%, transparent); border-color: var(--border-strong); }
  .node.on .card { border-color: color-mix(in srgb, var(--c) 55%, var(--border)); box-shadow: var(--elev-2), 0 0 34px -12px color-mix(in srgb, var(--c) 60%, transparent); }
  .msg { font-size: 13.5px; font-weight: 500; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); overflow: hidden; white-space: nowrap; }
  .av { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font: 600 9px var(--font); font-style: normal; color: #fff; background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge); }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tags:empty { display: none; }
  .tags i { font-style: normal; }
  .cnt { color: #1b1206; background: var(--sev-high); }
  .empty { position: relative; text-align: center; color: var(--text-3); padding: 40px; }
  @media (max-width: 860px) {
    .spine { left: 40px; }
    .node, .node.r { width: 100%; margin-left: 0; padding: 0 0 0 40px; }
    .node.l .pin, .node.r .pin { left: 2px; right: auto; } .node.l .stem, .node.r .stem { left: 14px; right: auto; width: 22px; }
    .day { justify-content: flex-start; padding-left: 0; }
  }
</style>
