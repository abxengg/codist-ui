<script lang="ts">
  // The code as a graph, in the manner of Obsidian's graph view, in 2D or 3D. Flat dots sized by their links, lines
  // styled by what the link means, physics you can push around. Hover lights a class and its neighbours; a card says
  // what it is. Click opens its details: what it uses, what uses it, its methods with their cost, its endpoints and
  // its open issues. Colour by kind, by service or by issues. In 3D the graph floats in space and can be turned.
  import { onMount, untrack } from 'svelte';
  import { app } from '../lib/store.svelte';
  import { live } from '../lib/live.svelte';
  import { groups } from '../lib/groups';
  import { STEREOTYPE } from '../lib/theme';
  import IssueCard from './IssueCard.svelte';
  import type { GraphEdge, GraphNode, Issue } from '../lib/types';

  type N = { id: string; g: GraphNode; x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; m: number;
    deg: number; ins: number; outs: number; issues: number; worst: string; pinned: boolean; label: string; px: number; py: number; pz: number; ps: number };
  type E = { a: N; b: N; same: boolean; kind: GraphEdge['kind'] };

  // Muted on purpose: colour is for meaning, not decoration.
  const KIND_COL: Record<string, string> = {
    controller: '#6f93c4', service: '#8d84c6', repository: '#62a091', entity: '#b99a5e', dto: '#8a8f99', config: '#6f6f78',
    component: '#7d87b9', client: '#b77d9c', advice: '#b98b60', exception: '#b86c6c', other: '#8b8b95', test: '#5f5f69',
  };
  const SERVICE_COL = ['#8d84c6', '#6f93c4', '#62a091', '#b99a5e', '#b77d9c', '#b98b60', '#7fa36f', '#6fa3b0', '#a08cc0', '#b0907a'];
  const PLAIN = '#8e8e98';
  const LINK_COL: Record<GraphEdge['kind'], string> = { injects: '110,140,190', uses: '140,140,155', extends: '98,160,145', implements: '125,165,110', feign: '183,125,156' };
  const SEV_COL: Record<string, string> = { critical: '#ff5c50', high: '#ff8f40', medium: '#f2c744', low: '#a3a3ad', info: '#a3a3ad' };
  const LINK: Record<GraphEdge['kind'], { label: string; dash: number[]; w: number }> = {
    injects: { label: 'injects', dash: [], w: 1.2 }, uses: { label: 'uses', dash: [], w: 0.8 },
    extends: { label: 'extends', dash: [5, 4], w: 1.1 }, implements: { label: 'implements', dash: [2, 3], w: 1.1 }, feign: { label: 'calls over HTTP', dash: [8, 4], w: 1.6 },
  };

  const DEFAULTS = { center: 0.5, repel: 0.6, link: 0.5, distance: 0.45, group: true, size: 1, text: 0.55, tests: false, drift: true,
    three: false, colour: 'plain' as 'plain' | 'kind' | 'service' | 'issues', issuesOnly: false, hidden: [] as string[], orphans: true, linkColour: true };
  let f = $state({ ...DEFAULTS, ...load() });
  function load() { try { return JSON.parse(localStorage.getItem('codist.mapForces') ?? '{}'); } catch { return {}; } }
  $effect(() => { const v = JSON.stringify(f); try { localStorage.setItem('codist.mapForces', v); } catch { /* storage blocked */ } });

  let wrap: HTMLDivElement | undefined = $state();
  let canvas: HTMLCanvasElement | undefined = $state();
  let query = $state('');
  let picked = $state.raw<N | null>(null); // raw: links are matched to it by identity
  let hover = $state.raw<N | null>(null);
  let mouse = $state({ x: 0, y: 0 });
  let panel = $state(false);
  let count = $state({ classes: 0, services: 0, links: 0, troubled: 0 });
  let kindsHere = $state<[string, number][]>([]);
  let modsHere = $state<string[]>([]);
  let orphans = $state(0);
  /** Classes a change to the picked one can reach: everything that uses it, directly or through others. */
  let reach = $state.raw<Set<N> | null>(null);

  let nodes: N[] = [];
  let edges: E[] = [];
  let mods: string[] = [];
  let byFile = new Map<string, N>();
  let adj = new Map<N, Set<N>>();
  const cam = { x: 0, y: 0, k: 1, yaw: 0.6, pitch: 0.35 };
  let heat = 1;
  let follow = 0;

  const openByFile = $derived.by(() => {
    const m = new Map<string, Issue[][]>();
    for (const g of groups(app.issueList?.issues ?? [])) for (const p of new Set(g.map((i) => i.path))) m.set(p, [...(m.get(p) ?? []), g]);
    return m;
  });
  const ORDER = ['critical', 'high', 'medium', 'low', 'info'];

  // What the detail panel shows about the picked class.
  type Link = { n: N; kind: string };
  let details = $state<{ uses: Link[]; usedBy: Link[]; issues: Issue[][]; methods: GraphNode['members']; fields: number } | null>(null);
  function describe(n: N | null) {
    if (!n) { details = null; return; }
    const uses: Link[] = [], usedBy: Link[] = [];
    for (const e of edges) { if (e.a === n) uses.push({ n: e.b, kind: LINK[e.kind]?.label ?? e.kind }); if (e.b === n) usedBy.push({ n: e.a, kind: LINK[e.kind]?.label ?? e.kind }); }
    const methods = n.g.members.filter((m) => m.kind !== 'field').sort((a, b) => (b.cost?.complexity ?? 0) - (a.cost?.complexity ?? 0));
    details = { uses, usedBy, issues: openByFile.get(n.g.file) ?? [], methods, fields: n.g.members.filter((m) => m.kind === 'field').length };
  }
  $effect(() => { void openByFile; describe(picked); });
  $effect(() => { void picked; reach = null; });
  function showReach() {
    if (!picked) return;
    if (reach) { reach = null; return; }
    const users = new Map<N, N[]>();
    for (const e of edges) users.set(e.b, [...(users.get(e.b) ?? []), e.a]);
    const seen = new Set<N>(), todo = [picked];
    while (todo.length) for (const u of users.get(todo.pop()!) ?? []) if (!seen.has(u) && u !== picked) { seen.add(u); todo.push(u); }
    reach = seen;
  }

  function build() {
    const gr = app.graph;
    if (!gr) return;
    const old = new Map(nodes.map((n) => [n.id, n]));
    const linked = new Set<string>();
    for (const e of gr.edges) if (e.source !== e.target) { linked.add(e.source); linked.add(e.target); }
    const keep = gr.nodes.filter((n) => (f.tests || n.stereotype !== 'test') && !f.hidden.includes(n.stereotype) && (f.orphans || linked.has(n.id)));
    orphans = gr.nodes.filter((n) => (f.tests || n.stereotype !== 'test') && !linked.has(n.id)).length;
    const modOf = (g: GraphNode) => g.module || g.pkg.split('.').slice(0, 3).join('.') || 'code';
    mods = [...new Set(keep.map(modOf))];
    const ins = new Map<string, number>(), outs = new Map<string, number>();
    for (const e of gr.edges) { outs.set(e.source, (outs.get(e.source) ?? 0) + 1); ins.set(e.target, (ins.get(e.target) ?? 0) + 1); }
    nodes = keep.map((g) => {
      const was = old.get(g.id);
      const m = mods.indexOf(modOf(g));
      const a = (m / Math.max(1, mods.length)) * Math.PI * 2;
      const d = (ins.get(g.id) ?? 0) + (outs.get(g.id) ?? 0);
      return { id: g.id, g, x: was?.x ?? Math.cos(a) * 300 + (Math.random() - 0.5) * 200, y: was?.y ?? Math.sin(a) * 300 + (Math.random() - 0.5) * 200,
        z: was?.z ?? (f.three ? (Math.random() - 0.5) * 300 : 0), vx: 0, vy: 0, vz: 0, r: Math.min(26, 2.4 + Math.pow(d, 0.62) * 1.7), m, deg: d, ins: ins.get(g.id) ?? 0,
        outs: outs.get(g.id) ?? 0, issues: 0, worst: '', pinned: false, label: g.name, px: 0, py: 0, pz: 0, ps: 1 };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    byFile = new Map(nodes.map((n) => [n.g.file, n]));
    edges = gr.edges.filter((e) => byId.has(e.source) && byId.has(e.target) && e.source !== e.target)
      .map((e) => ({ a: byId.get(e.source)!, b: byId.get(e.target)!, same: byId.get(e.source)!.m === byId.get(e.target)!.m, kind: e.kind }));
    adj = new Map(nodes.map((n) => [n, new Set<N>()]));
    for (const e of edges) { adj.get(e.a)!.add(e.b); adj.get(e.b)!.add(e.a); }
    const kc = new Map<string, number>();
    for (const g of gr.nodes) if (f.tests || g.stereotype !== 'test') kc.set(g.stereotype, (kc.get(g.stereotype) ?? 0) + 1);
    kindsHere = [...kc].sort((a, b) => b[1] - a[1]);
    modsHere = mods;
    paintIssues();
    if (picked) picked = byId.get(picked.id) ?? null;
    heat = 1;
  }
  function paintIssues() {
    let troubled = 0;
    for (const n of nodes) {
      const list = openByFile.get(n.g.file) ?? [];
      n.issues = list.length;
      n.worst = list.map((g) => g[0].severity).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0] ?? '';
      if (n.issues) troubled++;
    }
    count = { classes: nodes.length, services: mods.length, links: edges.length, troubled };
  }
  // Rebuild only when the graph or what is shown changes; build itself reads much else that must not trigger it.
  $effect(() => { void app.graph; void f.tests; void f.hidden.length; void f.orphans; untrack(build); });
  $effect(() => { void openByFile; untrack(paintIssues); });
  $effect(() => { void f.center; void f.repel; void f.link; void f.distance; void f.group; heat = 1; });
  $effect(() => {
    // Into 3D: give every dot some depth to start from; back to 2D: flatten.
    const three = f.three;
    untrack(() => { for (const n of nodes) { n.z = three ? (Math.random() - 0.5) * 260 : 0; n.vz = 0; } heat = 1; follow = 2; });
  });

  // One step of the simulation: repulsion between nearby dots (through a grid), springs along links (weaker for very
  // connected classes, as in d3), a pull to the middle, a pull to each service's middle, and services kept apart.
  function step(dt: number, t: number) {
    const three = f.three;
    const repel = 400 + f.repel * 5200, rest = 20 + f.distance * 160, spring = 0.1 + f.link * 3, gravity = 0.004 + f.center * 0.08;
    const cell = Math.max(60, Math.sqrt(repel) * 1.6);
    const grid = new Map<number, N[]>();
    const key = (i: number, j: number, l: number) => (i * 73856093) ^ (j * 19349663) ^ (l * 83492791);
    for (const n of nodes) {
      const k = key(Math.floor(n.x / cell), Math.floor(n.y / cell), three ? Math.floor(n.z / cell) : 0);
      const b = grid.get(k); b ? b.push(n) : grid.set(k, [n]);
    }
    const lr = three ? 1 : 0;
    for (const n of nodes) {
      const cx = Math.floor(n.x / cell), cy = Math.floor(n.y / cell), cz = three ? Math.floor(n.z / cell) : 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -lr; l <= lr; l++) {
        const b = grid.get(key(cx + i, cy + j, cz + l));
        if (!b) continue;
        for (const o of b) {
          if (o === n) continue;
          let dx = n.x - o.x, dy = n.y - o.y, dz = n.z - o.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = three ? Math.random() - 0.5 : 0; d2 = 0.5; }
          if (d2 > cell * cell) continue;
          let p = (repel / d2) * dt;
          const touch = (n.r + o.r) * 1.6; // big dots keep clear of each other
          if (d2 < touch * touch) p += ((touch - Math.sqrt(d2)) / Math.sqrt(d2)) * 1.5 * dt;
          n.vx += dx * p; n.vy += dy * p; n.vz += dz * p;
        }
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, dz = e.b.z - e.a.z, d = Math.hypot(dx, dy, dz) || 1;
      const share = 1 / Math.max(1, Math.min(e.a.deg, e.b.deg));
      const k = ((d - (e.same ? rest : rest * 1.8)) / d) * spring * share * (e.same ? 1.6 : 0.3) * dt;
      e.a.vx += dx * k; e.a.vy += dy * k; e.a.vz += dz * k; e.b.vx -= dx * k; e.b.vy -= dy * k; e.b.vz -= dz * k;
    }
    const cs = mods.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
    for (const n of nodes) { const c = cs[n.m]; c.x += n.x; c.y += n.y; c.z += n.z; c.n++; }
    for (const c of cs) if (c.n) { c.x /= c.n; c.y /= c.n; c.z /= c.n; }
    const push = cs.map(() => ({ x: 0, y: 0, z: 0 }));
    if (f.group) for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      if (!a.n || !b.n) continue;
      const ra = Math.sqrt(a.n) * (14 + rest * 0.25), rb = Math.sqrt(b.n) * (14 + rest * 0.25);
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, d = Math.hypot(dx, dy, dz) || 1, want = ra + rb + 40;
      if (d >= want) continue;
      const p = (want - d) * 0.5;
      push[i].x += (dx / d) * p; push[i].y += (dy / d) * p; push[i].z += (dz / d) * p;
      push[j].x -= (dx / d) * p; push[j].y -= (dy / d) * p; push[j].z -= (dz / d) * p;
    }
    for (const n of nodes) {
      n.vx -= n.x * gravity * dt; n.vy -= n.y * gravity * dt; n.vz -= n.z * gravity * dt;
      if (f.group && mods.length > 1) { const c = cs[n.m], p = push[n.m]; n.vx += ((c.x - n.x) * 0.5 + p.x) * dt; n.vy += ((c.y - n.y) * 0.5 + p.y) * dt; n.vz += ((c.z - n.z) * 0.5 + p.z) * dt; }
      if (f.drift) { n.vx += Math.sin(t * 0.4 + n.r * 7 + n.x * 0.01) * 0.8 * dt; n.vy += Math.cos(t * 0.37 + n.r * 5 + n.y * 0.01) * 0.8 * dt; }
      if (n.pinned) { n.vx = 0; n.vy = 0; n.vz = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82; n.vz *= 0.82;
      n.x += n.vx * dt * 10 * heat; n.y += n.vy * dt * 10 * heat;
      n.z = three ? n.z + n.vz * dt * 10 * heat : 0;
    }
    heat = Math.max(0.3, heat * 0.996);
  }

  function frameAll() {
    if (!nodes.length || !wrap) return null;
    if (f.three) {
      // In 3D the graph can turn any way, so frame the sphere that holds it.
      let R = 1;
      for (const n of nodes) R = Math.max(R, Math.hypot(n.x, n.y, n.z));
      return { x: 0, y: 0, k: Math.min(2.2, (Math.min(wrap.clientWidth, wrap.clientHeight) - 120) / (2 * R * 1.08)) };
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of nodes) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }
    const w = Math.max(200, x1 - x0 + 140), h = Math.max(200, y1 - y0 + 220);
    return { x: -(x0 + x1) / 2, y: -(y0 + y1) / 2, k: Math.min(2.2, Math.min(wrap.clientWidth / w, wrap.clientHeight / h)) };
  }
  function fit(snap = false) {
    const t = frameAll();
    if (t && snap) Object.assign(cam, t);
    follow = snap ? 4 : 1.6;
  }
  function focusOn(n: N) {
    picked = n; follow = 0;
    if (!f.three) { cam.x = -n.x; cam.y = -n.y; }
    cam.k = Math.max(cam.k, 1.4);
  }

  const hexRGB = (h: string) => `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`;

  // The colour of a dot.
  function colourOf(n: N) {
    if (f.colour === 'service') return SERVICE_COL[n.m % SERVICE_COL.length];
    if (f.colour === 'issues') return n.issues ? SEV_COL[n.worst] ?? SEV_COL.medium : '#5c5c66';
    if (f.colour === 'kind') return KIND_COL[n.g.stereotype] ?? KIND_COL.other;
    return n.issues ? SEV_COL[n.worst] ?? SEV_COL.medium : PLAIN;
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

    // Where a node is on screen: in 2D a plain zoom and pan; in 3D a turn by yaw and pitch, then perspective.
    const project = () => {
      const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      for (const n of nodes) {
        if (!f.three) { n.px = W / 2 + (n.x + cam.x) * cam.k; n.py = H / 2 + (n.y + cam.y) * cam.k; n.pz = 0; n.ps = 1; continue; }
        const x = n.x, y = n.y, z = n.z;
        const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const p = 1800 / (1800 + z2);
        n.px = W / 2 + x1 * cam.k * p; n.py = H / 2 + y2 * cam.k * p; n.pz = z2; n.ps = Math.max(0.2, p);
      }
    };
    const hit = (sx: number, sy: number) => {
      let best: N | null = null, bd = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.px - sx, n.py - sy);
        if (d < n.r * f.size * cam.k * n.ps + 5 && d < bd) { best = n; bd = d; }
      }
      return best;
    };
    let drag: { n: N | null; sx: number; sy: number; cx: number; cy: number; yaw: number; pitch: number; moved: boolean } | null = null;
    canvas!.addEventListener('pointerdown', (e) => {
      canvas!.setPointerCapture(e.pointerId);
      const n = hit(e.offsetX, e.offsetY);
      drag = { n: f.three ? null : n, sx: e.offsetX, sy: e.offsetY, cx: cam.x, cy: cam.y, yaw: cam.yaw, pitch: cam.pitch, moved: false };
      if (f.three && n) drag.n = null, (drag as { pick?: N }).pick = n;
      follow = 0;
      if (drag.n) { drag.n.pinned = true; heat = 1; }
    });
    canvas!.addEventListener('pointermove', (e) => {
      mouse = { x: e.offsetX, y: e.offsetY };
      if (!drag) { hover = hit(e.offsetX, e.offsetY); canvas!.style.cursor = hover ? 'pointer' : f.three ? 'grab' : 'default'; return; }
      const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.n) { drag.n.x = (e.offsetX - W / 2) / cam.k - cam.x; drag.n.y = (e.offsetY - H / 2) / cam.k - cam.y; heat = 1; }
      else if (f.three) { cam.yaw = drag.yaw + dx * 0.006; cam.pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + dy * 0.006)); canvas!.style.cursor = 'grabbing'; }
      else { cam.x = drag.cx + dx / cam.k; cam.y = drag.cy + dy / cam.k; canvas!.style.cursor = 'grabbing'; }
    });
    canvas!.addEventListener('pointerup', () => {
      const pick = (drag as { pick?: N } | null)?.pick;
      if (drag?.n) { drag.n.pinned = false; if (!drag.moved) picked = drag.n; }
      else if (drag && !drag.moved) picked = pick ?? null;
      drag = null;
    });
    canvas!.addEventListener('pointerleave', () => (hover = null));
    canvas!.addEventListener('wheel', (e) => {
      e.preventDefault();
      follow = 0;
      const k0 = cam.k;
      cam.k = Math.min(6, Math.max(0.08, cam.k * Math.exp(-e.deltaY * 0.0015)));
      if (!f.three) { const s = 1 / cam.k - 1 / k0; cam.x += (e.offsetX - W / 2) * s; cam.y += (e.offsetY - H / 2) * s; }
    }, { passive: false });

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let lit = 0, litNode: N | null = null, raf = 0, last = performance.now(), t = 0, idle = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      if (!reduce) step(dt, t);
      // In 3D the graph turns slowly by itself until you take hold of it.
      idle = drag || hover ? 0 : idle + dt;
      if (f.three && !reduce && idle > 1.5) cam.yaw += dt * 0.08;
      if (follow > 0) {
        follow -= dt;
        const g = frameAll();
        if (g) { const k = Math.min(1, dt * 3); cam.x += (g.x - cam.x) * k; cam.y += (g.y - cam.y) * k; cam.k += (g.k - cam.k) * k; }
      }
      project();
      const focus = hover ?? picked;
      if (focus) { litNode = focus; lit = Math.min(1, lit + dt * 6); } else lit = Math.max(0, lit - dt * 4);
      const near = litNode ? adj.get(litNode) ?? new Set<N>() : new Set<N>();
      const dark = document.documentElement.dataset.theme !== 'light';
      const lineRGB = dark ? '150,150,165' : '150,150,165';
      const accent = '#8b7cf6';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const depthA = (n: N) => (f.three ? Math.max(0.15, Math.min(1, 0.55 + n.ps - 0.9)) : 1);
      const dim = (n: N) => (f.issuesOnly && !n.issues ? 0.18 : 1);

      // Lines, styled by kind.
      for (const e of edges) {
        const on = litNode && (e.a === litNode || e.b === litNode);
        const style = LINK[e.kind] ?? LINK.uses;
        const base = (e.same ? 0.3 : 0.16) * Math.min(depthA(e.a), depthA(e.b)) * Math.min(dim(e.a), dim(e.b));
        const a = on ? 0.4 + 0.55 * lit : base * (1 - 0.75 * lit);
        if (a < 0.015) continue;
        // A link to a class with open issues takes the issue's colour; otherwise its kind's, or plain grey.
        const hot = e.a.issues ? e.a : e.b.issues ? e.b : null;
        const rgb = hot ? hexRGB(SEV_COL[hot.worst] ?? SEV_COL.medium) : f.linkColour ? LINK_COL[e.kind] ?? lineRGB : lineRGB;
        const inReach = reach && reach.has(e.a) && (reach.has(e.b) || e.b === picked);
        ctx.strokeStyle = on || inReach ? accent : `rgba(${rgb},${hot ? Math.min(0.9, a * 2.2) : f.linkColour ? Math.min(0.9, a * 1.5) : a})`;
        ctx.globalAlpha = on ? a : 1;
        ctx.lineWidth = style.w * (on ? 1.4 : 1);
        ctx.setLineDash(style.dash);
        ctx.beginPath(); ctx.moveTo(e.a.px, e.a.py); ctx.lineTo(e.b.px, e.b.py); ctx.stroke();
        // An arrow shows the direction of a lit link.
        if (on && lit > 0.3) {
          const ang = Math.atan2(e.b.py - e.a.py, e.b.px - e.a.px), rr = e.b.r * f.size * cam.k * e.b.ps + 3;
          const hx = e.b.px - Math.cos(ang) * rr, hy = e.b.py - Math.sin(ang) * rr;
          ctx.setLineDash([]); ctx.fillStyle = accent;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(ang - 0.45) * 7, hy - Math.sin(ang - 0.45) * 7); ctx.lineTo(hx - Math.cos(ang + 0.45) * 7, hy - Math.sin(ang + 0.45) * 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.setLineDash([]);
      // Dots, far first.
      const draw = f.three ? [...nodes].sort((a, b) => b.pz - a.pz) : nodes;
      const reading = live.call?.status === 'running' && live.call.path ? byFile.get(live.call.path) ?? null : null;
      for (const n of draw) {
        const on = n === litNode, nb = near.has(n);
        const fade = (reach ? (reach.has(n) || n === picked ? 1 : 0.12) : litNode && !on && !nb ? 1 - 0.8 * lit : 1) * depthA(n) * dim(n);
        const r = n.r * f.size * Math.max(0.6, Math.min(2.4, cam.k)) * n.ps * (on ? 1 + 0.25 * lit : 1);
        ctx.globalAlpha = fade;
        ctx.fillStyle = on || (reach && reach.has(n)) ? accent : colourOf(n);
        ctx.beginPath(); ctx.arc(n.px, n.py, r, 0, Math.PI * 2); ctx.fill();
        // A class with open issues gets a small mark beside it whatever the colouring.
        if (n.issues && (f.colour === 'plain' || f.colour === 'issues')) {
          ctx.strokeStyle = SEV_COL[n.worst] ?? SEV_COL.medium; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(n.px, n.py, r + 3, 0, Math.PI * 2); ctx.stroke();
        }
        if (n.issues && (f.colour === 'kind' || f.colour === 'service')) {
          ctx.fillStyle = SEV_COL[n.worst] ?? SEV_COL.medium;
          ctx.beginPath(); ctx.arc(n.px + r * 0.8, n.py - r * 0.8, Math.max(2, r * 0.42), 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (reading) {
        ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(reading.px, reading.py, reading.r * f.size * cam.k * reading.ps + 6 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); ctx.stroke();
      }
      if (picked) {
        ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(picked.px, picked.py, picked.r * f.size * Math.max(0.6, Math.min(2.4, cam.k)) * picked.ps + 5, 0, Math.PI * 2); ctx.stroke();
      }
      // Labels fade in with zoom; the lit node and its neighbours always show theirs.
      const zoomAlpha = Math.max(0, Math.min(1, (cam.k - (0.3 + f.text * 1.6)) * 2.5));
      const fam = getComputedStyle(document.documentElement).getPropertyValue('--font') || 'sans-serif';
      ctx.textAlign = 'center';
      ctx.font = `11px ${fam}`;
      for (const n of draw) {
        const on = n === litNode, nb = near.has(n);
        let a = zoomAlpha * depthA(n) * dim(n);
        if (litNode) a = on || nb ? Math.max(a, lit) : a * (1 - 0.85 * lit);
        if (n === reading) a = 1;
        if (a < 0.03) continue;
        ctx.fillStyle = dark ? `rgba(200,201,212,${a})` : `rgba(45,45,58,${a})`;
        ctx.fillText(n.label, n.px, n.py + n.r * f.size * Math.max(0.6, Math.min(2.4, cam.k)) * n.ps + 13);
      }
      if (f.group && mods.length > 1 && cam.k < 0.9) {
        const cs = mods.map(() => ({ x: 0, y: 0, n: 0, top: Infinity }));
        for (const n of nodes) { const c = cs[n.m]; c.x += n.px; c.y += n.py; c.n++; c.top = Math.min(c.top, n.py); }
        ctx.font = `500 12px ${fam}`;
        mods.forEach((m, i) => {
          const c = cs[i];
          if (!c.n) return;
          ctx.fillStyle = f.colour === 'service' ? SERVICE_COL[i % SERVICE_COL.length] : dark ? `rgba(200,200,212,${0.7 * (1 - lit * 0.6)})` : 'rgba(60,60,80,0.75)';
          ctx.fillText(m, c.x / c.n, c.top - 14);
        });
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
    if (n) focusOn(n);
  }
  function toggleKind(k: string) { f.hidden = f.hidden.includes(k) ? f.hidden.filter((x: string) => x !== k) : [...f.hidden, k]; }
  const SLIDERS: [keyof typeof DEFAULTS, string][] = [['center', 'Centre force'], ['repel', 'Repel force'], ['link', 'Link force'], ['distance', 'Link distance'], ['size', 'Node size'], ['text', 'Text fade threshold']];
  const cost = (m: GraphNode['members'][number]) => m.cost ? [m.cost.complexity > 1 ? `complexity ${m.cost.complexity}` : '', m.cost.dbCalls ? `${m.cost.dbCalls} db` : '', m.cost.remoteCalls ? `${m.cost.remoteCalls} remote` : '', m.cost.loopIo ? 'I/O in a loop' : ''].filter(Boolean).join(' · ') : '';
  let showAllMethods = $state(false);
</script>

<div class="map" bind:this={wrap}>
  <canvas bind:this={canvas}></canvas>

  <div class="hud tl">
    <input placeholder="Find a class…" bind:value={query} onkeydown={(e) => e.key === 'Enter' && find()} spellcheck="false" />
    <div class="facts">
      <span><b>{count.services}</b> services</span><span><b>{count.classes}</b> classes</span><span><b>{count.links}</b> links</span>
      <button class="tr-btn" class:on={!f.orphans} onclick={() => (f.orphans = !f.orphans)} title="Classes with no links to any other"><b class="plain">{orphans}</b> orphans{f.orphans ? '' : ' hidden'}</button>
      {#if count.troubled}<button class="tr-btn" class:on={f.issuesOnly} onclick={() => (f.issuesOnly = !f.issuesOnly)} title="Fade the classes without open issues"><b>{count.troubled}</b> with issues</button>{/if}
    </div>
  </div>

  <div class="hud tr">
    <div class="seg">
      <button class:on={!f.three} onclick={() => (f.three = false)}>2D</button>
      <button class:on={f.three} onclick={() => (f.three = true)}>3D</button>
    </div>
    <div class="seg">
      {#each [['plain', 'Plain'], ['kind', 'Kind'], ['service', 'Service'], ['issues', 'Issues']] as [v, l]}
        <button class:on={f.colour === v} onclick={() => (f.colour = v as typeof f.colour)}>{l}</button>
      {/each}
    </div>
    <button class="b3" onclick={() => fit()} title="Frame everything">Fit</button>
    <button class="b3" class:primary={panel} onclick={() => (panel = !panel)} aria-expanded={panel}>Forces</button>
  </div>

  {#if panel}
    <div class="forces">
      {#each SLIDERS as [k, label]}
        <label><span>{label}</span><input type="range" min={k === 'size' ? 0.4 : 0} max={k === 'size' ? 2.5 : 1} step="0.01" bind:value={f[k] as number} /></label>
      {/each}
      <label class="tog"><input type="checkbox" bind:checked={f.group} /> Group by service</label>
      <label class="tog"><input type="checkbox" bind:checked={f.drift} /> Gentle motion</label>
      <label class="tog"><input type="checkbox" bind:checked={f.tests} /> Show tests</label>
      <label class="tog"><input type="checkbox" bind:checked={f.orphans} /> Show orphans ({orphans})</label>
      <label class="tog"><input type="checkbox" bind:checked={f.linkColour} /> Colour links by kind</label>
      <button class="reset" onclick={() => (f = { ...DEFAULTS })}>Reset</button>
    </div>
  {/if}

  <div class="legend">
    {#if f.colour === 'plain'}
      <span><i style:background={PLAIN}></i>Class, sized by links</span><span><i style:background={SEV_COL.medium}></i>Medium issue</span><span><i style:background={SEV_COL.high}></i>High</span><span><i style:background={SEV_COL.critical}></i>Critical</span>
    {:else if f.colour === 'kind'}
      {#each kindsHere as [k, n]}
        <button class:off={f.hidden.includes(k)} onclick={() => toggleKind(k)} title="Show or hide {STEREOTYPE[k]?.label ?? k}">
          <i style:background={KIND_COL[k] ?? KIND_COL.other}></i>{STEREOTYPE[k]?.label ?? k} <small>{n}</small>
        </button>
      {/each}
    {:else if f.colour === 'service'}
      {#each modsHere as m, i}<span><i style:background={SERVICE_COL[i % SERVICE_COL.length]}></i>{m}</span>{/each}
    {:else}
      {#each ['critical', 'high', 'medium'] as s}<span><i style:background={SEV_COL[s]}></i>{s}</span>{/each}<span><i style:background="#6b6b76"></i>no open issue</span>
    {/if}
    <span class="sep"></span>
    {#each [['injects', 'injects', ''], ['uses', 'uses', ''], ['extends', 'extends', '5 4'], ['implements', 'implements', '2 3'], ['feign', 'HTTP call', '8 4']] as [k, l, dash]}
      <span class="ln"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={f.linkColour ? `rgb(${LINK_COL[k as GraphEdge['kind']]})` : 'currentColor'} stroke-width="1.5" stroke-dasharray={dash} /></svg>{l}</span>
    {/each}
    <span class="ln"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={SEV_COL.high} stroke-width="1.5" /></svg>link to a class with issues</span>
    <span class="ln"><i class="ring"></i>AI reading</span>
  </div>

  {#if hover && hover !== picked}
    <div class="hovercard" style:left="{Math.min(mouse.x + 16, (wrap?.clientWidth ?? 800) - 260)}px" style:top="{mouse.y + 16}px">
      <div class="hc-t"><i style:background={KIND_COL[hover.g.stereotype] ?? KIND_COL.other}></i><b>{hover.label}</b></div>
      <div class="hc-s">{STEREOTYPE[hover.g.stereotype]?.label ?? hover.g.stereotype}{hover.g.module ? ` · ${hover.g.module}` : ''}</div>
      <div class="hc-n"><span>uses <b>{hover.outs}</b></span><span>used by <b>{hover.ins}</b></span><span>methods <b>{hover.g.members.filter((m) => m.kind !== 'field').length}</b></span>{#if hover.issues}<span class="bad">issues <b>{hover.issues}</b></span>{/if}</div>
    </div>
  {/if}

  {#if picked && details}
    <aside class="card">
      <header>
        <i class="o" style:background={KIND_COL[picked.g.stereotype] ?? KIND_COL.other}></i>
        <div><h2>{picked.g.name}</h2><p class="mono">{picked.g.pkg}</p></div>
        <button class="x" aria-label="Close" onclick={() => (picked = null)}>×</button>
      </header>
      <div class="tags">
        <span>{STEREOTYPE[picked.g.stereotype]?.label ?? picked.g.stereotype}</span>
        {#if picked.g.module}<span>{picked.g.module}</span>{/if}
        {#each picked.g.annotations.slice(0, 4) as a}<span class="mono">@{a.replace(/^@/, '')}</span>{/each}
      </div>
      <div class="nums">
        <div><b>{details.uses.length}</b><span>uses</span></div>
        <div><b>{details.usedBy.length}</b><span>used by</span></div>
        <div><b>{details.methods.length}</b><span>methods</span></div>
        <div><b>{details.fields}</b><span>fields</span></div>
        <div class:bad={details.issues.length}><b>{details.issues.length}</b><span>open issues</span></div>
      </div>
      <button class="b3 reach" class:primary={!!reach} onclick={showReach}>
        {reach ? `${reach.size} class${reach.size === 1 ? '' : 'es'} reached · clear` : 'Show what a change here reaches'}
      </button>
      {#if details.issues.length}
        <h3>Open issues</h3>
        <div class="issues">{#each details.issues as g (g[0].id)}<IssueCard {g} />{/each}</div>
      {/if}
      {#if picked.g.endpoints.length}
        <h3>Endpoints</h3>
        <ul class="plain mono">{#each picked.g.endpoints as ep}<li>{ep}</li>{/each}</ul>
      {/if}
      {#if details.usedBy.length}
        <h3>Used by</h3>
        <div class="links">{#each details.usedBy as l}<button onclick={() => focusOn(l.n)}><i style:background={colourOf(l.n)}></i>{l.n.label}<small>{l.kind}</small></button>{/each}</div>
      {/if}
      {#if details.uses.length}
        <h3>Uses</h3>
        <div class="links">{#each details.uses as l}<button onclick={() => focusOn(l.n)}><i style:background={colourOf(l.n)}></i>{l.n.label}<small>{l.kind}</small></button>{/each}</div>
      {/if}
      {#if details.methods.length}
        <h3>Methods <small>most complex first</small></h3>
        <ul class="methods">
          {#each showAllMethods ? details.methods : details.methods.slice(0, 8) as m}
            <li><span class="mono">{m.name}</span><small>line {m.startLine}{cost(m) ? ` · ${cost(m)}` : ''}</small></li>
          {/each}
        </ul>
        {#if details.methods.length > 8}<button class="more" onclick={() => (showAllMethods = !showAllMethods)}>{showAllMethods ? 'Fewer' : `All ${details.methods.length}`}</button>{/if}
      {/if}
      <p class="file mono">{picked.g.file}:{picked.g.startLine}</p>
    </aside>
  {/if}
</div>

<style>
  .map { position: relative; flex: 1; min-height: 0; overflow: hidden; background: var(--map-bg, var(--canvas)); }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
  .hud { position: absolute; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .tl { top: 14px; left: 14px; flex-direction: column; align-items: flex-start; }
  .tr { top: 14px; right: 14px; justify-content: flex-end; }
  .hud input { width: 240px; height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); color: var(--text); background: var(--glass); box-shadow: var(--elev-1); font-size: 13px; }
  .hud input:focus { outline: none; border-color: var(--accent); }
  .facts { display: flex; gap: 12px; font-size: 11.5px; color: var(--text-3); align-items: center; }
  .facts b { color: var(--text-2); font-weight: 600; }
  .tr-btn { white-space: nowrap; border: 1px solid var(--border); background: var(--glass); border-radius: 99px; padding: 2px 9px; font-size: 11.5px; color: var(--text-3); }
  .tr-btn b { color: #ff8f40; } .tr-btn b.plain { color: var(--text-2); } .tr-btn.on { color: var(--text); border-color: var(--border-strong); }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 11px; background: var(--glass); box-shadow: var(--elev-1); border: 1px solid var(--border); }
  .seg button { border: 0; background: none; height: 26px; padding: 0 10px; border-radius: 8px; font-size: 12px; color: var(--text-3); }
  .seg button.on { color: var(--text); background: var(--surface-3); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.4); }
  .forces { position: absolute; top: 60px; right: 14px; width: 250px; padding: 14px; display: flex; flex-direction: column; gap: 10px;
    border-radius: 14px; border: 1px solid var(--border); background: var(--glass-strong); box-shadow: var(--elev-2); font-size: 12px; color: var(--text-2); z-index: 3; }
  .forces label { display: flex; flex-direction: column; gap: 4px; }
  .forces input[type='range'] { width: 100%; accent-color: var(--accent); }
  .forces .tog { flex-direction: row; align-items: center; gap: 8px; }
  .reset { align-self: flex-start; border: 0; background: none; padding: 0; color: var(--text-3); font-size: 12px; }
  .legend { position: absolute; left: 14px; right: 14px; bottom: 12px; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 11.5px; color: var(--text-3); }
  .legend button, .legend span { display: flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; color: inherit; font-size: inherit; }
  .legend button:hover { color: var(--text); } .legend button.off { opacity: 0.35; text-decoration: line-through; }
  .legend i { width: 8px; height: 8px; border-radius: 50%; }
  .legend small { color: var(--text-3); opacity: 0.7; }
  .legend .sep { width: 1px; height: 14px; background: var(--border-strong); }
  .legend .ln { color: var(--text-3); }
  .ring { width: 9px !important; height: 9px !important; border-radius: 50%; border: 1.5px solid #7dd3fc; background: none; }
  .hovercard { position: absolute; width: 240px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--glass-strong);
    box-shadow: var(--elev-2); pointer-events: none; font-size: 12px; z-index: 4; }
  .hc-t { display: flex; align-items: center; gap: 8px; } .hc-t i { width: 9px; height: 9px; border-radius: 50%; } .hc-t b { font-size: 13px; }
  .hc-s { color: var(--text-3); margin: 2px 0 8px 17px; }
  .hc-n { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--text-3); } .hc-n b { color: var(--text); } .hc-n .bad b { color: #ff8f40; }
  .card { position: absolute; top: 60px; right: 14px; bottom: 44px; width: min(420px, calc(100% - 28px)); overflow: auto; padding: 18px;
    border-radius: 16px; border: 1px solid var(--border); background: var(--glass-strong); box-shadow: var(--elev-2); z-index: 3; animation: in 0.2s ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } }
  .card header { display: flex; gap: 12px; align-items: flex-start; }
  .o { width: 12px; height: 12px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
  h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
  .card header p { margin: 2px 0 0; font-size: 11.5px; color: var(--text-3); word-break: break-all; }
  .x { margin-left: auto; border: 0; background: none; font-size: 20px; line-height: 1; color: var(--text-3); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
  .tags span { padding: 2px 8px; border-radius: 99px; font-size: 11px; color: var(--text-2); background: var(--surface-2); box-shadow: inset 0 1px 0 var(--edge); }
  .nums { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 4px 0 6px; }
  .nums div { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; border-radius: 10px; background: var(--surface-2); box-shadow: inset 0 1px 0 var(--edge), 0 2px 0 rgba(0, 0, 0, 0.3); }
  .nums b { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; } .nums span { font-size: 10.5px; color: var(--text-3); }
  .nums .bad b { color: #ff8f40; }
  h3 { margin: 18px 0 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
  h3 small { text-transform: none; letter-spacing: 0; font-weight: 400; margin-left: 6px; }
  .issues { display: flex; flex-direction: column; gap: 8px; }
  .plain { list-style: none; margin: 0; padding: 0; font-size: 12px; color: var(--text-2); display: grid; gap: 3px; }
  .links { display: flex; flex-wrap: wrap; gap: 6px; }
  .links button { display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border: 1px solid var(--border); border-radius: 99px; background: var(--surface-2); font-size: 12px; color: var(--text); }
  .links button:hover { border-color: var(--accent); }
  .links i { width: 7px; height: 7px; border-radius: 50%; } .links small { color: var(--text-3); font-size: 10.5px; }
  .methods { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .methods li { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
  .methods small { color: var(--text-3); text-align: right; }
  .more { margin-top: 6px; border: 0; background: none; padding: 0; color: var(--accent-text); font-size: 12px; }
  .reach { margin: 12px 0 2px; width: 100%; justify-content: center; }
  .file { margin: 18px 0 0; font-size: 11px; color: var(--text-3); word-break: break-all; }
</style>
