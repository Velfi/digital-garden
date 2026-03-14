<script lang="ts">
  import { clayMode, clayBrushRadius } from '../store';
</script>

<div class="clay-mode" role="group" aria-labelledby="clay-label">
  <span id="clay-label" class="stroke-label">Clay mode</span>
  <div class="stroke-buttons">
    <button
      type="button"
      class:active={$clayMode === 'bulk'}
      onclick={() => clayMode.set('bulk')}
      title="Bulk: pull voxels along cursor path (Blender Snake Hook style)"
    >
      Bulk
    </button>
  </div>
  {#if $clayMode === 'bulk'}
    <div class="light-control">
      <label for="clay-brush-size">Brush size</label>
      <div class="slider-row">
        <input
          id="clay-brush-size"
          type="range"
          min="0"
          max="2"
          step="1"
          value={$clayBrushRadius}
          oninput={(e) => clayBrushRadius.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="slider-value">{$clayBrushRadius}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .clay-mode {
    margin-bottom: 0.5rem;
  }

  .stroke-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .stroke-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .stroke-buttons button {
    flex: 1;
    min-width: 4rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .stroke-buttons button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .stroke-buttons button.active {
    background: var(--link-color);
    border-color: var(--link-color);
  }

  :global(body:not(.light-mode)) .stroke-buttons button.active {
    color: white;
    background: color-mix(in srgb, var(--link-color) 70%, black);
    border-color: color-mix(in srgb, var(--link-color) 70%, black);
  }

  :global(body.light-mode) .stroke-buttons button.active {
    color: var(--text-color);
    background: color-mix(in srgb, var(--link-color) 20%, var(--bg-color));
    border-color: var(--link-color);
  }

  .light-control {
    margin-top: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .light-control label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .slider-row input[type='range'] {
    flex: 1;
    accent-color: var(--link-color);
  }

  .slider-value {
    font-size: 0.85rem;
    opacity: 0.8;
    min-width: 2.5rem;
  }
</style>
