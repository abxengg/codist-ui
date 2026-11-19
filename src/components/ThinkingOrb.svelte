<script lang="ts">
  // The small "AI is working" indicator used inline across the older screens. It is now the same turning orb as the
  // rest of Codist, sized to sit in a line of text; the state picks its mood.
  import Orb from './Orb.svelte';
  import type { Mood } from '../lib/live.svelte';

  type OrbState = 'working' | 'searching' | 'solving' | 'listening' | 'connecting' | 'weaving' | 'composing' | 'breathing' | 'shaping';
  let { state: orbState = 'working', size = 20, label = '' }: { state?: OrbState; size?: 20 | 32 | 64; speed?: number; label?: string } = $props();
  const MOOD: Record<OrbState, Mood> = {
    working: 'reading', searching: 'reading', solving: 'reading', listening: 'idle', connecting: 'reading', weaving: 'reading',
    composing: 'writing', shaping: 'writing', breathing: 'idle',
  };
</script>

<span class="inline"><Orb mood={MOOD[orbState]} size={size === 20 ? 16 : size === 32 ? 26 : 52} label={label || 'Working'} /></span>

<style>
  .inline { display: inline-flex; vertical-align: middle; margin-right: 4px; }
</style>
