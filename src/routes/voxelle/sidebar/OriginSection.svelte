<script lang="ts">
  import {
    voxels,
    selection,
    centerOriginOnObject,
    centerOriginOnSelection,
    shiftVoxelsAndSelection
  } from '../store';

  let shiftX = $state(0);
  let shiftY = $state(0);
  let shiftZ = $state(0);
</script>

<h2>Origin</h2>
<p class="origin-hint">Move all voxels so the origin lands at the center or a selected point.</p>
<div class="origin-buttons">
  <button
    type="button"
    onclick={() => centerOriginOnObject()}
    disabled={$voxels.size === 0}
    title="Move voxels so object center is at origin"
  >
    Center
  </button>
  <button
    type="button"
    onclick={() => centerOriginOnSelection()}
    disabled={$selection.size === 0}
    title="Move voxels so selection center is at origin"
  >
    To selection
  </button>
</div>
<div class="origin-inputs">
  <label for="shift-x">Shift X</label>
  <input id="shift-x" type="number" bind:value={shiftX} title="Move all voxels by this amount" />
  <label for="shift-y">Shift Y</label>
  <input id="shift-y" type="number" bind:value={shiftY} />
  <label for="shift-z">Shift Z</label>
  <input id="shift-z" type="number" bind:value={shiftZ} />
</div>
<button
  type="button"
  class="shift-apply"
  onclick={() => shiftVoxelsAndSelection(shiftX, shiftY, shiftZ)}
  disabled={$voxels.size === 0}
  title="Apply shift to all voxels and selection"
>
  Apply shift
</button>

<style>

  .origin-hint {
    font-size: 0.8rem;
    opacity: 0.8;
    margin: -0.25rem 0 0.5rem 0;
  }

  .origin-buttons {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .origin-buttons button {
    flex: 1;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .origin-buttons button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .origin-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .origin-inputs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .origin-inputs label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .origin-inputs input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .shift-apply {
    margin-top: 0.25rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .shift-apply:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .shift-apply:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
