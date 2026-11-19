<script lang="ts">
  // The AI, drawn flat: one solid shape whose edge is moved by a few slow waves. Its mood sets colour and pace:
  // offline is grey and almost still, idle breathes, reading turns faster with dots drawn in, writing sends dots out,
  // alert pulses warm for a moment. No gradients, no glow.
  import type { Mood } from '../lib/live.svelte';

  let { mood = 'idle', size = 160, label = '' }: { mood?: Mood; size?: number; label?: string } = $props();

  type Look = { col: [number, number, number]; pace: number; wobble: number; dots: number; inward: number };
  const LOOKS: Record<Mood, Look> = {
    offline: { col: [142, 142, 150], pace: 0.12, wobble: 0.02, dots: 0, inward: 0 },
    idle: { col: [124, 92, 255], pace: 0.35, wobble: 0.025, dots: 0, inward: 0 },
    reading: { col: [80, 150, 255], pace: 1.1, wobble: 0.04, dots: 14, inward: 1 },
    writing: { col: [150, 100, 255], pace: 1.6, wobble: 0.05, dots: 12, inward: -1 },
    alert: { col: [255, 140, 60], pace: 2.2, wobble: 0.07, dots: 10, inward: -1 },
  };

  let canvas: HTMLCanvasElement | undefined = $state();
  let cur: Look = { ...LOOKS.idle, col: [...LOOKS.idle.col] };

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size * 1.6;
    canvas.width = W * dpr;
    canvas.height = W * dpr;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    type D = { ang: number; r: number; v: number; life: number };
    let ds: D[] = [];
    let phase = 0, last = performance.now(), raf = 0;
    const mix = (x: number, y: number, k: number) => x + (y - x) * k;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const want = LOOKS[mood];
      const k = Math.min(1, dt * 2.5);
      cur.pace = mix(cur.pace, want.pace, k); cur.wobble = mix(cur.wobble, want.wobble, k);
      cur.dots = mix(cur.dots, want.dots, k); cur.inward = mix(cur.inward, want.inward, k);
      cur.col = cur.col.map((v, i) => mix(v, want.col[i], k)) as [number, number, number];
      phase += dt * cur.pace;
      const t = phase, R = size * 0.42, c = W / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const fill = `rgb(${cur.col[0] | 0},${cur.col[1] | 0},${cur.col[2] | 0})`;
      const breathe = 1 + Math.sin(t * 1.3) * 0.03;
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const r = R * breathe * (1 + cur.wobble * (Math.sin(3 * a + t * 1.7) + 0.6 * Math.sin(5 * a - t * 2.3) + 0.35 * Math.sin(2 * a + t * 0.9)));
        i ? ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : ctx.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      // Small flat dots: drawn in while reading, sent out while writing. None on a small orb.
      const n = size < 60 ? 0 : Math.round(cur.dots);
      while (ds.length < n) ds.push({ ang: Math.random() * Math.PI * 2, r: R * (1.2 + Math.random() * 0.5), v: 0.4 + Math.random() * 0.6, life: Math.random() });
      if (ds.length > n) ds = ds.slice(0, n);
      ctx.fillStyle = fill;
      for (const d of ds) {
        d.ang += dt * d.v * 0.8 * (cur.pace + 0.2);
        d.r -= dt * d.v * R * 0.4 * cur.inward;
        d.life += dt * 0.45;
        if (d.r < R * 1.08 || d.r > R * 1.8 || d.life > 1) { d.ang = Math.random() * Math.PI * 2; d.r = cur.inward >= 0 ? R * (1.5 + Math.random() * 0.25) : R * 1.1; d.life = 0; }
        ctx.globalAlpha = Math.sin(Math.PI * Math.min(1, d.life));
        ctx.beginPath(); ctx.arc(c + Math.cos(d.ang) * d.r, c + Math.sin(d.ang) * d.r, 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const vis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); };
  });
</script>

<div class="orb" style:width="{size}px" style:height="{size}px" role="img" aria-label={label || `AI: ${mood}`}>
  <canvas bind:this={canvas} style:width="{size * 1.6}px" style:height="{size * 1.6}px"></canvas>
</div>

<style>
  .orb { position: relative; flex-shrink: 0; }
  canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; }
</style>
