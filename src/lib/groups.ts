// Open issues grouped by root cause, independent of the old hub's filters, for the Now and Issues screens.
import type { Issue, Severity } from './types';
import { SEVERITIES } from './theme';

export function groups(all: Issue[], state: Issue['state'] = 'open'): Issue[][] {
  const m = new Map<string, Issue[]>();
  for (const i of all) {
    if (i.state !== state) continue;
    const k = i.state === 'open' && i.group ? i.group : i.id;
    m.set(k, [...(m.get(k) ?? []), i]);
  }
  return [...m.values()]
    .map((g) => [...g].sort((a, b) => Number(!!b.groupRoot) - Number(!!a.groupRoot)))
    .sort((a, b) => rank(a[0].severity) - rank(b[0].severity) || (b[0].firstTime ?? 0) - (a[0].firstTime ?? 0));
}

export const rank = (s: Severity) => SEVERITIES.indexOf(s);
/** Serious: what deserves your attention first. Low and info wait. */
export const serious = (g: Issue[]) => rank(g[0].severity) <= rank('medium');
