<script lang="ts">
  // One issue, as a row that opens in place: what is wrong, where, the code, why it matters, and what to do about it.
  // Everything about an issue is one click away, with no tab to switch.
  import { slide } from 'svelte/transition';
  import { app, api_feedback, issueAction, proposeFix, selectCommit } from '../lib/store.svelte';
  import { ago, INSTANT_REFS } from '../lib/theme';
  import CodePeek from './CodePeek.svelte';
  import type { FindingWithPath, FixRef, Issue } from '../lib/types';

  let { g, open = false }: { g: Issue[]; open?: boolean } = $props();
  const i = $derived(g[0]);
  let shown = $state(false);
  $effect(() => { shown = open; });
  const file = $derived(i.path.slice(i.path.lastIndexOf('/') + 1));
  const sha = $derived(i.lastSeen && i.lastSeen !== 'working' ? i.lastSeen : null);
  const asFinding = (x: Issue): FindingWithPath =>
    ({ line: x.reviewLine, endLine: x.reviewLine, severity: x.severity, category: x.category, title: x.title, detail: x.detail,
       suggestion: x.suggestion, nodeId: '', onChangedLine: true, source: x.source, ref: x.ref, snippet: x.snippet, path: x.path }) as FindingWithPath;
  const others = (list: Issue[]): FixRef[] => list.slice(1).map((m) => ({ sha: m.lastSeen, path: m.path, line: m.reviewLine, title: m.title }));
  function openCommit() {
    void selectCommit(i.lastSeen === 'working' ? i.firstSeen : i.lastSeen, true);
    app.mode = 'commits';
  }
  let judged = $state<'' | 'useful' | 'wrong'>('');
</script>

<article class="card sev-{i.severity}" class:open={shown}>
  <button class="head" onclick={() => (shown = !shown)} aria-expanded={shown}>
    <span class="dot"></span>
    <span class="title">{i.title}</span>
    <span class="meta">
      {#if i.source === 'llm'}<span class="ai">AI</span>{:else}<span class="chk">check</span>{/if}
      <span class="where mono">{file}:{i.line}</span>
      {#if g.length > 1}<span class="n">×{g.length}</span>{/if}
      <span class="when">{i.firstTime ? ago(i.firstTime) : ''}</span>
    </span>
  </button>
  {#if !shown && app.showCode}
    <div class="peek-wrap"><CodePeek path={i.path} {sha} line={i.reviewLine || i.line} around={2} /></div>
  {:else if !shown && i.snippet}
    <div class="snip mono">{i.line}<span>{i.snippet}</span></div>
  {/if}
  {#if shown}
    <div class="body" transition:slide={{ duration: 180 }}>
      {#if i.detail}<p class="why">{i.detail}</p>{/if}
      <div class="code"><CodePeek path={i.path} {sha} line={i.reviewLine || i.line} around={5} /></div>
      {#if i.suggestion}<p class="fix"><b>Suggestion</b> {i.suggestion}</p>{/if}
      <p class="origin">
        <span class="mono">{i.path}:{i.line}</span>
        {#if i.firstSeen && i.firstSeen !== 'working' && i.firstSeen !== 'baseline'}
          · since <button class="link mono" onclick={openCommit}>{i.firstSeen.slice(0, 7)}</button>{#if i.firstBy}&nbsp;by {i.firstBy}{/if}{#if i.firstMsg}: “{i.firstMsg}”{/if}
        {:else if i.firstSeen === 'baseline'} · already in the code when Codist first ran{/if}
      </p>
      <div class="actions">
        {#if i.state === 'open'}
          {#if app.status?.canFix !== false}
            <button class="b3 primary" onclick={() => proposeFix(asFinding(i), i.lastSeen, others(g))}>{i.ref && INSTANT_REFS.has(i.ref) ? 'Fix' : 'Fix with AI'}</button>
          {/if}
          <button class="b3" onclick={() => issueAction(g, 'fixed')}>Mark fixed</button>
          <button class="b3" onclick={openCommit}>Open commit</button>
          {#if i.source === 'llm'}
            <span class="judge">
              <button class="b3 ghost" class:on={judged === 'useful'} title="Right: show more like this" onclick={() => { judged = 'useful'; void api_feedback(i.id, 'useful'); }}>Useful</button>
              <button class="b3 ghost" class:on={judged === 'wrong'} title="Wrong: Codist hides it and learns from it" onclick={() => { judged = 'wrong'; void api_feedback(i.id, 'wrong'); }}>Wrong</button>
            </span>
          {/if}
        {:else}
          <button class="b3" onclick={() => issueAction(g, 'reopen')}>Reopen</button>
        {/if}
      </div>
    </div>
  {/if}
</article>

<style>
  .card { --c: var(--text-3); border-radius: 14px; background: var(--glass, var(--surface)); border: 1px solid var(--border);
    box-shadow: var(--elev-1); transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s; overflow: hidden; container-type: inline-size; }
  .card:hover { border-color: var(--border-strong); transform: translateY(-1px); box-shadow: var(--elev-2); }
  .card.open { transform: none; box-shadow: var(--elev-2); }
  .card.open { border-color: color-mix(in srgb, var(--c) 45%, var(--border)); }
  .sev-critical { --c: var(--sev-critical); } .sev-high { --c: var(--sev-high); } .sev-medium { --c: var(--sev-medium); }
  .sev-low, .sev-info { --c: var(--sev-low); }
  .head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 0; background: none; text-align: left; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex-shrink: 0; }
  .title { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open .title { white-space: normal; }
  .meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 11.5px; color: var(--text-3); }
  .ai { padding: 1px 7px; border-radius: 99px; font-weight: 600; color: #fff; background: var(--accent); }
  .chk { padding: 1px 7px; border-radius: 99px; color: var(--text-2); background: var(--surface-3); }
  .where { color: var(--text-2); }
  .body { padding: 0 16px 14px 35px; }
  .peek-wrap { padding: 0 14px 12px 35px; }
  .snip { display: flex; gap: 12px; margin: -4px 14px 11px 35px; font-size: 12px; color: var(--text-3); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .snip span { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; }
  .why { margin: 0 0 10px; color: var(--text-2); font-size: 13px; line-height: 1.55; max-width: 80ch; }
  .code { margin: 8px 0; }
  .fix { margin: 8px 0; font-size: 13px; color: var(--text-2); } .fix b { color: var(--text); font-weight: 600; margin-right: 6px; }
  .origin { margin: 8px 0 12px; font-size: 12px; color: var(--text-3); }
  .link { border: 0; background: none; padding: 0; color: var(--accent-text); }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .judge { margin-left: auto; display: flex; gap: 4px; }
  /* In a narrow place (the Map's panel) the title gets its own line and the details go under it. */
  @container (max-width: 520px) {
    .head { flex-wrap: wrap; row-gap: 4px; }
    .title { white-space: normal; flex-basis: calc(100% - 24px); }
    .meta { width: 100%; padding-left: 21px; }
    .body, .peek-wrap { padding-left: 16px; }
    .snip { margin-left: 16px; }
  }
</style>
