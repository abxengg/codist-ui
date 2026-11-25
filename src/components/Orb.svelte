<script lang="ts">
  // The AI as a glass sphere with a honeycomb of fine lines on it, turning slowly: the far side shows faintly through
  // the glass, the rim glows, and highlights catch the light. Its mood sets colour, pace and glow: offline is grey and
  // slow, idle turns gently, reading sends a band of light across the lines, writing and alert make the rim flare.
  import type { Mood } from '../lib/live.svelte';

  let { mood = 'idle', size = 160, label = '' }: { mood?: Mood; size?: number; label?: string } = $props();

  type Look = { col: [number, number, number]; spin: number; ripple: number; pulse: number };
  const LOOKS: Record<Mood, Look> = {
    offline: { col: [150, 150, 160], spin: 0.08, ripple: 0, pulse: 0 },
    idle: { col: [140, 112, 255], spin: 0.25, ripple: 0.03, pulse: 0.02 },
    reading: { col: [96, 165, 255], spin: 0.7, ripple: 0.09, pulse: 0.03 },
    writing: { col: [168, 120, 255], spin: 0.5, ripple: 0.06, pulse: 0.09 },
    alert: { col: [255, 146, 64], spin: 1.1, ripple: 0.12, pulse: 0.12 },
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
    return { pts: cen, lines };
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
    const { pts, lines } = honeycomb(size < 40 ? 1 : 2);
    const P = pts.length, sx = new Float32Array(P), sy = new Float32Array(P), sz = new Float32Array(P);
    let rot = 0, t = 0, last = performance.now(), raf = 0;
    const mix = (x: number, y: number, k: number) => x + (y - x) * k;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const want = LOOKS[mood], k = Math.min(1, dt * 2.5);
      cur.spin = mix(cur.spin, want.spin, k); cur.ripple = mix(cur.ripple, want.ripple, k); cur.pulse = mix(cur.pulse, want.pulse, k);
      cur.col = cur.col.map((v, i) => mix(v, want.col[i], k)) as [number, number, number];
      rot += dt * cur.spin * 0.6;
      const R = size * 0.46 * (1 + Math.sin(t * 2.2) * cur.pulse * 0.25), c = W / 2;
      const cy = Math.cos(rot), sy0 = Math.sin(rot), tilt = 0.32, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i < P; i++) {
        const [x, y, z] = pts[i];
        const x1 = x * cy + z * sy0, z1 = -x * sy0 + z * cy;
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        sx[i] = c + x1 * R; sy[i] = c + y2 * R; sz[i] = z2;
      }
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
      ctx.strokeStyle = col(0.13); ctx.stroke();
      // The glass: clear in the middle, tinted towards the edge, as light bends through a bubble.
      const body = ctx.createRadialGradient(c - R * 0.25, c - R * 0.3, R * 0.1, c, c, R);
      body.addColorStop(0, col(0.04)); body.addColorStop(0.7, col(0.1)); body.addColorStop(1, col(0.38));
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
      // The near side of the honeycomb. Reading sends a band of light across the lines.
      for (const [a, b] of lines) {
        const z = (sz[a] + sz[b]) / 2;
        if (z < 0) continue;
        const band = cur.ripple * 5 * Math.max(0, Math.sin((sy[a] / W) * 9 - t * 3.4));
        const edge = 1 - z; // lines near the rim read brighter, as on a glass dome
        ctx.strokeStyle = lite(Math.min(0.95, 0.16 + 0.42 * edge + band));
        ctx.beginPath(); ctx.moveTo(sx[a], sy[a]); ctx.lineTo(sx[b], sy[b]); ctx.stroke();
      }
      // The rim, glowing; brighter and wider while the AI writes or something is found.
      ctx.save();
      ctx.shadowColor = col(0.9);
      ctx.shadowBlur = Math.max(4, size * (0.12 + cur.pulse * 0.8));
      ctx.lineWidth = Math.max(1, size / 70);
      ctx.strokeStyle = lite(0.85);
      ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
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
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); };
  });
</script>

<div class="orb" style:width="{size}px" style:height="{size}px" role="img" aria-label={label || `AI: ${mood}`}>
  <canvas bind:this={canvas} style:width="{size * 1.5}px" style:height="{size * 1.5}px"></canvas>
</div>

<style>
  .orb { position: relative; flex-shrink: 0; }
  canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; }
</style>
