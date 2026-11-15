<script lang="ts">
  import type { Trail } from '../lib/types';

  let { trail }: { trail: Trail } = $props();
  let open = $state(false);
  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const failed = $derived(trail.files.filter((f) => f.error).length);
</script>

<section class="card trail">
  <div class="card-head">
    <span class="label">Model</span>
    <span class="sum">Read {trail.files.length} time{trail.files.length === 1 ? '' : 's'}{#if failed}, {failed} failed{/if} · {trail.discarded.length} claim{trail.discarded.length === 1 ? '' : 's'} discarded</span>
    <span class="spacer"></span>
    <button class="link" onclick={() => (open = !open)} aria-expanded={open}>{open ? 'Hide' : 'Show what it understood'}</button>
  </div>
  {#if open}
    <h4>What the model understood</h4>
    {#each trail.files as f, i (i)}
      <div class="file">
        <div class="fh"><span class="mono">{name(f.path)}</span>{#if f.reading && f.reading !== 'first'}<span class="tag">{f.reading} reading</span>{/if}</div>
        {#if f.error}<p class="bad">Could not read it: {f.error}</p>
        {:else}
          {#if f.change}<p><b>Changed</b> {f.change}</p>{/if}
          {#if f.effect}<p><b>Effect</b> {f.effect}</p>{/if}
          {#if f.expected}<p><b>The rules say</b> {f.expected}</p>{/if}
        {/if}
      </div>
    {/each}
    <h4>Claims Codist discarded</h4>
    {#each trail.discarded as d, i (i)}
      <div class="disc"><span class="mono">{name(d.path)}:{d.line}</span> <b>{d.title}</b> <span class="faint">· {d.why}</span></div>
    {:else}<p class="faint">None: every claim the model made is on the page, as an issue or a note.</p>{/each}
  {/if}
</section>

<style>
  .card { margin-top: 14px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .spacer { flex: 1; }
  .sum { font-size: 12px; color: var(--text-2); }
  h4 { margin: 12px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); font-weight: 600; }
  .file { margin: 6px 0; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--r); background: var(--code-bg); }
  .fh { display: flex; gap: 8px; align-items: center; font-size: 12px; color: var(--text); }
  .file p { margin: 4px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-2); overflow-wrap: anywhere; }
  .file b, .disc b { color: var(--text); font-weight: 600; }
  .disc { margin: 4px 0; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .bad { color: var(--warn); }
  .faint { font-size: 12px; }
  .tag { font-size: 10.5px; color: var(--text-3); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; }
  .link { padding: 0; border: 0; background: none; font-size: 12px; color: var(--accent-text); }
</style>
