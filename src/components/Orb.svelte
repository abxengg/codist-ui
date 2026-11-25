<script lang="ts">
  // The AI as a glass sphere with a honeycomb of fine lines on it, turning slowly: the far side shows faintly through
  // the glass, the rim glows, and highlights catch the light. Its mood shows in what happens inside:
  //   offline  grey and slow, nothing lights;            idle     turns gently, a cell glints now and then;
  //   reading  cells slowly glow and fade, the core breathes (it is thinking);
  //   writing  rings of lit cells spread from the front and light ripples out past the rim (it is making something);
  //   working  (reading or writing) soft particles drift around the sphere on slow orbits, and fade when it rests;
  //   alert    a warm flare and a burst of cells (it found something).
  import type { Mood } from '../lib/live.svelte';

  let { mood = 'idle', size = 160, label = '' }: { mood?: Mood; size?: number; label?: string } = $props();

  type Look = { col: [number, number, number]; spin: number; ripple: number; pulse: number; think: number; make: number };
  const LOOKS: Record<Mood, Look> = {
    offline: { col: [150, 150, 160], spin: 0.08, ripple: 0, pulse: 0, think: 0, make: 0 },
    idle: { col: [140, 112, 255], spin: 0.25, ripple: 0.02, pulse: 0.02, think: 0.06, make: 0 },
    reading: { col: [150, 112, 255], spin: 0.45, ripple: 0.06, pulse: 0.03, think: 1, make: 0 },
    writing: { col: [176, 120, 255], spin: 0.4, ripple: 0.03, pulse: 0.08, think: 0.35, make: 1 },
    alert: { col: [255, 146, 64], spin: 1.2, ripple: 0.08, pulse: 0.12, think: 1, make: 0.6 },
  };

  let canvas: HTMLCanvasElement | undefined = $state();
  let cur: Look = { ...LOOKS.idle, col: [...LOOKS.idle.col] };

  // The honeycomb on the sphere: an icosahedron, split into smaller triangles and pushed out onto the sphere; the
  // lines joining the centres of neighbouring triangles form hexagons (and twelve pentagons), as on a geodesic dome.
  function honeycomb(level: number) {
    const t = (1 + Math.sqrt(5)) / 2;
    let v: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const norm = (p: number[]) => { const l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; };
    v = v.map(norm);
    for (let l = 0; l < level; l++) {
      const mid = new Map<string, number>(), nf: number[][] = [];
      const m = (a: number, b: number) => {
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        let i = mid.get(k);
        if (i === undefined) { i = v.length; v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])); mid.set(k, i); }
        return i;
      };
      for (const [a, b, c] of f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      f = nf;
    }
    const cen = f.map(([a, b, c]) => norm([v[a][0] + v[b][0] + v[c][0], v[a][1] + v[b][1] + v[c][1], v[a][2] + v[b][2] + v[c][2]]));
    const byEdge = new Map<string, number>(), lines: [number, number][] = [];
    f.forEach((tri, i) => {
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3], k = a < b ? `${a},${b}` : `${b},${a}`;
        const j = byEdge.get(k);
        if (j === undefined) byEdge.set(k, i); else lines.push([i, j]);
      }
    });
    // The cells: around each corner of the split icosahedron, the centres of the triangles that meet there, in order.
    const around = new Map<number, number[]>();
    f.forEach((tri, i) => tri.forEach((x) => around.set(x, [...(around.get(x) ?? []), i])));
    const cells: { c: number[]; at: number[] }[] = [];
    for (const [x, fs] of around) {
      const p = v[x], up = Math.abs(p[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = norm([up[1] * p[2] - up[2] * p[1], up[2] * p[0] - up[0] * p[2], up[0] * p[1] - up[1] * p[0]]);
      const w = [p[1] * u[2] - p[2] * u[1], p[2] * u[0] - p[0] * u[2], p[0] * u[1] - p[1] * u[0]];
      const ang = (i: number) => Math.atan2(cen[i][0] * w[0] + cen[i][1] * w[1] + cen[i][2] * w[2], cen[i][0] * u[0] + cen[i][1] * u[1] + cen[i][2] * u[2]);
      cells.push({ c: [...fs].sort((a, b) => ang(a) - ang(b)), at: p });
    }
    return { pts: cen, lines, cells };
  }

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size * 1.5;
    canvas.width = W * dpr;
    canvas.height = W * dpr;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const { pts, lines, cells } = honeycomb(size < 40 ? 1 : 2);
    const heat = new Float32Array(cells.length); // how lit each cell is now
    const glow = new Float32Array(cells.length); // how lit it is heading to: cells ease towards it, so they fade in and out
    let spawn = 0;
    const P = pts.length, sx = new Float32Array(P), sy = new Float32Array(P), sz = new Float32Array(P);
    // Each point can leave its place on the sphere: ox, oy is how far it is off now, easing towards where it is sent.
    const ox = new Float32Array(P), oy = new Float32Array(P), seed = Float32Array.from({ length: P }, () => Math.random());
    // Soft particles drifting around the sphere while the AI works: each on its own slow orbit, just off the surface.
    const DN = size < 40 ? 0 : size < 100 ? 40 : 110;
    const drift = Array.from({ length: DN }, () => {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      return { p: [Math.cos(a) * r, u, Math.sin(a) * r], h: 1.06 + Math.random() * 0.34, sp: 0.15 + Math.random() * 0.35, ph: Math.random() * 6.28, s: 0.6 + Math.random() * 0.9 };
    });
    let driftOn = 0;
    // The pointer over the orb, in canvas pixels; particles near it move aside.
    let mx = -1e4, my = -1e4;
    const cv = canvas;
    const onMove = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width) * W; my = ((e.clientY - r.top) / r.height) * W; };
    const onLeave = () => { mx = -1e4; my = -1e4; };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    // It looks at you: the pointer anywhere on the page turns the sphere a little towards it.
    let gx = 0, gy = 0, gazeX = 0, gazeY = 0;
    const onLook = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect(), cx0 = r.left + r.width / 2, cy0 = r.top + r.height / 2;
      gx = Math.max(-1, Math.min(1, (e.clientX - cx0) / (window.innerWidth * 0.5)));
      gy = Math.max(-1, Math.min(1, (e.clientY - cy0) / (window.innerHeight * 0.5)));
    };
    window.addEventListener('pointermove', onLook);
    let near = 0; // how close the pointer is, for the sphere to brighten
    let rot = 0, t = 0, last = performance.now(), raf = 0;
    const mix = (x: number, y: number, k: number) => x + (y - x) * k;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const want = LOOKS[mood], k = Math.min(1, dt * 2.5);
      cur.spin = mix(cur.spin, want.spin, k); cur.ripple = mix(cur.ripple, want.ripple, k); cur.pulse = mix(cur.pulse, want.pulse, k);
      cur.think = mix(cur.think, want.think, k); cur.make = mix(cur.make, want.make, k);
      cur.col = cur.col.map((v, i) => mix(v, want.col[i], k)) as [number, number, number];
      rot += dt * cur.spin * 0.6;
      // It breathes: a slow swell all the time, a little deeper while it works.
      const breath = Math.sin(t * 1.25) * (0.018 + 0.02 * Math.max(cur.think, cur.make));
      const R = size * 0.46 * (1 + breath + Math.sin(t * 2.2) * cur.pulse * 0.25), c = W / 2;
      gazeX += (gx - gazeX) * Math.min(1, dt * 2); gazeY += (gy - gazeY) * Math.min(1, dt * 2);
      near += ((mx > -1e3 ? 1 : 0) - near) * Math.min(1, dt * 4);
      const yaw = rot + gazeX * 0.6, tilt = 0.32 + gazeY * 0.35;
      const cy = Math.cos(yaw), sy0 = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i < P; i++) {
        const [x, y, z] = pts[i];
        const x1 = x * cy + z * sy0, z1 = -x * sy0 + z * cy;
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        sx[i] = c + x1 * R; sy[i] = c + y2 * R; sz[i] = z2;
      }
      // Deform and form: while the AI works, the honeycomb loosens every few seconds, its points drifting outward and
      // swirling into a cloud of particles, then eases back into the sphere. Points near the pointer move aside.
      const busyNow = Math.max(cur.think, cur.make);
      const cycle = 0.5 - 0.5 * Math.cos(t * 0.55); // 0 whole, 1 most apart; about 11 seconds a round
      const apart = 0 * cycle; // the sphere itself stays whole and calm; the drifting particles around it show the work
      const hoverR = R * 0.55;
      let loose = 0;
      for (let i = 0; i < P; i++) {
        const dx0 = sx[i] - c, dy0 = sy[i] - c, d0 = Math.hypot(dx0, dy0) || 1;
        const s0 = seed[i], spin = t * (0.4 + s0 * 0.5) + s0 * 6.28;
        let tx = (dx0 / d0) * R * 0.45 * apart * (0.5 + s0) + Math.cos(spin) * R * 0.16 * apart;
        let ty = (dy0 / d0) * R * 0.45 * apart * (0.5 + s0) + Math.sin(spin) * R * 0.16 * apart;
        const hx = sx[i] + ox[i] - mx, hy = sy[i] + oy[i] - my, hd = Math.hypot(hx, hy);
        if (hd < hoverR && sz[i] > -0.2) { const push = (1 - hd / hoverR) ** 2 * R * 0.35; tx += (hx / (hd || 1)) * push; ty += (hy / (hd || 1)) * push; }
        const k = Math.min(1, dt * (2.2 + s0));
        ox[i] += (tx - ox[i]) * k; oy[i] += (ty - oy[i]) * k;
        sx[i] += ox[i]; sy[i] += oy[i];
        loose = Math.max(loose, Math.hypot(ox[i], oy[i]) / R);
      }
      const lineFade = Math.max(0, 1 - apart * 1.8); // the further it comes apart, the fainter the lines; a hover only moves points
      const [r0, g0, b0] = cur.col.map((v) => v | 0);
      const col = (a: number) => `rgba(${r0},${g0},${b0},${a})`;
      const lite = (a: number) => `rgba(${Math.min(255, r0 + 90)},${Math.min(255, g0 + 90)},${Math.min(255, b0 + 60)},${a})`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const lw = Math.max(0.5, size / 220);
      // The far side of the honeycomb, faint, seen through the glass.
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (const [a, b] of lines) if (sz[a] + sz[b] < 0) { ctx.moveTo(sx[a], sy[a]); ctx.lineTo(sx[b], sy[b]); }
      ctx.strokeStyle = col(0.13 * (0.3 + 0.7 * lineFade)); ctx.stroke();
      // Thinking: cells light at random, mostly on the near side, and fade. Making: rings of cells light outward from
      // the point facing the viewer.
      // Slow and smooth: a few cells at a time start to glow, ease up over about a second and fade over a few.
      for (let i = 0; i < heat.length; i++) {
        glow[i] *= Math.exp(-dt * 0.55);
        heat[i] += (glow[i] - heat[i]) * Math.min(1, dt * 1.4);
      }
      spawn += dt * (0.6 + 5 * cur.think + 6 * near);
      while (spawn > 1) {
        spawn -= 1;
        const i = (Math.random() * cells.length) | 0;
        if (cur.think > 0.02 || Math.random() < 0.15) glow[i] = Math.max(glow[i], 0.55 + Math.random() * 0.45);
      }
      const cz = (cell: { at: number[] }) => { const [x, y, z] = cell.at; const z1 = -x * sy0 + z * cy; return y * st + z1 * ct; };
      // A soft core of light, breathing while the AI works.
      const busy = Math.max(cur.think, cur.make);
      if (busy > 0.05) {
        const core = ctx.createRadialGradient(c, c, 0, c, c, R * 0.9);
        core.addColorStop(0, col(0.32 * busy * (0.7 + 0.3 * Math.sin(t * 3.1))));
        core.addColorStop(1, col(0));
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
      }
      // The glass: clear in the middle, tinted towards the edge, as light bends through a bubble.
      const body = ctx.createRadialGradient(c - R * 0.25, c - R * 0.3, R * 0.1, c, c, R);
      body.addColorStop(0, col(0.04)); body.addColorStop(0.7, col(0.1)); body.addColorStop(1, col(0.38));
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
      // The lit cells, on the near side, filled with light.
      cells.forEach((cell, i) => {
        const z = cz(cell);
        if (z < 0) return;
        const wave = cur.make > 0.02 ? cur.make * Math.max(0, Math.sin((1 - z) * 9 - t * 4.2)) ** 3 : 0;
        const a = Math.min(1, heat[i] * Math.max(cur.think, 0.25) + wave) * (0.25 + 0.75 * z);
        if (a < 0.03) return;
        ctx.beginPath();
        cell.c.forEach((j, k2) => ctx[k2 ? 'lineTo' : 'moveTo'](sx[j], sy[j]));
        ctx.closePath();
        ctx.fillStyle = lite(a * 0.55);
        ctx.fill();
      });
      // The near side of the honeycomb. Reading sends a band of light across the lines.
      for (const [a, b] of lines) {
        const z = (sz[a] + sz[b]) / 2;
        if (z < 0) continue;
        const band = cur.ripple * 5 * Math.max(0, Math.sin((sy[a] / W) * 9 - t * 3.4));
        const edge = 1 - z; // lines near the rim read brighter, as on a glass dome
        ctx.strokeStyle = lite(Math.min(0.95, 0.16 + 0.42 * edge + band) * (0.25 + 0.75 * lineFade));
        ctx.beginPath(); ctx.moveTo(sx[a], sy[a]); ctx.lineTo(sx[b], sy[b]); ctx.stroke();
      }
      // The particles: each point as a small glowing dot, brighter the further it has left its place.
      if (loose > 0.01) {
        for (let i = 0; i < P; i++) {
          const off = Math.hypot(ox[i], oy[i]) / R, front = (sz[i] + 1) / 2;
          const a = Math.min(0.9, off * 3.2) * (0.35 + 0.65 * front);
          if (a < 0.03) continue;
          ctx.fillStyle = lite(a);
          ctx.beginPath(); ctx.arc(sx[i], sy[i], Math.max(0.7, size / 120) * (0.8 + front), 0, Math.PI * 2); ctx.fill();
        }
      }
      // The drifting particles: they fade in while the AI works and out when it rests, rising and falling gently
      // around the sphere, the far ones dimmer, behind the glass.
      driftOn += ((busyNow > 0.1 ? 1 : 0.35) - driftOn) * Math.min(1, dt * 0.8); // a few float even at rest
      if (driftOn > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        for (const d of drift) {
          const ang = t * d.sp * 0.35 + d.ph;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          let [x, y, z] = d.p;
          [x, z] = [x * ca + z * sa, -x * sa + z * ca]; // its own slow orbit around the vertical
          // At rest they float; while it works they stream in towards the sphere and new ones come from outside.
          const inflow = Math.max(0, driftOn - 0.35) / 0.65;
          const life = (t * 0.12 * (0.6 + d.sp) + d.ph / 6.28) % 1;
          const h = (d.h + Math.sin(t * 0.6 + d.ph) * 0.05) * (1 - inflow) + (1.55 - life * 0.55) * inflow;
          x *= h; y *= h; z *= h;
          const x1 = x * cy + z * sy0, z1 = -x * sy0 + z * cy;
          const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
          const front = (z2 / h + 1) / 2;
          const fadeEnds = inflow > 0 ? Math.min(1, Math.sin(life * Math.PI) * 1.6) * inflow + (1 - inflow) : 1;
          const a = driftOn * fadeEnds * (0.12 + 0.5 * front) * (0.6 + 0.4 * Math.sin(t * 1.3 + d.ph * 3));
          const rad = Math.max(0.6, size / 140) * d.s * (0.7 + front * 0.6);
          ctx.fillStyle = lite(a);
          ctx.beginPath(); ctx.arc(c + x1 * R, c + y2 * R, rad, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      // The rim, glowing; brighter and wider while the AI writes or something is found.
      ctx.save();
      ctx.shadowColor = col(0.9);
      ctx.shadowBlur = Math.max(4, size * (0.12 + cur.pulse * 0.8 + near * 0.12 + Math.max(0, breath) * 2));
      ctx.lineWidth = Math.max(1, size / 70);
      ctx.strokeStyle = lite(Math.min(1, 0.75 + near * 0.25));
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      // Making: rings of light leave the rim and fade as they grow.
      if (cur.make > 0.05) {
        for (let k2 = 0; k2 < 3; k2++) {
          const ph = (t * 0.55 + k2 / 3) % 1;
          ctx.strokeStyle = lite(cur.make * 0.45 * (1 - ph));
          ctx.lineWidth = Math.max(0.8, size / 110) * (1 - ph * 0.6);
          ctx.beginPath(); ctx.arc(c, c, R * (1.02 + ph * 0.26), 0, Math.PI * 2); ctx.stroke();
        }
      }
      // Highlights where the light catches the glass: they stay put while the honeycomb turns under them.
      if (size >= 24) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.ellipse(c - R * 0.42, c - R * 0.45, R * 0.17, R * 0.07, -0.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(c + R * 0.5, c - R * 0.3, R * 0.06, R * 0.025, 0.9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(c + R * 0.38, c + R * 0.55, R * 0.05, R * 0.02, -0.5, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave); window.removeEventListener('pointermove', onLook); };
  });
</script>

<div class="orb" style:width="{size}px" style:height="{size}px" role="img" aria-label={label || `AI: ${mood}`}>
  <canvas bind:this={canvas} style:width="{size * 1.5}px" style:height="{size * 1.5}px"></canvas>
</div>

<style>
  .orb { position: relative; flex-shrink: 0; }
  canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
</style>
