<script lang="ts">
  // Toasts rise in at the bottom right. Pointing at one holds it, so it can be read to the end; clicking it sends it
  // away. A thin line under each one runs out with the time it has left.
  import { toast } from '../lib/motion';
  import { app, dismissToast, holdToast, resumeToast } from '../lib/store.svelte';
  import CopyButton from './CopyButton.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div class="toast {t.tone}" role="status" transition:toast style:--ms="{t.ms}ms"
      onmouseenter={() => holdToast(t.id)} onmouseleave={() => resumeToast(t.id)} onclick={() => dismissToast(t.id)} title="Click to dismiss">
      <span class="dot"></span>{t.text}{#if t.tone === 'bad'}<span class="cp" role="presentation" onclick={(e) => e.stopPropagation()}><CopyButton text={t.text} title="Copy this error" /></span>{/if}
      <i class="left" aria-hidden="true"></i>
    </div>
  {/each}
</div>

<style>
  .toasts { position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; z-index: 100; pointer-events: none; }
  .toast {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border-strong);
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 12.5px;
    pointer-events: auto;
    cursor: pointer;
    transition: transform 120ms var(--t-ease), border-color 120ms var(--t-ease);
  }
  .toast:hover { transform: translateY(-1px); border-color: var(--accent-edge, var(--border-strong)); }
  .toast:active { transform: scale(0.98); }
  .dot { width: 7px; height: 7px; background: var(--accent); }
  .good .dot { background: var(--good); }
  .warn .dot { background: var(--warn); }
  .bad .dot { background: var(--bad); }
  .cp { margin-left: 6px; }
  /* Time left: drains over the toast's life and stops while it is held. */
  .left { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; transform-origin: left; background: currentColor; opacity: 0.18;
    animation: drain var(--ms) linear forwards; }
  .good .left { background: var(--good); opacity: 0.5; } .warn .left { background: var(--warn); opacity: 0.5; } .bad .left { background: var(--bad); opacity: 0.5; }
  .toast:hover .left { animation-play-state: paused; }
  @keyframes drain { to { transform: scaleX(0); } }
  @media (prefers-reduced-motion: reduce) { .left { display: none; } }
</style>
