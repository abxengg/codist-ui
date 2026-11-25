// What the AI is doing right now, for the orb and the Now screen: the model call under way, the lanes' queues, and a
// short pulse when a review finds something. Fed by the activity stream and a light poll of the lanes.
import { api } from './api';
import { app } from './store.svelte';
import type { Activity, LaneView } from './types';

export type Mood = 'offline' | 'idle' | 'reading' | 'writing' | 'alert';

class Live {
  call = $state.raw<Activity | null>(null);
  lanes = $state.raw<LaneView[]>([]);
  /** Set for a moment when a review raises issues: the orb flares. */
  alertUntil = $state(0);
  now = $state(Date.now());
  /** The last few things the AI finished, newest first, for the Now screen's feed. */
  recent = $state.raw<Activity[]>([]);

  /** ?orb=reading in the address shows a mood without a model, for demos and screenshots. */
  forced = (new URLSearchParams(location.search).get('orb') ?? '') as Mood | '';

  mood: Mood = $derived.by(() => {
    if (this.forced) return this.forced;
    if (this.alertUntil > this.now) return 'alert';
    if (!app.status) return 'idle';
    if (app.status.llmProblem) return this.call ? 'reading' : 'offline';
    if (this.call?.status === 'running') return (this.call as Activity & { phase?: string }).phase === 'writing' ? 'writing' : 'reading';
    return 'idle';
  });

  lane = (name: string) => this.lanes.find((l) => l.name.toLowerCase().includes(name));
  waiting: number = $derived((this.lane('model')?.waiting.length ?? 0) + (this.lane('model')?.running ? 1 : 0));
  checking: number = $derived((this.lane('check')?.waiting.length ?? 0) + (this.lane('check')?.running ? 1 : 0));

  /** One sentence on what the AI is doing. */
  sentence: string = $derived.by(() => {
    const c = this.call;
    if (c?.status === 'running') {
      const file = c.path ? c.path.slice(c.path.lastIndexOf('/') + 1) : '';
      const what = (c as Activity & { phase?: string }).phase === 'writing' ? 'Writing up' : 'Reading';
      return file ? `${what} ${file}` : c.title || 'Thinking';
    }
    if (this.forced === 'reading') return 'Reading the code';
    if (this.forced === 'writing') return 'Writing a fix';
    if (this.mood === 'alert') return 'Found something';
    if (app.status?.llmProblem) return 'AI offline · checks only';
    if (this.waiting) return `${this.waiting} commit${this.waiting === 1 ? '' : 's'} to read`;
    return 'All caught up';
  });

  started = false;
  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('codist:activity', (e) => this.take((e as CustomEvent<Activity>).detail));
    try {
      const es = new EventSource('/api/activity/stream');
      es.addEventListener('call', (e) => this.take((JSON.parse((e as MessageEvent).data) as { call: Activity }).call));
    } catch {
      /* the main event stream still updates the page */
    }
    window.addEventListener('codist:found', () => (this.alertUntil = Date.now() + 2600));
    const lanes = () => void api.activityLanes().then((l) => (this.lanes = l)).catch(() => {});
    lanes();
    setInterval(lanes, 2000);
    setInterval(() => (this.now = Date.now()), 500);
    void api.activity().then((a) => {
      this.recent = a.filter((x) => x.kind !== 'step' && x.status !== 'running').slice(0, 8);
      this.call = a.find((x) => x.status === 'running') ?? null;
    }).catch(() => {});
  }

  private take(a: Activity) {
    if (!a || a.kind === 'step') return;
    if (a.status === 'running') this.call = a;
    else {
      if (this.call?.id === a.id) this.call = null;
      this.recent = [a, ...this.recent.filter((x) => x.id !== a.id)].slice(0, 8);
    }
  }
}

export const live = new Live();
