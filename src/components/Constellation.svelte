<script lang="ts">
  // How far a commit reaches, drawn: the classes it changed glow in the middle, the classes that use them sit on the
  // first ring, and the rest it reaches on the outer ring, fading. Classes with issues are orange. A click opens the file.
  import { app, openFile } from '../lib/store.svelte';
  import type { ChangedType } from '../lib/types';

  let { changed, impacted, hot, sha }: { changed: ChangedType[]; impacted: string[]; hot: Set<string>; sha: string | null } = $props();

  const S = 260, C = S / 2;
  type P = { id: string; x: number; y: number; ring: 0 | 1 | 2; name: string; file: string };
  const layout = $derived.by(() => {
    const g = app.graph;
    const byId = new Map((g?.nodes ?? []).map((n) => [n.id, n]));
    const centre = changed.filter((c) => c.status !== 'deleted').slice(0, 8).map((c) => c.id);
    const inC = new Set(centre);
    const touch = new Set<string>();
    for (const e of g?.edges ?? []) {
      if (inC.has(e.source) && !inC.has(e.target)) touch.add(e.target);
      if (inC.has(e.target) && !inC.has(e.source)) touch.add(e.source);
    }
    const reach = impacted.filter((id) => !inC.has(id));
    const ring1 = reach.filter((id) => touch.has(id)).slice(0, 14);
    const r1 = new Set(ring1);
    const ring2 = reach.filter((id) => !r1.has(id)).slice(0, 22);
    const place = (ids: string[], r: number, ring: 0 | 1 | 2, turn: number): P[] =>
      ids.map((id, i) => {
        const a = turn + (i / Math.max(1, ids.length)) * Math.PI * 2, rr = ids.length === 1 && ring === 0 ? 0 : r;
        const n = byId.get(id);
        return { id, x: C + Math.cos(a) * rr, y: C + Math.sin(a) * rr, ring, name: n?.name ?? id.slice(id.lastIndexOf('.') + 1), file: n?.file ?? changed.find((c) => c.id === id)?.file ?? '' };
      });
    const pts = [...place(centre, 26, 0, -Math.PI / 2), ...place(ring1, 70, 1, -Math.PI / 3), ...place(ring2, 112, 2, 0)];
    const at = new Map(pts.map((p) => [p.id, p]));
    const lines = (g?.edges ?? []).filter((e) => at.has(e.source) && at.has(e.target) && e.source !== e.target).map((e) => ({ a: at.get(e.source)!, b: at.get(e.target)! }));
    return { pts, lines, more: reach.length - ring1.length - ring2.length };
  });
  let over = $state<P | null>(null);
</script>

<div class="wrap">
  <svg viewBox="0 0 {S} {S}" role="img" aria-label="Classes this commit changed and the classes they reach">
    <circle cx={C} cy={C} r="70" class="orbit" /><circle cx={C} cy={C} r="112" class="orbit" />
    {#each layout.lines as l}<line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} class="ln" class:near={l.a.ring + l.b.ring <= 1} />{/each}
    {#each layout.pts as p (p.id)}
      {@const isHot = hot.has(p.file)}
      <g class="n r{p.ring}" class:hot={isHot} style:animation-delay="{p.ring * 140}ms" role="button" tabindex="0"
        onclick={() => p.file && openFile(p.file, sha, 1)} onkeydown={(e) => e.key === 'Enter' && p.file && openFile(p.file, sha, 1)}
        onmouseenter={() => (over = p)} onmouseleave={() => (over = null)}>
        {#if p.ring === 0}<circle cx={p.x} cy={p.y} r="13" class="glow" />{/if}
        <circle cx={p.x} cy={p.y} r={p.ring === 0 ? 7 : p.ring === 1 ? 4.5 : 3.2} class="dot" />
      </g>
    {/each}
  </svg>
  <p class="cap">{#if over}<b>{over.name}</b> · {over.ring === 0 ? 'changed' : over.ring === 1 ? 'uses a changed class' : 'reached further'}{:else}{changed.length} changed · {impacted.length} reached{#if layout.more > 0} ({layout.more} not shown){/if}{/if}</p>
</div>

<style>
  .wrap { display: flex; flex-direction: column; align-items: center; }
  svg { width: 100%; max-width: 260px; height: auto; overflow: visible; }
  .orbit { fill: none; stroke: var(--border); stroke-dasharray: 2 4; }
  .ln { stroke: color-mix(in srgb, var(--accent) 22%, transparent); stroke-width: 0.8; }
  .ln.near { stroke: color-mix(in srgb, var(--accent) 45%, transparent); stroke-width: 1.1; }
  .n { cursor: pointer; animation: rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; transform-box: fill-box; transform-origin: center; }
  @keyframes rise { from { opacity: 0; transform: scale(0.4); } }
  .dot { fill: var(--accent); }
  .r1 .dot { fill: color-mix(in srgb, var(--accent) 65%, var(--text-3)); }
  .r2 .dot { fill: color-mix(in srgb, var(--accent) 25%, var(--text-3)); opacity: 0.75; }
  .glow { fill: var(--accent); opacity: 0.18; animation: breathe 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes breathe { 50% { opacity: 0.32; transform: scale(1.25); } }
  .hot .dot { fill: var(--sev-high); opacity: 1; }
  .hot .glow { fill: var(--sev-high); }
  .n:hover .dot { stroke: var(--text); stroke-width: 1.5; }
  .cap { margin: 6px 0 0; font-size: 11.5px; color: var(--text-3); text-align: center; min-height: 16px; }
  .cap b { color: var(--text); font-weight: 600; }
  @media (prefers-reduced-motion: reduce) { .n, .glow { animation: none; } }
</style>
