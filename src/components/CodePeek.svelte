<script lang="ts">
  // A few lines of code around a line, read from the file at a commit, with the line itself marked. Files are
  // fetched once and kept, so a list of issues in the same file costs one request.
  import { api } from '../lib/api';
  import { app } from '../lib/store.svelte';
  import { tokenize, plain, type Line } from '../lib/highlight';

  let { path, sha = null, line, around = 3 }: { path: string; sha?: string | null; line: number; around?: number } = $props();

  const cache: Map<string, Promise<string>> = ((globalThis as { __peek?: Map<string, Promise<string>> }).__peek ??= new Map());
  let rows = $state<{ n: number; toks: Line }[] | null>(null);
  let failed = $state(false);

  $effect(() => {
    const key = `${sha ?? ''}:${path}`, at = line, theme = app.theme;
    let text = cache.get(key);
    if (!text) { text = api.file(path, sha && sha !== 'working' && sha !== 'baseline' ? sha : null).then((r) => r.content); cache.set(key, text); }
    text.then(async (content) => {
      const all = content.split('\n');
      const from = Math.max(1, at - around), to = Math.min(all.length, at + around);
      const slice = all.slice(from - 1, to).join('\n');
      const toks = plain(slice);
      rows = toks.map((t, i) => ({ n: from + i, toks: t }));
      const lang = path.endsWith('.java') ? 'java' : path.endsWith('.kt') ? 'kotlin' : null;
      const coloured = await tokenize(slice, lang, theme);
      if (at === line) rows = coloured.map((t, i) => ({ n: from + i, toks: t }));
    }).catch(() => { cache.delete(key); failed = true; });
  });
</script>

{#if rows}
  <div class="peek mono">
    {#each rows as r (r.n)}
      <div class="ln" class:hit={r.n === line}><span class="no">{r.n}</span><span class="tx">{#each r.toks as t}<span style:color={t.color}>{t.content}</span>{/each}</span></div>
    {/each}
  </div>
{:else if failed}
  <div class="peek mono none">The file is not readable at this commit.</div>
{:else}
  <div class="peek mono none">…</div>
{/if}

<style>
  .peek { margin: 0; padding: 6px 0; border-radius: 9px; background: var(--code-bg); border: 1px solid var(--border); font-size: 12px; line-height: 1.6; overflow-x: auto; }
  .ln { display: flex; white-space: pre; padding-right: 12px; }
  .ln.hit { background: color-mix(in srgb, var(--sev-high) 13%, transparent); box-shadow: inset 2px 0 0 var(--sev-high); }
  .no { flex-shrink: 0; width: 44px; padding-right: 12px; text-align: right; color: var(--text-3); user-select: none; }
  .tx { color: var(--text); }
  .none { padding: 8px 14px; color: var(--text-3); }
</style>
