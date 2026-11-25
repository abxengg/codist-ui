<script lang="ts">
  // One incident, on stage: the page blurs, the failing code sits in the middle, the log runs down the left with its
  // error lines lit, and the likely causes float on the right, each with an arrow to the line it blames. ← → walk the
  // incidents; Esc or a click outside closes; "Full report" leaves the stage for the report underneath.
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app, openIncident, openFile, selectCommit } from '../lib/store.svelte';
  import { ago } from '../lib/theme';
  import CodePeek from './CodePeek.svelte';
  import Orb from './Orb.svelte';
  import type { IncidentLocation } from '../lib/types';

  const j = $derived(app.incident);
  const open = $derived(app.incidentStage && app.mode === 'incidents' && !!j);
  const close = () => (app.incidentStage = false);
  $effect(() => { if (app.mode !== 'incidents') app.incidentStage = false; });

  const list = $derived(app.incidents);
  const at = $derived(list.findIndex((i) => i.id === app.incidentId));
  function go(step: number) { const n = list[at + step]; if (n) void openIncident(n.id); }
  function keys(e: KeyboardEvent) {
    if (!open || app.fix || app.focus || app.fileShown) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(-1); }
  }

  // The code in the middle: the location picked, else where the error started, else the first frame in your code.
  let pick = $state<{ path: string; line: number } | null>(null);
  $effect(() => { void app.incidentId; pick = null; });
  const locs = $derived([...(j?.locations ?? [])].sort((a, b) => Number(b.origin) - Number(a.origin) || b.hits - a.hits).slice(0, 6));
  const shown = $derived(pick ?? (locs[0] ? { path: locs[0].path, line: locs[0].line } : null));
  const shownLoc = $derived(locs.find((l) => shown && l.path === shown.path && l.line === shown.line) ?? null);
  const short = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const occurrences = $derived(j?.errors.reduce((a, e) => a + e.count, 0) ?? 0);

  // The log, with error lines lit and the shown location's frame marked.
  const logLines = $derived((j?.excerpt ?? '').split('\n').slice(0, 400));
  const kindOf = (l: string) => /^\s*at\s/.test(l) ? (shownLoc && l.includes(`${short(shownLoc.path)}:${shownLoc.line}`) ? 'here' : 'frame')
    : /Caused by:|Exception|Error\b|\bERROR\b/.test(l) ? 'err' : /\bWARN\b/.test(l) ? 'warn' : '';

  // Lines from each cause card to the code, when the cause names the file on show.
  let stage: HTMLDivElement | undefined = $state();
  let paths = $state<{ d: string; key: string }[]>([]);
  $effect(() => {
    if (!open || !stage) return;
    let raf = 0;
    const draw = () => {
      const out: { d: string; key: string }[] = [];
      const hit = stage!.querySelector('.code .ln.hit') ?? stage!.querySelector('.code');
      const t = hit?.getBoundingClientRect();
      if (t) for (const card of stage!.querySelectorAll<HTMLElement>('[data-cause]')) {
        if (card.dataset.match !== '1') continue;
        const c = card.getBoundingClientRect(), x1 = c.left, y1 = c.top + 26, x2 = t.right - 12, y2 = t.top + t.height / 2;
        const dx = Math.max(40, (x1 - x2) * 0.5);
        out.push({ key: card.dataset.cause!, d: `M${x1},${y1} C${x1 - dx},${y1} ${x2 + dx},${y2} ${x2},${y2}` });
      }
      const log = stage!.querySelector('.log .here'), code = stage!.querySelector('.code');
      if (log && code) {
        const a = log.getBoundingClientRect(), b = code.getBoundingClientRect(), box = stage!.querySelector('.log')!.getBoundingClientRect();
        if (a.top > box.top && a.bottom < box.bottom) {
          const x1 = a.right, y1 = a.top + a.height / 2, x2 = b.left, y2 = (t ?? b).top + ((t ?? b).height / 2);
          const dx = Math.max(40, (x2 - x1) * 0.5);
          out.push({ key: 'log', d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` });
        }
      }
      paths = out;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });
  const CONF: Record<string, string> = { high: 'Likely', medium: 'Possible', low: 'Unsure' };
  function openSuspect(sha: string) { close(); app.mode = 'commits'; void selectCommit(sha, true); app.commitStage = true; }
  function show(l: IncidentLocation | { path: string; line: number }) { pick = { path: l.path, line: l.line }; }
</script>

<svelte:window onkeydown={keys} />

{#if open && j}
  <div class="scrim" transition:fade={{ duration: 240, easing: cubicOut }} onclick={close} role="presentation"></div>
  <svg class="wires" aria-hidden="true" in:fade|global={{ duration: 400, delay: 300 }} out:fade|global={{ duration: 100 }}>
    <defs><marker id="is-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
    {#each paths as p (p.key)}<path class="wire" class:logw={p.key === 'log'} d={p.d} marker-end="url(#is-arrow)" />{/each}
  </svg>

  <div class="stage" bind:this={stage} role="dialog" aria-modal="true" aria-label={j.title}>
    <header class="head" transition:fly|global={{ y: -18, duration: 300, easing: cubicOut }}>
      <button class="nav" disabled={!list[at + 1]} onclick={() => go(1)} title="Older incident (←)" aria-label="Older incident">‹</button>
      <div class="who">
        <span class="pos mono">{at + 1} / {list.length}</span>
        <h2>{j.title}</h2>
        <p>
          {#if j.status === 'analysing'}<span class="ui-pill ai">analysing</span>{:else if j.confirmed}<span class="ui-pill good">root cause confirmed</span>{:else if j.status === 'failed'}<span class="ui-pill warn">failed</span>{/if}
          <span>{occurrences} occurrence{occurrences === 1 ? '' : 's'} · {j.errors.length} error{j.errors.length === 1 ? '' : 's'} · {ago(j.createdAt)}{#if j.model} · read by {j.model}{/if}</span>
        </p>
      </div>
      <button class="b3 ghost" onclick={close}>Full report</button>
      <button class="nav" disabled={at <= 0} onclick={() => go(-1)} title="Newer incident (→)" aria-label="Newer incident">›</button>
      <button class="x" aria-label="Close" onclick={close}>×</button>
    </header>

    <aside class="left" in:fly|global={{ x: -26, duration: 320, delay: 120, easing: cubicOut }} out:fly|global={{ x: -18, duration: 180 }}>
      <div class="card errs">
        <h3 class="ui-label">Errors</h3>
        {#each j.errors.slice(0, 5) as e}
          <div class="err"><b>{e.exception.slice(e.exception.lastIndexOf('.') + 1)}</b><i>×{e.count}</i>{#if e.message}<span>{e.message}</span>{/if}</div>
        {/each}
      </div>
      <div class="card log mono">
        <h3 class="ui-label">The log</h3>
        <div class="lines">{#each logLines as l, i (i)}<div class="ll {kindOf(l)}">{l || ' '}</div>{/each}</div>
      </div>
    </aside>

    <section class="centre" transition:scale|global={{ start: 0.96, opacity: 0, duration: 300, easing: cubicOut }}>
      {#if locs.length > 1}
        <div class="tabs">{#each locs as l}<button class:on={shown?.path === l.path && shown?.line === l.line} onclick={() => show(l)}>{#if l.origin}<i></i>{/if}{short(l.path)}:{l.line}</button>{/each}</div>
      {/if}
      {#if shown}
        <div class="code">
          <div class="path mono">{shown.path}<b>:{shown.line}</b>{#if shownLoc} <span>· {shownLoc.class.slice(shownLoc.class.lastIndexOf('.') + 1)}.{shownLoc.method}{#if shownLoc.origin} · where it started{/if}</span>{/if}</div>
          {#key shown.path + shown.line}<CodePeek path={shown.path} line={shown.line} around={10} />{/key}
          {#if shownLoc?.blame?.sha}
            <p class="blame">Line last changed by <b>{shownLoc.blame.author}</b> {ago(shownLoc.blame.time)} in <button class="link mono" onclick={() => openSuspect(shownLoc.blame.sha)}>{shownLoc.blame.sha.slice(0, 7)}</button> “{shownLoc.blame.summary}”</p>
          {/if}
          <button class="b3 ghost whole" onclick={() => { const s = shown; if (s) { close(); void openFile(s.path, null, s.line); } }}>Open the whole file</button>
        </div>
      {:else}
        <div class="code empty">No frame in this log points at your code.</div>
      {/if}
    </section>

    <aside class="right">
      {#if j.status === 'analysing'}
        <div class="card thinking" in:fly|global={{ x: 26, duration: 320, delay: 140, easing: cubicOut }}>
          <Orb mood="reading" size={56} label="Finding causes" /><p>Finding the likely causes…</p>
        </div>
      {/if}
      {#each j.causes.slice(0, 4) as c, i (c.title)}
        {@const match = !!(c.path && shown && c.path === shown.path)}
        <div class="card cause conf-{c.confidence}" data-cause={'c' + i} data-match={match ? '1' : '0'} in:fly|global={{ x: 26, duration: 320, delay: 140 + i * 60, easing: cubicOut }} out:fly|global={{ x: 18, duration: 180 }}>
          <div class="tags"><span class="ui-pill conf">{CONF[c.confidence] ?? c.confidence}</span>{#if i === 0}<span class="ui-pill ai">top cause</span>{/if}</div>
          <h4>{c.title}</h4>
          <p>{c.explanation}</p>
          {#if c.fix}<p class="fixline"><b>Fix:</b> {c.fix}</p>{/if}
          {#if c.path}<button class="b3 ghost" onclick={() => c.path && show({ path: c.path, line: c.line ?? 1 })}>Show {short(c.path)}{c.line ? `:${c.line}` : ''}</button>{/if}
        </div>
      {/each}
      {#if j.suspects.length}
        <div class="card sus" in:fly|global={{ x: 26, duration: 320, delay: 380, easing: cubicOut }} out:fly|global={{ x: 18, duration: 180 }}>
          <h3 class="ui-label">Suspect commits</h3>
          {#each j.suspects.slice(0, 3) as s}
            <button class="srow" onclick={() => openSuspect(s.sha)}><span class="mono">{s.sha.slice(0, 7)}</span><span class="m">{s.message}</span><span class="sc" style:width="{Math.round(Math.min(1, s.score) * 40)}px"></span></button>
          {/each}
        </div>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 56; background: rgba(6, 6, 10, 0.8); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.62); }
  .wires { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 59; pointer-events: none; overflow: visible; }
  .wire { fill: none; stroke: color-mix(in srgb, var(--accent) 75%, transparent); stroke-width: 1.5; stroke-dasharray: 5 4; filter: drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 70%, transparent)); animation: flow 1.2s linear infinite; }
  .wire.logw { stroke: color-mix(in srgb, var(--bad) 70%, transparent); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--bad) 60%, transparent)); }
  .wires marker path { fill: var(--accent); }
  @keyframes flow { to { stroke-dashoffset: -8; } }
  @media (prefers-reduced-motion: reduce) { .wire { animation: none; } }

  .stage { position: fixed; inset: 0; z-index: 58; pointer-events: none; display: grid; grid-template-columns: minmax(240px, 320px) minmax(0, 820px) minmax(250px, 300px);
    grid-template-rows: auto minmax(0, 1fr); justify-content: center; gap: 18px 40px; padding: 22px 28px 26px; }
  .stage > * { pointer-events: auto; }
  .card { padding: 14px 16px; border-radius: 14px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2); min-width: 0; }
  .card h3 { margin: 0 0 10px; }

  .head { grid-column: 1 / -1; justify-self: center; width: min(100%, 1060px); display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px;
    background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), 0 0 60px -26px color-mix(in srgb, var(--bad) 70%, transparent); }
  .who { flex: 1; min-width: 0; text-align: center; }
  .who h2 { margin: 2px 0 4px; font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who p { margin: 0; display: flex; justify-content: center; align-items: center; gap: 8px; font-size: 12px; color: var(--text-3); }
  .pos { font-size: 10.5px; color: var(--text-3); }
  .nav { flex-shrink: 0; width: 38px; height: 38px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); font-size: 20px; line-height: 1; box-shadow: var(--elev-1); }
  .nav:hover:not(:disabled) { color: var(--text); border-color: var(--border-strong); }
  .nav:disabled { opacity: 0.3; }
  .x { border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); }

  .left, .right { grid-row: 2; display: flex; flex-direction: column; gap: 14px; min-height: 0; padding: 2px; }
  .left { grid-column: 1; } .right { grid-column: 3; overflow: auto; }
  .err { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 6px 0; border-top: 1px solid var(--border); font-size: 12.5px; }
  .err:first-of-type { border-top: 0; }
  .err b { color: var(--bad); font-weight: 600; } .err i { font-style: normal; color: var(--text-3); font-size: 11.5px; }
  .err span { flex-basis: 100%; color: var(--text-3); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .log { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .lines { flex: 1; min-height: 0; overflow: auto; font-size: 10.5px; line-height: 1.55; }
  .ll { white-space: pre; color: var(--text-3); padding: 0 4px; border-radius: 3px; }
  .ll.err { color: color-mix(in srgb, var(--bad) 80%, var(--text)); background: color-mix(in srgb, var(--bad) 10%, transparent); }
  .ll.warn { color: var(--warn); }
  .ll.frame { color: var(--text-2); }
  .ll.here { color: var(--text); background: color-mix(in srgb, var(--accent) 22%, transparent); box-shadow: inset 2px 0 0 var(--accent); }

  .centre { grid-column: 2; grid-row: 2; min-height: 0; display: flex; flex-direction: column; gap: 10px; align-self: center; }
  .tabs { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
  .tabs button { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 99px; border: 1px solid var(--border); background: var(--glass); color: var(--text-2); font: 11.5px var(--mono); }
  .tabs button.on { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--glass)); }
  .tabs i { width: 7px; height: 7px; border-radius: 50%; background: var(--bad); box-shadow: 0 0 6px var(--bad); }
  .code { border-radius: 16px; padding: 12px; background: var(--glass-strong); border: 1px solid color-mix(in srgb, var(--bad) 40%, var(--border));
    box-shadow: var(--elev-2), 0 0 90px -26px color-mix(in srgb, var(--bad) 55%, transparent); min-height: 0; overflow: auto; }
  .code.empty { color: var(--text-3); text-align: center; padding: 40px; }
  .path { font-size: 12px; color: var(--text-3); padding: 2px 4px 10px; word-break: break-all; } .path b { color: var(--text); }
  .blame { margin: 10px 4px 0; font-size: 12px; color: var(--text-3); line-height: 1.5; } .blame b { color: var(--text-2); font-weight: 600; }
  .link { border: 0; background: none; padding: 0; color: var(--accent-text); font-size: 12px; }
  .whole { margin-top: 10px; }

  .cause { --c: var(--accent); border-color: color-mix(in srgb, var(--c) 40%, var(--border)); }
  .conf-medium { --c: var(--sev-medium); } .conf-low { --c: var(--text-3); }
  .tags { display: flex; gap: 5px; }
  .conf { color: #111 !important; background: var(--c) !important; }
  .cause h4 { margin: 8px 0 4px; font-size: 13.5px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
  .cause p { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .cause .fixline { -webkit-line-clamp: 3; line-clamp: 3; }
  .cause .b3 { height: 28px; font-size: 12px; }
  .thinking { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; } .thinking p { margin: 0; font-size: 12.5px; color: var(--text-2); }
  .srow { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 4px; border: 0; border-radius: 8px; background: none; color: var(--text-2); font-size: 12px; text-align: left; }
  .srow:hover { background: var(--surface-2); color: var(--text); }
  .srow .mono { color: var(--accent-text); font-size: 11.5px; }
  .srow .m { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sc { height: 4px; border-radius: 2px; background: var(--accent); flex-shrink: 0; }
  @media (max-width: 1200px) {
    .stage { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; overflow: auto; }
    .left, .right, .centre { grid-column: 1; grid-row: auto; }
    .log { max-height: 260px; }
  }
</style>
