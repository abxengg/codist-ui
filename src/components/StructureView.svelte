<script lang="ts">
  // The structure graph (layers, cycles, blast radius, calls) in the new frame: a slim header with the way back to the
  // Map, the graph across the page, and a class's details at the side only while one is selected.
  import { app, selectNode } from '../lib/store.svelte';
  import Panel from './Panel.svelte';
</script>

<div class="structure">
  <header>
    <button class="b3 ghost back" onclick={() => (app.mode = 'map')}>← Map</button>
    <h1>Structure</h1>
    <p>Layers, cycles, calls and what a change reaches. Pick a class to see it.</p>
  </header>
  <div class="body" class:with={!!app.selectedNode}>
    <div class="g">
      {#await import('./GraphView.svelte')}
        <div class="empty">Loading the graph</div>
      {:then { default: GraphView }}
        <GraphView />
      {/await}
    </div>
    {#if app.selectedNode}
      <aside class="side">
        <button class="x" aria-label="Close" onclick={() => selectNode(null)}>×</button>
        <Panel />
      </aside>
    {/if}
  </div>
</div>

<style>
  .structure { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  header { display: flex; align-items: baseline; gap: 14px; padding: 14px 20px 10px; border-bottom: 1px solid var(--border); }
  .back { height: 28px; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  header p { margin: 0; font-size: 12.5px; color: var(--text-3); }
  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); }
  .body.with { grid-template-columns: minmax(0, 1fr) min(460px, 40vw); }
  .g { min-width: 0; min-height: 0; display: flex; }
  .g > :global(*) { flex: 1; }
  .side { position: relative; min-height: 0; display: flex; border-left: 1px solid var(--border); background: var(--surface); box-shadow: -10px 0 30px -20px rgba(0, 0, 0, 0.8); }
  .side :global(.panel) { flex: 1; min-width: 0; }
  .x { position: absolute; top: 10px; right: 10px; z-index: 2; border: 0; background: none; font-size: 20px; line-height: 1; color: var(--text-3); }
  .empty { padding: 40px; color: var(--text-3); }
</style>
