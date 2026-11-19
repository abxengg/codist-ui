<script lang="ts">
  // One issue as a row. Clicking it opens the issue in focus over the page (IssueFocus).
  import { app } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import type { Issue } from '../lib/types';

  let { g }: { g: Issue[]; open?: boolean } = $props();
  const i = $derived(g[0]);
  const file = $derived(i.path.slice(i.path.lastIndexOf('/') + 1));
</script>

<article class="card sev-{i.severity}">
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
</article>

<style>
  .card { --c: var(--text-3); border-radius: 14px; background: var(--glass, var(--surface)); border: 1px solid var(--border);
    box-shadow: var(--elev-1); transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s; overflow: hidden; container-type: inline-size; }
  .card:hover { border-color: var(--border-strong); transform: translateY(-1px); box-shadow: var(--elev-2); }
  .sev-critical { --c: var(--sev-critical); } .sev-high { --c: var(--sev-high); } .sev-medium { --c: var(--sev-medium); }
  .sev-low, .sev-info { --c: var(--sev-low); }
  .head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 0; background: none; text-align: left; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex-shrink: 0; }
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
</style>
