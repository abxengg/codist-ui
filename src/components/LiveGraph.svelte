<script lang="ts">
  // The code as a graph in the manner of Obsidian's graph view: flat dots sized by their links, thin lines, physics
  // you can push around. Hover a class and it and its neighbours light up while the rest fade; labels fade in as you
  // zoom. Classes of one service are drawn together. A class with open issues is marked; the file the AI is reading
  // right now is ringed. Forces can be tuned the way Obsidian lets you, and are remembered.
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import { groups } from '../lib/groups';
  import { STEREOTYPE } from '../lib/theme';
  import IssueCard from './IssueCard.svelte';
  import type { GraphNode, Issue } from '../lib/types';

  type N = { id: string; g: GraphNode; x: number; y: number; vx: number; vy: number; r: number; m: number; deg: number; issues: number; worst: string; pinned: boolean; label: string };
  type E = { a: N; b: N; same: boolean };

  // Forces, as Obsidian names them. Saved per browser.
  const DEFAULTS = { center: 0.5, repel: 0.6, link: 0.5, distance: 0.45, group: true, size: 1, text: 0.55, tests: false, drift: true };
  let f = $state({ ...DEFAULTS, ...load() });
  function load() { try { return JSON.parse(localStorage.getItem('codist.mapForces') ?? '{}'); } catch { return {}; } }
  $effect(() => { const v = JSON.stringify(f); try { localStorage.setItem('codist.mapForces', v); } catch { /* storage blocked */ } });

  let wrap: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let query = $state('');
  let picked = $state<N | null>(null);
  let hover = $state<N | null>(null);
  let panel = $state(false);
  let count = $state({ classes: 0, services: 0, links: 0 });

  let nodes: N[] = [];
  let edges: E[] = [];
  let mods: string[] = [];
  let byId = new Map<string, N>();
  let byFile = new Map<string, N>();
  let adj = new Map<N, Set<N>>();
  const cam = { x: 0, y: 0, k: 1 };
  let heat = 1;
  let follow = 0;

  const openByFile = $derived.by(() => {
    const m = new Map<string, Issue[][]>();
    for (const g of groups(app.issueList?.issues ?? [])) for (const p of new Set(g.map((i) => i.path))) m.set(p, [...(m.get(p) ?? []), g]);
    return m;
  });
  const pickedIssues = $derived(picked ? openByFile.get(picked.g.file) ?? [] : []);
  const ORDER = ['critical', 'high', 'medium', 'low', 'info'];

  function build() {
    const gr = app.graph;
    if (!gr) return;
    const old = new Map(nodes.map((n) => [n.id, n]));
    const keep = gr.nodes.filter((n) => f.tests || n.stereotype !== 'test');
    const modOf = (g: GraphNode) => g.module || g.pkg.split('.').slice(0, 3).join('.') || 'code';
    mods = [...new Set(keep.map(modOf))];
    const deg = new Map<string, number>();
    for (const e of gr.edges) { deg.set(e.source, (deg.get(e.source) ?? 0) + 1); deg.set(e.target, (deg.get(e.target) ?? 0) + 1); }
    nodes = keep.map((g) => {
      const was = old.get(g.id);
      const m = mods.indexOf(modOf(g));
      const a = (m / Math.max(1, mods.length)) * Math.PI * 2;
      const d = deg.get(g.id) ?? 0;
      return { id: g.id, g, x: was?.x ?? Math.cos(a) * 300 + (Math.random() - 0.5) * 200, y: was?.y ?? Math.sin(a) * 300 + (Math.random() - 0.5) * 200,
        vx: 0, vy: 0, r: 2.6 + Math.sqrt(d) * 1.3, m, deg: d, issues: 0, worst: '', pinned: false, label: g.name };
    });
    byId = new Map(nodes.map((n) => [n.id, n]));
    byFile = new Map(nodes.map((n) => [n.g.file, n]));
    edges = gr.edges.filter((e) => byId.has(e.source) && byId.has(e.target) && e.source !== e.target)
      .map((e) => ({ a: byId.get(e.source)!, b: byId.get(e.target)!, same: byId.get(e.source)!.m === byId.get(e.target)!.m }));
    adj = new Map(nodes.map((n) => [n, new Set<N>()]));
    for (const e of edges) { adj.get(e.a)!.add(e.b); adj.get(e.b)!.add(e.a); }
    count = { classes: nodes.length, services: mods.length, links: edges.length };
    paintIssues();
    heat = 1;
  }
  function paintIssues() {
    for (const n of nodes) {
      const list = openByFile.get(n.g.file) ?? [];
      n.issues = list.length;
      n.worst = list.map((g) => g[0].severity).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] ?? '';
    }
  }
  $effect(() => { void app.graph; void f.tests; build(); });
  $effect(() => { void openByFile; paintIssues(); });
  $effect(() => { void f.center; void f.repel; void f.link; void f.distance; void f.group; heat = 1; });

  // One step of the simulation: repulsion between nearby dots (through a grid), springs along links, a pull to the
  // middle and, when grouping is on, a pull to the middle of each service.
  function step(dt: number, t: number) {
    const repel = 400 + f.repel * 5200, rest = 20 + f.distance * 160, spring = 0.1 + f.link * 3, gravity = 0.004 + f.center * 0.08;
    const cell = Math.max(60, Math.sqrt(repel) * 1.6);
    const grid = new Map<number, N[]>();
    const key = (i: number, j: number) => i * 100003 + j;
    for (const n of nodes) {
      const k = key(Math.floor(n.x / cell), Math.floor(n.y / cell));
      const b = grid.get(k); b ? b.push(n) : grid.set(k, [n]);
    }
    for (const n of nodes) {
      const cx = Math.floor(n.x / cell), cy = Math.floor(n.y / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const b = grid.get(key(cx + i, cy + j));
        if (!b) continue;
        for (const o of b) {
          if (o === n) continue;
          let dx = n.x - o.x, dy = n.y - o.y, d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
          if (d2 > cell * cell) continue;
          const p = (repel / d2) * dt;
          n.vx += dx * p; n.vy += dy * p;
        }
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 1;
      // As in d3: a link pulls less the more links its ends have, so a class everything uses does not knot the graph.
      const share = 1 / Math.max(1, Math.min(e.a.deg, e.b.deg));
      const k = ((d - (e.same ? rest : rest * 1.8)) / d) * spring * share * (e.same ? 1.6 : 0.3) * dt;
      e.a.vx += dx * k; e.a.vy += dy * k; e.b.vx -= dx * k; e.b.vy -= dy * k;
    }
    // Service centres, recomputed each step, and the pull towards them.
    const cs = mods.map(() => ({ x: 0, y: 0, n: 0 }));
    for (const n of nodes) { const c = cs[n.m]; c.x += n.x; c.y += n.y; c.n++; }
    for (const c of cs) if (c.n) { c.x /= c.n; c.y /= c.n; }
    // Services keep apart: two whose areas overlap are pushed away from each other, every class with its service.
    const push = cs.map(() => ({ x: 0, y: 0 }));
    if (f.group) for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      if (!a.n || !b.n) continue;
      const ra = Math.sqrt(a.n) * (14 + rest * 0.25), rb = Math.sqrt(b.n) * (14 + rest * 0.25);
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1, want = ra + rb + 40;
      if (d >= want) continue;
      const p = (want - d) * 0.5;
      push[i].x += (dx / d) * p; push[i].y += (dy / d) * p; push[j].x -= (dx / d) * p; push[j].y -= (dy / d) * p;
    }
    for (const n of nodes) {
      n.vx -= n.x * gravity * dt; n.vy -= n.y * gravity * dt;
      if (f.group && mods.length > 1) { const c = cs[n.m], p = push[n.m]; n.vx += ((c.x - n.x) * 0.5 + p.x) * dt; n.vy += ((c.y - n.y) * 0.5 + p.y) * dt; }
      if (f.drift) { n.vx += Math.sin(t * 0.4 + n.r * 7 + n.x * 0.01) * 0.8 * dt; n.vy += Math.cos(t * 0.37 + n.r * 5 + n.y * 0.01) * 0.8 * dt; }
      if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += n.vx * dt * 10 * heat; n.y += n.vy * dt * 10 * heat;
    }
    heat = Math.max(0.3, heat * 0.996);
  }

  function frameAll() {
    if (!nodes.length || !wrap) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of nodes) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
    const w = Math.max(200, x1 - x0 + 140), h = Math.max(200, y1 - y0 + 220); // room for the service names above
    return { x: -(x0 + x1) / 2, y: -(y0 + y1) / 2, k: Math.min(2.2, Math.min(wrap.clientWidth / w, wrap.clientHeight / h)) };
  }
  function fit(snap = false) {
    const t = frameAll();
    if (t && snap) Object.assign(cam, t);
    follow = snap ? 4 : 1.6;
  }

  onMount(() => {
    const ctx = canvas!.getContext('2d')!;
    let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); W = wrap!.clientWidth; H = wrap!.clientHeight; canvas!.width = W * dpr; canvas!.height = H * dpr; };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap!);
    for (let i = 0; i < (nodes.length > 300 ? 400 : 220); i++) { heat = 1; step(0.05, i * 0.05); }
    fit(true);

    const toWorld = (sx: number, sy: number) => ({ x: (sx - W / 2) / cam.k - cam.x, y: (sy - H / 2) / cam.k - cam.y });
    const hit = (sx: number, sy: number) => {
      const p = toWorld(sx, sy);
      let best: N | null = null, bd = Infinity;
      for (const n of nodes) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < n.r * f.size + 5 / cam.k && d < bd) { best = n; bd = d; } }
      return best;
    };
    let drag: { n: N | null; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
    canvas!.addEventListener('pointerdown', (e) => {
      canvas!.setPointerCapture(e.pointerId);
      const n = hit(e.offsetX, e.offsetY);
      drag = { n, sx: e.offsetX, sy: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
      follow = 0;
      if (n) { n.pinned = true; heat = 1; }
    });
    canvas!.addEventListener('pointermove', (e) => {
      if (!drag) { hover = hit(e.offsetX, e.offsetY); canvas!.style.cursor = hover ? 'pointer' : 'default'; return; }
      const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.n) { const p = toWorld(e.offsetX, e.offsetY); drag.n.x = p.x; drag.n.y = p.y; heat = 1; }
      else { cam.x = drag.cx + dx / cam.k; cam.y = drag.cy + dy / cam.k; canvas!.style.cursor = 'grabbing'; }
    });
    canvas!.addEventListener('pointerup', () => {
      if (drag?.n) { drag.n.pinned = false; if (!drag.moved) picked = drag.n; }
      else if (drag && !drag.moved) picked = null;
      drag = null;
    });
    canvas!.addEventListener('pointerleave', () => (hover = null));
    canvas!.addEventListener('wheel', (e) => {
      e.preventDefault();
      follow = 0;
      const before = toWorld(e.offsetX, e.offsetY);
      cam.k = Math.min(6, Math.max(0.08, cam.k * Math.exp(-e.deltaY * 0.0015)));
      const after = toWorld(e.offsetX, e.offsetY);
      cam.x += after.x - before.x; cam.y += after.y - before.y;
    }, { passive: false });

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Hover lights up and fades smoothly, as in Obsidian.
    let lit = 0, litNode: N | null = null;
    let raf = 0, last = performance.now(), t = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      if (!reduce) step(dt, t);
      if (follow > 0) {
        follow -= dt;
        const g = frameAll();
        if (g) { const k = Math.min(1, dt * 3); cam.x += (g.x - cam.x) * k; cam.y += (g.y - cam.y) * k; cam.k += (g.k - cam.k) * k; }
      }
      const focus = hover ?? picked;
      if (focus) { litNode = focus; lit = Math.min(1, lit + dt * 6); } else lit = Math.max(0, lit - dt * 4);
      const near = litNode ? adj.get(litNode) ?? new Set<N>() : new Set<N>();
      const css = getComputedStyle(document.documentElement);
      const dark = document.documentElement.dataset.theme !== 'light';
      const dot = dark ? [170, 170, 178] : [110, 110, 120];
      const line = dark ? [120, 120, 130] : [160, 160, 170];
      const accent = [124, 92, 255];
      const mix = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2); ctx.scale(cam.k, cam.k); ctx.translate(cam.x, cam.y);

      // Lines.
      ctx.lineWidth = Math.max(0.6, 1 / cam.k) ;
      for (const e of edges) {
        const on = litNode && (e.a === litNode || e.b === litNode);
        const a = on ? 0.35 + 0.55 * lit : (e.same ? 0.32 : 0.18) * (1 - 0.75 * lit);
        ctx.strokeStyle = mix(on ? accent : line, a);
        ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y); ctx.stroke();
      }
      // Dots.
      const reading = live.call?.status === 'running' && live.call.path ? byFile.get(live.call.path) ?? null : null;
      for (const n of nodes) {
        const on = n === litNode, nb = near.has(n);
        const fade = litNode && !on && !nb ? 1 - 0.8 * lit : 1;
        const r = n.r * f.size;
        let c = dot;
        if (n.issues) c = n.worst === 'critical' || n.worst === 'high' ? [255, 108, 96] : [245, 190, 70];
        if (on) c = accent;
        ctx.fillStyle = mix(c, fade);
        ctx.beginPath(); ctx.arc(n.x, n.y, on ? r * (1 + 0.25 * lit) : r, 0, Math.PI * 2); ctx.fill();
      }
      if (reading) {
        ctx.strokeStyle = mix([125, 211, 252], 0.9); ctx.lineWidth = 1.5 / cam.k;
        ctx.beginPath(); ctx.arc(reading.x, reading.y, reading.r * f.size + 5 / cam.k + Math.sin(t * 4) * 1.5 / cam.k, 0, Math.PI * 2); ctx.stroke();
      }
      if (picked) {
        ctx.strokeStyle = mix(accent, 0.9); ctx.lineWidth = 1.5 / cam.k;
        ctx.beginPath(); ctx.arc(picked.x, picked.y, picked.r * f.size + 4 / cam.k, 0, Math.PI * 2); ctx.stroke();
      }
      // Labels fade in with zoom; the lit node and its neighbours always show theirs.
      const zoomAlpha = Math.max(0, Math.min(1, (cam.k - (0.3 + f.text * 1.6)) * 2.5));
      const fam = css.getPropertyValue('--font') || 'sans-serif';
      ctx.textAlign = 'center';
      ctx.font = `${12 / cam.k}px ${fam}`;
      for (const n of nodes) {
        const on = n === litNode, nb = near.has(n);
        let a = zoomAlpha;
        if (litNode) a = on || nb ? Math.max(a, lit) : a * (1 - 0.85 * lit);
        if (n === reading) a = Math.max(a, 1);
        if (a < 0.02) continue;
        ctx.fillStyle = dark ? `rgba(220,221,230,${a})` : `rgba(40,40,50,${a})`;
        ctx.fillText(n.label, n.x, n.y + n.r * f.size + 13 / cam.k);
      }
      // Service names, faint, when zoomed out and grouping is on.
      if (f.group && mods.length > 1 && cam.k < 0.9) {
        const cs = mods.map(() => ({ x: 0, y: 0, n: 0, top: Infinity }));
        for (const n of nodes) { const c = cs[n.m]; c.x += n.x; c.y += n.y; c.n++; c.top = Math.min(c.top, n.y); }
        ctx.font = `600 ${13 / cam.k}px ${fam}`;
        ctx.fillStyle = dark ? `rgba(167,139,250,${0.75 * (1 - lit * 0.6)})` : `rgba(90,60,200,0.8)`;
        mods.forEach((m, i) => { const c = cs[i]; if (c.n) ctx.fillText(m, c.x / c.n, c.top - 14 / cam.k); });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  });

  function find() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const n = nodes.find((x) => x.label.toLowerCase() === q) ?? nodes.find((x) => x.label.toLowerCase().includes(q) || x.g.fqn.toLowerCase().includes(q));
    if (!n) return;
    picked = n; follow = 0;
    cam.x = -n.x; cam.y = -n.y; cam.k = Math.max(cam.k, 1.6);
  }
  const SLIDERS: [keyof typeof DEFAULTS, string][] = [['center', 'Centre force'], ['repel', 'Repel force'], ['link', 'Link force'], ['distance', 'Link distance'], ['size', 'Node size'], ['text', 'Text fade threshold']];
</script>

<div class="map" bind:this={wrap}>
  <canvas bind:this={canvas}></canvas>
  <div class="hud tl">
    <input placeholder="Find a class…" bind:value={query} onkeydown={(e) => e.key === 'Enter' && find()} spellcheck="false" />
    <span class="facts">{count.services} service{count.services === 1 ? '' : 's'} · {count.classes} classes · {count.links} links</span>
  </div>
  <div class="hud tr">
    <button onclick={() => fit()} title="Frame everything">Fit</button>
    <button class:on={panel} onclick={() => (panel = !panel)} aria-expanded={panel}>Forces</button>
    <button onclick={() => (app.mode = 'graph')} title="The detailed structure graph, with cycles, layers and blast radius">Structure</button>
  </div>
  {#if panel}
    <div class="forces">
      {#each SLIDERS as [k, label]}
        <label><span>{label}</span><input type="range" min={k === 'size' ? 0.4 : 0} max={k === 'size' ? 2.5 : 1} step="0.01" bind:value={f[k] as number} /></label>
      {/each}
      <label class="tog"><input type="checkbox" bind:checked={f.group} /> Group by service</label>
      <label class="tog"><input type="checkbox" bind:checked={f.drift} /> Gentle motion</label>
      <label class="tog"><input type="checkbox" bind:checked={f.tests} /> Show tests</label>
      <button class="reset" onclick={() => (f = { ...DEFAULTS })}>Reset</button>
    </div>
  {/if}
  <div class="legend">
    <span><i class="d"></i>Class, sized by links</span>
    <span><i class="d warn"></i>Open issues</span>
    <span><i class="d bad"></i>Serious issues</span>
    <span><i class="ring"></i>AI reading now</span>
  </div>
  {#if picked}
    <aside class="card">
      <header>
        <div><h2>{picked.g.name}</h2><p class="mono">{picked.g.pkg}</p></div>
        <button class="x" aria-label="Close" onclick={() => (picked = null)}>×</button>
      </header>
      <dl>
        <dt>Kind</dt><dd>{STEREOTYPE[picked.g.stereotype]?.label ?? picked.g.stereotype}</dd>
        {#if picked.g.module}<dt>Service</dt><dd>{picked.g.module}</dd>{/if}
        <dt>Links</dt><dd>{picked.deg}</dd>
        <dt>Members</dt><dd>{picked.g.members.length}</dd>
        {#if picked.g.endpoints.length}<dt>Endpoints</dt><dd class="mono">{picked.g.endpoints.slice(0, 4).join(', ')}{picked.g.endpoints.length > 4 ? ' …' : ''}</dd>{/if}
        <dt>File</dt><dd class="mono">{picked.g.file}</dd>
      </dl>
      {#if pickedIssues.length}
        <h3>Open issues here</h3>
        <div class="issues">{#each pickedIssues as g (g[0].id)}<IssueCard {g} />{/each}</div>
      {:else}
        <p class="calm">No open issues in this class.</p>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .map { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--map-bg, var(--canvas)); }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  .hud { position: absolute; display: flex; gap: 8px; align-items: center; }
  .tl { top: 14px; left: 14px; } .tr { top: 14px; right: 14px; }
  .hud input { width: 220px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border); color: var(--text); background: var(--surface); font-size: 13px; }
  .hud input:focus { outline: none; border-color: var(--accent); }
  .facts { font-size: 11.5px; color: var(--text-3); }
  .hud button { height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); font-size: 12.5px; color: var(--text-2); }
  .hud button:hover, .hud button.on { color: var(--text); border-color: var(--border-strong); }
  .forces { position: absolute; top: 54px; right: 14px; width: 250px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;
    border-radius: 10px; border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow); font-size: 12px; color: var(--text-2); }
  .forces label { display: flex; flex-direction: column; gap: 4px; }
  .forces input[type='range'] { width: 100%; accent-color: var(--accent); }
  .forces .tog { flex-direction: row; align-items: center; gap: 8px; }
  .reset { align-self: flex-start; border: 0; background: none; padding: 0; color: var(--text-3); font-size: 12px; }
  .legend { position: absolute; left: 14px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 14px; font-size: 11px; color: var(--text-3); pointer-events: none; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .d { width: 7px; height: 7px; border-radius: 50%; background: #aaaab2; }
  .d.warn { background: #f5be46; } .d.bad { background: #ff6c60; }
  .ring { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid #7dd3fc; }
  .card { position: absolute; top: 54px; right: 14px; bottom: 14px; width: min(400px, calc(100% - 28px)); overflow: auto; padding: 16px;
    border-radius: 12px; border: 1px solid var(--border); background: var(--surface); box-shadow: var(--shadow); }
  .card header { display: flex; gap: 12px; align-items: flex-start; }
  h2 { margin: 0; font-size: 16px; font-weight: 600; }
  .card header p { margin: 2px 0 0; font-size: 11.5px; color: var(--text-3); word-break: break-all; }
  .x { margin-left: auto; border: 0; background: none; font-size: 20px; line-height: 1; color: var(--text-3); }
  dl { display: grid; grid-template-columns: 90px 1fr; gap: 6px 10px; margin: 16px 0; font-size: 12.5px; }
  dt { color: var(--text-3); } dd { margin: 0; word-break: break-word; }
  h3 { margin: 18px 0 8px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  .issues { display: flex; flex-direction: column; gap: 8px; }
  .calm { color: var(--text-3); font-size: 12.5px; }
</style>
