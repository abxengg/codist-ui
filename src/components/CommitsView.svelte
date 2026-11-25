<script lang="ts">
  // Commits as a compact list, one row per commit, grouped by day: a dot coloured by what its review found, the
  // message, who, the id, issue and AI tags, and when. Clicking a commit puts it on the stage (CommitStage), where
  // its changes, issues and fixes float together and ← → walk the history.
  import { app, selectCommit } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import BranchPicker from './BranchPicker.svelte';
  import CommitStage from './CommitStage.svelte';
  import { live } from '../lib/live.svelte';

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
  // The branch graph, as git log --graph draws it: each row knows which lanes come in at the top, which go out at the
  // bottom, which lane the commit sits on, which lanes join into it (a merge's other side ending) and which lanes it
  // starts (its parents). Lanes are reused once free, so the graph stays narrow.
  type GRow = { col: number; top: (string | null)[]; bot: (string | null)[]; to: number[]; merge: boolean };
  const graph = $derived.by(() => {
    let lanes: (string | null)[] = [];
    const rows = new Map<string, GRow>();
    let wide = 1;
    for (const c of list) {
      const sha = c.commit.sha, top = [...lanes];
      let col = lanes.indexOf(sha);
      if (col < 0) { col = lanes.indexOf(null); if (col < 0) { col = lanes.length; lanes.push(null); } }
      lanes = lanes.map((x) => (x === sha ? null : x));
      const ps = c.commit.parents ?? [], to: number[] = [];
      ps.forEach((p, k) => {
        let j = k === 0 ? col : lanes.indexOf(p);
        if (k > 0 && j < 0) { j = lanes.indexOf(null); if (j < 0) { j = lanes.length; lanes.push(null); } }
        lanes[j] = p; to.push(j);
      });
      while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
      rows.set(sha, { col, top, bot: [...lanes], to, merge: ps.length > 1 });
      wide = Math.max(wide, top.length, lanes.length, col + 1);
    }
    return { rows, wide: Math.min(wide, 9) };
  });
  const LANE = 14, RH = 46, DH = 34;
  const lx = (i: number) => 10 + Math.min(i, 8) * LANE;
  const LANE_COL = ['#8b74ff', '#5dcaa5', '#ef9f27', '#ed93b1', '#7dd3fc', '#97c459', '#f0997b', '#afa9ec', '#b4b2a9'];
  const laneCol = (i: number) => LANE_COL[i % LANE_COL.length];
  // The lanes running past a day label: those leaving the row above it.
  const passing = (c: Row | undefined) => (c ? graph.rows.get(c.commit.sha)?.bot ?? [] : []);

  // Three dots per commit: the code checks, the AI's read, and the behaviour run.
  type Dot = { k: 'done' | 'busy' | 'bad' | 'warn' | 'none'; t: string };
  const checksDot = (c: Row): Dot => c.status === 'done' ? { k: 'done', t: 'Code checks: done' } : c.status === 'running' ? { k: 'busy', t: 'Code checks: running' }
    : c.status === 'failed' ? { k: 'bad', t: 'Code checks: failed' } : c.status === 'queued' ? { k: 'busy', t: 'Code checks: waiting' } : { k: 'none', t: 'Code checks: not run' };
  const aiDot = (c: Row): Dot => live.call?.status === 'running' && live.call.sha === c.commit.sha ? { k: 'busy', t: 'AI: reading now' }
    : c.model ? { k: 'done', t: `AI: read by ${c.model}` } : { k: 'none', t: 'AI: not read yet' };
  const behDot = (c: Row): Dot => c.behaviour === 'done' ? { k: 'done', t: 'Behaviour: same as before' } : c.behaviour === 'differs' ? { k: 'warn', t: 'Behaviour: differs from before' }
    : c.behaviour === 'running' || c.behaviour === 'queued' ? { k: 'busy', t: `Behaviour: ${c.behaviour}` } : c.behaviour === 'failed' ? { k: 'bad', t: 'Behaviour: run failed' }
    : { k: 'none', t: c.behaviour === 'skipped' ? 'Behaviour: skipped' : 'Behaviour: not run' };

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
    {#if days.length}
      <div class="legend"><span class="dots"><i class="done"></i><i class="done"></i><i class="done"></i></span>checks · AI · behaviour</div>
    {/if}
    <div class="group" style:--gw="{lx(graph.wide - 1) + 12}px">
      {#each days as g, gi (g.day)}
        {@const prev = gi ? days[gi - 1].items.at(-1)?.c : undefined}
        <div class="day">
          <svg class="gr" width={lx(graph.wide - 1) + 12} height={DH} aria-hidden="true">
            {#each passing(prev) as l, i}{#if l}<line x1={lx(i)} y1="0" x2={lx(i)} y2={DH} stroke={laneCol(i)} />{/if}{/each}
          </svg>
          <span>{g.day}</span>
        </div>
        {#each g.items as { c } (c.commit.sha)}
          {@const k = issuesIn(c)}
          {@const r = graph.rows.get(c.commit.sha)}
          <button id="c-{c.commit.sha}" class="row {tone(c)}" class:on={c.commit.sha === app.selectedSha} onclick={() => openCommit(c.commit.sha)}>
            <svg class="gr" width={lx(graph.wide - 1) + 12} height={RH} aria-hidden="true">
              {#if r}
                {#each r.top as l, i}{#if l}
                  {#if l === c.commit.sha}<path d="M{lx(i)},0 C{lx(i)},{RH / 2 - 8} {lx(r.col)},{RH / 2 - 14} {lx(r.col)},{RH / 2}" stroke={laneCol(i)} />
                  {:else}<line x1={lx(i)} y1="0" x2={lx(i)} y2={RH / 2} stroke={laneCol(i)} />{/if}
                {/if}{/each}
                {#each r.bot as l, i}{#if l}
                  {#if r.to.includes(i)}<path d="M{lx(r.col)},{RH / 2} C{lx(r.col)},{RH / 2 + 14} {lx(i)},{RH - 8} {lx(i)},{RH}" stroke={laneCol(i)} />
                  {:else}<line x1={lx(i)} y1={RH / 2} x2={lx(i)} y2={RH} stroke={laneCol(i)} />{/if}
                {/if}{/each}
                <circle cx={lx(r.col)} cy={RH / 2} r={r.merge ? 5 : 4.5} class="node" class:merge={r.merge} style:--lc={laneCol(r.col)} />
              {/if}
            </svg>
            <span class="msg" title={c.commit.message}>{#if r?.merge}<i class="mg">merge</i>{/if}{c.commit.message}</span>
            <span class="who"><i class="av">{initials(c.commit.author)}</i><span>{c.commit.author}</span></span>
            <span class="sha mono">{c.commit.shortSha}</span>
            <span class="dots">{#each [checksDot(c), aiDot(c), behDot(c)] as d}<i class={d.k} title={d.t}></i>{/each}</span>
            <span class="tags">
              {#if k}<i class="ui-pill cnt">{k} issue{k === 1 ? '' : 's'}</i>{:else if c.status === 'done'}<i class="ui-pill good">clean</i>{/if}
              {#if c.risk === 'high'}<i class="ui-pill warn">risky</i>{/if}
            </span>
            <span class="time">{ago(c.commit.time)}</span>
          </button>
        {/each}
      {:else}
        <p class="empty">{q ? 'No commit matches.' : 'No commits yet.'}</p>
      {/each}
    </div>
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

  /* One panel of rows, day labels inside it, with the branch graph down the left edge of every row. */
  .list { position: relative; z-index: 1; max-width: 1180px; margin: 0 auto; padding: 0 32px 80px; }
  .legend { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin: 0 4px 8px; font-size: 11px; color: var(--text-3); }
  .group { border-radius: 16px; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-1); overflow: hidden; }
  .day { display: flex; align-items: center; height: 34px; padding: 0 16px 0 8px; border-top: 1px solid var(--border); background: color-mix(in srgb, var(--surface-2) 50%, transparent); }
  .day:first-child { border-top: 0; }
  .day span { font-size: 11px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-3); }
  .gr { flex-shrink: 0; overflow: visible; }
  .gr line, .gr path { fill: none; stroke-width: 2; stroke-linecap: round; opacity: 0.75; }
  .node { fill: var(--lc); stroke: var(--bg); stroke-width: 2; }
  .node.merge { fill: var(--bg); stroke: var(--lc); stroke-width: 2.5; }
  .row { --c: var(--good); display: grid; grid-template-columns: var(--gw) minmax(0, 1fr) 150px 74px 52px 100px 60px; align-items: center; gap: 12px;
    width: 100%; height: 46px; padding: 0 16px 0 8px; border: 0; border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent); background: none; color: inherit; text-align: left; transition: background 0.12s; }
  .row.warn { --c: var(--sev-high); } .row.bad { --c: var(--bad); } .row.busy { --c: var(--accent); }
  .row:hover { background: var(--surface-2); }
  .row.on { background: color-mix(in srgb, var(--accent) 9%, transparent); box-shadow: inset 3px 0 0 var(--accent); }
  .msg { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mg { font-style: normal; margin-right: 6px; padding: 0 6px; border-radius: 99px; font-size: 10.5px; font-weight: 600; color: var(--text-3); border: 1px solid var(--border-strong); }
  .who { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 12.5px; color: var(--text-2); }
  .who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .av { flex-shrink: 0; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font: 600 9px var(--font); font-style: normal; color: #fff; background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge); }
  .sha { font-size: 12px; color: var(--text-3); }
  /* checks · AI · behaviour: filled when done, pulsing while running, hollow when not run. */
  .dots { display: inline-flex; gap: 6px; align-items: center; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--text-3); opacity: 0.5; }
  .dots i:nth-child(1).done { background: var(--good); border-color: var(--good); opacity: 1; }
  .dots i:nth-child(2).done { background: var(--accent); border-color: var(--accent); opacity: 1; }
  .dots i:nth-child(3).done { background: #7dd3fc; border-color: #7dd3fc; opacity: 1; }
  .dots i.busy { border-color: var(--accent); opacity: 1; animation: beat 1.2s ease-in-out infinite; }
  .dots i.bad { background: var(--bad); border-color: var(--bad); opacity: 1; }
  .dots i.warn { background: var(--sev-high); border-color: var(--sev-high); opacity: 1; }
  @keyframes beat { 50% { transform: scale(1.4); } }
  .tags { display: flex; gap: 5px; overflow: hidden; }
  .tags i { font-style: normal; }
  .cnt { color: #1b1206; background: var(--sev-high); }
  .time { font-size: 12px; color: var(--text-3); text-align: right; font-variant-numeric: tabular-nums; }
  .empty { text-align: center; color: var(--text-3); padding: 40px; }
  @media (max-width: 900px) {
    .row { grid-template-columns: var(--gw) minmax(0, 1fr) 52px auto 50px; }
    .who, .sha { display: none; }
  }
</style>
