<script lang="ts">
  // Grey cards in the shape of what is coming, with a light sweeping across, so the page keeps its layout while it
  // loads and does not jump when the real cards arrive.
  let { rows = 3, label = 'Loading' }: { rows?: number; label?: string } = $props();
</script>

<div class="sk" role="status" aria-label={label}>
  {#each { length: rows } as _, i}
    <div class="card" style:animation-delay="{i * 90}ms">
      <i class="dot"></i>
      <div class="lines"><i style:width="{72 - i * 9}%"></i><i class="short" style:width="{38 + i * 6}%"></i></div>
    </div>
  {/each}
</div>

<style>
  .sk { display: flex; flex-direction: column; gap: 8px; }
  .card { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--glass);
    animation: rise 300ms var(--t-ease) both; }
  .dot { flex-shrink: 0; width: 8px; height: 8px; margin-top: 4px; border-radius: 50%; }
  .lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .lines i { display: block; height: 10px; border-radius: 5px; }
  .lines i.short { height: 8px; }
  .dot, .lines i { background: linear-gradient(90deg, var(--surface-3) 0%, color-mix(in srgb, var(--surface-3) 55%, var(--text-3)) 50%, var(--surface-3) 100%);
    background-size: 220% 100%; animation: sweep 1.4s ease-in-out infinite; }
  @keyframes sweep { from { background-position: 120% 0; } to { background-position: -120% 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .dot, .lines i { animation: none; } }
</style>
