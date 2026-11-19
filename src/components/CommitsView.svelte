<script lang="ts">
  // Commits as a timeline: a line of light down the left, each commit a node on it coloured by what its review found,
  // grouped by day, its card beside it. The chosen commit opens on the right as a floating panel: what it changed at a
  // glance, then its changes with the findings beside the lines, or how the AI read it.
  import { app, selectCommit, requestReview } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import DiffReview from './DiffReview.svelte';
  import ReviewTab from './ReviewTab.svelte';
  import BranchPicker from './BranchPicker.svelte';
  import CopyButton from './CopyButton.svelte';
  import Orb from './Orb.svelte';

  let q = $state('');
  let view = $state<'changes' | 'ai'>('changes');
  const list = $derived(app.shownCommits.filter((c) => !q.trim() || `${c.commit.message} ${c.commit.author} ${c.commit.sha}`.toLowerCase().includes(q.trim().toLowerCase())));
  const issuesIn = (c: (typeof app.commits)[number]) => Object.values(c.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const STATUS: Record<string, string> = { queued: 'Waiting', running: 'Reviewing', done: 'Reviewed', failed: 'Failed' };
  // Group by day: Today, Yesterday, then the date.
  const dayOf = (ms: number) => {
    const d = new Date(ms), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  };
  const days = $derived.by(() => {
    const out: { day: string; items: typeof list }[] = [];
    for (const c of list) {
      const day = dayOf(c.commit.time);
      if (out.at(-1)?.day !== day) out.push({ day, items: [] });
      out.at(-1)!.items.push(c);
    }
    return out;
  });
  const tone = (c: (typeof app.commits)[number]) => (c.status === 'running' || c.status === 'queued' ? 'busy' : c.status === 'failed' ? 'bad' : issuesIn(c) ? 'warn' : 'ok');
  const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const d = $derived(app.detail);
  const added = $derived(d?.analysis.files.reduce((a, f) => a + f.addedLines.length, 0) ?? 0);
  const removed = $derived(d?.analysis.files.reduce((a, f) => a + f.deletedAt.length, 0) ?? 0);
  const found = $derived(app.issues.length);
  function keys(e: KeyboardEvent) {
    if ((e.target as Element | null)?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey) return;
    if (e.key !== 'j' && e.key !== 'k') return;
    const i = list.findIndex((c) => c.commit.sha === app.selectedSha);
    const next = list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'j' ? 1 : -1)))];
    if (next) { e.preventDefault(); void selectCommit(next.commit.sha, true); }
  }
</script>

<svelte:window onkeydown={keys} />
<div class="commits">
  <aside class="timeline">
    <div class="tools">
      <div class="trow"><h1>Commits</h1>{#if app.featureOn('branchSwitcher')}<BranchPicker />{/if}</div>
      <div class="trow">
        <input placeholder="Search commits…" bind:value={q} spellcheck="false" />
        <div class="seg">
          <button class:on={app.history === 'everyone'} onclick={() => (app.history = 'everyone')}>All</button>
          <button class:on={app.history === 'mine'} disabled={!app.myCommits.length} onclick={() => (app.history = 'mine')}>Mine</button>
        </div>
      </div>
    </div>
    <div class="track">
      {#each days as g (g.day)}
        <p class="day">{g.day}</p>
        {#each g.items as c (c.commit.sha)}
          {@const n = issuesIn(c)}
          <button class="node {tone(c)}" class:on={c.commit.sha === app.selectedSha} onclick={() => selectCommit(c.commit.sha, true)}>
            <span class="pin" title={STATUS[c.status ?? 'queued']}></span>
            <span class="card">
              <span class="msg">{c.commit.message}</span>
              <span class="meta">
                <i class="av">{initials(c.commit.author)}</i>{c.commit.author} · {ago(c.commit.time)} · <span class="mono">{c.commit.shortSha}</span>
              </span>
              <span class="tags">
                {#if n}<i class="cnt">{n} issue{n === 1 ? '' : 's'}</i>{:else if c.status === 'done'}<i class="clean">clean</i>{/if}
                {#if c.model}<i class="ai">AI read</i>{/if}
                {#if c.status === 'running' || c.status === 'queued'}<i class="wait">{STATUS[c.status]}</i>{/if}
                {#if c.risk === 'high'}<i class="risk">risky</i>{/if}
              </span>
            </span>
          </button>
        {/each}
      {:else}
        <p class="empty">{q ? 'No commit matches.' : 'No commits yet.'}</p>
      {/each}
    </div>
  </aside>

  <section class="detail">
    {#if d}
      <div class="summary">
        <div class="sh">
          <h2>{d.analysis.commit.message}</h2>
          <p class="who"><i class="av big">{initials(d.analysis.commit.author)}</i>{d.analysis.commit.author} · {ago(d.analysis.commit.time)} · <span class="mono">{d.analysis.commit.shortSha}</span> <CopyButton text={d.analysis.commit.sha} title="Copy the commit id" /></p>
        </div>
        <div class="nums">
          <div><b>{d.analysis.files.length}</b><span>files</span></div>
          <div><b class="plus">+{added}</b><span>lines added</span></div>
          <div><b class="minus">−{removed}</b><span>lines removed</span></div>
          <div><b>{d.analysis.changed.length}</b><span>classes changed</span></div>
          <div><b>{d.analysis.impacted.length}</b><span>classes affected</span></div>
          <div class:hot={found}><b>{found}</b><span>issues found</span></div>
          <div class="aiv">
            {#if d.review?.status === 'running' || d.review?.status === 'queued'}<Orb mood="reading" size={26} label="Reviewing" /><span>AI reviewing</span>
            {:else if d.review?.model}<b class="okb">✓</b><span>read by {d.review.model}</span>
            {:else}<button class="b3" onclick={() => requestReview(d.analysis.commit.sha)}>Ask the AI</button>{/if}
          </div>
        </div>
      </div>
      <div class="switch">
        <button class:on={view === 'changes'} onclick={() => (view = 'changes')}>Changes and findings</button>
        <button class:on={view === 'ai'} onclick={() => (view = 'ai')}>How the AI read it</button>
      </div>
      <div class="body">
        {#if view === 'changes'}<div class="drwrap"><DiffReview /></div>{:else}<div class="ai-view"><ReviewTab /></div>{/if}
      </div>
    {:else}
      <p class="empty pad">Pick a commit on the timeline.</p>
    {/if}
  </section>
</div>

<style>
  .commits { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); }
  .timeline { display: flex; flex-direction: column; min-height: 0; }
  .tools { display: flex; flex-direction: column; gap: 10px; padding: 22px 18px 12px; }
  .trow { display: flex; align-items: center; gap: 10px; }
  h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; flex: 1; }
  .tools input { flex: 1; min-width: 0; height: 34px; padding: 0 12px; border-radius: 11px; border: 1px solid var(--border); background: var(--glass); color: var(--text); font-size: 13px; box-shadow: var(--elev-1); }
  .tools input:focus { outline: none; border-color: var(--accent); }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-2); box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4); }
  .seg button { border: 0; background: none; padding: 4px 10px; border-radius: 7px; font-size: 12px; color: var(--text-2); }
  .seg button.on { background: var(--surface-3); color: var(--text); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4); }
  .seg button:disabled { opacity: 0.4; }
  /* The track: a line of light with a node per commit. */
  .track { position: relative; flex: 1; min-height: 0; overflow: auto; padding: 4px 18px 40px 18px; }
  .track::before { content: ''; position: absolute; left: 31px; top: 0; bottom: 0; width: 2px; border-radius: 2px;
    background: rgba(139, 124, 246, 0.25); box-shadow: 0 0 12px rgba(139, 124, 246, 0.35); }
  .day { position: relative; margin: 16px 0 8px 34px; font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-3); }
  .node { --c: var(--good); position: relative; display: flex; align-items: flex-start; gap: 14px; width: 100%; margin: 0 0 8px; padding: 0; border: 0; background: none; text-align: left; color: inherit; }
  .node.warn { --c: var(--sev-high); } .node.bad { --c: var(--bad); } .node.busy { --c: var(--accent); }
  .pin { position: relative; z-index: 1; flex-shrink: 0; width: 12px; height: 12px; margin: 16px 0 0 8px; border-radius: 50%; background: var(--c);
    box-shadow: 0 0 0 4px var(--bg), 0 0 12px var(--c); }
  .node.busy .pin { animation: beat 1.3s ease-in-out infinite; }
  @keyframes beat { 50% { transform: scale(1.4); } }
  .card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; padding: 11px 14px; border-radius: 14px; background: var(--glass); border: 1px solid var(--border);
    box-shadow: var(--elev-1); transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
  .node:hover .card { transform: translateX(2px); box-shadow: var(--elev-2); border-color: var(--border-strong); }
  .node.on .card { border-color: color-mix(in srgb, var(--c) 55%, var(--border)); box-shadow: var(--elev-2), 0 0 34px -12px color-mix(in srgb, var(--c) 60%, transparent); }
  .msg { font-size: 13px; font-weight: 500; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .meta { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); overflow: hidden; white-space: nowrap; }
  .av { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; font: 600 9px var(--font); font-style: normal; color: #fff; background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge); }
  .av.big { width: 24px; height: 24px; font-size: 10.5px; margin-right: 6px; background: var(--accent); }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .tags:empty { display: none; }
  .tags i { font-style: normal; font-size: 10.5px; font-weight: 600; padding: 1px 8px; border-radius: 99px; }
  .cnt { color: #1b1206; background: var(--sev-high); } .clean { color: var(--good); background: color-mix(in srgb, var(--good) 14%, transparent); }
  .ai { color: #c4b5fd; background: rgba(124, 92, 255, 0.18); } .wait { color: var(--accent-text); background: var(--accent-soft); }
  .risk { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
  /* The chosen commit, floating. */
  .detail { display: flex; flex-direction: column; min-height: 0; min-width: 0; padding: 22px 22px 0 6px; }
  .summary { padding: 18px 20px; border-radius: 18px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), var(--glow-soft); }
  .sh h2 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.015em; line-height: 1.3; }
  .who { display: flex; align-items: center; gap: 4px; margin: 8px 0 0; font-size: 12.5px; color: var(--text-3); }
  .nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; margin-top: 16px; }
  .nums > div { display: flex; flex-direction: column; justify-content: center; padding: 9px 10px; border-radius: 12px; background: var(--surface-2); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.3); min-width: 0; }
  .nums b { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; } .nums span { font-size: 10.5px; color: var(--text-3); }
  .plus { color: var(--good); } .minus { color: var(--bad); } .nums .hot b { color: var(--sev-high); } .okb { color: var(--good); }
  .aiv { align-items: flex-start; gap: 2px; } .aiv .b3 { height: 28px; }
  .switch { display: flex; gap: 4px; padding: 14px 0 10px; }
  .switch button { border: 0; background: none; height: 30px; padding: 0 12px; border-radius: 9px; font-size: 12.5px; color: var(--text-3); }
  .switch button.on { color: var(--text); background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4); }
  .body { flex: 1; min-height: 0; display: flex; border-radius: 18px 18px 0 0; background: var(--glass); border: 1px solid var(--border); border-bottom: 0; box-shadow: var(--elev-2); overflow: hidden; }
  .drwrap { flex: 1; min-width: 0; min-height: 0; display: flex; }
  .drwrap > :global(.review) { flex: 1; }
  .drwrap :global(.review > header > h2), .drwrap :global(.review > header > .meta) { display: none; }
  .ai-view { flex: 1; min-height: 0; overflow: auto; padding: 16px 20px; }
  .empty { color: var(--text-3); padding: 12px 20px; } .pad { padding: 40px; }
  @media (max-width: 1000px) { .commits { grid-template-columns: 1fr; } .timeline { max-height: 45vh; } }
</style>
