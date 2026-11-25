<script lang="ts">
  // The pulse of the repository: the latest events (commits, issues found, fixes, the AI's reads) orbit a small orb
  // on two slow rings, the newest on the inner one. The rings are tilted, so events pass behind and in front of the orb.
  // A click opens the event.
  import { onMount } from 'svelte';
  import { app, selectCommit } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import { ago } from '../lib/theme';
  import Orb from './Orb.svelte';

  type Ev = { key: string; kind: 'commit' | 'issue' | 'fix' | 'ai'; label: string; at: number; open: () => void };
  const short = (s: string, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const events = $derived.by(() => {
    const out: Ev[] = [];
    for (const c of app.commits.slice(0, 6)) out.push({ key: 'c' + c.commit.sha, kind: 'commit', label: short(c.commit.message), at: c.commit.time,
      open: () => { void selectCommit(c.commit.sha, true); app.mode = 'commits'; app.commitStage = true; } });
    const issues = app.issueList?.issues ?? [];
    for (const i of [...issues].filter((i) => i.state === 'open').sort((a, b) => b.firstTime - a.firstTime).slice(0, 5))
      out.push({ key: 'i' + i.id, kind: 'issue', label: short(i.title), at: i.firstTime, open: () => (app.focus = [i]) });
    for (const i of issues.filter((i) => i.state === 'resolved' && i.fixedAt).sort((a, b) => (b.fixedAt ?? 0) - (a.fixedAt ?? 0)).slice(0, 3))
      out.push({ key: 'f' + i.id, kind: 'fix', label: short(i.title), at: i.fixedAt ?? 0, open: () => (app.focus = [i]) });
    for (const a of live.recent.slice(0, 4)) out.push({ key: 'a' + a.id, kind: 'ai', label: short(a.title || 'AI call'), at: a.at, open: () => (app.mode = 'activity') });
    return out.sort((a, b) => b.at - a.at).slice(0, 12);
  });

  let w = $state(900);
  let t = $state(0);
  onMount(() => {
    const slow = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, t0 = performance.now();
    const tick = (now: number) => { t = slow ? 0 : (now - t0) / 1000; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  const H = 300;
  // Where each event is now: inner ring for the newest four, outer ring for the rest, each ring turning slowly.
  const placed = $derived(events.map((e, i) => {
    const inner = i < 4, k = inner ? i : i - 4, n = inner ? Math.min(4, events.length) : Math.max(1, events.length - 4);
    const a = (k / n) * Math.PI * 2 + t * (inner ? 0.05 : -0.032) + (inner ? 0.4 : 0);
    const rx = (inner ? 0.24 : 0.36) * w, ry = inner ? 72 : 112;
    const depth = Math.sin(a); // -1 behind the orb, 1 in front
    // Kept inside the panel, so a chip near the side is never cut off.
    return { e, x: Math.max(140, Math.min(w - 140, w / 2 + Math.cos(a) * rx)), y: H / 2 + depth * ry, depth };
  }));
  const ICON: Record<Ev['kind'], string> = { commit: '◆', issue: '●', fix: '✓', ai: '◇' };
</script>

<section class="pulse" bind:clientWidth={w} aria-label="Latest events">
  <svg class="rings" width={w} height={H} aria-hidden="true">
    <ellipse cx={w / 2} cy={H / 2} rx={0.24 * w} ry="72" /><ellipse cx={w / 2} cy={H / 2} rx={0.36 * w} ry="112" />
  </svg>
  {#each placed.filter((p) => p.depth < 0) as p (p.e.key)}
    <button class="ev {p.e.kind}" style:left="{p.x}px" style:top="{p.y}px" style:opacity={0.35 + 0.65 * (1 + p.depth) / 2} style:scale={0.82 + 0.18 * (1 + p.depth) / 2} onclick={p.e.open} title="{p.e.label} · {ago(p.e.at)}"><i>{ICON[p.e.kind]}</i>{p.e.label}</button>
  {/each}
  <div class="core"><Orb mood={live.mood} size={64} label={live.sentence} /><span>{live.sentence}</span></div>
  {#each placed.filter((p) => p.depth >= 0) as p (p.e.key)}
    <button class="ev front {p.e.kind}" style:left="{p.x}px" style:top="{p.y}px" style:opacity={0.75 + 0.25 * p.depth} style:scale={0.92 + 0.12 * p.depth} onclick={p.e.open} title="{p.e.label} · {ago(p.e.at)}"><i>{ICON[p.e.kind]}</i>{p.e.label}<small>{ago(p.e.at)}</small></button>
  {/each}
  <div class="key"><span class="commit">◆ commit</span><span class="issue">● issue found</span><span class="fix">✓ fixed</span><span class="ai">◇ AI read</span></div>
</section>

<style>
  .pulse { position: relative; height: 300px; margin: 0 0 8px; border-radius: 22px; overflow: hidden; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-1); }
  .pulse::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 12%, transparent), transparent 60%); pointer-events: none; }
  :global([data-theme='light']) .pulse::before { display: none; }
  .rings { position: absolute; inset: 0; pointer-events: none; }
  .rings ellipse { fill: none; stroke: var(--border-strong); stroke-dasharray: 3 6; }
  .core { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 2; pointer-events: none; }
  .core span { font-size: 11.5px; color: var(--text-3); white-space: nowrap; }
  .ev { --c: var(--accent); position: absolute; z-index: 1; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 6px; max-width: 250px; height: 26px; overflow: hidden; text-overflow: ellipsis; padding: 0 11px;
    border-radius: 99px; border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border)); background: var(--glass-strong); color: var(--text-2); font-size: 11.5px; white-space: nowrap; box-shadow: var(--elev-1); }
  .ev.front { z-index: 3; color: var(--text); }
  .ev:hover { border-color: var(--c); color: var(--text); z-index: 4; }
  .ev i { font-style: normal; color: var(--c); font-size: 10px; }
  .ev small { color: var(--text-3); font-size: 10.5px; }
  .commit { --c: var(--accent); } .issue { --c: var(--sev-high); } .fix { --c: var(--good); } .ai { --c: #7dd3fc; }
  .key { position: absolute; right: 14px; bottom: 10px; display: flex; gap: 12px; font-size: 11px; color: var(--text-3); z-index: 3; }
  .key span { color: var(--text-3); } .key .commit { color: var(--accent-text); } .key .issue { color: var(--sev-high); } .key .fix { color: var(--good); } .key .ai { color: #7dd3fc; }
</style>
