<script lang="ts">
  // The AI as a sphere of particles: points strung along a geodesic honeycomb, so close up it is hexagons made of
  // dots and from afar a glowing shell, brighter at the rim, its surface rippling. Its mood shows in the motion:
  //   offline  grey, slow and still;          idle     a calm shimmer;
  //   reading  deeper, faster ripples and a breathing glow inside (it is thinking);
  //   writing  the surface swells, and a big orb comes apart into a cloud and forms again (it is making something);
  //   alert    warm and restless (it found something). The pointer pushes particles aside.
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
    // The particles: points strung along the lines of a geodesic honeycomb, so close up the sphere is hexagons made
    // of dots, and from afar a glowing cloud; plus a sparse dust over the whole surface. Fewer for a small orb.
    const { pts, lines } = honeycomb(size < 40 ? 1 : 2);
    const per = size < 40 ? 4 : size < 100 ? 6 : 9;
    const dust = size < 40 ? 60 : size < 100 ? 260 : 700;
    const P = lines.length * per + dust;
    const px = new Float32Array(P), py = new Float32Array(P), pz = new Float32Array(P), seed = new Float32Array(P);
    let n = 0;
    const put = (x: number, y: number, z: number) => { const l = Math.hypot(x, y, z) || 1; px[n] = x / l; py[n] = y / l; pz[n] = z / l; seed[n] = Math.random(); n++; };
    for (const [a, b] of lines) for (let k = 0; k < per; k++) {
      const f = (k + Math.random() * 0.6) / per, j = 0.012;
      put(pts[a][0] + (pts[b][0] - pts[a][0]) * f + (Math.random() - 0.5) * j, pts[a][1] + (pts[b][1] - pts[a][1]) * f + (Math.random() - 0.5) * j, pts[a][2] + (pts[b][2] - pts[a][2]) * f + (Math.random() - 0.5) * j);
    }
    for (let i = 0; i < dust; i++) { const y = 1 - (2 * (i + 0.5)) / dust, r = Math.sqrt(1 - y * y), a = i * 2.399963; put(Math.cos(a) * r, y, Math.sin(a) * r); }
    // Where each particle is pushed off its place (while working, and under the pointer), easing back.
    const ox = new Float32Array(P), oy = new Float32Array(P);
    // A few waves over the surface, in fixed directions, make it ripple like something alive.
    const waves = [[0.8, 0.5, 0.33, 5.0, 1.1], [-0.4, 0.9, 0.2, 7.0, -1.4], [0.3, -0.2, 0.93, 9.0, 0.8], [-0.7, -0.6, 0.38, 13.0, 1.9]];
    let mx = -1e4, my = -1e4;
    const cv = canvas;
    const onMove = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width) * W; my = ((e.clientY - r.top) / r.height) * W; };
    const onLeave = () => { mx = -1e4; my = -1e4; };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    let rot = 0, t = 0, last = performance.now(), raf = 0;
    const mix = (x: number, y: number, k: number) => x + (y - x) * k;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const want = LOOKS[mood], k = Math.min(1, dt * 2.5);
      cur.spin = mix(cur.spin, want.spin, k); cur.ripple = mix(cur.ripple, want.ripple, k); cur.pulse = mix(cur.pulse, want.pulse, k);
      cur.think = mix(cur.think, want.think, k); cur.make = mix(cur.make, want.make, k);
      cur.col = cur.col.map((v, i) => mix(v, want.col[i], k)) as [number, number, number];
      rot += dt * cur.spin * 0.5;
      const busy = Math.max(cur.think, cur.make);
      const R = size * 0.44 * (1 + Math.sin(t * 2.2) * cur.pulse * 0.2), c = W / 2;
      const cy = Math.cos(rot), sy0 = Math.sin(rot), tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
      // How rough the surface is: a calm shimmer when idle, deeper and faster waves while working.
      const amp = 0.025 + cur.ripple * 0.5 + cur.make * 0.04, speed = 0.6 + busy * 1.4;
      // Big orbs come apart into a looser cloud and form again every few seconds while the AI works.
      const cycle = 0.5 - 0.5 * Math.cos(t * 0.55);
      const apart = size >= 60 ? busy * cycle * cycle : 0;
      const [r0, g0, b0] = cur.col.map((v) => v | 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      // A faint glow inside, breathing while it works.
      const core = ctx.createRadialGradient(c, c, 0, c, c, R * 1.1);
      core.addColorStop(0, `rgba(${r0},${g0},${b0},${0.1 + 0.18 * busy * (0.7 + 0.3 * Math.sin(t * 2.6))})`);
      core.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(c, c, R * 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const dot = Math.max(0.6, size / 150);
      const hoverR = R * 0.55;
      for (let i = 0; i < P; i++) {
        let x = px[i], y = py[i], z = pz[i];
        let rr = 1;
        for (const [wx, wy, wz, f, sp] of waves) rr += amp * Math.sin((x * wx + y * wy + z * wz) * f + t * sp * speed) * 0.5;
        rr += apart * (0.25 + seed[i] * 0.55);
        x *= rr; y *= rr; z *= rr;
        const x1 = x * cy + z * sy0, z1 = -x * sy0 + z * cy;
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        let sx = c + x1 * R, sy = c + y2 * R;
        // The pointer pushes nearby particles aside; they ease back when it leaves.
        let tx = 0, ty = 0;
        const hx = sx + ox[i] - mx, hy = sy + oy[i] - my, hd = Math.hypot(hx, hy);
        if (hd < hoverR) { const push = (1 - hd / hoverR) ** 2 * R * 0.4; tx = (hx / (hd || 1)) * push; ty = (hy / (hd || 1)) * push; }
        const kk = Math.min(1, dt * (2 + seed[i] * 2));
        ox[i] += (tx - ox[i]) * kk; oy[i] += (ty - oy[i]) * kk;
        sx += ox[i]; sy += oy[i];
        // Brighter towards the rim and in front, as in a shell of light; the dust is fainter than the honeycomb.
        const rim = 1 - Math.min(1, Math.abs(z2 / rr)), front = (z2 / rr + 1) / 2;
        let a = (0.1 + 0.55 * rim * rim + 0.25 * front) * (i < lines.length * per ? 1 : 0.45);
        // A few particles sparkle.
        const tw = seed[i] > 0.985 ? 0.6 + 0.4 * Math.sin(t * 3 + seed[i] * 50) : 0;
        a = Math.min(1, a + tw);
        if (a < 0.03) continue;
        const sz = dot * (0.7 + front * 0.8 + tw * 1.2);
        ctx.fillStyle = tw > 0.2 ? `rgba(255,255,255,${a})` : `rgba(${Math.min(255, r0 + 70 * rim)},${Math.min(255, g0 + 70 * rim)},${Math.min(255, b0 + 40 * rim)},${a})`;
        ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerleave', onLeave); };
  });
</script>

<div class="orb" style:width="{size}px" style:height="{size}px" role="img" aria-label={label || `AI: ${mood}`}>
  <canvas bind:this={canvas} style:width="{size * 1.5}px" style:height="{size * 1.5}px"></canvas>
</div>

<style>
  .orb { position: relative; flex-shrink: 0; }
  canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
</style>
