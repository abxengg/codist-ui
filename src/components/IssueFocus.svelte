<script lang="ts">
  // One issue, in focus: the page behind blurs, the code sits in the middle, and what to know about it floats around
  // it: what is wrong and why, the suggestion, where it came from, and what you can do. Esc or a click outside closes.
  import { fade, scale } from 'svelte/transition';
  import { app, api_feedback, issueAction, proposeFix, selectCommit } from '../lib/store.svelte';
  import { ago, INSTANT_REFS } from '../lib/theme';
  import CodePeek from './CodePeek.svelte';
  import type { FindingWithPath, FixRef, Issue } from '../lib/types';

  const g = $derived(app.focus);
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
  }
  async function act(what: 'fixed' | 'reopen') { if (g) { await issueAction(g, what); close(); } }
  function fix() { if (g && i) { proposeFix(asFinding(i), i.lastSeen, others(g)); close(); } }
  const SEV: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && g && close()} />

{#if g && i}
  <div class="scrim" transition:fade={{ duration: 160 }} onclick={close} role="presentation"></div>
  <div class="stage sev-{i.severity}" role="dialog" aria-modal="true" aria-label={i.title}>
    <header class="title float f1" in:scale={{ start: 0.96, duration: 200 }}>
      <span class="badge">{SEV[i.severity]}</span>
      {#if i.source === 'llm'}<span class="src ai">Found by AI</span>{:else}<span class="src">Code check{i.ref ? ` · ${i.ref}` : ''}</span>{/if}
      <h2>{i.title}</h2>
      <button class="x" aria-label="Close" onclick={close}>×</button>
    </header>

    <section class="code" in:scale={{ start: 0.94, duration: 240 }}>
      <div class="path mono">{i.path}<b>:{i.line}</b></div>
      <CodePeek path={i.path} {sha} line={i.reviewLine || i.line} around={9} />
    </section>

    <aside class="left">
      {#if i.detail}
        <div class="note float f2" in:scale={{ start: 0.9, duration: 260, delay: 60 }}><h3>What goes wrong</h3><p>{i.detail}</p></div>
      {/if}
      <div class="note float f3" in:scale={{ start: 0.9, duration: 260, delay: 120 }}>
        <h3>Where it came from</h3>
        {#if i.firstSeen === 'baseline'}<p>Already in the code when Codist first ran.</p>
        {:else if i.firstSeen && i.firstSeen !== 'working'}
          <p><button class="link mono" onclick={openCommit}>{i.firstSeen.slice(0, 7)}</button>{#if i.firstBy} by {i.firstBy}{/if}{#if i.firstTime}, {ago(i.firstTime)}{/if}</p>
          {#if i.firstMsg}<p class="quote">“{i.firstMsg}”</p>{/if}
        {:else}<p>In your uncommitted changes.</p>{/if}
      </div>
    </aside>

    <aside class="right">
      {#if i.suggestion}
        <div class="note float f4" in:scale={{ start: 0.9, duration: 260, delay: 90 }}><h3>Suggestion</h3><p>{i.suggestion}</p></div>
      {/if}
      {#if g.length > 1}
        <div class="note float f5" in:scale={{ start: 0.9, duration: 260, delay: 150 }}>
          <h3>Same problem in {g.length} places</h3>
          <ul>{#each g as m}<li class="mono">{m.path.slice(m.path.lastIndexOf('/') + 1)}:{m.line}</li>{/each}</ul>
        </div>
      {/if}
      <div class="note actions float f6" in:scale={{ start: 0.9, duration: 260, delay: 180 }}>
        <h3>Do</h3>
        {#if i.state === 'open'}
          {#if app.status?.canFix !== false}<button class="b3 primary" onclick={fix}>{i.ref && INSTANT_REFS.has(i.ref) ? 'Fix' : 'Fix with AI'}</button>{/if}
          <button class="b3" onclick={() => act('fixed')}>Mark fixed</button>
          <button class="b3" onclick={openCommit}>Open the commit</button>
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
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(6, 6, 10, 0.68); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.6); }
  .stage { --c: var(--sev-medium); position: fixed; inset: 0; z-index: 61; pointer-events: none; display: grid;
    grid-template-columns: minmax(200px, 300px) minmax(0, 760px) minmax(200px, 300px); grid-template-rows: auto auto;
    justify-content: center; align-content: center; gap: 22px 26px; padding: 32px; }
  .stage > * { pointer-events: auto; }
  .sev-critical { --c: var(--sev-critical); } .sev-high { --c: var(--sev-high); } .sev-low, .sev-info { --c: var(--sev-low); }
  .title { grid-column: 1 / -1; justify-self: center; max-width: 900px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    padding: 14px 18px; border-radius: 16px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2); }
  .title h2 { flex-basis: 100%; margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  .badge { padding: 2px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600; color: #111; background: var(--c); }
  .src { font-size: 12px; color: var(--text-3); } .src.ai { color: var(--accent-text); font-weight: 600; }
  .x { margin-left: auto; border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); }
  .code { grid-column: 2; grid-row: 2; align-self: center; border-radius: 16px; padding: 12px; background: var(--glass-strong);
    border: 1px solid color-mix(in srgb, var(--c) 40%, var(--border)); box-shadow: var(--elev-2), 0 0 0 1px rgba(0, 0, 0, 0.2); }
  .code :global(.peek) { font-size: 13px; }
  .path { font-size: 12px; color: var(--text-3); padding: 2px 4px 10px; word-break: break-all; } .path b { color: var(--text); font-weight: 600; }
  .left { grid-column: 1; grid-row: 2; align-self: center; display: flex; flex-direction: column; gap: 16px; }
  .right { grid-column: 3; grid-row: 2; align-self: center; display: flex; flex-direction: column; gap: 16px; }
  .note { padding: 14px 16px; border-radius: 14px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2); }
  .note h3 { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .note p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--text-2); }
  .note p + p { margin-top: 6px; }
  .quote { font-style: italic; }
  .note ul { margin: 0; padding-left: 16px; font-size: 12px; color: var(--text-2); }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .actions .b3 { justify-content: center; }
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
</style>
