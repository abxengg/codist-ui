<script lang="ts">
  // Commits: the list on the left, the chosen commit on the right with its changes and what the review found beside
  // the lines. A second view shows how the AI read it.
  import { app, selectCommit } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import DiffReview from './DiffReview.svelte';
  import ReviewTab from './ReviewTab.svelte';

  let q = $state('');
  let view = $state<'changes' | 'ai'>('changes');
  const list = $derived(app.shownCommits.filter((c) => !q.trim() || `${c.commit.message} ${c.commit.author} ${c.commit.sha}`.toLowerCase().includes(q.trim().toLowerCase())));
  const issuesIn = (c: (typeof app.commits)[number]) => Object.values(c.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const STATUS: Record<string, string> = { queued: 'Waiting', running: 'Reviewing', done: 'Reviewed', failed: 'Failed' };
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
  <aside class="list">
    <div class="tools">
      <input placeholder="Search commits…" bind:value={q} spellcheck="false" />
      <div class="seg">
        <button class:on={app.history === 'everyone'} onclick={() => (app.history = 'everyone')}>All</button>
        <button class:on={app.history === 'mine'} disabled={!app.myCommits.length} onclick={() => (app.history = 'mine')}>Mine</button>
      </div>
    </div>
    <div class="rows">
      {#each list as c (c.commit.sha)}
        {@const n = issuesIn(c)}
        <button class="row" class:on={c.commit.sha === app.selectedSha} onclick={() => selectCommit(c.commit.sha, true)}>
          <span class="st {c.status ?? 'queued'}" class:bad={n > 0} title={STATUS[c.status ?? 'queued']}></span>
          <span class="txt">
            <span class="msg">{c.commit.message}</span>
            <span class="meta"><span class="mono">{c.commit.shortSha}</span> · {c.commit.author} · {ago(c.commit.time)}</span>
          </span>
          <span class="tags">
            {#if n}<i class="cnt">{n}</i>{/if}
            {#if c.model}<i class="ai" title="Read by {c.model}">AI</i>{/if}
            {#if c.risk === 'high'}<i class="risk" title="Commits like this often needed fixes later in this project">risk</i>{/if}
          </span>
        </button>
      {:else}
        <p class="empty">{q ? 'No commit matches.' : 'No commits yet.'}</p>
      {/each}
    </div>
  </aside>
  <section class="detail">
    {#if app.detail}
      <div class="switch">
        <button class:on={view === 'changes'} onclick={() => (view = 'changes')}>Changes and findings</button>
        <button class:on={view === 'ai'} onclick={() => (view = 'ai')}>How the AI read it</button>
      </div>
      {#if view === 'changes'}<DiffReview />{:else}<div class="ai-view"><ReviewTab /></div>{/if}
    {:else}
      <p class="empty pad">Pick a commit.</p>
    {/if}
  </section>
</div>

<style>
  .commits { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); }
  .list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); background: var(--glass); box-shadow: 10px 0 30px -20px rgba(0, 0, 0, 0.8); position: relative; z-index: 1; }
  .tools { display: flex; gap: 8px; padding: 14px; border-bottom: 1px solid var(--border); }
  .tools input { flex: 1; min-width: 0; height: 32px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px; }
  .tools input:focus { outline: none; border-color: rgba(124, 92, 255, 0.6); }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-2); }
  .seg button { border: 0; background: none; padding: 0 10px; border-radius: 7px; font-size: 12px; color: var(--text-2); }
  .seg button.on { background: var(--surface-3); color: var(--text); }
  .seg button:disabled { opacity: 0.4; cursor: default; }
  .rows { flex: 1; min-height: 0; overflow: auto; padding: 6px; }
  .row { display: flex; align-items: center; gap: 11px; width: 100%; padding: 9px 10px; border: 0; border-radius: 11px; background: none; text-align: left; }
  .row:hover { background: var(--hover); }
  .row.on { background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.35), 0 8px 18px -10px rgba(0, 0, 0, 0.7); }
  .st { width: 8px; height: 8px; border-radius: 50%; background: var(--good); flex-shrink: 0; }
  .st.queued, .st.running { background: var(--lane-model); animation: pulse 1.4s ease-in-out infinite; }
  .st.bad { background: var(--sev-high); } .st.failed { background: var(--bad); }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .msg { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tags { display: flex; gap: 4px; flex-shrink: 0; }
  .tags i { font-style: normal; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 99px; }
  .cnt { color: #fff; background: var(--sev-high); }
  .ai { color: #c4b5fd; background: rgba(124, 92, 255, 0.18); }
  .risk { color: var(--warn); background: color-mix(in srgb, var(--warn) 16%, transparent); }
  .detail { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: color-mix(in srgb, var(--bg) 70%, transparent); }
  .switch { display: flex; gap: 4px; padding: 12px 20px 0; }
  .switch button { border: 0; background: none; height: 30px; padding: 0 12px; border-radius: 9px; font-size: 12.5px; color: var(--text-3); }
  .switch button.on { color: var(--text); background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4); }
  .detail :global(.diff), .detail > :global(*:last-child) { flex: 1; min-height: 0; }
  .ai-view { flex: 1; min-height: 0; overflow: auto; padding: 12px 20px; max-width: 900px; }
  .empty { color: var(--text-3); padding: 12px; } .pad { padding: 40px; }
</style>
