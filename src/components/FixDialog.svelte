<script lang="ts">
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { live } from '../lib/live.svelte';
  import Orb from './Orb.svelte';
  import CodePeek from './CodePeek.svelte';
  import { tokenize, type Line } from '../lib/highlight';
  import { STEREOTYPE } from '../lib/theme';
  import type { FixCheck } from '../lib/types';
  import { app, applyFix, closeFix, toast } from '../lib/store.svelte';
  import { api } from '../lib/api';
  import CopyButton from './CopyButton.svelte';

  let message = $state('');
  let view = $state<'split' | 'unified'>('split');
  let rejecting = $state(false);
  let reason = $state('');
  let lastId = '';
  $effect(() => {
    const p = app.fix?.proposal;
    if (p && p.id !== lastId) {
      lastId = p.id;
      message = p.message;
      rejecting = false;
      reason = '';
    }
  });

  // Keep a file header per file so multi-file fixes stay readable.
  const lines = $derived(
    (app.fix?.proposal?.patch ?? '').split('\n').flatMap((l) => {
      if (l.startsWith('+++ ')) return [`file ${l.slice(6)}`];
      return /^(diff |index |--- )/.test(l) ? [] : [l];
    }),
  );
  const stats = $derived({
    add: lines.filter((l) => l.startsWith('+')).length,
    del: lines.filter((l) => l.startsWith('-')).length,
  });

  // Old on the left, new on the right, with removed and added lines paired up.
  type Cell = { text: string; kind: '' | 'add' | 'del' | 'hunk' | 'fileh' | 'none' };
  const rows = $derived.by(() => {
    const out: [Cell, Cell][] = [];
    let dels: string[] = [], adds: string[] = [];
    const flush = () => {
      for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
        out.push([
          i < dels.length ? { text: dels[i], kind: 'del' } : { text: '', kind: 'none' },
          i < adds.length ? { text: adds[i], kind: 'add' } : { text: '', kind: 'none' },
        ]);
      }
      dels = [];
      adds = [];
    };
    for (const l of lines) {
      if (l.startsWith('-')) dels.push(l.slice(1));
      else if (l.startsWith('+')) adds.push(l.slice(1));
      else {
        flush();
        if (l.startsWith('file ') || l.startsWith('@@')) {
          const c: Cell = { text: l, kind: l.startsWith('file ') ? 'fileh' : 'hunk' };
          out.push([c, c]);
        } else if (!l.startsWith('\\')) out.push([{ text: l.slice(1), kind: '' }, { text: l.slice(1), kind: '' }]);
      }
    }
    flush();
    return out;
  });

  // The model can change plenty and still leave the problem. It can't be proven here, but this can be seen.
  // Every prepared fix is built and tested in a throwaway copy, so you know before you decide.
  let check = $state.raw<FixCheck | 'running' | null>(null);
  let checkedId = '';
  $effect(() => {
    const id = app.fix?.proposal?.id ?? '';
    if (id === checkedId) return;
    checkedId = id;
    check = id ? 'running' : null;
    if (id) api.checkFix(id).then((c) => { if (checkedId === id) check = c; }, () => { if (checkedId === id) check = null; });
  });
  const flagged = $derived((app.fix?.finding.snippet ?? '').split('\n').map((l) => l.trim()).find((l) => l.length > 3) ?? '');
  const untouched = $derived(!!flagged && !lines.some((l) => l.startsWith('-') && l.includes(flagged)));

  // Saying why teaches later reviews and fixes; it is never required.
  async function reject() {
    const f = app.fix;
    if (!f) return;
    const text = reason.trim();
    closeFix();
    if (!text) return;
    try {
      await api.addMemory({ kind: 'rejected-fix', text, title: f.finding.title, ref: f.finding.ref, path: f.finding.path, snippet: f.finding.snippet });
      toast('Codist will remember that. See Memory.', 'good', 3000);
    } catch (e) {
      toast((e as Error).message, 'bad');
    }
  }

  function cls(l: string) {
    return l.startsWith('file ') ? 'fileh' : l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : '';
  }

  function key(e: KeyboardEvent) {
    if (!app.fix) return;
    if (app.fixHidden) return;
    if (e.key === 'Escape' && app.fix.busy === 'generating') { app.fixHidden = true; return; }
    if (e.key === 'Escape' && app.fix.busy !== 'applying' && !app.fix.done) closeFix();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && app.fix.proposal && !app.fix.busy) void applyFix(message);
  }

  // How long the model has been at it, for the waiting view.
  let started = 0;
  let now = $state(Date.now());
  $effect(() => {
    if (app.fix?.busy !== 'generating') return;
    started = Date.now();
    const t = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(t);
  });
  const secs = $derived(Math.max(0, Math.round((now - started) / 1000)));
  const words = $derived(live.call?.status === 'running' ? live.call.replyTokens ?? 0 : 0);
  const phase = $derived(live.call?.status === 'running' && (live.call as { phase?: string }).phase === 'writing' ? 'Writing the change' : 'Reading the code around it');

  // Lines from the floating cards to the change, redrawn while the cards drift.
  let stage: HTMLDivElement | undefined = $state();
  let wires = $state<{ d: string; key: string }[]>([]);
  $effect(() => {
    if (!app.fix?.proposal || !stage) { wires = []; return; }
    let raf = 0;
    const draw = () => {
      const to = stage!.querySelector('.change')?.getBoundingClientRect();
      const out: { d: string; key: string }[] = [];
      for (const key of ['why', 'check', 'warn', 'msg']) {
        const c = stage!.querySelector('.n-' + key)?.getBoundingClientRect();
        if (!c || !to) continue;
        const right = c.left > to.left + to.width / 2;
        const x1 = right ? c.left : c.right, y1 = c.top + Math.min(26, c.height / 2);
        const x2 = right ? to.right : to.left, y2 = Math.max(to.top + 40, Math.min(to.bottom - 40, y1));
        const dx = Math.max(30, Math.abs(x2 - x1) * 0.5) * (right ? -1 : 1);
        out.push({ key, d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
      }
      wires = out;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });
  const ease = { easing: cubicOut };

  // While waiting: the classes in this file, what depends on them and what they use, from the code graph.
  const here = $derived.by(() => {
    const f = app.fix, g = app.graph;
    if (!f || !g) return null;
    const mine = g.nodes.filter((n) => n.file === f.finding.path);
    if (!mine.length) return null;
    const ids = new Set(mine.map((n) => n.id));
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const users = [...new Set(g.edges.filter((e) => ids.has(e.target) && !ids.has(e.source)).map((e) => e.source))].map((id) => byId.get(id)!).filter(Boolean);
    const uses = [...new Set(g.edges.filter((e) => ids.has(e.source) && !ids.has(e.target)).map((e) => e.target))].map((id) => byId.get(id)!).filter(Boolean);
    return { cls: mine[0], users, uses };
  });

  const signOf = (l: string) => (l.startsWith('+') || l.startsWith('-') ? l[0] : ' ');
  const isHead = (l: string) => l.startsWith('file ') || l.startsWith('@@');
  const bodyOf = (l: string) => (isHead(l) ? l : l.slice(1));
  // Syntax colours for the change: each side is coloured as a whole, so a line split over cells still reads right.
  let oldTok = $state<Line[] | null>(null), newTok = $state<Line[] | null>(null), uniTok = $state<Line[] | null>(null);
  $effect(() => {
    const r = rows, l = lines, theme = app.theme;
    const lang = (app.fix?.finding.path ?? '').endsWith('.java') ? 'java' : null;
    oldTok = newTok = uniTok = null;
    if (!r.length) return;
    void tokenize(r.map(([o]) => o.text).join('\n'), lang, theme).then((t) => { if (r === rows) oldTok = t; });
    void tokenize(r.map(([, n]) => n.text).join('\n'), lang, theme).then((t) => { if (r === rows) newTok = t; });
    void tokenize(l.map((x) => (/^[+\- ]/.test(x) ? x.slice(1) : x)).join('\n'), lang, theme).then((t) => { if (l === lines) uniTok = t; });
  });

</script>

<svelte:window onkeydown={key} />

{#if app.fix && !app.fixHidden}
  {@const f = app.fix}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" transition:fade={{ duration: 260, ...ease }} onclick={() => { if (f.busy === 'generating') app.fixHidden = true; else if (!f.busy && !f.proposal) closeFix(); }}></div>

  {#if f.busy === 'generating' || (!f.proposal && !f.error)}
    <!-- Waiting: the orb at work in the middle, the code it is reading on the left, what depends on it on the right. -->
    <div class="waitgrid" role="dialog" aria-modal="true" aria-label="Preparing a fix">
      <section class="wcode" in:fly|global={{ x: -30, duration: 360, delay: 80, ...ease }} out:fly|global={{ x: -20, duration: 200 }}>
        <h3>The code it is reading</h3>
        <CodePeek path={f.finding.path} sha={f.sha} line={f.finding.line || 1} around={8} />
      </section>
      <div class="wait" transition:scale|global={{ start: 0.94, opacity: 0, duration: 320, ...ease }}>
        <Orb mood={words ? 'writing' : 'reading'} size={130} label="Preparing a fix" />
        <p class="kicker">Preparing a fix</p>
        <h2>{f.finding.title}</h2>
        <p class="where mono">{f.finding.path.split('/').pop()}{f.finding.line ? ':' + f.finding.line : ''}</p>
        <p class="progress">{phase} · {secs} s{words ? ` · ${words} words written` : ''} · {app.status?.model ?? 'the model'}</p>
        <p class="hint">Usually 20 to 60 seconds. Keep working: a bubble will say when it is ready.</p>
        <div class="wbtns">
          <button class="b3 primary" onclick={() => (app.fixHidden = true)}>Keep working</button>
          <button class="b3" onclick={closeFix}>Cancel</button>
        </div>
      </div>
      <aside class="wside" in:fly|global={{ x: 30, duration: 360, delay: 120, ...ease }} out:fly|global={{ x: 20, duration: 200 }}>
        {#if here}
          <div class="note">
            <h3>{here.cls.name}</h3>
            <p>{STEREOTYPE[here.cls.stereotype]?.label ?? here.cls.stereotype} · {here.cls.kind}{here.cls.module ? ` · ${here.cls.module}` : ''} · {here.cls.endLine - here.cls.startLine + 1} lines</p>
          </div>
          {#if here.users.length}
            <div class="note">
              <h3>Depends on it · {here.users.length}</h3>
              <ul class="deps">{#each here.users.slice(0, 8) as u}<li><span class="mono">{u.name}</span><small>{STEREOTYPE[u.stereotype]?.label ?? ''}</small></li>{/each}</ul>
              {#if here.users.length > 8}<p class="more">and {here.users.length - 8} more</p>{/if}
              <p class="foot">A fix here can change what these see.</p>
            </div>
          {/if}
          {#if here.uses.length}
            <div class="note">
              <h3>It uses · {here.uses.length}</h3>
              <ul class="deps">{#each here.uses.slice(0, 6) as u}<li><span class="mono">{u.name}</span><small>{STEREOTYPE[u.stereotype]?.label ?? ''}</small></li>{/each}</ul>
            </div>
          {/if}
        {/if}
        {#if f.finding.detail}<div class="note"><h3>The problem</h3><p>{f.finding.detail}</p></div>{/if}
      </aside>
    </div>
  {:else}
    <svg class="wires" aria-hidden="true" in:fade|global={{ duration: 400, delay: 250 }} out:fade|global={{ duration: 120 }}>
      <defs><marker id="fix-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
      {#each wires as w (w.key)}<path class="wire w-{w.key}" d={w.d} marker-end="url(#fix-arrow)" />{/each}
    </svg>
    <div class="stage" bind:this={stage} role="dialog" aria-modal="true" aria-labelledby="fix-title">
      <header class="title float f1" transition:fly|global={{ y: -16, duration: 300, ...ease }}>
        <span class="tag">Fix</span>
        <h2 id="fix-title">{f.finding.title}</h2>
        <p class="sub mono">
          {#if f.proposal && f.proposal.paths.length > 1}{f.proposal.paths.length} files: {f.proposal.paths.map((p) => p.split('/').pop()).join(', ')}{:else}{f.finding.path}{f.finding.line ? ':' + f.finding.line : ''}{/if}
          {f.proposal ? (f.proposal.working ? ' · working tree, not committed' : ` · commit to ${f.proposal.branch}`) : ''}
        </p>
        <button class="x" aria-label="Close" disabled={f.busy === 'applying'} onclick={closeFix}>×</button>
      </header>

      {#if f.proposal}
        <section class="change" class:applying={f.busy === 'applying'} class:landed={!!f.done} transition:scale|global={{ start: 0.95, opacity: 0, duration: 320, ...ease }}>
          {#if f.busy === 'applying'}<div class="sweep" aria-hidden="true"></div><p class="applying-note">Applying {f.proposal.working ? 'to your working tree' : 'and committing'}…</p>{/if}
          {#if f.done}
            <div class="done" role="status">
              <svg viewBox="0 0 52 52" width="64" height="64"><circle cx="26" cy="26" r="23" /><path d="M15 27 l8 8 l15 -17" /></svg>
              <b>{f.done === 'working' ? 'Applied to your working tree' : `Committed ${f.done.slice(0, 7)}`}</b>
              <span>{f.done === 'working' ? 'Commit it together with your changes.' : 'Codist is reviewing the fix now.'}</span>
            </div>
          {/if}
          <div class="diff-head">
            <span class="mono plus">+{stats.add}</span><span class="mono minus">−{stats.del}</span>
            <span class="grow"></span>
            <div class="seg">
              <button class:on={view === 'split'} onclick={() => (view = 'split')}>Side by side</button>
              <button class:on={view === 'unified'} onclick={() => (view = 'unified')}>Unified</button>
            </div>
            <CopyButton text={f.proposal.patch} title="Copy the patch" label="Patch" />
          </div>
          {#if view === 'split'}
            <div class="split-head"><span>Now</span><span>After the fix</span></div>
            <div class="split-diff">
              {#each rows as [o, n], ri}
                {#if o.kind === 'fileh' || o.kind === 'hunk'}
                  <div class="wide {o.kind}">{o.text}</div>
                {:else}
                  <div class="cell {o.kind}">{#if oldTok?.[ri]}{#each oldTok[ri] as t}<span style:color={t.color}>{t.content}</span>{/each}{:else}{o.text}{/if}{' '}</div>
                  <div class="cell {n.kind}">{#if newTok?.[ri]}{#each newTok[ri] as t}<span style:color={t.color}>{t.content}</span>{/each}{:else}{n.text}{/if}{' '}</div>
                {/if}
              {/each}
            </div>
          {:else}
            <pre class="diff">{#each lines as l, li}<span class={cls(l)}><i class="sign">{signOf(l)}</i>{#if uniTok?.[li] && !isHead(l)}{#each uniTok[li] as t}<b style:color={t.color}>{t.content}</b>{/each}{:else}{bodyOf(l)}{/if}{' '}</span>{/each}</pre>
          {/if}
        </section>

        <aside class="left">
          {#if f.finding.detail || f.finding.suggestion}
            <div class="note n-why float f2" in:fly|global={{ x: -28, duration: 340, delay: 120, ...ease }} out:fly|global={{ x: -20, duration: 200 }}>
              <h3>Why this change</h3>
              {#if f.finding.detail}<p>{f.finding.detail}</p>{/if}
              {#if f.finding.suggestion}<p class="rec">{f.finding.suggestion}</p>{/if}
            </div>
          {/if}
          {#if check}
            <div class="note n-check float f3 {check === 'running' ? 'running' : check.status}" in:fly|global={{ x: -28, duration: 340, delay: 180, ...ease }} out:fly|global={{ x: -20, duration: 200 }}>
              <h3>Built and tested</h3>
              {#if check === 'running'}<p><span class="spin"></span>Compiling and running the tests in a separate copy. You can decide now.</p>
              {:else if check.status === 'passed'}<p class="ok">Compiles, and the tests pass. {Math.round(check.tookMs / 1000)} s.</p>
              {:else if check.status === 'failed'}<p class="bad">{check.step === 'tests' ? 'Compiles, but tests fail.' : 'Does not compile.'}</p>{#if check.output}<pre>{check.output}</pre>{/if}
              {:else}<p>Could not check it. {check.output}</p>{/if}
            </div>
          {/if}
          {#if untouched}
            <div class="note n-warn float f4 warnc" in:fly|global={{ x: -28, duration: 340, delay: 240, ...ease }} out:fly|global={{ x: -20, duration: 200 }}>
              <h3>Look twice</h3>
              <p>The flagged line is unchanged: <code>{flagged}</code></p>
            </div>
          {/if}
        </aside>

        <aside class="right">
          <div class="note n-msg float f5" in:fly|global={{ x: 28, duration: 340, delay: 150, ...ease }} out:fly|global={{ x: 20, duration: 200 }}>
            {#if f.proposal.working}
              <h3>Applies to your changes</h3>
              <p>This fixes uncommitted work, so it goes into the working tree and is not committed.</p>
            {:else}
              <div class="lab"><h3>Commit message</h3><CopyButton text={message} title="Copy the message" /></div>
              <textarea class="mono" rows="5" bind:value={message} spellcheck="false"></textarea>
            {/if}
          </div>
          <div class="note actions float f6" in:fly|global={{ x: 28, duration: 340, delay: 210, ...ease }} out:fly|global={{ x: 20, duration: 200 }}>
            {#if rejecting}
              <h3>Why not? Optional</h3>
              <textarea rows="3" bind:value={reason} placeholder="e.g. we keep field injection in legacy controllers. Codist remembers this."></textarea>
              <button class="b3 primary" onclick={reject}>{reason.trim() ? 'Reject and remember' : 'Reject'}</button>
              <button class="b3 ghost" onclick={() => (rejecting = false)}>Back</button>
            {:else}
              <button class="b3 primary" disabled={!!f.busy || (!f.proposal.working && !message.trim())} onclick={() => applyFix(message)}>
                {f.busy === 'applying' ? 'Applying…' : f.proposal.working ? 'Apply' : 'Apply and commit'}
              </button>
              <button class="b3" disabled={f.busy === 'applying'} onclick={() => (rejecting = true)}>Reject…</button>
              <p class="keys">⌘↵ to {f.proposal.working ? 'apply' : 'commit'} · Esc to discard</p>
            {/if}
          </div>
        </aside>
      {/if}

      {#if f.error}
        <div class="note err float" transition:scale|global={{ start: 0.95, opacity: 0, duration: 260 }}>
          <div class="lab"><h3>The fix could not be prepared</h3><CopyButton text={f.error} title="Copy the error" /></div>
          <p>{f.error}</p>
          <button class="b3" onclick={closeFix}>Close</button>
        </div>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 70; background: rgba(6, 6, 10, 0.84); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.6); }
  .wait { position: fixed; z-index: 71; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 560px; width: calc(100% - 32px); }
  .wait .kicker { margin: 18px 0 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-text); }
  .wait h2 { margin: 0; font-size: 21px; font-weight: 600; letter-spacing: -0.01em; }
  .wait .where { margin: 6px 0 14px; font-size: 12px; color: var(--text-3); word-break: break-all; }
  .progress { margin: 0; font-size: 13px; color: var(--text-2); font-variant-numeric: tabular-nums; }
  .hint { margin: 4px 0 18px; font-size: 12px; color: var(--text-3); }
  .wires { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 73; pointer-events: none; overflow: visible; }
  .wire { fill: none; stroke: rgba(139, 124, 246, 0.75); stroke-width: 1.6; stroke-dasharray: 5 4; filter: drop-shadow(0 0 4px rgba(139, 124, 246, 0.7)); animation: flow 1.2s linear infinite; }
  .w-warn { stroke: rgba(255, 159, 10, 0.8); }
  .wires marker path { fill: #8b7cf6; }
  @keyframes flow { to { stroke-dashoffset: -9; } }
  .stage { position: fixed; inset: 0; z-index: 72; pointer-events: none; display: grid; overflow: auto;
    grid-template-columns: minmax(200px, 270px) minmax(0, 820px) minmax(220px, 290px); grid-template-rows: auto auto;
    justify-content: center; align-content: center; gap: 24px 64px; padding: 28px; }
  .stage > * { pointer-events: auto; }
  .title { grid-column: 1 / -1; justify-self: center; position: relative; max-width: 900px; padding: 14px 44px 14px 18px; border-radius: 16px;
    background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), var(--glow-soft); }
  .tag { display: inline-block; padding: 2px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600; color: #fff; background: var(--accent); box-shadow: var(--glow); }
  .title h2 { margin: 8px 0 2px; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  .sub { margin: 0; font-size: 11.5px; color: var(--text-3); word-break: break-all; }
  .x { position: absolute; top: 10px; right: 12px; border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); }
  .change { grid-column: 2; grid-row: 2; align-self: center; min-width: 0; border-radius: 16px; padding: 10px; background: var(--glass-strong);
    border: 1px solid rgba(139, 124, 246, 0.35); box-shadow: var(--elev-2), 0 0 90px -24px rgba(139, 124, 246, 0.55); }
  .diff-head { display: flex; align-items: center; gap: 10px; padding: 2px 4px 10px; }
  .plus { color: var(--good); } .minus { color: var(--bad); } .grow { flex: 1; }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--surface-2); }
  .seg button { border: 0; background: none; height: 24px; padding: 0 10px; border-radius: 7px; font-size: 12px; color: var(--text-3); }
  .seg button.on { color: var(--text); background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4); }
  .split-head { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-3); padding: 0 4px 6px; }
  .split-diff { display: grid; grid-template-columns: 1fr 1fr; max-height: 52vh; overflow: auto; border-radius: 10px; background: var(--code-bg); border: 1px solid var(--border);
    font: 12px/1.6 var(--mono, ui-monospace, monospace); }
  .cell { padding: 0 10px; white-space: pre-wrap; overflow-wrap: anywhere; min-width: 0; } /* wrap, never cut: the hidden end may be the fix */
  .cell.del { background: color-mix(in srgb, var(--bad) 16%, transparent); }
  .cell.add { background: color-mix(in srgb, var(--good) 16%, transparent); }
  .cell.none { background: rgba(255, 255, 255, 0.015); }
  .wide { grid-column: 1 / -1; padding: 3px 10px; color: var(--text-3); background: var(--surface-2); white-space: pre; overflow: hidden; text-overflow: ellipsis; }
  .wide.fileh { color: var(--text); font-weight: 600; }
  .diff { margin: 0; max-height: 52vh; overflow: auto; padding: 6px 0; border-radius: 10px; background: var(--code-bg); border: 1px solid var(--border); font-size: 12px; line-height: 1.6; }
  .diff span { display: block; padding: 0 12px; white-space: pre; }
  .diff .add { background: color-mix(in srgb, var(--good) 16%, transparent); } .diff .del { background: color-mix(in srgb, var(--bad) 16%, transparent); }
  .diff .hunk, .diff .fileh { color: var(--text-3); background: var(--surface-2); }
  .left { grid-column: 1; grid-row: 2; align-self: center; display: flex; flex-direction: column; gap: 16px; }
  .right { grid-column: 3; grid-row: 2; align-self: center; display: flex; flex-direction: column; gap: 16px; }
  .note { padding: 14px 16px; border-radius: 14px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), 0 0 40px -18px rgba(139, 124, 246, 0.4); }
  .note h3 { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .note p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--text-2); }
  .note p + p { margin-top: 6px; }
  .rec { color: var(--text) !important; }
  .note pre { margin: 8px 0 0; max-height: 140px; overflow: auto; font-size: 11px; color: var(--text-2); white-space: pre-wrap; }
  .ok { color: var(--good) !important; } .bad { color: var(--bad) !important; }
  .n-check.passed { border-color: color-mix(in srgb, var(--good) 45%, var(--border)); box-shadow: var(--elev-2), 0 0 40px -16px color-mix(in srgb, var(--good) 60%, transparent); }
  .n-check.failed { border-color: color-mix(in srgb, var(--bad) 45%, var(--border)); }
  .warnc { border-color: color-mix(in srgb, var(--warn) 45%, var(--border)); }
  .spin { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 50%; border: 1.5px solid var(--text-3); border-top-color: var(--accent); animation: rot 0.8s linear infinite; vertical-align: -1px; }
  @keyframes rot { to { transform: rotate(360deg); } }
  .lab { display: flex; align-items: center; justify-content: space-between; }
  textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--code-bg); color: var(--text); font-size: 12px; resize: vertical; }
  textarea:focus { outline: none; border-color: var(--accent); }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .actions .b3 { justify-content: center; }
  .actions .b3:disabled { opacity: 0.45; cursor: not-allowed; }
  .keys { margin: 2px 0 0 !important; font-size: 11px !important; color: var(--text-3) !important; text-align: center; }
  .err { grid-column: 2; grid-row: 2; align-self: center; border-color: color-mix(in srgb, var(--bad) 45%, var(--border)); }
  .float { animation: bob 8s ease-in-out infinite; }
  .f2 { animation-duration: 8.5s; animation-delay: -2s; } .f3 { animation-duration: 9.5s; animation-delay: -4s; } .f4 { animation-duration: 7.5s; animation-delay: -1s; }
  .f5 { animation-duration: 9s; animation-delay: -3s; } .f6 { animation-duration: 10s; animation-delay: -5s; } .f1 { animation-duration: 11s; }
  @keyframes bob { 50% { transform: translateY(-5px); } }
  @media (prefers-reduced-motion: reduce) { .float, .wire, .spin { animation: none; } }
  @media (max-width: 1150px) {
    .stage { grid-template-columns: minmax(0, 1fr); align-content: start; }
    .change, .left, .right, .err { grid-column: 1; grid-row: auto; }
  }
  .waitgrid { position: fixed; inset: 0; z-index: 71; display: grid; grid-template-columns: minmax(0, 520px) minmax(300px, 380px) minmax(240px, 320px);
    justify-content: center; align-content: center; align-items: center; gap: 48px; padding: 28px; overflow: auto; pointer-events: none; }
  .waitgrid > * { pointer-events: auto; }
  .waitgrid .wait { position: static; transform: none; width: auto; max-width: none; }
  .wcode, .wside .note { padding: 14px 16px; border-radius: 14px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), 0 0 40px -18px rgba(139, 124, 246, 0.4); }
  .wcode h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .wcode :global(.peek) { font-size: 12px; }
  .wside { display: flex; flex-direction: column; gap: 14px; }
  .wbtns { display: flex; gap: 8px; }
  .deps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .deps li { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; } .deps small { color: var(--text-3); }
  .more, .foot { margin-top: 6px !important; font-size: 11.5px !important; color: var(--text-3) !important; }
  @media (max-width: 1250px) { .waitgrid { grid-template-columns: minmax(0, 1fr); align-content: start; } }
  .diff .sign { display: inline-block; width: 14px; font-style: normal; color: var(--text-3); }
  .diff b { font-weight: inherit; }
  /* Applying: a band of light sweeps down the change; the new side glows as it lands. */
  .change { position: relative; overflow: hidden; }
  .sweep { position: absolute; left: 0; right: 0; top: -30%; height: 30%; z-index: 2; pointer-events: none;
    background: rgba(139, 124, 246, 0.12); box-shadow: 0 0 40px 10px rgba(139, 124, 246, 0.18); animation: sweep 1.1s ease-in-out infinite; }
  @keyframes sweep { to { top: 100%; } }
  .applying-note { position: absolute; z-index: 3; top: 12px; left: 50%; transform: translateX(-50%); margin: 0; padding: 4px 12px; border-radius: 99px;
    font-size: 12px; background: var(--accent); color: #fff; box-shadow: var(--glow); }
  .applying .cell.add, .applying .diff .add { animation: land 1.1s ease-in-out infinite; }
  @keyframes land { 50% { background: color-mix(in srgb, var(--good) 34%, transparent); } }
  .done { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    background: color-mix(in srgb, var(--glass-strong) 92%, transparent); animation: appear 0.3s ease-out; }
  @keyframes appear { from { opacity: 0; } }
  .done svg circle { fill: none; stroke: var(--good); stroke-width: 3; stroke-dasharray: 145; stroke-dashoffset: 145; animation: draw 0.6s ease-out forwards; }
  .done svg path { fill: none; stroke: var(--good); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 40; stroke-dashoffset: 40; animation: draw 0.4s 0.45s ease-out forwards; }
  .done svg { filter: drop-shadow(0 0 12px color-mix(in srgb, var(--good) 70%, transparent)); }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .done b { font-size: 16px; } .done span { font-size: 12.5px; color: var(--text-3); }
  .landed { border-color: color-mix(in srgb, var(--good) 55%, var(--border)) !important; box-shadow: var(--elev-2), 0 0 90px -20px color-mix(in srgb, var(--good) 60%, transparent) !important; }

  /* Long words (a full method chain, a path) wrap inside the card instead of running over the code. */
  .note, .note p, .note li, .wside .note, .title h2 { overflow-wrap: anywhere; min-width: 0; }
  .left, .right { min-width: 0; }
</style>
