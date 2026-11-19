<script lang="ts">
  // The home screen. One look answers: what is the AI doing, is anything wrong, and what changed. No clicks needed;
  // every row opens in place.
  import { app, selectCommit } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import { groups, serious } from '../lib/groups';
  import { ago } from '../lib/theme';
  import Orb from './Orb.svelte';
  import BranchPicker from './BranchPicker.svelte';
  import IssueCard from './IssueCard.svelte';

  const all = $derived(app.issueList?.issues ?? []);
  const open = $derived(groups(all));
  const attention = $derived(open.filter(serious).slice(0, 6));
  const ai = $derived(open.filter((g) => g.some((i) => i.source === 'llm')).length);
  const week = Date.now() - 7 * 864e5;
  const fixedWeek = $derived(all.filter((i) => i.state === 'resolved' && (i.fixedAt ?? 0) > week).length);
  const reviewed = $derived(app.commits.filter((c) => c.status === 'done').length);
  const latest = $derived(app.commits.slice(0, 6));
  const elapsed = $derived(live.call ? Math.max(0, Math.round((live.now - live.call.at) / 1000)) : 0);
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const issuesIn = (c: (typeof app.commits)[number]) => Object.values(c.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  function openCommit(sha: string) {
    void selectCommit(sha, true);
    app.mode = 'commits';
  }
  const greet = $derived(new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening');
</script>

<div class="now">
  <div class="brandbar"><span class="repo">{app.status?.repo ?? ""}</span>{#if app.featureOn('branchSwitcher')}<BranchPicker />{:else if app.status?.branch}<span>· {app.status.branch}</span>{/if}</div>
  <section class="hero">
    <div class="light" aria-hidden="true"></div>
    <!-- The name, with the AI's orb as its "o". -->
    <div class="wordmark" aria-label="Codist">
      <span aria-hidden="true">C</span><span class="o"><Orb mood={live.mood} size={128} label={live.sentence} /></span><span aria-hidden="true">dist</span>
    </div>
    <h1>{live.sentence}</h1>
    <p class="sub">
      {#if live.call?.status === 'running'}
        {live.call.sha ? live.call.sha.slice(0, 7) + ' · ' : ''}{mm(elapsed)}{live.call.replyTokens ? ` · ${live.call.replyTokens} words written` : ''}
      {:else if app.status?.llmProblem}
        {app.status.llmProblem}
      {:else}
        {greet}{app.status?.user ? `, ${app.status.user.split(' ')[0]}` : ''}. Watching <b>{app.status?.repo ?? 'your code'}</b> on {app.status?.branch ?? 'this branch'}.
      {/if}
    </p>
    <div class="stats">
      <button class="stat fl" onclick={() => (app.mode = 'issues')}><b>{open.length}</b><span>open issues</span></button>
      <button class="stat fl" onclick={() => { app.foundBy = 'llm'; app.mode = 'issues'; }}><b class="grad">{ai}</b><span>found by AI</span></button>
      <button class="stat fl" onclick={() => (app.mode = 'commits')}><b>{reviewed}</b><span>commits reviewed</span></button>
      <div class="stat fl"><b>{live.waiting}</b><span>waiting for AI</span></div>
      <div class="stat fl"><b>{fixedWeek}</b><span>fixed this week</span></div>
    </div>
  </section>

  <div class="cols">
    <section class="block panel fl p1">
      <header><h2>Needs your attention</h2><span class="hr">{#if open.length > attention.length}<button class="more" onclick={() => (app.mode = 'issues')}>All {open.length} →</button>{/if}</span></header>
      {#if !app.issueList}
        <p class="empty">Loading…</p>
      {:else if attention.length === 0}
        <div class="calm"><span class="ok"></span><div><b>Nothing serious is open.</b><p>{open.length ? `${open.length} minor note${open.length === 1 ? '' : 's'} in Issues.` : 'Every issue Codist found is closed.'}</p></div></div>
      {:else}
        <div class="list">{#each attention as g (g[0].id)}<IssueCard {g} />{/each}</div>
      {/if}
    </section>

    <aside class="side">
      <section class="block panel fl p2">
        <header><h2>Latest commits</h2><button class="more" onclick={() => (app.mode = 'commits')}>All →</button></header>
        <div class="commits">
          {#each latest as c (c.commit.sha)}
            {@const n = issuesIn(c)}
            <button class="commit" onclick={() => openCommit(c.commit.sha)}>
              <span class="st {c.status ?? 'queued'}" class:bad={n > 0}></span>
              <span class="msg">{c.commit.message}</span>
              <span class="cm">{#if n}<i class="cnt">{n}</i>{/if}{#if c.model}<i class="aitag" title="Read by {c.model}">AI</i>{/if}<span>{ago(c.commit.time)}</span></span>
            </button>
          {/each}
        </div>
      </section>
      {#if live.recent.length}
        <section class="block panel fl p3">
          <header><h2>What the AI just did</h2><button class="more" onclick={() => (app.mode = 'activity')}>Activity →</button></header>
          <ol class="feed">
            {#each live.recent.slice(0, 5) as a (a.id)}
              <li class:failed={a.status === 'failed'}><span class="fd"></span><span class="ft">{a.title}{a.path ? ` · ${a.path.slice(a.path.lastIndexOf('/') + 1)}` : ''}</span><span class="fm">{(a.tookMs / 1000).toFixed(0)} s</span></li>
            {/each}
          </ol>
        </section>
      {/if}
    </aside>
  </div>
</div>

<style>
  .now { flex: 1; min-height: 0; overflow: auto; padding: 0 clamp(16px, 4vw, 56px) 48px; }
  .brandbar { display: flex; align-items: center; gap: 10px; padding: 20px 0 0; max-width: 1280px; margin: 0 auto; }
  .brandbar .repo { font-size: 13px; font-weight: 600; color: var(--text-2); }
  .brandbar span { font-size: 12.5px; color: var(--text-3); }
  .hero { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 72px 0 40px; }
  /* The orb as a light source: a soft pool of its colour behind it, breathing slowly. */
  .light { position: absolute; top: -40px; left: 50%; width: 760px; height: 460px; transform: translateX(-50%); pointer-events: none;
    background: radial-gradient(closest-side, rgba(124, 100, 255, 0.16), rgba(124, 100, 255, 0.05) 55%, transparent); filter: blur(10px);
    animation: breathe 6s ease-in-out infinite; }
  @keyframes breathe { 50% { opacity: 0.65; transform: translateX(-50%) scale(0.96); } }
  @media (prefers-reduced-motion: reduce) { .light { animation: none; } }
  .hero > :global(*:not(.light)) { position: relative; }
  .wordmark { display: flex; align-items: center; font-size: clamp(110px, 14vw, 200px); font-weight: 650; letter-spacing: -0.05em; line-height: 1; color: var(--text); margin-top: 8px; }
  .wordmark .o { display: inline-flex; align-items: center; justify-content: center; width: 0.66em; height: 0.66em; margin: 0.16em 0.03em 0 0.05em; }
  .wordmark .o :global(.orb) { width: 100% !important; height: 100% !important; }
  h1 { position: relative; margin: 22px 0 6px; font-size: clamp(17px, 1.8vw, 21px); font-weight: 500; letter-spacing: -0.01em; color: var(--text-2); }
  .sub { position: relative; margin: 0; color: var(--text-2); font-size: 14px; }
  .sub b { color: var(--text); font-weight: 600; }
  .stats { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; margin-top: 34px; }
  .stat { display: flex; flex-direction: column; align-items: center; min-width: 116px; padding: 12px 16px; border-radius: 16px; border: 1px solid var(--border);
    background: var(--glass, var(--surface)); box-shadow: var(--elev-1); color: inherit; }
  button.stat:hover { border-color: rgba(139, 116, 255, 0.45); transform: translateY(-2px); box-shadow: var(--elev-2), var(--glow-soft); }
  .stat { transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; }
  .stat b { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 11.5px; color: var(--text-3); }
  .grad { color: var(--accent-text); }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: 28px; max-width: 1280px; margin: 0 auto; }
  @media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
  .block { margin-bottom: 24px; }
  /* Everything on Now floats: panels and tiles drift gently, each on its own rhythm. */
  .panel { padding: 16px 16px 14px; border-radius: 16px; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-1); }
  .panel .commits { box-shadow: none; }
  .stats .fl:nth-child(1) { animation-duration: 8s; } .stats .fl:nth-child(2) { animation-duration: 9.5s; animation-delay: -2s; }
  .stats .fl:nth-child(3) { animation-duration: 8.5s; animation-delay: -4s; } .stats .fl:nth-child(4) { animation-duration: 10s; animation-delay: -1s; }
  .stats .fl:nth-child(5) { animation-duration: 9s; animation-delay: -3s; }
  .p1 { animation-duration: 12s; } .p2 { animation-duration: 11s; animation-delay: -3s; } .p3 { animation-duration: 13s; animation-delay: -6s; }
  @keyframes drift { 50% { transform: translateY(-6px); } }
  button.stat.fl:hover { animation-play-state: paused; }
  @media (prefers-reduced-motion: reduce) { .fl { animation: none; } }
  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
  h2 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .hr { display: flex; gap: 14px; align-items: baseline; }
  .more { border: 0; background: none; color: var(--text-3); font-size: 12px; } .more:hover { color: var(--text); }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .empty { color: var(--text-3); }
  .calm { display: flex; gap: 14px; align-items: center; padding: 18px; border-radius: 16px; border: 1px solid var(--border); background: var(--glass, var(--surface)); box-shadow: var(--elev-1); }
  .calm p { margin: 2px 0 0; color: var(--text-3); font-size: 12.5px; }
  .ok { width: 12px; height: 12px; border-radius: 50%; background: var(--good); flex-shrink: 0; }
  .commits { display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--border); background: var(--glass, var(--surface)); box-shadow: var(--elev-1); overflow: hidden; }
  .commit { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--border); background: none; text-align: left; }
  .commit:last-child { border-bottom: 0; }
  .commit:hover { background: var(--hover); }
  .st { width: 8px; height: 8px; border-radius: 50%; background: var(--good); flex-shrink: 0; }
  .st.queued, .st.running { background: var(--lane-model); animation: pulse 1.4s ease-in-out infinite; }
  .st.bad { background: var(--sev-high); }
  .st.failed { background: var(--bad); }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .cm { display: flex; gap: 6px; align-items: center; font-size: 11px; color: var(--text-3); flex-shrink: 0; }
  .cnt { font-style: normal; font-weight: 600; color: var(--sev-high); }
  .aitag { font-style: normal; font-weight: 600; font-size: 9.5px; padding: 0 5px; border-radius: 99px; color: #c4b5fd; background: rgba(124, 92, 255, 0.18); }
  .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .feed li { display: flex; align-items: center; gap: 10px; padding: 6px 4px; font-size: 12.5px; color: var(--text-2); }
  .fd { width: 6px; height: 6px; border-radius: 50%; background: var(--lane-model); flex-shrink: 0; }
  .failed .fd { background: var(--bad); }
  .ft { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fm { color: var(--text-3); font-variant-numeric: tabular-nums; }
</style>
