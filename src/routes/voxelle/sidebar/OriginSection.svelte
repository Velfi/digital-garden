<script lang="ts">
  import {
    voxels,
    selection,
    centerOriginOnObject,
    centerOriginOnSelection,
    shiftVoxelsAndSelection,
    shiftSelection
  } from '../store/index';

  let shiftX = $state(0);
  let shiftY = $state(0);
  let shiftZ = $state(0);

  const hasSelection = $derived($selection.size > 0);
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
<div class="shift-block">
  <span class="shift-label">{hasSelection ? 'Shift selection' : 'Shift the object'}</span>
  <div class="shift-row">
    <label for="shift-x">x</label>
    <input id="shift-x" type="number" bind:value={shiftX} title="X offset" />
    <label for="shift-y">y</label>
    <input id="shift-y" type="number" bind:value={shiftY} title="Y offset" />
    <label for="shift-z">z</label>
    <input id="shift-z" type="number" bind:value={shiftZ} title="Z offset" />
  </div>
  <button
    type="button"
    class="shift-apply"
    onclick={() =>
      hasSelection
        ? shiftSelection(shiftX, shiftY, shiftZ)
        : shiftVoxelsAndSelection(shiftX, shiftY, shiftZ)}
    disabled={hasSelection ? $selection.size === 0 : $voxels.size === 0}
    title={hasSelection ? 'Move selected voxels' : 'Apply shift to all voxels and selection'}
  >
    Shift
  </button>
</div>

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

  .shift-block {
    margin-top: 0.75rem;
  }

  .shift-label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 0.35rem;
  }

  .shift-row {
    display: flex;
    align-items: center;
    gap: 0.25rem 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.35rem;
  }

  .shift-row label {
    font-size: 0.8rem;
    font-weight: 500;
    opacity: 0.85;
  }

  .shift-row input {
    width: 3rem;
    padding: 0.3rem 0.35rem;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .shift-apply {
    width: 100%;
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
