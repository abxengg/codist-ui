<script lang="ts">
  // The backdrop: an endless field of stars at three depths, drawn once and moved very slowly, so the page sits in
  // deep space without costing anything. The near layer drifts faster than the far one, which gives the depth.
  import { onMount } from 'svelte';
  let layers: HTMLCanvasElement[] = $state([]);
  onMount(() => {
    const draw = () => {
      const dark = document.documentElement.dataset.theme !== 'light';
      const W = Math.max(window.innerWidth, 800) * 2, H = Math.max(window.innerHeight, 600) * 2;
      layers.forEach((c, depth) => {
        c.width = W; c.height = H;
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);
        const count = [260, 130, 50][depth];
        const size = [0.6, 1, 1.6][depth];
        // Seeded, so the sky is the same on every load.
        let seed = 7 + depth * 101;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < count; i++) {
          const a = dark ? 0.18 + rnd() * [0.25, 0.35, 0.45][depth] : 0.08 + rnd() * 0.12;
          ctx.fillStyle = dark ? `rgba(205,210,255,${a})` : `rgba(70,70,110,${a})`;
          const s = size * (0.6 + rnd() * 0.8);
          // One tile of sky drawn four times, so moving by half the canvas lands on the same sky: no seam.
          const x = rnd() * (W / 2), y = rnd() * (H / 2);
          for (const [ox, oy] of [[0, 0], [W / 2, 0], [0, H / 2], [W / 2, H / 2]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, s, 0, Math.PI * 2); ctx.fill(); }
        }
      });
    };
    draw();
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => theme.disconnect();
  });
</script>

<div class="space" aria-hidden="true">
  {#each [0, 1, 2] as d}<canvas bind:this={layers[d]} class="l{d}"></canvas>{/each}
</div>

<style>
  .space { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: var(--bg); }
  canvas { position: absolute; left: 0; top: 0; width: 200vw; height: 200vh; will-change: transform; }
  .l0 { animation: drift 420s linear infinite; }
  .l1 { animation: drift 260s linear infinite; }
  .l2 { animation: drift 160s linear infinite; }
  @keyframes drift { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-50%, -50%, 0); } }
  @media (prefers-reduced-motion: reduce) { canvas { animation: none; } }
</style>
