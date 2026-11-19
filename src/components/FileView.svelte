<script lang="ts">
  // A whole file over the page, in the focus style: the page blurs, the file sits in the middle with syntax colours,
  // scrolled to the line asked for, which is marked. Esc or a click outside closes it.
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, proposeFix } from '../lib/store.svelte';
  import { groups } from '../lib/groups';
  import type { FindingWithPath, Issue } from '../lib/types';
  import { tokenize, plain, type Line } from '../lib/highlight';

  const f = $derived(app.fileShown ? app.file : null);
  let toks = $state<Line[]>([]);
  let box = $state<HTMLDivElement>();
  const target = $derived(app.focusLine?.line ?? 0);
  $effect(() => {
    const file = f, theme = app.theme;
    if (!file) return;
    toks = plain(file.content);
    const lang = file.path.endsWith('.java') ? 'java' : file.path.endsWith('.kt') ? 'kotlin' : null;
    void tokenize(file.content, lang, theme).then((t) => { if (file === f) toks = t; });
  });
  $effect(() => {
    void toks; const at = target;
    if (!box || !at) return;
    requestAnimationFrame(() => box?.querySelector(`[data-n="${at}"]`)?.scrollIntoView({ block: 'center' }));
  });
  const close = () => (app.fileShown = false);

  // The issues in this file, open ones, each at the line it flags: a mark in the margin, the line tinted, and a card
  // under it. A strip on the right shows where they all are.
  const here = $derived(f ? groups(app.issueList?.issues ?? []).filter((g) => g.some((i) => i.path === f.path)) : []);
  const byLine = $derived.by(() => {
    const m = new Map<number, Issue[][]>();
    for (const g of here) { const i = g.find((x) => x.path === f?.path) ?? g[0]; const at = i.reviewLine || i.line; m.set(at, [...(m.get(at) ?? []), g]); }
    return m;
  });
  const ORDER = ['critical', 'high', 'medium', 'low', 'info'];
  const worstAt = (n: number) => (byLine.get(n) ?? []).map((g) => g[0].severity).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
  const total = $derived(toks.length || 1);
  function jump(n: number) { box?.querySelector(`[data-n="${n}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  function fix(g: Issue[]) {
    const i = g[0];
    const fd = { line: i.reviewLine, endLine: i.reviewLine, severity: i.severity, category: i.category, title: i.title, detail: i.detail,
      suggestion: i.suggestion, nodeId: '', onChangedLine: true, source: i.source, ref: i.ref, snippet: i.snippet, path: i.path } as FindingWithPath;
    proposeFix(fd, i.lastSeen, g.slice(1).map((m) => ({ sha: m.lastSeen, path: m.path, line: m.reviewLine, title: m.title })), g);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && f && close()} />

{#if f}
  <div class="scrim" transition:fade={{ duration: 240, easing: cubicOut }} onclick={close} role="presentation"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={f.path} transition:scale={{ start: 0.95, opacity: 0, duration: 300, easing: cubicOut }}>
    <header>
      <div><b>{f.path.slice(f.path.lastIndexOf('/') + 1)}</b><span class="mono">{f.path}{f.sha ? ` @ ${f.sha.slice(0, 7)}` : ''}</span>        {#if here.length}
        <div class="hits">
          <span>{here.length} issue{here.length === 1 ? '' : 's'} here</span>
          {#each [...byLine.keys()].sort((a, b) => a - b) as n}<button class="hit-chip sev-{worstAt(n)}" onclick={() => jump(n)}>line {n}</button>{/each}
        </div>
      {/if}
</div>
      <span class="n">{toks.length} lines</span>
      <button class="x" aria-label="Close" onclick={close}>×</button>
    </header>
    <div class="wrapcode">
    <div class="code mono" bind:this={box}>
      {#each toks as line, i}
        {@const n = i + 1}
        {@const sev = worstAt(n)}
        <div class="ln sev-{sev ?? ''}" class:hit={n === target} class:flag={!!sev} data-n={n}><span class="no">{#if sev}<i class="mk"></i>{/if}{n}</span><span class="tx">{#each line as t}<span style:color={t.color}>{t.content}</span>{/each}{' '}</span></div>
        {#if sev}
          {#each byLine.get(n) ?? [] as g (g[0].id)}
            {@const it = g[0]}
            <div class="inline sev-{it.severity}">
              <div class="ih">
                <b>{it.title}</b>
                {#if it.source === 'llm'}<span class="ai">AI</span>{:else}<span class="chk">check</span>{/if}
                <span class="sv">{it.severity}</span>
              </div>
              {#if it.detail}<p>{it.detail}</p>{/if}
              <div class="ia">
                <button class="b3" onclick={() => { close(); app.focus = g; }}>Open</button>
                {#if app.status?.canFix !== false}<button class="b3 primary" onclick={() => { close(); fix(g); }}>Fix with AI</button>{/if}
              </div>
            </div>
          {/each}
        {/if}
      {/each}
    </div>
    {#if here.length}
      <div class="strip" aria-label="Where the issues are">
        {#each [...byLine.keys()] as n}<button class="tick sev-{worstAt(n)}" style:top="{(n / total) * 100}%" title="line {n}" onclick={() => jump(n)}></button>{/each}
      </div>
    {/if}
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 66; background: rgba(6, 6, 10, 0.82); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.75); }
  .sheet { position: fixed; z-index: 67; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(1000px, calc(100vw - 48px)); height: min(84vh, 1000px);
    display: flex; flex-direction: column; border-radius: 16px; background: var(--glass-strong); border: 1px solid var(--border);
    box-shadow: var(--elev-2), var(--glow-soft); }
  header { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
  header div { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  header b { font-size: 15px; } header span.mono { font-size: 11.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { font-size: 12px; color: var(--text-3); }
  .x { border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); }
  .code { flex: 1; min-height: 0; overflow: auto; padding: 8px 0; font-size: 12.5px; line-height: 1.65; background: var(--code-bg); border-radius: 0 0 16px 16px; }
  .ln { display: flex; white-space: pre; padding-right: 16px; }
  .ln.hit { background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 2px 0 0 var(--accent); }
  .no { flex-shrink: 0; width: 56px; padding-right: 14px; text-align: right; color: var(--text-3); user-select: none; }
  .wrapcode { position: relative; flex: 1; min-height: 0; display: flex; }
  .wrapcode .code { flex: 1; }
  .sev-critical { --c: var(--sev-critical); } .sev-high { --c: var(--sev-high); } .sev-medium { --c: var(--sev-medium); } .sev-low, .sev-info { --c: var(--sev-low); }
  .ln.flag { background: color-mix(in srgb, var(--c) 12%, transparent); }
  .no { position: relative; }
  .mk { position: absolute; left: 8px; top: 50%; width: 7px; height: 7px; margin-top: -3.5px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); }
  .inline { margin: 4px 16px 8px 56px; padding: 10px 12px; border-radius: 12px; font-family: var(--font); white-space: normal;
    background: var(--glass-strong); border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border)); box-shadow: var(--elev-1); }
  .ih { display: flex; align-items: center; gap: 8px; } .ih b { font-size: 12.5px; font-weight: 600; flex: 1; }
  .ih .ai { padding: 0 7px; border-radius: 99px; font-size: 10.5px; font-weight: 600; color: #fff; background: var(--accent); }
  .ih .chk { padding: 0 7px; border-radius: 99px; font-size: 10.5px; color: var(--text-2); background: var(--surface-3); }
  .sv { font-size: 10.5px; font-weight: 600; text-transform: capitalize; color: var(--c); }
  .inline p { margin: 5px 0 8px; font-size: 12px; line-height: 1.5; color: var(--text-2); }
  .ia { display: flex; gap: 6px; } .ia .b3 { height: 26px; font-size: 11.5px; }
  .strip { position: relative; width: 12px; flex-shrink: 0; background: var(--code-bg); border-left: 1px solid var(--border); border-radius: 0 0 16px 0; }
  .tick { position: absolute; left: 2px; right: 2px; height: 4px; border: 0; padding: 0; border-radius: 2px; background: var(--c); box-shadow: 0 0 6px var(--c); cursor: pointer; }
  .hits { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; font-size: 11.5px; color: var(--text-2); }
  .hit-chip { height: 22px; padding: 0 9px; border-radius: 99px; border: 1px solid color-mix(in srgb, var(--c) 50%, var(--border)); background: none; font: 11px var(--font); color: var(--text); }
</style>
