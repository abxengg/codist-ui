<script lang="ts">
  // The AI as a sphere of points turning in 3D. Each point is a flat dot; nearer ones are larger and brighter, so the
  // sphere reads as solid without any gradient. Its mood sets colour, pace and shape: offline is grey and slow, idle
  // turns gently, reading spins faster and ripples, writing pulses outward, alert flares warm for a moment.
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
    // Points spread evenly over a sphere (a Fibonacci lattice). Fewer for a small orb.
    const N = size < 40 ? 70 : size < 100 ? 260 : 520;
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963;
      return [Math.cos(a) * r, y, Math.sin(a) * r] as [number, number, number];
    });
    const order = pts.map((_, i) => i);
    const z = new Float32Array(N), sx = new Float32Array(N), sy = new Float32Array(N);
    let rot = 0, t = 0, last = performance.now(), raf = 0;
    const mix = (x: number, y: number, k: number) => x + (y - x) * k;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; t += dt;
      const want = LOOKS[mood], k = Math.min(1, dt * 2.5);
      cur.spin = mix(cur.spin, want.spin, k); cur.ripple = mix(cur.ripple, want.ripple, k); cur.pulse = mix(cur.pulse, want.pulse, k);
      cur.col = cur.col.map((v, i) => mix(v, want.col[i], k)) as [number, number, number];
      rot += dt * cur.spin;
      const R = size * 0.46 * (1 + Math.sin(t * 2.2) * cur.pulse * 0.5), c = W / 2;
      const cy = Math.cos(rot), sy0 = Math.sin(rot), tilt = 0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (let i = 0; i < N; i++) {
        let [x, y, zz] = pts[i];
        const wave = 1 + cur.ripple * Math.sin(y * 6 + t * 3) + cur.pulse * Math.sin(t * 4 - i * 0.02);
        x *= wave; y *= wave; zz *= wave;
        const x1 = x * cy + zz * sy0, z1 = -x * sy0 + zz * cy; // turn around the vertical axis
        const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct; // tilt towards the viewer
        const p = 2.6 / (2.6 - z2); // perspective
        sx[i] = c + x1 * R * p; sy[i] = c + y2 * R * p; z[i] = z2;
      }
      order.sort((a, b) => z[a] - z[b]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const [r0, g0, b0] = cur.col.map((v) => v | 0);
      const dot = Math.max(0.8, size / 110);
      for (const i of order) {
        const d = (z[i] + 1) / 2; // 0 far, 1 near
        ctx.fillStyle = `rgba(${r0},${g0},${b0},${0.18 + 0.82 * d})`;
        ctx.beginPath(); ctx.arc(sx[i], sy[i], dot * (0.55 + d), 0, Math.PI * 2); ctx.fill();
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
