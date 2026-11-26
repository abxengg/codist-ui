<script lang="ts">
  // Chat with the AI about this codebase. Codist picks the classes a question is about and gives the local model their
  // code, the services and the open issues; the answer names the files it used, and each one opens at its line. The
  // conversation lives in lib/chat.svelte.ts, so it keeps going when you leave the page.
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { tick } from 'svelte';
  import { app, openFile } from '../lib/store.svelte';
  import { chat } from '../lib/chat.svelte';
  import { live } from '../lib/live.svelte';
  import Orb from './Orb.svelte';

  $effect(() => { void app.status?.repo; chat.sync(); });
  const msgs = $derived(chat.msgs);
  const busy = $derived(chat.busy);

  let text = $state('');
  let list = $state<HTMLDivElement>();
  let input = $state<HTMLTextAreaElement>();
  const offline = $derived(!!app.status?.llmProblem);
  // While another job holds the model (a review, an incident), the answer waits for it; say which.
  const waitingFor = $derived(live.call?.status === 'running' && live.call.kind !== 'chat' ? live.sentence.charAt(0).toLowerCase() + live.sentence.slice(1) : '');

  async function send(q = text) {
    if (!q.trim() || busy) return;
    text = '';
    const run = chat.send(q, app.fileShown ? app.file?.path ?? null : null);
    await scroll();
    await run;
    await scroll();
    input?.focus();
  }
  async function scroll() { await tick(); list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); }
  function keydown(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }
  function clear() { chat.clear(); }

  // Questions to start with, made from this repository: its services, its busiest class and its open issues.
  const starters = $derived.by(() => {
    const g = app.graph, out: string[] = [];
    const mods = [...new Set((g?.nodes ?? []).map((n) => n.module).filter(Boolean))] as string[];
    if (mods.length > 1) out.push(`How do ${mods[0]} and ${mods[1]} talk to each other?`);
    const deg = new Map<string, number>();
    for (const e of g?.edges ?? []) { deg.set(e.source, (deg.get(e.source) ?? 0) + 1); deg.set(e.target, (deg.get(e.target) ?? 0) + 1); }
    const hub = (g?.nodes ?? []).filter((n) => n.stereotype !== 'test').sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))[0];
    if (hub) out.push(`What does ${hub.name} do, and who depends on it?`);
    const ctl = (g?.nodes ?? []).find((n) => n.stereotype === 'controller' && n.endpoints.length > 2);
    if (ctl) out.push(`Walk me through the endpoints in ${ctl.name}.`);
    if ((app.issueList?.issues ?? []).some((i) => i.state === 'open')) out.push('Which open issue should I fix first, and why?');
    out.push('Where would I add a new endpoint for refunds?');
    return out.slice(0, 5);
  });

  // A small, safe markdown: everything is escaped first, then code blocks, inline code, bold, headings and lists.
  // File references like Foo.java:42 become links that open the file at that line.
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function md(src: string) {
    const blocks: string[] = [];
    let s = esc(src).replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_, code) => { blocks.push(`<pre class="cb"><code>${code.replace(/\n$/, '')}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    s = s.replace(/([\w/.-]+\.(?:java|kt|xml|yml|yaml|properties|gradle)):(\d+)/g, '<a class="ref" data-file="$1" data-line="$2">$1:$2</a>');
    const out: string[] = [];
    let list: string[] | null = null;
    for (const line of s.split('\n')) {
      const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (li) { (list ??= []).push(`<li>${li[1]}</li>`); continue; }
      if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
      const h = line.match(/^#{1,4}\s+(.*)$/);
      if (h) out.push(`<h4>${h[1]}</h4>`);
      else if (line.trim()) out.push(`<p>${line}</p>`);
    }
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
  }
  // A file reference in an answer may be a bare name; find the real path from the classes Codist knows.
  function openRef(file: string, line: number) {
    const nodes = app.graph?.nodes ?? [];
    const path = nodes.find((n) => n.file === file)?.file ?? nodes.find((n) => n.file.endsWith('/' + file))?.file ?? file;
    void openFile(path, null, line);
  }
  function clickAnswer(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest<HTMLElement>('a.ref');
    if (a) { e.preventDefault(); openRef(a.dataset.file!, Number(a.dataset.line)); }
  }
  const short = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  $effect(() => { void app.mode; if (app.mode === 'chat') requestAnimationFrame(() => { input?.focus(); list?.scrollTo({ top: list.scrollHeight }); }); });
</script>

<div class="chat">
  <header class="top">
    <div><h1>Chat</h1><p>Ask about {app.status?.repo ?? 'this codebase'}. The answers come from your local model and the code Codist has read.{#if app.status?.model}<span class="mdl mono">{app.status.model}</span>{/if}</p></div>
    {#if msgs.length}<button class="b3 ghost" onclick={clear}>New chat</button>{/if}
  </header>

  <div class="list" bind:this={list}>
    {#if !msgs.length}
      <div class="hello" in:fade={{ duration: 300 }}>
        <Orb mood={offline ? 'offline' : live.mood} size={120} label="Codist" />
        <h2>What do you want to know about the code?</h2>
        <p>Codist finds the classes your question is about and reads their code, the services and the open issues with you.</p>
        <div class="starters">{#each starters as s, i}<button class="starter" style:animation-delay="{i * 60}ms" onclick={() => send(s)}>{s}</button>{/each}</div>
      </div>
    {/if}
    {#each msgs as m, i (i)}
      {#if m.role === 'user'}
        <div class="row me" in:fly={{ y: 10, duration: 220, easing: cubicOut }}><div class="bubble">{m.content}</div></div>
      {:else}
        <div class="row ai" in:fly={{ y: 10, duration: 260, easing: cubicOut }}>
          <span class="who"><Orb mood={m.error ? 'offline' : 'idle'} size={26} label="Codist" /></span>
          <div class="answer" class:err={m.error}>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="md" onclick={clickAnswer}>{@html md(m.content)}</div>
            {#if m.sources?.length}
              <div class="srcs"><span class="ui-label">Sources</span>{#each m.sources as s}<button class="src mono" onclick={() => openFile(s.path, null, s.line)}>{short(s.path)}:{s.line}</button>{/each}</div>
            {/if}
            {#if m.looked?.length}
              <div class="looked">Read {#each m.looked as l, k}<button onclick={() => openFile(l.path, null, l.line)}>{l.name}</button>{k < m.looked.length - 1 ? ', ' : ''}{/each}{#if m.took} · {(m.took / 1000).toFixed(1)} s{/if}</div>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
    {#if busy}
      <div class="row ai" in:fade={{ duration: 200 }}>
        <span class="who"><Orb mood="reading" size={26} label="Thinking" /></span>
        <div class="answer thinking"><span class="dots"><i></i><i></i><i></i></span>{waitingFor ? `Waiting for the AI to finish: ${waitingFor}` : 'Reading the code'}…</div>
      </div>
    {/if}
  </div>

  <div class="composer">
    <div class="box" class:off={offline}>
      <textarea bind:this={input} bind:value={text} onkeydown={keydown} rows="1" placeholder={offline ? 'Chat needs the AI model, which is offline' : 'Ask about a class, a flow, an endpoint or an issue…'} disabled={offline}></textarea>
      <button class="send" onclick={() => send()} disabled={!text.trim() || busy || offline} aria-label="Send">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>
      </button>
    </div>
    <p class="hint"><kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line · the file you have open is read first</p>
  </div>
</div>

<style>
  .chat { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
  .chat::before { content: ''; position: absolute; left: 50%; top: 30%; width: 70%; height: 50%; transform: translate(-50%, -50%); pointer-events: none;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 10%, transparent), transparent); }
  :global([data-theme='light']) .chat::before { display: none; }
  .top { position: relative; display: flex; align-items: flex-end; gap: 16px; padding: 26px 32px 12px; max-width: 920px; width: 100%; margin: 0 auto; box-sizing: border-box; }
  .top div { flex: 1; }
  h1 { margin: 0; font-size: 30px; font-weight: 600; letter-spacing: -0.03em; }
  .top p { margin: 4px 0 0; font-size: 13px; color: var(--text-3); }
  .mdl { margin-left: 8px; padding: 1px 7px; border-radius: 99px; font-size: 11px; color: var(--accent-text); background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .list { position: relative; flex: 1; min-height: 0; overflow: auto; padding: 8px 32px 24px; }
  .list > * { max-width: 856px; margin-left: auto; margin-right: auto; }
  .hello { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 40px 0 10px; }
  .hello h2 { margin: 18px 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  .hello p { margin: 0 0 22px; font-size: 13.5px; color: var(--text-3); max-width: 52ch; line-height: 1.6; }
  .starters { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px; width: 100%; }
  .starter { padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--glass-strong); color: var(--text-2); font-size: 13px; text-align: left; line-height: 1.45;
    box-shadow: var(--elev-1); transition: transform 0.18s, border-color 0.18s, color 0.18s; animation: rise 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .starter:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); color: var(--text); }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  .row { display: flex; gap: 12px; margin-top: 16px; }
  .row.me { justify-content: flex-end; }
  .bubble { max-width: 75%; padding: 10px 14px; border-radius: 16px 16px 4px 16px; background: color-mix(in srgb, var(--accent) 16%, var(--glass-strong)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
    font-size: 14px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  /* The orb lines up with the first line of the answer: 12px padding plus half a 23px line, less half this 30px slot. */
  .who { flex-shrink: 0; width: 30px; height: 30px; display: grid; place-items: center; margin-top: 9px; }
  .answer { flex: 1; min-width: 0; padding: 12px 16px; border-radius: 4px 16px 16px 16px; background: var(--glass-strong); border: 1px solid var(--border); box-shadow: var(--elev-1); }
  .answer.err { border-color: color-mix(in srgb, var(--bad) 40%, var(--border)); color: var(--text-2); }
  .md { font-size: 14px; line-height: 1.65; color: var(--text); overflow-wrap: anywhere; }
  .md :global(p) { margin: 0 0 8px; } .md :global(p:last-child) { margin-bottom: 0; }
  .md :global(h4) { margin: 12px 0 6px; font-size: 13px; font-weight: 600; }
  .md :global(ul) { margin: 4px 0 8px; padding-left: 20px; } .md :global(li) { margin: 2px 0; }
  .md :global(code) { font: 12.5px var(--mono); padding: 1px 5px; border-radius: 5px; background: var(--surface-2); }
  .md :global(pre.cb) { margin: 8px 0; padding: 10px 12px; border-radius: 10px; background: var(--code-bg); border: 1px solid var(--border); overflow: auto; }
  .md :global(pre.cb code) { padding: 0; background: none; font-size: 12px; line-height: 1.55; white-space: pre; }
  .md :global(a.ref) { color: var(--accent-text); font: 12.5px var(--mono); cursor: pointer; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .srcs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); }
  .src { height: 22px; padding: 0 9px; border-radius: 99px; border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); background: none; color: var(--accent-text); font-size: 11px; }
  .src:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .looked { margin-top: 8px; font-size: 11.5px; color: var(--text-3); }
  .looked button { border: 0; background: none; padding: 0; color: var(--text-2); font-size: 11.5px; text-decoration: underline; text-decoration-color: var(--border-strong); }
  .thinking { display: flex; align-items: center; gap: 10px; min-height: 23px; font-size: 13px; color: var(--text-3); }
  .dots { display: inline-flex; gap: 4px; } .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: blink 1.2s ease-in-out infinite; }
  .dots i:nth-child(2) { animation-delay: 0.15s; } .dots i:nth-child(3) { animation-delay: 0.3s; }
  @keyframes blink { 50% { opacity: 0.25; transform: translateY(-2px); } }
  .composer { position: relative; padding: 10px 32px 18px; }
  .box { max-width: 856px; margin: 0 auto; display: flex; align-items: flex-end; gap: 8px; padding: 8px 8px 8px 16px; border-radius: 18px; background: var(--glass-strong);
    border: 1px solid var(--border); box-shadow: var(--elev-2), 0 0 50px -24px color-mix(in srgb, var(--accent) 60%, transparent); }
  .box:focus-within { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
  .box.off { opacity: 0.6; }
  textarea { flex: 1; min-height: 24px; max-height: 180px; padding: 6px 0; border: 0; background: none; color: var(--text); font: 14px/1.5 var(--font); resize: none; field-sizing: content; }
  textarea:focus { outline: none; }
  .send { flex-shrink: 0; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; border: 0; background: var(--accent); color: #fff; }
  .send:disabled { opacity: 0.35; }
  .hint { max-width: 856px; margin: 8px auto 0; font-size: 11px; color: var(--text-3); text-align: center; }
  .hint kbd { font: 10.5px var(--mono); padding: 0 4px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface-2); }
  @media (prefers-reduced-motion: reduce) { .starter, .dots i { animation: none; } }
</style>
