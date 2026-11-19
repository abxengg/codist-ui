<script lang="ts">
  // Lines between cards on a page: give the container and a list of links between elements (by data-node), and it
  // draws a curve for each, redrawn when the layout changes. A busy link flows; a quiet one is faint.
  import { onMount } from 'svelte';

  type Link = { from: string; to: string; busy?: boolean; tone?: string; label?: string };
  let { root, links, vertical = false }: { root: HTMLElement | undefined; links: Link[]; vertical?: boolean } = $props();
  let paths = $state<{ d: string; busy: boolean; tone: string; key: string; lx: number; ly: number; label: string }[]>([]);
  let w = $state(0), h = $state(0);

  function draw() {
    if (!root) return;
    const box = root.getBoundingClientRect();
    w = box.width; h = box.height;
    const at = (id: string) => root!.querySelector(`[data-node="${id}"]`)?.getBoundingClientRect();
    const out: typeof paths = [];
    for (const l of links) {
      const a = at(l.from), b = at(l.to);
      if (!a || !b) continue;
      let x1: number, y1: number, x2: number, y2: number, d: string;
      const sameRow = Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < Math.max(a.height, b.height) * 0.6;
      if (!vertical && sameRow) {
        const right = b.left >= a.left;
        x1 = (right ? a.right : a.left) - box.left; y1 = a.top + a.height / 2 - box.top;
        x2 = (right ? b.left : b.right) - box.left; y2 = b.top + b.height / 2 - box.top;
        const dx = (x2 - x1) * 0.5;
        d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      } else {
        const down = b.top >= a.top;
        x1 = a.left + a.width / 2 - box.left; y1 = (down ? a.bottom : a.top) - box.top;
        x2 = b.left + b.width / 2 - box.left; y2 = (down ? b.top : b.bottom) - box.top;
        const dy = (y2 - y1) * 0.5;
        d = `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
      }
      out.push({ d, busy: !!l.busy, tone: l.tone ?? '139,124,246', key: l.from + '>' + l.to, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2, label: l.label ?? '' });
    }
    paths = out;
  }
  onMount(() => {
    const ro = new ResizeObserver(() => requestAnimationFrame(draw));
    if (root) { ro.observe(root); for (const el of root.querySelectorAll('[data-node]')) ro.observe(el); }
    window.addEventListener('resize', draw);
    const t = setInterval(draw, 1500); // cards change size as their contents update
    requestAnimationFrame(draw);
    return () => { ro.disconnect(); window.removeEventListener('resize', draw); clearInterval(t); };
  });
  $effect(() => { void links; requestAnimationFrame(draw); });
</script>

<svg class="wires" width={w} height={h} aria-hidden="true">
  <defs>
    <marker id="wire-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="rgba(139,124,246,0.75)" /></marker>
  </defs>
  {#each paths as p (p.key)}
    <path class="base" d={p.d} style:stroke="rgba({p.tone},0.22)" />
    <path class="flow" class:busy={p.busy} d={p.d} style:stroke="rgba({p.tone},{p.busy ? 0.9 : 0.35})" marker-end="url(#wire-head)" />
    {#if p.label}<text x={p.lx} y={p.ly - 6} text-anchor="middle">{p.label}</text>{/if}
  {/each}
</svg>

<style>
  .wires { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; z-index: 0; }
  .base { fill: none; stroke-width: 6; stroke-linecap: round; }
  .flow { fill: none; stroke-width: 1.6; stroke-dasharray: 2 6; }
  .flow.busy { stroke-dasharray: 6 6; stroke-width: 2; animation: run 0.8s linear infinite; filter: drop-shadow(0 0 5px rgba(139, 124, 246, 0.8)); }
  @keyframes run { to { stroke-dashoffset: -12; } }
  text { font: 10.5px var(--font); fill: var(--text-3); }
  @media (prefers-reduced-motion: reduce) { .flow.busy { animation: none; } }
</style>
