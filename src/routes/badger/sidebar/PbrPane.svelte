<script lang="ts">
  import { document as docStore, updateDocument } from '../store';
  import type { MetalFinish, MetalSurface, EnamelFinish } from '../store/types';
  import BadgeDimensions from './BadgeDimensions.svelte';

  const finishes: { id: MetalFinish; label: string }[] = [
    { id: 'gold', label: 'Gold' },
    { id: 'silver', label: 'Silver' },
    { id: 'black_nickel', label: 'Black nickel' },
    { id: 'copper', label: 'Copper' },
    { id: 'iron', label: 'Iron' },
    { id: 'rose_gold', label: 'Rose gold' },
    { id: 'bronze', label: 'Bronze' },
    { id: 'brass', label: 'Brass' }
  ];

  const surfaces: { id: MetalSurface; label: string }[] = [
    { id: 'polished', label: 'Polished' },
    { id: 'matte', label: 'Matte' }
  ];

  const enamels: { id: EnamelFinish; label: string }[] = [
    { id: 'soft', label: 'Soft enamel' },
    { id: 'hard', label: 'Hard enamel' }
  ];
</script>

<h2>Finish</h2>
<div class="tool-buttons">
  {#each finishes as f (f.id)}
    <button
      type="button"
      class:active={$docStore.render.finish === f.id}
      onclick={() => updateDocument((d) => (d.render.finish = f.id))}
    >
      {f.label}
    </button>
  {/each}
</div>

<h2>Surface</h2>
<div class="tool-buttons">
  {#each surfaces as s (s.id)}
    <button
      type="button"
      class:active={$docStore.render.metalSurface === s.id}
      onclick={() => updateDocument((d) => (d.render.metalSurface = s.id))}
    >
      {s.label}
    </button>
  {/each}
</div>

<h2>Enamel style</h2>
<div class="tool-buttons">
  {#each enamels as e (e.id)}
    <button
      type="button"
      class:active={$docStore.render.enamelFinish === e.id}
      onclick={() => updateDocument((d) => (d.render.enamelFinish = e.id))}
    >
      {e.label}
    </button>
  {/each}
</div>

<h2>Badge</h2>
<BadgeDimensions />

<h2>Background</h2>
<input
  type="color"
  value={$docStore.render.background}
  oninput={(e) =>
    updateDocument((d) => (d.render.background = (e.target as HTMLInputElement).value))}
/>

<style>
  h2 {
    margin-top: 0.75rem;
  }

  input[type='color'] {
    width: 100%;
    height: 2rem;
    padding: 2px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    cursor: pointer;
  }
</style>
