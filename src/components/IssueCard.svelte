<script lang="ts">
  // One issue as a row. Clicking it opens the issue in focus over the page (IssueFocus).
  import { app, proposeFix } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import type { FindingWithPath, Issue } from '../lib/types';

  let { g }: { g: Issue[]; open?: boolean } = $props();
  const i = $derived(g[0]);
  const file = $derived(i.path.slice(i.path.lastIndexOf('/') + 1));
  // Fix straight from the list, without opening the issue.
  function fix(e: Event) {
    e.stopPropagation();
    const f = { line: i.reviewLine, endLine: i.reviewLine, severity: i.severity, category: i.category, title: i.title, detail: i.detail,
      suggestion: i.suggestion, nodeId: '', onChangedLine: true, source: i.source, ref: i.ref, snippet: i.snippet, path: i.path } as FindingWithPath;
    proposeFix(f, i.lastSeen, g.slice(1).map((m) => ({ sha: m.lastSeen, path: m.path, line: m.reviewLine, title: m.title })), g);
  }
</script>

<article class="card sev-{i.severity}" class:fixable={i.state === 'open' && app.status?.canFix !== false}>
  <button class="head" onclick={() => (app.focus = g)} aria-haspopup="dialog">
    <span class="dot"></span>
    <span class="title">{i.title}</span>
    <span class="meta">
      {#if i.source === 'llm'}<span class="ai">AI</span>{:else}<span class="chk">check</span>{/if}
      <span class="where mono">{file}:{i.line}</span>
      {#if g.length > 1}<span class="n">×{g.length}</span>{/if}
      <span class="when">{i.firstTime ? ago(i.firstTime) : ''}</span>
    </span>
  </button>
  {#if i.state === 'open' && app.status?.canFix !== false}
    <button class="b3 primary quickfix" onclick={fix} title="Prepare a fix for this issue">Fix with AI</button>
  {/if}
</article>

<style>
  .card { --c: var(--text-3); border-radius: 14px; background: var(--glass, var(--surface)); border: 1px solid var(--border);
    box-shadow: var(--elev-1); transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s; overflow: hidden; container-type: inline-size; }
  .card:hover { border-color: color-mix(in srgb, var(--c) 45%, var(--border)); transform: translateY(-1px); box-shadow: var(--elev-2), 0 0 34px -12px color-mix(in srgb, var(--c) 60%, transparent); }
  .sev-critical { --c: var(--sev-critical); } .sev-high { --c: var(--sev-high); } .sev-medium { --c: var(--sev-medium); }
  .sev-low, .sev-info { --c: var(--sev-low); }
  .head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 0; background: none; text-align: left; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px color-mix(in srgb, var(--c) 70%, transparent); flex-shrink: 0; }
  .title { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 11.5px; color: var(--text-3); }
  .ai { padding: 1px 7px; border-radius: 99px; font-weight: 600; color: #fff; background: var(--accent); }
  .chk { padding: 1px 7px; border-radius: 99px; color: var(--text-2); background: var(--surface-3); }
  .where { color: var(--text-2); }
  /* In a narrow place (the Map's panel) the title gets its own line and the details go under it. */
  @container (max-width: 520px) {
    .head { flex-wrap: wrap; row-gap: 4px; }
    .title { white-space: normal; flex-basis: calc(100% - 24px); }
    .meta { width: 100%; padding-left: 21px; }
    }
  .card { position: relative; }
  .quickfix { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); height: 28px; opacity: 0; pointer-events: none; transition: opacity 0.15s; }
  .card:hover .quickfix, .quickfix:focus-visible { opacity: 1; pointer-events: auto; }
  .fixable:hover .meta { opacity: 0; }
</style>
