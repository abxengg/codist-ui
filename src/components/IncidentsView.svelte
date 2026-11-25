<script lang="ts">
  import Orb from './Orb.svelte';
  import ThinkingOrb from './ThinkingOrb.svelte';
  import { onMount } from 'svelte';
  import { app, loadIncidents, openIncident, toast } from '../lib/store.svelte';
  import { api } from '../lib/api';
  import { ago } from '../lib/theme';
  import IncidentDetail from './IncidentDetail.svelte';
  import IncidentStage from './IncidentStage.svelte';

  let title = $state('');
  let logs = $state('');
  let busy = $state(false);
  let dragging = $state(false);

  onMount(() => void loadIncidents());

  async function analyse() {
    if (!logs.trim()) return;
    busy = true;
    try {
      const { id } = await api.createIncident(title, logs);
      title = '';
      logs = '';
      await loadIncidents();
      await openIncident(id);
      app.incidentStage = true;
    } catch (e) {
      toast((e as Error).message, 'bad', 6000);
    } finally {
      busy = false;
    }
  }

  async function readFile(f: File) {
    if (f.size > 16 * 1024 * 1024) {
      toast('That log is larger than 16 MB; trim it to the incident window first', 'warn', 6000);
      return;
    }
    logs = await f.text();
    if (!title) title = f.name.replace(/\.(log|txt)$/, '');
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) void readFile(f);
  }
  const lines = $derived(logs ? logs.split('\n').length : 0);
  function stageOf(id: string) { void openIncident(id); app.incidentStage = true; }
</script>

<div class="incidents">
  <aside class="list">
    <div class="head">
      <span class="title">Incidents</span>
      <button class="btn sm" onclick={() => openIncident(null)}>New analysis</button>
    </div>
    <ul>
      {#each app.incidents as i (i.id)}
        <li>
          <button class="item" class:selected={i.id === app.incidentId} onclick={() => stageOf(i.id)}>
            <span class="t">{i.title}</span>
            <span class="meta">
              {#if i.status === 'analysing'}<ThinkingOrb state="searching" /> analysing{:else if i.confirmed}<span class="ok">✓ root cause confirmed</span>{:else if i.status === 'failed'}<span class="bad">failed</span>{:else}{i.occurrences} occurrence{i.occurrences === 1 ? '' : 's'}{/if}
              <span class="time">{ago(i.createdAt)}</span>
            </span>
            {#if i.topCause}<span class="cause">{i.topCause}</span>{/if}
          </button>
        </li>
      {:else}
        <li class="empty">No incidents yet.</li>
      {/each}
    </ul>
  </aside>

  <main class="content">
    {#if app.incidentId && app.incident}
      <IncidentDetail />
    {:else if app.incidentError}
      <div class="empty">Could not open this incident: {app.incidentError} <button class="btn secondary sm" onclick={() => openIncident(app.incidentId)}>Try again</button></div>
    {:else if app.incidentId}
      <div class="empty"><Orb mood="reading" size={64} label="Opening the incident" /></div>
    {:else}
      {#if app.incidents.length}
        <div class="board">
          <h1>Incidents</h1>
          <div class="cards">
            {#each app.incidents.slice(0, 9) as i (i.id)}
              <button class="icard" class:hot={i.status !== 'failed' && !i.confirmed} onclick={() => stageOf(i.id)}>
                <span class="top">
                  {#if i.status === 'analysing'}<span class="ui-pill ai">analysing</span>{:else if i.confirmed}<span class="ui-pill good">confirmed</span>{:else if i.status === 'failed'}<span class="ui-pill warn">failed</span>{:else}<span class="ui-pill">{i.occurrences} occurrence{i.occurrences === 1 ? '' : 's'}</span>{/if}
                  <span class="time">{ago(i.createdAt)}</span>
                </span>
                <b>{i.title}</b>
                {#if i.topCause}<span class="tc"><i>Likely cause</i>{i.topCause}</span>{:else}<span class="tc none">{i.errors ? 'No cause named yet' : 'No errors recognised in this log'}</span>{/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="new">
        <h1>Analyse an incident</h1>
        <p class="muted">Paste the logs from the incident, or drop a log file. Codist finds the errors, maps them to the code, ranks the commits that most likely caused them and asks the local model for the root cause, with evidence. The logs never leave this machine.</p>
        <label class="label" for="inc-title">Title (optional)</label>
        <input id="inc-title" class="field" bind:value={title} placeholder="e.g. Customer signup failing with 500" />
        <label class="label" for="inc-logs">Logs</label>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="drop" class:dragging ondragover={(e) => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop}>
          <textarea id="inc-logs" bind:value={logs} rows="16" spellcheck="false" placeholder={'2026-10-30 10:15:02 ERROR ... : Servlet.service() threw exception\njava.lang.NullPointerException: ...\n\tat com.acme.CustomerService.create(CustomerService.java:18)'}></textarea>
        </div>
        <div class="actions">
          <label class="btn secondary file">Choose a log file<input type="file" accept=".log,.txt,.out,text/plain" onchange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void readFile(f); }} /></label>
          <span class="faint">{lines ? `${lines.toLocaleString()} lines` : 'Stack traces, ERROR lines and "Caused by" chains are recognised.'}</span>
          <span class="spacer"></span>
          <button class="btn" disabled={!logs.trim() || busy} onclick={analyse}>{busy ? 'Starting…' : 'Find root cause'}</button>
        </div>
      </div>
    {/if}
  </main>
</div>
<IncidentStage />

<style>
  .incidents { flex: 1; min-height: 0; display: grid; grid-template-columns: 280px minmax(0, 1fr); }
  .list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); background: var(--glass); box-shadow: 10px 0 30px -20px rgba(0, 0, 0, 0.8); position: relative; z-index: 1; }
  .head { display: flex; justify-content: space-between; align-items: center; padding: 18px 14px 14px 16px; border-bottom: 1px solid var(--border); }
  .title { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
  ul { list-style: none; margin: 0; padding: 8px; overflow: auto; flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .item { display: grid; gap: 3px; width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); text-align: left; box-shadow: var(--elev-1); transition: transform 0.15s, box-shadow 0.15s; }
  .item:hover { transform: translateY(-1px); box-shadow: var(--elev-2); }
  .item.selected { border-color: rgba(139, 116, 255, 0.55); box-shadow: var(--elev-2), var(--glow-soft); }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); }
  .time { margin-left: auto; }
  .cause { font-size: 11.5px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ok { color: var(--good); }
  .bad { color: var(--bad); }
  .content { min-width: 0; min-height: 0; overflow: auto; }
  .board { max-width: 1060px; margin: 36px auto 0; padding: 0 26px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 14px; }
  .icard { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 16px; border: 1px solid var(--border); background: var(--glass-strong); color: var(--text); text-align: left;
    box-shadow: var(--elev-1); transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s; }
  .icard.hot { border-color: color-mix(in srgb, var(--bad) 30%, var(--border)); }
  .icard:hover { transform: translateY(-2px); box-shadow: var(--elev-2), 0 0 40px -18px color-mix(in srgb, var(--bad) 60%, transparent); border-color: color-mix(in srgb, var(--bad) 50%, var(--border)); }
  .icard .top { display: flex; align-items: center; gap: 8px; } .icard .time { margin-left: auto; font-size: 11.5px; color: var(--text-3); }
  .icard b { font-size: 14px; font-weight: 600; line-height: 1.4; }
  .icard .tc { font-size: 12.5px; color: var(--text-2); line-height: 1.45; } .icard .tc i { display: block; font-style: normal; font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); margin-bottom: 2px; }
  .icard .tc.none { color: var(--text-3); }
  .new { max-width: 820px; margin: 36px auto 60px; padding: 24px 26px; display: grid; gap: 8px; border-radius: 18px; background: var(--glass); border: 1px solid var(--border); box-shadow: var(--elev-2), var(--glow-soft); }
  h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  .new p { margin: 0 0 10px; max-width: 70ch; line-height: 1.6; }
  .field, textarea { width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--code-bg); color: var(--text); font: inherit; }
  textarea { font: 12px/1.5 var(--mono); resize: vertical; min-height: 280px; }
  .field:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .drop { border-radius: var(--r); }
  .drop.dragging { outline: 2px dashed var(--accent); outline-offset: 3px; }
  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; }
  .spacer { flex: 1; }
  .file { position: relative; overflow: hidden; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: default; filter: none; }
  @media (max-width: 1000px) { .incidents { grid-template-columns: 1fr; } .list { max-height: 240px; } }
</style>
