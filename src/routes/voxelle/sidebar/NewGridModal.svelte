<script lang="ts">
  import { get } from 'svelte/store';
  import { gridSize, resetCanvas, MAX_GRID_SIZE } from '../store';
  import type { StartShape } from '../store';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let newGridSize = $state(32);
  let newGridShape = $state<StartShape>('circle');

  $effect(() => {
    if (open) {
      newGridSize = get(gridSize);
    }
  });

  function createGrid() {
    const size = Math.max(1, Math.min(MAX_GRID_SIZE, Math.floor(newGridSize)));
    gridSize.set(size);
    resetCanvas(size, newGridShape);
    newGridSize = size;
    open = false;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal">
      <h3>New grid</h3>
      <label>
        Grid size (1–{MAX_GRID_SIZE.toLocaleString()})
        <input type="number" min="1" max={MAX_GRID_SIZE} step="1" bind:value={newGridSize} />
      </label>
      <label>
        Starting shape
        <select bind:value={newGridShape}>
          <option value="cube">Cube</option>
          <option value="orb">Orb</option>
          <option value="cylinder">Cylinder</option>
          <option value="hollowCube">Hollow cube</option>
          <option value="plane">Plane</option>
          <option value="circle">Circle</option>
          <option value="empty">Empty</option>
        </select>
      </label>
      <div class="modal-buttons">
        <button type="button" onclick={createGrid}>Create</button>
        <button type="button" onclick={() => (open = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal input[type='number'],
  .modal select {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }
</style>
