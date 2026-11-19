<script lang="ts">
  // A whole file over the page, in the focus style: the page blurs, the file sits in the middle with syntax colours,
  // scrolled to the line asked for, which is marked. Esc or a click outside closes it.
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { app } from '../lib/store.svelte';
  import { tokenize, plain, type Line } from '../lib/highlight';

  const f = $derived(app.fileShown ? app.file : null);
  let toks = $state<Line[]>([]);
  let box = $state<HTMLDivElement>();
  const target = $derived(app.focusLine?.line ?? 0);
  $effect(() => {
    const file = f, theme = app.theme;
    if (!file) return;
    toks = plain(file.content);
    const lang = file.path.endsWith('.java') ? 'java' : file.path.endsWith('.kt') ? 'kotlin' : null;
    void tokenize(file.content, lang, theme).then((t) => { if (file === f) toks = t; });
  });
  $effect(() => {
    void toks; const at = target;
    if (!box || !at) return;
    requestAnimationFrame(() => box?.querySelector(`[data-n="${at}"]`)?.scrollIntoView({ block: 'center' }));
  });
  const close = () => (app.fileShown = false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && f && close()} />

{#if f}
  <div class="scrim" transition:fade={{ duration: 240, easing: cubicOut }} onclick={close} role="presentation"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={f.path} transition:scale={{ start: 0.95, opacity: 0, duration: 300, easing: cubicOut }}>
    <header>
      <div><b>{f.path.slice(f.path.lastIndexOf('/') + 1)}</b><span class="mono">{f.path}{f.sha ? ` @ ${f.sha.slice(0, 7)}` : ''}</span></div>
      <span class="n">{toks.length} lines</span>
      <button class="x" aria-label="Close" onclick={close}>×</button>
    </header>
    <div class="code mono" bind:this={box}>
      {#each toks as line, i}
        <div class="ln" class:hit={i + 1 === target} data-n={i + 1}><span class="no">{i + 1}</span><span class="tx">{#each line as t}<span style:color={t.color}>{t.content}</span>{/each}{' '}</span></div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 66; background: rgba(6, 6, 10, 0.82); backdrop-filter: blur(18px) saturate(0.8); -webkit-backdrop-filter: blur(18px) saturate(0.8); }
  :global([data-theme='light']) .scrim { background: rgba(240, 240, 246, 0.75); }
  .sheet { position: fixed; z-index: 67; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(1000px, calc(100vw - 48px)); height: min(84vh, 1000px);
    display: flex; flex-direction: column; border-radius: 16px; background: var(--glass-strong); border: 1px solid var(--border);
    box-shadow: var(--elev-2), var(--glow-soft); }
  header { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
  header div { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  header b { font-size: 15px; } header span.mono { font-size: 11.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { font-size: 12px; color: var(--text-3); }
  .x { border: 0; background: none; font-size: 22px; line-height: 1; color: var(--text-3); }
  .code { flex: 1; min-height: 0; overflow: auto; padding: 8px 0; font-size: 12.5px; line-height: 1.65; background: var(--code-bg); border-radius: 0 0 16px 16px; }
  .ln { display: flex; white-space: pre; padding-right: 16px; }
  .ln.hit { background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 2px 0 0 var(--accent); }
  .no { flex-shrink: 0; width: 56px; padding-right: 14px; text-align: right; color: var(--text-3); user-select: none; }
</style>
