<script lang="ts">
  // The AI, drawn as a living orb. A soft blob whose edge is moved by a few slow waves, lit from inside by swirling
  // bands, with a glow around it. Its mood sets colour and pace: offline is grey and still, idle breathes, reading
  // swirls and draws particles in, writing ripples outward, alert flares warm for a moment.
  import type { Mood } from '../lib/live.svelte';

  let { mood = 'idle', size = 160, label = '' }: { mood?: Mood; size?: number; label?: string } = $props();

  type Look = { a: [number, number, number]; b: [number, number, number]; c: [number, number, number]; pace: number; wobble: number; glow: number; particles: number; inward: number };
  const LOOKS: Record<Mood, Look> = {
    offline: { a: [118, 110, 170], b: [62, 60, 96], c: [150, 140, 200], pace: 0.12, wobble: 0.02, glow: 0.22, particles: 0, inward: 0 },
    idle: { a: [124, 92, 255], b: [56, 189, 248], c: [236, 72, 153], pace: 0.35, wobble: 0.035, glow: 0.45, particles: 10, inward: 0 },
    reading: { a: [56, 189, 248], b: [124, 92, 255], c: [45, 212, 191], pace: 1.1, wobble: 0.06, glow: 0.75, particles: 46, inward: 1 },
    writing: { a: [192, 132, 252], b: [236, 72, 153], c: [99, 102, 241], pace: 1.6, wobble: 0.08, glow: 0.85, particles: 34, inward: -1 },
    alert: { a: [251, 146, 60], b: [244, 63, 94], c: [250, 204, 21], pace: 2.2, wobble: 0.11, glow: 1, particles: 40, inward: -1 },
  };

  let canvas: HTMLCanvasElement | undefined = $state();
  // The look eases from one mood to the next instead of jumping.
  let cur: Look = { ...LOOKS.idle, a: [...LOOKS.idle.a], b: [...LOOKS.idle.b], c: [...LOOKS.idle.c] };

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size * 2; // room for the glow
    canvas.width = W * dpr;
    canvas.height = W * dpr;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    type P = { ang: number; r: number; v: number; life: number };
    let ps: P[] = [];
    let phase = 0;
    let last = performance.now();
    let raf = 0;
    const mix = (x: number, y: number, k: number) => x + (y - x) * k;
    const rgb = (c: number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const want = LOOKS[mood];
      const k = Math.min(1, dt * 2.5);
      for (const key of ['pace', 'wobble', 'glow', 'particles', 'inward'] as const) cur[key] = mix(cur[key], want[key], k);
      for (const key of ['a', 'b', 'c'] as const) cur[key] = cur[key].map((v, i) => mix(v, want[key][i], k)) as [number, number, number];
      phase += dt * cur.pace;
      const t = phase;
      const R = size * 0.36;
      const cx = W / 2, cy = W / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, W);
      const breathe = 1 + Math.sin(t * 1.3) * 0.025;

      // Glow.
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 2.3);
      g.addColorStop(0, rgb(cur.a, 0.32 * cur.glow));
      g.addColorStop(0.45, rgb(cur.b, 0.12 * cur.glow));
      g.addColorStop(1, rgb(cur.b, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, W);

      // The blob's edge: a circle moved by three slow waves.
      const edge = (a: number) => R * breathe * (1 + cur.wobble * (Math.sin(3 * a + t * 1.7) + 0.6 * Math.sin(5 * a - t * 2.3) + 0.35 * Math.sin(2 * a + t * 0.9)));
      ctx.globalCompositeOperation = 'source-over';
      const blob = new Path2D();
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        const r = edge(a);
        i ? blob.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : blob.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      blob.closePath();
      const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
      body.addColorStop(0, rgb(cur.a, 0.9));
      body.addColorStop(0.75, rgb(cur.b, 0.75));
      body.addColorStop(1, rgb(cur.c, 0.55));
      ctx.fillStyle = body;
      ctx.fill(blob);

      // Bands of light swirling inside, clipped to the blob.
      ctx.save();
      ctx.clip(blob);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = t * (0.6 + i * 0.25) + i * 1.7;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * R * 0.25, cy + Math.sin(a * 1.3) * R * 0.25);
        ctx.rotate(a);
        const band = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.9);
        const col = [cur.a, cur.c, cur.b, cur.a][i] as number[];
        band.addColorStop(0, rgb(col, 0.28));
        band.addColorStop(1, rgb(col, 0));
        ctx.fillStyle = band;
        ctx.scale(1.9, 0.55);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      // A thin bright rim.
      ctx.globalCompositeOperation = 'lighter';


      // Particles: drawn in while reading, sent out while writing.
      const want_n = size < 60 ? 0 : Math.round(cur.particles); // a small orb stays calm
      while (ps.length < want_n) ps.push({ ang: Math.random() * Math.PI * 2, r: R * (1.15 + Math.random() * 1.1), v: 0.3 + Math.random() * 0.7, life: Math.random() });
      if (ps.length > want_n) ps = ps.slice(0, want_n);
      for (const p of ps) {
        p.ang += dt * p.v * 0.6 * (cur.pace + 0.2);
        p.r -= dt * p.v * R * 0.5 * cur.inward;
        p.life += dt * 0.5;
        if (p.r < R * 1.02 || p.r > R * 2.4 || p.life > 1) {
          p.ang = Math.random() * Math.PI * 2;
          p.r = cur.inward >= 0 ? R * (1.6 + Math.random() * 0.8) : R * (1.05 + Math.random() * 0.2);
          p.life = 0;
        }
        const alpha = Math.sin(Math.PI * Math.min(1, p.life)) * 0.75;
        ctx.fillStyle = rgb(cur.a, alpha);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(p.ang) * p.r, cy + Math.sin(p.ang) * p.r, 1 + p.v, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // Stop drawing while the page is hidden.
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    document.addEventListener('visibilitychange', vis);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', vis); };
  });
</script>

<div class="orb" style:width="{size}px" style:height="{size}px" role="img" aria-label={label || `AI: ${mood}`}>
  <canvas bind:this={canvas} style:width="{size * 2}px" style:height="{size * 2}px"></canvas>
</div>

<style>
  .orb { position: relative; flex-shrink: 0; }
  canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none; }
</style>
