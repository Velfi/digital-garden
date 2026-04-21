<script lang="ts">
  import { activeKind, selectedPathIds, pickKind } from '../store';
  import type { PathKind } from '../store/types';

  const kinds: { id: PathKind; label: string; hint: string }[] = [
    { id: 'shape', label: 'Shape', hint: 'Closed = silhouette, open = wall (S)' },
    { id: 'cutout', label: 'Cutout', hint: 'A hole through the badge (X)' }
  ];

  let hasSelection = $derived($selectedPathIds.size > 0);
</script>

<h2>Path kind</h2>
<p class="hint">
  {hasSelection
    ? 'Sets the kind for the selected path, and the default for new paths.'
    : 'Shapes become the silhouette when closed, or a wall when left open. Cutouts are holes through the metal.'}
</p>
<div class="kind-grid" role="group" aria-label="Path kind">
  {#each kinds as k (k.id)}
    <button
      type="button"
      class="kind-btn kind-{k.id}"
      class:active={$activeKind === k.id}
      onclick={() => pickKind(k.id)}
      title={k.hint}
    >
      <span class="kind-chip chip-{k.id}">{k.label[0]}</span>
      {k.label}
    </button>
  {/each}
</div>

<style>
  .hint {
    font-size: 0.8rem;
    opacity: 0.85;
    margin: 0 0 0.5rem;
    line-height: 1.35;
  }

  .kind-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
    margin-bottom: 0.5rem;
  }

  .kind-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.45rem 0.35rem;
    font-size: 0.8rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .kind-btn:hover {
    filter: brightness(1.06);
  }

  .kind-shape.active {
    border-color: #3a9bb8;
    box-shadow: 0 0 0 1px #3a9bb8;
  }
  .kind-cutout.active {
    border-color: #b85c3a;
    box-shadow: 0 0 0 1px #b85c3a;
  }

  .kind-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 3px;
    font-weight: 700;
    font-size: 0.7rem;
    color: #fff;
    flex-shrink: 0;
  }
  .chip-shape {
    background: #3a9bb8;
  }
  .chip-cutout {
    background: #b85c3a;
  }
</style>
