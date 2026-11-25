<script lang="ts">
  // A fixed issue, before and after: the change in the commit that fixed it, at the issue's place, side by side. The
  // left is the code as it was (removed lines red), the right as it is now (added lines green); the issue's line is
  // marked on the left. When the fixing commit did not touch the file, or the issue was closed by hand, it says so and
  // shows the code as it last was.
  import { api } from '../lib/api';
  import { app, selectCommit } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import { tokenize, type Line } from '../lib/highlight';
  import CodePeek from './CodePeek.svelte';
  import type { Issue } from '../lib/types';

  let { issue }: { issue: Issue } = $props();
  type Side = { n: number; text: string; kind: 'ctx' | 'del' | 'add' }[];
  let phase = $state<'loading' | 'ready' | 'untouched' | 'manual' | 'error'>('loading');
  let before = $state<Side>([]), after = $state<Side>([]);
  let tb = $state<Line[]>([]), ta = $state<Line[]>([]);
  const lang = $derived(issue.path.endsWith('.java') ? 'java' : issue.path.endsWith('.kt') ? 'kotlin' : null);

  $effect(() => {
    const is = issue;
    phase = 'loading'; before = []; after = [];
    if (!is.fixedIn) { phase = 'manual'; return; }
    void api.commit(is.fixedIn).then((d) => {
      if (issue !== is) return;
      const f = d.analysis.files.find((x) => x.path === is.path || x.newPath === is.path || x.oldPath === is.path);
      if (!f || !f.patch) { phase = 'untouched'; return; }
      // Split the patch into hunks, each with its old and new lines; show the hunk nearest the issue's line.
      type H = { oldStart: number; b: Side; a: Side };
      const hunks: H[] = [];
      let o = 0, n = 0;
      for (const line of f.patch.split('\n')) {
        const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
        if (h) { o = +h[1]; n = +h[2]; hunks.push({ oldStart: o, b: [], a: [] }); continue; }
        const cur = hunks.at(-1);
        if (!cur || /^(diff |index |--- |\+\+\+ |\\ )/.test(line)) continue;
        if (line.startsWith('-')) cur.b.push({ n: o++, text: line.slice(1), kind: 'del' });
        else if (line.startsWith('+')) cur.a.push({ n: n++, text: line.slice(1), kind: 'add' });
        else { cur.b.push({ n: o++, text: line.slice(1), kind: 'ctx' }); cur.a.push({ n: n++, text: line.slice(1), kind: 'ctx' }); }
      }
      const at = is.reviewLine || is.line;
      const dist = (h: H) => Math.min(...h.b.map((l) => Math.abs(l.n - at)), Infinity);
      const best = [...hunks].sort((x, y) => dist(x) - dist(y))[0];
      if (!best) { phase = 'untouched'; return; }
      // Drop the indentation every shown line shares, so the change reads in a narrow column.
      const all = [...best.b, ...best.a].filter((l) => l.text.trim());
      const cut = Math.min(...all.map((l) => l.text.match(/^[ \t]*/)![0].length), 80);
      const trim = (side: Side) => side.map((l) => ({ ...l, text: l.text.slice(Math.min(cut, l.text.match(/^[ \t]*/)![0].length)) }));
      best.b = trim(best.b); best.a = trim(best.a);
      before = best.b; after = best.a;
      phase = 'ready';
      void tokenize(best.b.map((l) => l.text).join('\n'), lang, app.theme).then((t) => { if (issue === is) tb = t; });
      void tokenize(best.a.map((l) => l.text).join('\n'), lang, app.theme).then((t) => { if (issue === is) ta = t; });
    }).catch(() => { if (issue === is) phase = 'error'; });
  });
  const marked = $derived(issue.reviewLine || issue.line);
  function openFix() { if (issue.fixedIn) { app.focus = null; app.mode = 'commits'; void selectCommit(issue.fixedIn, true); app.commitStage = true; } }
</script>

<div class="fc">
  <header>
    <span class="ok">✓ Fixed</span>
    {#if issue.fixedIn}
      <span>in <button class="link mono" onclick={openFix}>{issue.fixedIn.slice(0, 7)}</button>{#if issue.fixedBy}{' '}by <b>{issue.fixedBy}</b>{/if}{#if issue.fixedAt}, {ago(issue.fixedAt)}{/if}</span>
      {#if issue.fixedMsg}<span class="msg">“{issue.fixedMsg}”</span>{/if}
    {:else}<span>marked fixed by hand</span>{/if}
  </header>

  {#if phase === 'ready'}
    <div class="sides">
      <div class="side">
        <h4>Before</h4>
        <div class="code mono">{#each before as l, i}<div class="ln {l.kind}" class:mark={l.n === marked}><span class="no">{l.n}</span><span class="sg">{l.kind === 'del' ? '−' : ''}</span><code>{#if tb[i]}{#each tb[i] as t}<span style:color={t.color}>{t.content}</span>{/each}{:else}{l.text}{/if}{' '}</code></div>{/each}</div>
      </div>
      <div class="arrow" aria-hidden="true">→</div>
      <div class="side">
        <h4>After</h4>
        <div class="code mono">{#each after as l, i}<div class="ln {l.kind}"><span class="no">{l.n}</span><span class="sg">{l.kind === 'add' ? '+' : ''}</span><code>{#if ta[i]}{#each ta[i] as t}<span style:color={t.color}>{t.content}</span>{/each}{:else}{l.text}{/if}{' '}</code></div>{/each}</div>
      </div>
    </div>
  {:else if phase === 'loading'}
    <p class="note">Reading the fix…</p>
  {:else}
    <p class="note">{phase === 'untouched' ? 'The fixing commit did not change this file; the issue stopped being reported there. This is the code as it last was:' : phase === 'manual' ? 'Closed by hand, without a fixing commit. This is the code as it last was:' : 'Could not read the fixing commit. This is the code as it last was:'}</p>
    <CodePeek path={issue.path} sha={issue.lastSeen && issue.lastSeen !== 'working' ? issue.lastSeen : null} line={marked} around={8} />
  {/if}
</div>

<style>
  .fc { display: flex; flex-direction: column; gap: 10px; min-width: 0; container-type: inline-size; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; font-size: 12.5px; color: var(--text-2); }
  .ok { padding: 1px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600; color: var(--good); background: color-mix(in srgb, var(--good) 15%, transparent); }
  header b { color: var(--text); font-weight: 600; }
  .msg { flex-basis: 100%; color: var(--text-3); font-style: italic; }
  .link { border: 0; background: none; padding: 0; color: var(--accent-text); font-size: 12px; }
  .sides { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 10px; align-items: start; }
  .arrow { align-self: center; font-size: 18px; color: var(--good); }
  .side h4 { margin: 0 0 6px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-3); }
  .code { border-radius: 10px; background: var(--code-bg); border: 1px solid var(--border); padding: 6px 0; font-size: 12px; line-height: 1.6; overflow: auto; max-height: 52vh; }
  .ln { display: flex; white-space: pre; padding-right: 10px; }
  .no { flex-shrink: 0; width: 38px; padding-right: 8px; text-align: right; color: var(--text-3); user-select: none; }
  .sg { flex-shrink: 0; width: 12px; color: var(--text-3); }
  .ln.del { background: color-mix(in srgb, var(--bad) 14%, transparent); } .ln.del .sg { color: var(--bad); }
  .ln.add { background: color-mix(in srgb, var(--good) 14%, transparent); } .ln.add .sg { color: var(--good); }
  .ln.mark { box-shadow: inset 2px 0 0 var(--sev-high); }
  .ln.mark .no { color: var(--sev-high); font-weight: 600; }
  .note { margin: 0; font-size: 12.5px; color: var(--text-3); }
  /* Not enough room side by side: before above after. */
  @container (max-width: 620px) { .sides { grid-template-columns: 1fr; } .arrow { transform: rotate(90deg); justify-self: center; } }
</style>
