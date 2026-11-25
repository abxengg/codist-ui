<script lang="ts">
  // One commit, on stage: the page behind blurs, the changes sit in the middle, and everything to know about the
  // commit floats around them: what it changed, what the AI made of it, its issues with Fix right there, and what it
  // reaches. ← and → walk to the previous and next commit without leaving the stage. Esc or a click outside closes.
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, selectCommit, requestReview, proposeFix } from '../lib/store.svelte';
  import { ago, SEVERITIES } from '../lib/theme';
  import DiffReview from './DiffReview.svelte';
  import ReviewTab from './ReviewTab.svelte';
  import CopyButton from './CopyButton.svelte';
  import Orb from './Orb.svelte';
  import Constellation from './Constellation.svelte';
  import type { FindingWithPath, FixRef } from '../lib/types';

  const open = $derived(app.commitStage && app.mode === 'commits');
  const d = $derived(app.detail);
  const close = () => (app.commitStage = false);
  // Leaving the page closes the stage, so coming back shows the timeline.
  $effect(() => { if (app.mode !== 'commits') app.commitStage = false; });
  let view = $state<'changes' | 'ai'>('changes');

  // Where this commit sits in the list, for previous and next. Newer commits are first in the list.
  const list = $derived(app.shownCommits);
  const at = $derived(list.findIndex((c) => c.commit.sha === app.selectedSha));
  let dir = $state(1);
  function go(step: number) {
    const next = list[at + step];
    if (!next) return;
    dir = step;
    void selectCommit(next.commit.sha, true);
  }
  function keys(e: KeyboardEvent) {
    if (!open || app.fix || app.focus || app.fileShown) return;
    if ((e.target as Element | null)?.closest?.('input, textarea, select')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(1); } // older
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(-1); } // newer
  }

  const added = $derived(d?.analysis.files.reduce((a, f) => a + f.addedLines.length, 0) ?? 0);
  const removed = $derived(d?.analysis.files.reduce((a, f) => a + f.deletedAt.length, 0) ?? 0);
  const fresh = $derived(app.issues);
  const carried = $derived(app.carried);
  const all = $derived([...fresh, ...carried]);
  const worst = (g: FindingWithPath[]) => SEVERITIES.find((s) => g.some((f) => f.severity === s)) ?? 'info';
  const tone = $derived(fresh.length ? worst(fresh.flat()) : carried.length ? 'carried' : 'clean');
  const running = $derived(d?.review?.status === 'running' || d?.review?.status === 'queued');
  const short = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  const canFix = $derived(app.status?.canFix !== false);
  const whyNot = $derived(app.status?.viewing ? 'Switch to this branch to fix it here.' : app.status?.llmProblem ? `Needs the AI model: ${app.status.llmProblem}` : 'Fixing is not available right now.');
  const others = (g: FindingWithPath[]): FixRef[] => g.slice(1).map((m) => ({ sha: app.selectedSha ?? '', path: m.path, line: m.line, title: m.title }));
  const idOf = (g: FindingWithPath[]) => `issue-${g[0].path}-${g[0].line}`;
  function show(g: FindingWithPath[]) {
    view = 'changes';
    requestAnimationFrame(() => document.getElementById(idOf(g))?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
  function showFile(path: string) {
    view = 'changes';
    requestAnimationFrame(() => centre?.querySelector(`.file .path[title="${CSS.escape(path)}"]`)?.closest('.file')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // Lines from each issue card to its place in the changes, while that place is in view.
  let centre: HTMLDivElement | undefined = $state();
  let side: HTMLElement | undefined = $state();
  let paths = $state<{ d: string; key: string; sev: string }[]>([]);
  $effect(() => {
    if (!open || !centre || !side) return;
    let raf = 0;
    const draw = () => {
      const out: { d: string; key: string; sev: string }[] = [];
      const frame = centre!.getBoundingClientRect();
      for (const card of side!.querySelectorAll<HTMLElement>('[data-issue]')) {
        const target = document.getElementById(card.dataset.issue!);
        if (!target) continue;
        const t = target.getBoundingClientRect(), c = card.getBoundingClientRect();
        const y2 = t.top + 18;
        if (y2 < frame.top + 8 || y2 > frame.bottom - 8) continue;
        const x1 = c.left, y1 = c.top + c.height / 2, x2 = Math.min(t.right, frame.right) - 6;
        const dx = Math.max(30, (x1 - x2) * 0.5);
        out.push({ key: card.dataset.issue!, sev: card.dataset.sev ?? 'medium', d: `M${x1},${y1} C${x1 - dx},${y1} ${x2 + dx},${y2} ${x2},${y2}` });
      }
      paths = out;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });
</script>

<svelte:window onkeydown={keys} />

{#if open && d}
  <div class="scrim" transition:fade={{ duration: 240, easing: cubicOut }} onclick={close} role="presentation"></div>
  <svg class="wires" aria-hidden="true" in:fade|global={{ duration: 400, delay: 300 }} out:fade|global={{ duration: 100 }}>
    <defs>{#each ['critical', 'high', 'medium', 'low', 'info'] as s}<marker id="cs-{s}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="m-{s}" /></marker>{/each}</defs>
    {#each paths as p (p.key)}<path class="wire w-{p.sev}" d={p.d} marker-end="url(#cs-{p.sev})" />{/each}
  </svg>

  <div class="stage tone-{tone}" role="dialog" aria-modal="true" aria-label={d.analysis.commit.message}>
    <!-- The commit, with the way to walk the history. -->
    <header class="head" transition:fly|global={{ y: -18, duration: 300, easing: cubicOut }}>
      <button class="nav" disabled={!list[at + 1]} onclick={() => go(1)} title="Older commit (←)" aria-label="Older commit">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5" /></svg>
      </button>
      <div class="who">
        <span class="pos mono">{at + 1} / {list.length}</span>
        {#key d.analysis.commit.sha}
          <h2 in:fly={{ x: 24 * dir, duration: 260, easing: cubicOut }}>{d.analysis.commit.message}</h2>
        {/key}
        <p><i class="av">{initials(d.analysis.commit.author)}</i>{d.analysis.commit.author} · {ago(d.analysis.commit.time)} · <span class="mono">{d.analysis.commit.shortSha}</span> <CopyButton text={d.analysis.commit.sha} title="Copy the commit id" /></p>
      </div>
      <button class="nav" disabled={at <= 0} onclick={() => go(-1)} title="Newer commit (→)" aria-label="Newer commit">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5" /></svg>
      </button>
      <button class="x" aria-label="Close" onclick={close}>×</button>
    </header>

    <!-- Left: what it changed and what the AI made of it. -->
    <aside class="left">
      <div class="card glance" in:fly|global={{ x: -26, duration: 320, delay: 120, easing: cubicOut }} out:fly|global={{ x: -18, duration: 180 }}>
        <h3 class="ui-label">At a glance</h3>
        <div class="nums">
          <div><b>{d.analysis.files.length}</b><span>files</span></div>
          <div><b class="plus">+{added}</b><span>added</span></div>
          <div><b class="minus">−{removed}</b><span>removed</span></div>
          <div><b>{d.analysis.changed.length}</b><span>classes changed</span></div>
          <div><b>{d.analysis.impacted.length}</b><span>classes reached</span></div>
          <div class:hot={all.length}><b>{all.length}</b><span>{all.length === 1 ? 'issue' : 'issues'}</span></div>
        </div>
      </div>

      <div class="card ai" in:fly|global={{ x: -26, duration: 320, delay: 170, easing: cubicOut }} out:fly|global={{ x: -18, duration: 180 }}>
        <h3 class="ui-label">The AI</h3>
        {#if running}
          <div class="airow"><Orb mood="reading" size={34} label="Reviewing" /><p>Reading this commit now…</p></div>
        {:else if d.review?.model}
          <div class="airow"><Orb mood="idle" size={34} label="Read" /><p>Read by <b>{d.review.model}</b>.{#if !fresh.length} Nothing new found.{/if}</p></div>
          <button class="b3 ghost" onclick={() => (view = 'ai')}>How it read it</button>
        {:else}
          <p class="muted">{d.review ? 'Only the code checks ran on this commit.' : 'Not reviewed yet.'}</p>
          <button class="b3 primary" onclick={() => requestReview(d.analysis.commit.sha)}>Ask the AI</button>
        {/if}
      </div>

      <div class="card files" in:fly|global={{ x: -26, duration: 320, delay: 220, easing: cubicOut }} out:fly|global={{ x: -18, duration: 180 }}>
        <h3 class="ui-label">Files</h3>
        <ul>
          {#each d.analysis.files as f (f.path)}
            <li><button onclick={() => showFile(f.path)} title={f.path}><span class="mono">{short(f.path)}</span><i class="plus mono">+{f.addedLines.length}</i><i class="minus mono">−{f.deletedAt.length}</i></button></li>
          {/each}
        </ul>
      </div>
    </aside>

    <!-- Middle: the changes, with every finding beside its line. -->
    <section class="centre" transition:scale|global={{ start: 0.96, opacity: 0, duration: 300, easing: cubicOut }}>
      <div class="switch">
        <button class:on={view === 'changes'} onclick={() => (view = 'changes')}>Changes</button>
        <button class:on={view === 'ai'} onclick={() => (view = 'ai')}>How the AI read it</button>
        <span class="hint"><kbd>←</kbd> <kbd>→</kbd> older, newer · <kbd>esc</kbd> close</span>
      </div>
      <div class="scroll" bind:this={centre}>
        {#key d.analysis.commit.sha}
          <div class="inner" in:fly={{ x: 30 * dir, duration: 260, easing: cubicOut }}>
            {#if view === 'changes'}<DiffReview />{:else}<div class="ai-view"><ReviewTab /></div>{/if}
          </div>
        {/key}
      </div>
    </section>

    <!-- Right: the issues, each with what to do, and what the commit reaches. -->
    <aside class="right" bind:this={side}>
      {#if all.length}
        {#each all as g, n (idOf(g))}
          {@const earlier = g[0].firstSeen && g[0].firstSeen !== app.selectedSha ? g[0].firstSeen : null}
          <div class="card issue sev-{worst(g)}" data-issue={idOf(g)} data-sev={worst(g)} in:fly|global={{ x: 26, duration: 320, delay: 140 + n * 50, easing: cubicOut }} out:fly|global={{ x: 18, duration: 180 }}>
            <div class="tags">
              <span class="ui-pill sev">{worst(g)}</span>
              {#if g[0].source === 'llm'}<span class="ui-pill ai">AI</span>{:else}<span class="ui-pill">check</span>{/if}
              {#if earlier}<span class="ui-pill">from {earlier.slice(0, 7)}</span>{:else}<span class="ui-pill warn">new here</span>{/if}
            </div>
            <h4>{g[0].title}</h4>
            <p class="where mono">{short(g[0].path)}:{g[0].line}{#if g.length > 1} · {g.length} places{/if}</p>
            <div class="do">
              <button class="b3 primary" disabled={!canFix} title={canFix ? 'Ask the AI for a fix' : whyNot} onclick={() => void proposeFix(g[0], app.selectedSha ?? undefined, others(g))}>Fix with AI</button>
              <button class="b3 ghost" onclick={() => show(g)}>Show</button>
            </div>
          </div>
        {/each}
        {#if !canFix}<p class="why-not">{whyNot}</p>{/if}
      {:else}
        <div class="card clean" in:fly|global={{ x: 26, duration: 320, delay: 140, easing: cubicOut }} out:fly|global={{ x: 18, duration: 180 }}>
          <span class="tick">✓</span>
          <h4>{running ? 'Nothing yet' : 'No issues'}</h4>
          <p>{running ? 'The AI is still reading this commit.' : 'The code checks and the AI found nothing on these lines.'}</p>
        </div>
      {/if}
      {#if d.analysis.changed.length}
        <div class="card reach" in:fly|global={{ x: 26, duration: 320, delay: 260, easing: cubicOut }} out:fly|global={{ x: 18, duration: 180 }}>
          <h3 class="ui-label">What it reaches</h3>
          <Constellation changed={d.analysis.changed} impacted={d.analysis.impacted} hot={new Set(all.map((g) => g[0].path))} sha={app.selectedSha} />
        </div>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 56; background: rgba(6, 6, 10, 0.8); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.62); }
  .wires { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 59; pointer-events: none; overflow: visible; }
  .wire { --c: var(--sev-medium); fill: none; stroke: color-mix(in srgb, var(--c) 70%, transparent); stroke-width: 1.5; stroke-dasharray: 5 4;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--c) 70%, transparent)); animation: flow 1.2s linear infinite; }
  .w-critical { --c: var(--sev-critical); } .w-high { --c: var(--sev-high); } .w-low, .w-info { --c: var(--sev-low); }
  .m-critical { fill: var(--sev-critical); } .m-high { fill: var(--sev-high); } .m-medium { fill: var(--sev-medium); } .m-low, .m-info { fill: var(--sev-low); }
  @keyframes flow { to { stroke-dashoffset: -8; } }
  @media (prefers-reduced-motion: reduce) { .wire { animation: none; } }

  .stage { --c: var(--good); position: fixed; inset: 0; z-index: 58; pointer-events: none; display: grid;
    grid-template-columns: minmax(210px, 250px) minmax(0, 940px) minmax(240px, 290px); grid-template-rows: auto minmax(0, 1fr);
    justify-content: center; gap: 18px 40px; padding: 22px 28px 26px; }
  .stage > * { pointer-events: auto; }
  .tone-critical { --c: var(--sev-critical); } .tone-high { --c: var(--sev-high); } .tone-medium { --c: var(--sev-medium); }
  .tone-low, .tone-info, .tone-carried { --c: var(--sev-low); }

  .card { padding: 14px 16px; border-radius: 14px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2); min-width: 0; }
  .card h3 { margin: 0 0 10px; }
  .muted { margin: 0 0 10px; font-size: 12.5px; color: var(--text-3); }

  .head { grid-column: 1 / -1; justify-self: center; width: min(100%, 1000px); display: flex; align-items: center; gap: 14px;
    padding: 12px 14px; border-radius: 18px; background: var(--glass-strong); border: 1px solid var(--border);
    box-shadow: var(--elev-2), 0 0 60px -26px color-mix(in srgb, var(--c) 70%, transparent); }
  .who { flex: 1; min-width: 0; text-align: center; }
  .who h2 { margin: 2px 0 4px; font-size: 18px; font-weight: 600; letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who p { margin: 0; display: flex; justify-content: center; align-items: center; gap: 4px; font-size: 12px; color: var(--text-3); }
  .pos { font-size: 10.5px; color: var(--text-3); letter-spacing: 0.04em; }
  .av { display: inline-grid; place-items: center; width: 20px; height: 20px; margin-right: 4px; border-radius: 50%; font: 600 9px var(--font); font-style: normal; color: #fff; background: var(--accent); }
  .nav { flex-shrink: 0; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2);
    box-shadow: var(--elev-1); transition: transform 0.15s, color 0.15s, border-color 0.15s; }
  .nav:hover:not(:disabled) { color: var(--text); border-color: var(--border-strong); transform: translateY(-1px); }
  .nav:disabled { opacity: 0.3; }
  .x { border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); padding: 0 4px; }

  .left, .right { grid-row: 2; display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: auto; padding: 2px; }
  .left { grid-column: 1; } .right { grid-column: 3; }
  .nums { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .nums > div { display: flex; flex-direction: column; padding: 8px 10px; border-radius: 10px; background: var(--surface-2); box-shadow: inset 0 1px 0 var(--edge); min-width: 0; }
  .nums b { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; } .nums span { font-size: 10.5px; color: var(--text-3); }
  .plus { color: var(--good); } .minus { color: var(--bad); } .hot b { color: var(--c); }
  .airow { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .airow p { margin: 0; font-size: 12.5px; color: var(--text-2); line-height: 1.45; }
  .ai .b3 { width: 100%; justify-content: center; }
  .files ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .files button { display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 6px; border: 0; border-radius: 8px; background: none; color: var(--text-2); font-size: 12px; text-align: left; }
  .files button:hover { background: var(--surface-2); color: var(--text); }
  .files .mono:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .files i { font-style: normal; font-size: 11px; }

  .centre { grid-column: 2; grid-row: 2; min-height: 0; display: flex; flex-direction: column; border-radius: 18px; background: var(--glass-strong);
    border: 1px solid color-mix(in srgb, var(--c) 35%, var(--border)); box-shadow: var(--elev-2), 0 0 90px -30px color-mix(in srgb, var(--c) 55%, transparent); overflow: hidden; }
  .switch { display: flex; align-items: center; gap: 4px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .switch button { border: 0; background: none; height: 28px; padding: 0 12px; border-radius: 8px; font-size: 12.5px; color: var(--text-3); }
  .switch button.on { color: var(--text); background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge); }
  .hint { margin-left: auto; font-size: 11px; color: var(--text-3); }
  .hint kbd { font: 10.5px var(--mono); padding: 1px 5px; border-radius: 5px; background: var(--surface-2); border: 1px solid var(--border); }
  .scroll { flex: 1; min-height: 0; overflow: auto; }
  .inner { min-height: 100%; display: flex; }
  .inner > :global(.review) { flex: 1; min-width: 0; }
  .inner :global(.review > header > h2), .inner :global(.review > header > .meta) { display: none; }
  .ai-view { flex: 1; padding: 16px 20px; }

  .issue { --s: var(--sev-medium); border-color: color-mix(in srgb, var(--s) 40%, var(--border)); box-shadow: var(--elev-2), 0 0 40px -20px color-mix(in srgb, var(--s) 70%, transparent); }
  .issue.sev-critical { --s: var(--sev-critical); } .issue.sev-high { --s: var(--sev-high); } .issue.sev-low, .issue.sev-info { --s: var(--sev-low); }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; }
  .sev { color: #111 !important; background: var(--s) !important; text-transform: capitalize; }
  .issue h4 { margin: 9px 0 4px; font-size: 13.5px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
  .where { margin: 0 0 10px; font-size: 11.5px; color: var(--text-3); overflow-wrap: anywhere; }
  .do { display: flex; gap: 6px; } .do .b3 { flex: 1; justify-content: center; height: 30px; }
  .do .b3:disabled { opacity: 0.45; cursor: not-allowed; }
  .why-not { margin: -4px 4px 0; font-size: 11.5px; color: var(--text-3); }
  .clean { text-align: center; padding: 22px 16px; }
  .clean .tick { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: var(--good); background: color-mix(in srgb, var(--good) 14%, transparent); font-weight: 700; }
  .clean h4 { margin: 10px 0 4px; font-size: 14px; } .clean p { margin: 0; font-size: 12.5px; color: var(--text-3); line-height: 1.5; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }

  @media (max-width: 1200px) {
    .stage { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; overflow: auto; }
    .left, .right, .centre { grid-column: 1; grid-row: auto; overflow: visible; }
    .centre { height: 70vh; }
  }
</style>
