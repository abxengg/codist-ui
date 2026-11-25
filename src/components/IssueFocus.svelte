<script lang="ts">
  // One issue, in focus: the page behind blurs, the code sits in the middle, and what to know about it floats around
  // it: what is wrong and why, the suggestion, where it came from, and what you can do. Esc or a click outside closes.
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, api_feedback, issueAction, openFile, proposeFix, selectCommit } from '../lib/store.svelte';
  import { ago, INSTANT_REFS } from '../lib/theme';
  import CodePeek from './CodePeek.svelte';
  import FixCompare from './FixCompare.svelte';
  import type { FindingWithPath, FixRef, Issue } from '../lib/types';

  // The issue on show. It stays set while the view animates away, so the closing animation has something to show.
  let held = $state.raw<Issue[] | null>(null);
  $effect(() => { if (app.focus) held = app.focus; });
  const g = $derived(held);
  const open = $derived(!!app.focus);
  const i = $derived(g?.[0] ?? null);
  const sha = $derived(i && i.lastSeen && i.lastSeen !== 'working' ? i.lastSeen : null);
  let judged = $state<'' | 'useful' | 'wrong'>('');
  $effect(() => { void i; judged = ''; });
  const close = () => (app.focus = null);
  const asFinding = (x: Issue): FindingWithPath =>
    ({ line: x.reviewLine, endLine: x.reviewLine, severity: x.severity, category: x.category, title: x.title, detail: x.detail,
       suggestion: x.suggestion, nodeId: '', onChangedLine: true, source: x.source, ref: x.ref, snippet: x.snippet, path: x.path }) as FindingWithPath;
  const others = (list: Issue[]): FixRef[] => list.slice(1).map((m) => ({ sha: m.lastSeen, path: m.path, line: m.reviewLine, title: m.title }));
  function openCommit() {
    if (!i) return;
    close();
    void selectCommit(i.firstSeen && i.firstSeen !== 'baseline' && i.firstSeen !== 'working' ? i.firstSeen : i.lastSeen, true);
    app.mode = 'commits';
    app.commitStage = true;
  }
  async function act(what: 'fixed' | 'reopen') { if (g) { await issueAction(g, what); close(); } }
  function fix() { if (g && i) { proposeFix(asFinding(i), i.lastSeen, others(g), g); close(); } }
  // Fixing needs the model, and the branch you look at checked out. Say which is missing rather than hide the button.
  const canFix = $derived(app.status?.canFix !== false);
  const whyNot = $derived(app.status?.viewing ? 'Switch to this branch to fix it here.' : app.status?.llmProblem ? `Needs the AI model: ${app.status.llmProblem}` : 'Fixing is not available right now.');
  const SEV: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

  // Lines from the floating cards to what they are about, redrawn every frame while the cards drift.
  let stage: HTMLDivElement | undefined = $state();
  let paths = $state<{ d: string; key: string }[]>([]);
  $effect(() => {
    if (!g || !stage) return;
    let raf = 0;
    const box = (el: Element | null) => el?.getBoundingClientRect() ?? null;
    const draw = () => {
      const code = stage!.querySelector('.code'), hit = stage!.querySelector('.code .ln.hit'), path = stage!.querySelector('.code .path');
      const target = box(hit) ?? box(code);
      const out: { d: string; key: string }[] = [];
      const link = (card: Element | null, to: DOMRect | null, key: string, toLeftEdge = true) => {
        const c = box(card);
        if (!c || !to) return;
        const fromLeft = c.left > to.left + to.width / 2; // the card is on the right
        const x1 = fromLeft ? c.left : c.right, y1 = c.top + Math.min(28, c.height / 2);
        const x2 = toLeftEdge ? (fromLeft ? to.right - 18 : to.left + 22) : to.left + to.width / 2, y2 = to.top + to.height / 2;
        const dx = Math.max(40, Math.abs(x2 - x1) * 0.5) * (fromLeft ? -1 : 1);
        out.push({ key, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
      };
      link(stage!.querySelector('.n-wrong'), target, 'wrong');
      link(stage!.querySelector('.n-fix'), target, 'fix');
      link(stage!.querySelector('.n-from'), box(path), 'from');
      link(stage!.querySelector('.n-places'), box(code), 'places');
      paths = out;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && close()} />

{#if open && g && i}
  <div class="scrim" transition:fade={{ duration: 260, easing: cubicOut }} onclick={close} role="presentation"></div>
  <svg class="wires sev-{i.severity}" aria-hidden="true" in:fade|global={{ duration: 400, delay: 220 }} out:fade|global={{ duration: 120 }}>
    <defs><marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
    {#each paths as p (p.key)}<path class="wire" d={p.d} marker-end="url(#arrowhead)" />{/each}
  </svg>
  <div class="stage sev-{i.severity}" class:fixed={i.state === 'resolved'} bind:this={stage} role="dialog" aria-modal="true" aria-label={i.title}>
    <header class="title float f1" transition:fly|global={{ y: -16, duration: 300, easing: cubicOut }}>
      <span class="badge">{SEV[i.severity]}</span>
      {#if i.source === 'llm'}<span class="src ai">Found by AI</span>{:else}<span class="src">Code check{i.ref ? ` · ${i.ref}` : ''}</span>{/if}
      <h2>{i.title}</h2>
      <button class="x" aria-label="Close" onclick={close}>×</button>
    </header>

    <section class="code" class:wide={i.state === 'resolved'} transition:scale|global={{ start: 0.94, opacity: 0, duration: 320, easing: cubicOut }}>
      <div class="path mono">{i.path}<b>:{i.line}</b></div>
      {#if i.state === 'resolved'}<FixCompare issue={i} />{:else}<CodePeek path={i.path} {sha} line={i.reviewLine || i.line} around={9} />{/if}
    </section>

    <aside class="left">
      {#if i.detail}
        <div class="note n-wrong float f2" in:fly|global={{ x: -28, duration: 340, delay: 140, easing: cubicOut }} out:fly|global={{ x: -20, duration: 200, easing: cubicOut }}><h3>What goes wrong</h3><p>{i.detail}</p></div>
      {/if}
      <div class="note n-from float f3" in:fly|global={{ x: -28, duration: 340, delay: 200, easing: cubicOut }} out:fly|global={{ x: -20, duration: 200, easing: cubicOut }}>
        <h3>Where it came from</h3>
        {#if i.firstSeen === 'baseline'}<p>Already in the code when Codist first ran.</p>
        {:else if i.firstSeen && i.firstSeen !== 'working'}
          <p><button class="link mono" onclick={openCommit}>{i.firstSeen.slice(0, 7)}</button>{#if i.firstBy}{' '}by {i.firstBy}{/if}{#if i.firstTime}, {ago(i.firstTime)}{/if}</p>
          {#if i.firstMsg}<p class="quote">“{i.firstMsg}”</p>{/if}
        {:else}<p>In your uncommitted changes.</p>{/if}
      </div>
    </aside>

    <aside class="right">
      {#if i.suggestion}
        <div class="note n-fix float f4" in:fly|global={{ x: 28, duration: 340, delay: 170, easing: cubicOut }} out:fly|global={{ x: 20, duration: 200, easing: cubicOut }}><h3>Suggestion</h3><p>{i.suggestion}</p></div>
      {/if}
      {#if g.length > 1}
        <div class="note n-places float f5" in:fly|global={{ x: 28, duration: 340, delay: 230, easing: cubicOut }} out:fly|global={{ x: 20, duration: 200, easing: cubicOut }}>
          <h3>Same problem in {g.length} places</h3>
          <ul>{#each g as m}<li class="mono">{m.path.slice(m.path.lastIndexOf('/') + 1)}:{m.line}</li>{/each}</ul>
        </div>
      {/if}
      <div class="note actions float f6" in:fly|global={{ x: 28, duration: 340, delay: 260, easing: cubicOut }} out:fly|global={{ x: 20, duration: 200, easing: cubicOut }}>
        <h3>Do</h3>
        {#if i.state === 'open'}
          <button class="b3 primary" onclick={fix} disabled={!canFix} title={whyNot}>{i.ref && INSTANT_REFS.has(i.ref) ? 'Fix' : 'Fix with AI'}</button>
          {#if !canFix}<p class="why-not">{whyNot}</p>{/if}
          <button class="b3" onclick={() => act('fixed')}>Mark fixed</button>
          <button class="b3" onclick={openCommit}>Open the commit</button>
          <button class="b3" onclick={() => { const it = i; if (!it) return; close(); void openFile(it.path, null, it.line); }}>Open the whole file</button>
          {#if i.source === 'llm'}
            <div class="judge">
              <button class="b3 ghost" class:on={judged === 'useful'} onclick={() => { judged = 'useful'; void api_feedback(i.id, 'useful'); }}>Useful</button>
              <button class="b3 ghost" class:on={judged === 'wrong'} onclick={() => { judged = 'wrong'; void api_feedback(i.id, 'wrong'); }}>Wrong</button>
            </div>
          {/if}
        {:else}
          <button class="b3" onclick={() => act('reopen')}>Reopen</button>
        {/if}
      </div>
    </aside>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(6, 6, 10, 0.82); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.6); }
  .wires { --c: var(--sev-medium); position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 63; pointer-events: none; overflow: visible; }
  .wire { fill: none; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--c) 80%, transparent)); stroke: color-mix(in srgb, var(--c) 75%, transparent); stroke-width: 1.6; stroke-dasharray: 5 4; animation: flow 1.2s linear infinite; }
  .wires marker path { fill: var(--c); }
  @keyframes flow { to { stroke-dashoffset: -8; } }
  @media (prefers-reduced-motion: reduce) { .wire { animation: none; } }
  .stage { --c: var(--sev-medium); position: fixed; inset: 0; z-index: 62; pointer-events: none; display: grid;
    grid-template-columns: minmax(200px, 280px) minmax(0, 700px) minmax(200px, 280px); grid-template-rows: auto auto;
    justify-content: center; align-content: center; gap: 26px 72px; padding: 32px; }
  .stage > * { pointer-events: auto; }
  .sev-critical { --c: var(--sev-critical); } .sev-high { --c: var(--sev-high); } .sev-low, .sev-info { --c: var(--sev-low); }
  .title { grid-column: 1 / -1; justify-self: center; max-width: 900px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    padding: 14px 18px; border-radius: 16px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2); }
  .title h2 { flex-basis: 100%; margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  .badge { padding: 2px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600; color: #111; background: var(--c); }
  .src { font-size: 12px; color: var(--text-3); } .src.ai { color: var(--accent-text); font-weight: 600; }
  .x { margin-left: auto; border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); }
  .code { grid-column: 2; grid-row: 2; align-self: center; border-radius: 16px; padding: 12px; background: var(--glass-strong);
    border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border)); box-shadow: var(--elev-2), 0 0 0 1px rgba(0, 0, 0, 0.2), 0 0 90px -20px color-mix(in srgb, var(--c) 55%, transparent); }
  .code :global(.peek) { font-size: 13px; }
  /* A fixed issue shows its fix side by side, so the middle is wider and the code glows green. */
  .stage.fixed { grid-template-columns: minmax(200px, 260px) minmax(0, 940px) minmax(200px, 260px); --c: var(--good); }
  .path { font-size: 12px; color: var(--text-3); padding: 2px 4px 10px; word-break: break-all; } .path b { color: var(--text); font-weight: 600; }
  .left { grid-column: 1; grid-row: 2; align-self: center; display: flex; flex-direction: column; gap: 16px; }
  .right { grid-column: 3; grid-row: 2; align-self: center; display: flex; flex-direction: column; gap: 16px; }
  .note { padding: 14px 16px; border-radius: 14px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), 0 0 40px -18px color-mix(in srgb, var(--c) 40%, transparent); }
  .note h3 { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .note p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--text-2); }
  .note p + p { margin-top: 6px; }
  .quote { font-style: italic; }
  .note ul { margin: 0; padding-left: 16px; font-size: 12px; color: var(--text-2); }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .actions .b3 { justify-content: center; }
  .why-not { margin: -2px 0 4px; font-size: 11.5px; color: var(--text-3); text-align: center; }
  .actions .b3:disabled { opacity: 0.45; cursor: not-allowed; filter: none; }
  .judge { display: flex; gap: 6px; } .judge .b3 { flex: 1; }
  .link { border: 0; background: none; padding: 0; color: var(--accent-text); }
  /* Floating: each card drifts slowly on its own rhythm. */
  .float { animation: bob 7s ease-in-out infinite; }
  .f2 { animation-duration: 8s; animation-delay: -2s; } .f3 { animation-duration: 9s; animation-delay: -4s; }
  .f4 { animation-duration: 7.5s; animation-delay: -1s; } .f5 { animation-duration: 8.5s; animation-delay: -3s; } .f6 { animation-duration: 9.5s; animation-delay: -5s; }
  .f1 { animation-duration: 10s; }
  @keyframes bob { 50% { transform: translateY(-5px); } }
  @media (prefers-reduced-motion: reduce) { .float { animation: none; } }
  @media (max-width: 1100px) {
    .stage { grid-template-columns: minmax(0, 1fr); overflow: auto; align-content: start; }
    .code, .left, .right { grid-column: 1; grid-row: auto; }
  }

  /* Long words (a full method chain, a path) wrap inside the card instead of running over the code. */
  .note, .note p, .note li, .title h2 { overflow-wrap: anywhere; min-width: 0; }
  .left, .right { min-width: 0; }
</style>
