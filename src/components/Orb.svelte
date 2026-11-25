<script lang="ts">
  // The AI as a sphere tiled with hexagons, like a honeycomb ball, turning in 3D. Tiles facing you are brighter and the
  // far side shows through as faint outlines. Its mood sets colour, pace and shape: offline is grey and slow, idle
  // turns gently, reading spins faster with a wave running over the tiles, writing makes them swell, alert flares warm.
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

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size * 1.3;
    canvas.width = W * dpr;
    canvas.height = W * dpr;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Tile centres spread evenly over the sphere (a Fibonacci lattice); each tile is a small hexagon lying flat on the
    // surface, so tiles near the edge foreshorten and the sphere reads as a honeycomb ball. Fewer for a small orb.
    const N = size < 40 ? 60 : size < 100 ? 150 : 260;
    const R0 = 0.56 * Math.sqrt((4 * Math.PI) / N); // a tile's radius: a little under half the spacing, so gaps show
    const tiles = Array.from({ length: N }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963;
      const p = [Math.cos(a) * r, y, Math.sin(a) * r];
      // Two directions along the surface at this point, to lay the hexagon flat.
      const up = Math.abs(p[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
      let u = [up[1] * p[2] - up[2] * p[1], up[2] * p[0] - up[0] * p[2], up[0] * p[1] - up[1] * p[0]];
      const ul = Math.hypot(u[0], u[1], u[2]); u = u.map((x) => x / ul);
      const v = [p[1] * u[2] - p[2] * u[1], p[2] * u[0] - p[0] * u[2], p[0] * u[1] - p[1] * u[0]];
      return { p, u, v, i };
    });
    const proj = new Float32Array(N * 14), depth = new Float32Array(N), order = tiles.map((_, i) => i);
    let rot = 0, t = 0, last = performance.now(), raf = 0;
    const mix = (x: number, y: number, k: number) => x + (y - x) * k;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const want = LOOKS[mood], k = Math.min(1, dt * 2.5);
      cur.spin = mix(cur.spin, want.spin, k); cur.ripple = mix(cur.ripple, want.ripple, k); cur.pulse = mix(cur.pulse, want.pulse, k);
      cur.col = cur.col.map((v, i) => mix(v, want.col[i], k)) as [number, number, number];
      rot += dt * cur.spin;
      const R = size * 0.46 * (1 + Math.sin(t * 2.2) * cur.pulse * 0.4), c = W / 2;
      const cy = Math.cos(rot), sy0 = Math.sin(rot), tilt = 0.38, ct = Math.cos(tilt), st = Math.sin(tilt);
      // Turn a point on the sphere, tilt it towards the viewer, and project it; returns screen x, y and depth.
      const place = (x: number, y: number, z: number) => {
        const x1 = x * cy + z * sy0, z1 = -x * sy0 + z * cy;
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
        const pp = 2.8 / (2.8 - z2);
        return [c + x1 * R * pp, c + y2 * R * pp, z2];
      };
      for (const tl of tiles) {
        const [px, py, pz] = tl.p;
        // Reading: a wave runs over the tiles; writing: tiles swell outward from the front.
        const grow = 1 + cur.ripple * 2.2 * Math.sin(py * 7 + t * 3.2) + cur.pulse * 1.6 * Math.sin(t * 4 - tl.i * 0.05);
        const rr = R0 * Math.max(0.35, grow);
        const o = tl.i * 14;
        for (let k2 = 0; k2 < 6; k2++) {
          const a = (k2 * Math.PI) / 3, ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
          const q = place(px + tl.u[0] * ca + tl.v[0] * sa, py + tl.u[1] * ca + tl.v[1] * sa, pz + tl.u[2] * ca + tl.v[2] * sa);
          proj[o + k2 * 2] = q[0]; proj[o + k2 * 2 + 1] = q[1];
        }
        depth[tl.i] = place(px, py, pz)[2];
      }
      order.sort((a, b) => depth[a] - depth[b]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const [r0, g0, b0] = cur.col.map((v) => v | 0);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(0.6, size / 160);
      for (const i of order) {
        const d = depth[i]; // -1 at the back, 1 facing the viewer
        const o = i * 14;
        ctx.beginPath();
        for (let k2 = 0; k2 < 6; k2++) ctx[k2 ? 'lineTo' : 'moveTo'](proj[o + k2 * 2], proj[o + k2 * 2 + 1]);
        ctx.closePath();
        if (d < 0) {
          // The far side shows through as faint outlines, so the ball reads as hollow glass.
          ctx.strokeStyle = `rgba(${r0},${g0},${b0},${0.1 + 0.12 * (1 + d)})`;
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${r0},${g0},${b0},${0.18 + 0.62 * d})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${Math.min(255, r0 + 60)},${Math.min(255, g0 + 60)},${Math.min(255, b0 + 40)},${0.25 + 0.6 * d})`;
          ctx.stroke();
        }
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
  <canvas bind:this={canvas} style:width="{size * 1.3}px" style:height="{size * 1.3}px"></canvas>
</div>

<style>
  .orb { position: relative; flex-shrink: 0; }
  canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; }
</style>
