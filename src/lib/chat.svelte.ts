// The chat with the AI about the codebase, kept for the whole app rather than the Chat page: a question asked and
// then left keeps going while you work elsewhere, and its answer is waiting when you come back. The conversation is
// kept per repository in the browser, so it also survives a reload.
import { api } from './api';
import { app, toast } from './store.svelte';

export type ChatMsg = {
  role: 'user' | 'assistant'; content: string; error?: boolean;
  sources?: { path: string; line: number }[]; looked?: { path: string; line: number; name: string }[]; took?: number; model?: string;
};

class Chat {
  msgs = $state<ChatMsg[]>([]);
  busy = $state(false);
  private key = '';

  /** Loads the conversation of the repository on show, when it changes. */
  sync() {
    const k = `codist.chat.${app.status?.repo ?? ''}`;
    if (k === this.key) return;
    this.key = k;
    try { this.msgs = JSON.parse(localStorage.getItem(k) ?? '[]'); } catch { this.msgs = []; }
  }
  private save() { try { localStorage.setItem(this.key, JSON.stringify(this.msgs.slice(-40))); } catch { /* storage blocked */ } }

  async send(q: string, path: string | null) {
    q = q.trim();
    if (!q || this.busy) return;
    this.sync();
    const key = this.key;
    this.msgs = [...this.msgs, { role: 'user', content: q }];
    this.save();
    this.busy = true;
    try {
      const r = await api.chat(this.msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), path);
      if (this.key !== key) return; // the repository changed meanwhile
      this.msgs = [...this.msgs, { role: 'assistant', content: r.answer, sources: r.sources, looked: r.looked, took: r.took, model: r.model }];
      if (app.mode !== 'chat') toast('The AI answered your question in Chat', 'good', 5000);
    } catch (e) {
      if (this.key === key) this.msgs = [...this.msgs, { role: 'assistant', content: (e as Error).message, error: true }];
    } finally {
      this.busy = false;
      this.save();
    }
  }
  clear() { this.msgs = []; this.save(); }
}

export const chat = new Chat();
