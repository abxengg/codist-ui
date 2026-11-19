<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Orb from './Orb.svelte';
  import { tokenize, plain, type Line } from '../lib/highlight';
  import { app, openFile, openIncident, showCommit } from '../lib/store.svelte';
  import { api } from '../lib/api';
  import CopyButton from './CopyButton.svelte';
  import { ago } from '../lib/theme';
  import type { Activity, LaneView, LogEntry } from '../lib/types';

  // Everything Codist did and everything the model saw and said, live.
  let items = $state.raw<Activity[]>([]);
  let picked = $state.raw<Activity | null>(null);
  let pickedId = $state<string | null>(null);
  let kind = $state('');
  let status = $state('');
  let query = $state('');
  let aiOnly = $state(false);
  let view = $state<'prompt' | 'system' | 'response'>('prompt');
  let failed = $state('');

  // What each lane is doing, and the server's log as it happens.
  let lanes = $state.raw<LaneView[]>([]);
  let logs = $state.raw<LogEntry[]>([]);
  let level = $state('info');
  let follow = $state(true);
  let now = $state(Date.now());
  let logEl = $state<HTMLDivElement | null>(null);
  const RANK: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const shownLogs = $derived(logs.filter((e) => (RANK[e.level] ?? 1) >= (RANK[level] ?? 1)));
  const msgOf = (sha: string) => app.commits.find((c) => c.commit.sha.startsWith(sha) || sha.startsWith(c.commit.sha))?.commit.message ?? '';
  const since = (at?: string) => (at ? secs(Math.max(0, now - new Date(at).getTime())) : '');
  const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const attrsText = (e: LogEntry) => Object.entries(e.attrs ?? {}).filter(([k]) => k !== 'lib').map(([k, v]) => `${k}=${v}`).join('  ');
  async function loadLanes() { try { lanes = await api.activityLanes(); } catch { /* the page shows what it last had */ } }
  $effect(() => { if (follow && shownLogs.length && logEl) logEl.scrollTop = logEl.scrollHeight; });

  async function load() {
    try { items = await api.activity(); failed = ''; } catch (e) { failed = (e as Error).message; }
  }
  async function pick(id: string) {
    pickedId = id;
    picked = await api.activityItem(id);
  }
  onMount(() => {
    void load();
    void loadLanes();
    void api.activityLog().then((l) => (logs = l)).catch(() => {});
    const lanesTimer = setInterval(loadLanes, 1500);
    const tick = setInterval(() => (now = Date.now()), 1000);
    const es = new EventSource('/api/activity/stream');
    es.addEventListener('log', (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as { log: LogEntry };
      logs = [...logs, ev.log].slice(-800);
    });
    es.addEventListener('call', (e) => {
      const a = (JSON.parse((e as MessageEvent).data) as { call: Activity }).call;
      const i = items.findIndex((x) => x.id === a.id);
      items = i >= 0 ? items.map((x, k) => (k === i ? a : x)) : [a, ...items].slice(0, 300);
      if (a.id === pickedId) void pick(a.id);
    });
    const on = (e: Event) => {
      const a = (e as CustomEvent<Activity>).detail;
      const i = items.findIndex((x) => x.id === a.id);
      items = i >= 0 ? items.map((x, k) => (k === i ? a : x)) : [a, ...items].slice(0, 300);
      if (a.id === pickedId) void pick(a.id);
    };
    window.addEventListener('codist:activity', on);
    return () => { window.removeEventListener('codist:activity', on); es.close(); clearInterval(lanesTimer); clearInterval(tick); };
  });

  const kinds = $derived([...new Set(items.map((a) => a.kind))].sort());
  const shown = $derived(items.filter((a) => (!kind || a.kind === kind) && (!status || a.status === status) && (!aiOnly || a.kind !== 'step') &&
    (!query || `${a.title} ${a.path ?? ''} ${a.sha ?? ''} ${a.note ?? ''}`.toLowerCase().includes(query.toLowerCase()))));
  const totals = $derived(items.reduce((t, a) => ({ calls: t.calls + (a.kind === 'step' ? 0 : 1), tokens: t.tokens + (a.promptTokens ?? 0) + (a.replyTokens ?? 0), ms: t.ms + (a.kind === 'step' ? 0 : a.tookMs) }), { calls: 0, tokens: 0, ms: 0 }));
  const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

  // The prompt split into its "## " sections, so each part can be read on its own.
  const sections = $derived.by(() => {
    const text = picked?.user ?? '';
    const out: { title: string; body: string }[] = [];
    for (const part of text.split(/\n(?=## )/)) {
      const nl = part.indexOf('\n');
      if (part.startsWith('## ') && nl > 0) out.push({ title: part.slice(3, nl), body: part.slice(nl + 1) });
      else if (part.trim()) out.push({ title: 'Prompt', body: part });
    }
    return out;
  });
  const pretty = $derived.by(() => {
    const r = picked?.response ?? '';
    try { return JSON.stringify(JSON.parse(r), null, 2); } catch { return r; }
  });
  function goCommit(sha: string) { void showCommit(sha); }
  function goFile(p: string) { void openFile(p, null); }
  function goIncident(id: string) { app.mode = 'incidents'; void openIncident(id); }

  // The picked call opens in focus; Esc or a click outside closes it.
  const close = () => { picked = null; pickedId = null; };
  let showLog = $state(false);
  let filter = $state<'all' | 'ai' | 'running' | 'failed'>('all');
  $effect(() => { aiOnly = filter === 'ai'; status = filter === 'running' ? 'running' : filter === 'failed' ? 'failed' : ''; });
  let respTok = $state<Line[]>([]);
  $effect(() => { const t = pretty, th = app.theme; respTok = plain(t); void tokenize(t, t.trim().startsWith('{') ? 'json' : null, th).then((x) => { if (t === pretty) respTok = x; }); });
  let openSec = $state<Record<number, boolean>>({});
  $effect(() => { void picked?.id; openSec = {}; });
  const ease = { easing: cubicOut };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && picked && close()} />

<div class="apage">
  <header class="head">
    <div>
      <h1>Activity</h1>
      <p>{totals.calls} AI calls · {totals.tokens.toLocaleString()} tokens · {secs(totals.ms)} of model time</p>
    </div>
    <input class="search" bind:value={query} placeholder="Search title, file, commit…" spellcheck="false" />
  </header>

  <section class="lanes" aria-label="Work lanes">
    {#each lanes as l (l.name)}
      <div class="lane" class:busy={!!l.running}>
        <div class="lh">
          {#if l.running}<Orb mood="reading" size={34} label="{l.name} working" />{:else}<span class="idle-dot"></span>{/if}
          <div><b>{l.name}</b><span>{l.running ? `working · ${since(l.since)}` : l.count ? `${l.count} waiting` : 'Idle'}</span></div>
        </div>
        {#if l.running}<button class="run" onclick={() => goCommit(l.running!)} title={msgOf(l.running)}><span class="mono">{l.running.slice(0, 7)}</span> {msgOf(l.running) || 'working'}</button>{/if}
        {#if l.waiting.length}<div class="q"><span>Next</span>{#each l.waiting.slice(0, 4) as w (w)}<button class="pill mono" title={msgOf(w)} onclick={() => goCommit(w)}>{w.slice(0, 7)}</button>{/each}{#if l.count > 4}<span>+{l.count - 4}</span>{/if}</div>{/if}
        {#if l.finished.length}<div class="q"><span>Done</span>{#each l.finished.slice(0, 3) as f (f.sha + f.at)}<button class="pill mono" title={msgOf(f.sha)} onclick={() => goCommit(f.sha)}>{f.sha.slice(0, 7)} · {secs(f.tookMs)}</button>{/each}</div>{/if}
      </div>
    {:else}<p class="empty">Loading lanes…</p>{/each}
  </section>

  <div class="chips">
    {#each [['all', 'Everything'], ['ai', 'AI calls'], ['running', 'Running'], ['failed', 'Failed']] as [v, l]}
      <button class="fchip" class:on={filter === v} onclick={() => (filter = v as typeof filter)}>{l}</button>
    {/each}
    {#if kinds.length > 1}
      <select class="kind" bind:value={kind} aria-label="Kind"><option value="">All kinds</option>{#each kinds as k}<option value={k}>{k}</option>{/each}</select>
    {/if}
  </div>

  <div class="list">
    {#each shown as a (a.id)}
      <button class="row {a.status}" onclick={() => pick(a.id)}>
        <span class="dot"></span>
        <span class="t">{a.title}</span>
        <span class="meta">
          <span class="kindtag">{a.kind}</span>
          {#if a.path}<span class="mono">{a.path.slice(a.path.lastIndexOf('/') + 1)}</span>{/if}
          {#if a.sha}<span class="mono">{a.sha.slice(0, 7)}</span>{/if}
          {#if a.promptTokens}<span>{((a.promptTokens ?? 0) + (a.replyTokens ?? 0)).toLocaleString()} tok</span>{/if}
          {#if a.tookMs}<span>{secs(a.tookMs)}</span>{/if}
          <span>{ago(a.at)}</span>
        </span>
      </button>
    {:else}<p class="empty">{failed || 'Nothing yet. Reviews, fixes and questions show up here as they happen.'}</p>{/each}
  </div>

  <section class="log" class:open={showLog}>
    <button class="loghead" onclick={() => (showLog = !showLog)} aria-expanded={showLog}>
      <b>Live log</b><span>{shownLogs.length} lines</span>
      <span class="last mono">{shownLogs.at(-1) ? `${clock(shownLogs.at(-1)!.at)} ${shownLogs.at(-1)!.msg}` : ''}</span>
      <span class="chev">{showLog ? '▾' : '▸'}</span>
    </button>
    {#if showLog}
      <div class="logtools">
        <select bind:value={level} aria-label="Lowest level shown"><option value="debug">Debug and up</option><option value="info">Info and up</option><option value="warn">Warnings and errors</option><option value="error">Errors only</option></select>
        <label><input type="checkbox" bind:checked={follow} /> Follow</label>
        <CopyButton text={shownLogs.map((e) => `${clock(e.at)} ${e.level.toUpperCase()} ${e.msg} ${attrsText(e)}`).join('\n')} label="Copy" />
      </div>
      <div class="lines" bind:this={logEl}>
        {#each shownLogs as e (e.seq)}
          <div class="ll {e.level}"><span class="tm mono">{clock(e.at)}</span><span class="lv">{e.level}</span><span class="m">{e.msg}</span><span class="at mono">{attrsText(e)}</span></div>
        {:else}<div class="empty">No log lines yet.</div>{/each}
      </div>
    {/if}
  </section>
</div>

{#if picked}
  {@const p = picked}
  <div class="scrim" transition:fade={{ duration: 240, ...ease }} onclick={close} role="presentation"></div>
  <div class="stage" role="dialog" aria-modal="true" aria-label={p.title}>
    <header class="ftitle" transition:fly={{ y: -16, duration: 300, ...ease }}>
      <span class="st {p.status}">{p.status}</span><span class="k">{p.kind}</span>
      <h2>{p.title}</h2>
      <button class="x" aria-label="Close" onclick={close}>×</button>
    </header>
    <section class="center" transition:scale={{ start: 0.95, opacity: 0, duration: 300, ...ease }}>
      {#if p.kind === 'step'}
        <p class="empty">This step ran without the AI, so there is no prompt or answer.</p>
      {:else if p.status === 'running'}
        <div class="working"><Orb mood="writing" size={110} label="Working" /><p>The AI is still writing…</p></div>
      {:else}
        <div class="ch"><h3>What the AI answered</h3><CopyButton text={pretty} label="Copy" /></div>
        <div class="code mono">{#each respTok as line, i (i)}<div class="cl">{#each line as t}<span style:color={t.color}>{t.content}</span>{/each}{' '}</div>{/each}</div>
      {/if}
    </section>
    <aside class="left" in:fly={{ x: -28, duration: 340, delay: 100, ...ease }} out:fly={{ x: -20, duration: 200 }}>
      <div class="note">
        <div class="ch"><h3>What it was given · {sections.length} parts</h3><CopyButton text={p.user ?? ''} title="Copy the whole prompt" /></div>
        <ul class="secs">
          {#each sections as sec, i}
            <li>
              <button onclick={() => (openSec = { ...openSec, [i]: !openSec[i] })}><span>{openSec[i] ? '▾' : '▸'} {sec.title}</span><small>{sec.body.length.toLocaleString()} chars</small></button>
              {#if openSec[i]}<pre>{sec.body}</pre>{/if}
            </li>
          {/each}
          {#if p.system}<li><button onclick={() => (openSec = { ...openSec, [-1]: !openSec[-1] })}><span>{openSec[-1] ? '▾' : '▸'} Standing instructions</span><small>{p.system.length.toLocaleString()} chars</small></button>{#if openSec[-1]}<pre>{p.system}</pre>{/if}</li>{/if}
        </ul>
      </div>
    </aside>
    <aside class="right" in:fly={{ x: 28, duration: 340, delay: 140, ...ease }} out:fly={{ x: 20, duration: 200 }}>
      <div class="note">
        <h3>The call</h3>
        <dl>
          {#if p.model}<dt>Model</dt><dd class="mono">{p.model}</dd>{/if}
          {#if p.tookMs}<dt>Took</dt><dd>{secs(p.tookMs)}</dd>{/if}
          {#if p.promptTokens}<dt>Tokens</dt><dd>{p.promptTokens} in · {p.replyTokens} out</dd>{/if}
          <dt>When</dt><dd>{new Date(p.at).toLocaleString()}</dd>
        </dl>
      </div>
      {#if p.sha || p.path || p.incident || p.knowledge?.length}
        <div class="note">
          <h3>About</h3>
          <div class="links">
            {#if p.sha}<button class="b3" onclick={() => { close(); goCommit(p.sha!); }}>Commit {p.sha.slice(0, 7)}</button>{/if}
            {#if p.path}<button class="b3" onclick={() => goFile(p.path!)}>{p.path.slice(p.path.lastIndexOf('/') + 1)}</button>{/if}
            {#if p.incident}<button class="b3" onclick={() => { close(); goIncident(p.incident!); }}>The incident</button>{/if}
          </div>
          {#each p.knowledge ?? [] as k}<span class="kn mono">{k}</span>{/each}
        </div>
      {/if}
      {#if p.note}<div class="note"><h3>Note</h3><p>{p.note}</p></div>{/if}
      {#if p.error}<div class="note err"><h3>Error</h3><p>{p.error}</p><CopyButton text={p.error} title="Copy the error" /></div>{/if}
    </aside>
  </div>
{/if}

<style>
  .apage { flex: 1; min-height: 0; overflow: auto; padding: 28px clamp(16px, 4vw, 56px) 40px; max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box; }
  .head { display: flex; align-items: flex-end; gap: 16px; margin-bottom: 18px; }
  .head h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
  .head p { margin: 4px 0 0; color: var(--text-3); font-size: 12.5px; }
  .search { margin-left: auto; width: 300px; max-width: 45vw; height: 34px; padding: 0 14px; border-radius: 11px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13px; box-shadow: var(--elev-1); }
  .search:focus { outline: none; border-color: var(--accent); }
  .lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .lane { padding: 14px 16px; border-radius: 14px; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-1); display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .lane.busy { border-color: rgba(139, 124, 246, 0.45); box-shadow: var(--elev-1), var(--glow-soft); }
  .lh { display: flex; align-items: center; gap: 12px; }
  .lh div { display: flex; flex-direction: column; } .lh b { font-size: 13.5px; } .lh span { font-size: 12px; color: var(--text-3); }
  .idle-dot { width: 10px; height: 10px; margin: 0 12px; border-radius: 50%; background: var(--surface-3); }
  .run { border: 0; background: none; padding: 0; text-align: left; font-size: 12.5px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .q { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 11.5px; color: var(--text-3); }
  .pill { border: 1px solid var(--border); background: var(--surface-2); border-radius: 99px; padding: 1px 8px; font-size: 11px; color: var(--text-2); }
  .chips { display: flex; gap: 6px; align-items: center; margin: 0 0 12px; flex-wrap: wrap; }
  .fchip { height: 30px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--border); background: none; font: 12.5px var(--font); color: var(--text-2); }
  .fchip.on { color: var(--text); background: var(--surface-3); border-color: var(--border-strong); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4); }
  .kind { height: 30px; border-radius: 99px; border: 1px solid var(--border); background: var(--surface); color: var(--text-2); padding: 0 10px; font: 12.5px var(--font); }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .row { --c: var(--good); display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--glass); box-shadow: var(--elev-1); text-align: left; transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
  .row:hover { transform: translateY(-1px); border-color: var(--border-strong); box-shadow: var(--elev-2); }
  .row.running { --c: var(--accent); } .row.failed { --c: var(--bad); } .row.cancelled { --c: var(--text-3); }
  .row .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 8px var(--c); flex-shrink: 0; }
  .row.running .dot { animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .row .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .row .meta { display: flex; gap: 10px; flex-shrink: 0; font-size: 11.5px; color: var(--text-3); }
  .kindtag { padding: 0 7px; border-radius: 99px; background: var(--surface-3); color: var(--text-2); }
  .empty { color: var(--text-3); padding: 20px 0; text-align: center; }
  .log { margin-top: 22px; border-radius: 14px; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-1); overflow: hidden; }
  .loghead { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 16px; border: 0; background: none; text-align: left; font-size: 12.5px; color: var(--text-2); }
  .loghead b { color: var(--text); font-size: 13px; }
  .last { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-3); font-size: 11.5px; }
  .chev { color: var(--text-3); }
  .logtools { display: flex; gap: 12px; align-items: center; padding: 0 16px 8px; font-size: 12px; color: var(--text-2); }
  .logtools select { height: 28px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); padding: 0 8px; font: 12px var(--font); }
  .lines { max-height: 320px; overflow: auto; padding: 4px 16px 12px; font-size: 11.5px; background: var(--code-bg); }
  .ll { display: grid; grid-template-columns: 70px 48px auto 1fr; gap: 10px; padding: 1px 0; }
  .ll .tm, .ll .at { color: var(--text-3); } .ll .lv { text-transform: uppercase; color: var(--text-3); font-size: 10.5px; }
  .ll.warn .lv { color: var(--warn); } .ll.error .lv, .ll.error .m { color: var(--bad); }
  .ll .at { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* The focus view of one call. */
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(6, 6, 10, 0.82); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.75); }
  .stage { position: fixed; inset: 0; z-index: 61; pointer-events: none; display: grid; overflow: auto;
    grid-template-columns: minmax(220px, 320px) minmax(0, 720px) minmax(200px, 280px); grid-template-rows: auto auto;
    justify-content: center; align-content: center; gap: 22px 40px; padding: 28px; }
  .stage > * { pointer-events: auto; }
  .ftitle { grid-column: 1 / -1; justify-self: center; position: relative; max-width: 900px; padding: 14px 44px 14px 18px; border-radius: 16px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), var(--glow-soft); }
  .ftitle h2 { margin: 8px 0 0; font-size: 18px; font-weight: 600; }
  .st { padding: 2px 9px; border-radius: 99px; font-size: 11.5px; font-weight: 600; color: #fff; background: var(--good); }
  .st.running { background: var(--accent); } .st.failed { background: var(--bad); } .st.cancelled { background: var(--surface-3); }
  .k { margin-left: 8px; font-size: 12px; color: var(--text-3); }
  .x { position: absolute; top: 10px; right: 12px; border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); }
  .center { grid-column: 2; grid-row: 2; align-self: center; min-width: 0; padding: 12px; border-radius: 16px; background: var(--glass-strong); border: 1px solid rgba(139, 124, 246, 0.35); box-shadow: var(--elev-2), 0 0 90px -24px rgba(139, 124, 246, 0.5); }
  .ch { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
  h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .code { max-height: 62vh; overflow: auto; padding: 8px 0; border-radius: 10px; background: var(--code-bg); border: 1px solid var(--border); font-size: 12px; line-height: 1.6; }
  .cl { white-space: pre-wrap; overflow-wrap: anywhere; padding: 0 14px; }
  .working { display: flex; flex-direction: column; align-items: center; padding: 30px; color: var(--text-2); }
  .left { grid-column: 1; grid-row: 2; align-self: center; } .right { grid-column: 3; grid-row: 2; align-self: center; display: flex; flex-direction: column; gap: 14px; }
  .note { padding: 14px 16px; border-radius: 14px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-2), 0 0 40px -18px rgba(139, 124, 246, 0.35); }
  .note p { margin: 6px 0 0; font-size: 12.5px; color: var(--text-2); }
  .note.err { border-color: color-mix(in srgb, var(--bad) 45%, var(--border)); }
  .secs { list-style: none; margin: 0; padding: 0; max-height: 52vh; overflow: auto; }
  .secs li { border-top: 1px solid var(--border); }
  .secs button { display: flex; justify-content: space-between; width: 100%; gap: 8px; padding: 7px 0; border: 0; background: none; text-align: left; font-size: 12.5px; color: var(--text); }
  .secs small { color: var(--text-3); white-space: nowrap; }
  .secs pre { margin: 0 0 8px; max-height: 220px; overflow: auto; padding: 8px 10px; border-radius: 8px; background: var(--code-bg); font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-2); }
  dl { display: grid; grid-template-columns: 64px 1fr; gap: 5px 10px; margin: 8px 0 0; font-size: 12.5px; }
  dt { color: var(--text-3); } dd { margin: 0; color: var(--text-2); word-break: break-word; }
  .links { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; } .links .b3 { justify-content: center; }
  .kn { display: inline-block; margin: 6px 4px 0 0; font-size: 11px; color: var(--text-3); }
  @media (max-width: 1150px) { .stage { grid-template-columns: minmax(0, 1fr); align-content: start; } .center, .left, .right { grid-column: 1; grid-row: auto; } }
  @media (prefers-reduced-motion: reduce) { .row.running .dot { animation: none; } }

  /* Long words (a full method chain, a path) wrap inside the card instead of running over the code. */
  .note, .note p, .note li, .wside .note, .ftitle h2, .title h2 { overflow-wrap: anywhere; min-width: 0; }
  .left, .right { min-width: 0; }
</style>
