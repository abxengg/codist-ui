<script lang="ts">
  import type { FilePlan } from '../lib/types';
  import { requestFileReview } from '../lib/store.svelte';

  let { sha, plan }: { sha: string; plan: FilePlan[] } = $props();
  const read = $derived(plan.filter((p) => p.decision === 'read'));
  const skipped = $derived(plan.filter((p) => p.decision !== 'read'));
  // Closed until asked for: most commits change few files and the model reads them all.
  let open = $state(false);
  let asked = $state<string[]>([]);
  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const who = (by: string) => (by === 'model' ? 'the model decided' : by === 'you' ? 'you asked' : 'Codist decided');
  async function check(path: string) {
    asked = [...asked, path];
    await requestFileReview(sha, path);
  }
</script>

<section class="card plan">
  <div class="card-head">
    <span class="label">Files</span>
    <span class="sum">The model read {read.length} of {plan.length} changed file{plan.length === 1 ? '' : 's'}{#if skipped.length}, skipped {skipped.length}{/if}</span>
    <span class="spacer"></span>
    <button class="link" onclick={() => (open = !open)} aria-expanded={open}>{open ? 'Hide' : 'Show why'}</button>
  </div>
  {#if open}
    <p class="faint">Code checks read every file. For the model, each file below says whether it was read and why; a skipped file can be read after all.</p>
    <ul>
      {#each [...skipped, ...read] as p (p.path)}
        <li class:skipped={p.decision !== 'read'}>
          <span class="state">{p.decision === 'read' ? 'Read' : 'Skipped'}</span>
          <span class="file mono" title={p.path}>{name(p.path)}</span>
          <span class="why">{p.why} <span class="faint">({who(p.by)})</span></span>
          {#if p.decision !== 'read'}
            <button class="btn secondary sm" disabled={asked.includes(p.path)} title="Have the model read this file as well" onclick={() => check(p.path)}>{asked.includes(p.path) ? 'Queued' : 'Check this file'}</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .card { margin-top: 14px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface-2); }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .spacer { flex: 1; }
  .sum { font-size: 12px; color: var(--text-2); }
  .faint { margin: 6px 0 0; font-size: 12px; line-height: 1.5; }
  ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li { display: grid; grid-template-columns: 58px minmax(90px, 180px) 1fr auto; gap: 8px; align-items: baseline; font-size: 12px; }
  .state { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--good); }
  li.skipped .state { color: var(--text-3); }
  .file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .why { color: var(--text-2); line-height: 1.45; overflow-wrap: anywhere; }
  .link { padding: 0; border: 0; background: none; font-size: 12px; color: var(--accent-text); }
  @media (max-width: 520px) { li { grid-template-columns: 58px 1fr; } .why { grid-column: 1 / -1; } }
</style>
