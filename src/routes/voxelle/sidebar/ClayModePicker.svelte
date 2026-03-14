<script lang="ts">
  import { get } from 'svelte/store';
  import { clayMode, clayBrushRadius, puffRadius, puffRadiusRange, puffRadiusMin, puffRadiusMax, puffScatter } from '../store';
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
    <button
      type="button"
      class:active={$clayMode === 'smooth'}
      onclick={() => clayMode.set('smooth')}
      title="Smooth: soften edges, fill small gaps"
    >
      Smooth
    </button>
    <button
      type="button"
      class:active={$clayMode === 'level'}
      onclick={() => clayMode.set('level')}
      title="Level: flatten surface to clicked height"
    >
      Level
    </button>
    <button
      type="button"
      class:active={$clayMode === 'gouge'}
      onclick={() => clayMode.set('gouge')}
      title="Gouge: carve trench along path"
    >
      Gouge
    </button>
    <button
      type="button"
      class:active={$clayMode === 'branch'}
      onclick={() => clayMode.set('branch')}
      title="Branch: extrude limbs/horns into empty space (follows cursor direction)"
    >
      Branch
    </button>
    <button
      type="button"
      class:active={$clayMode === 'puffy'}
      onclick={() => clayMode.set('puffy')}
      title="Puffy: organic spheres for clouds"
    >
      Puffy
    </button>
    <button
      type="button"
      class:active={$clayMode === 'melt'}
      onclick={() => clayMode.set('melt')}
      title="Melt: spread voxels downhill, highest first"
    >
      Melt
    </button>
  </div>
  {#if $clayMode === 'bulk' || $clayMode === 'smooth' || $clayMode === 'level' || $clayMode === 'gouge' || $clayMode === 'branch' || $clayMode === 'melt'}
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
  {#if $clayMode === 'puffy'}
    <div class="light-control">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={$puffRadiusRange}
          onchange={(e) => puffRadiusRange.set((e.target as HTMLInputElement).checked)}
          title="Vary sphere size per stamp"
        />
        Size range
      </label>
    </div>
    {#if $puffRadiusRange}
      <div class="light-control">
        <label for="puff-radius-min">Min</label>
        <div class="slider-row">
          <input
            id="puff-radius-min"
            type="range"
            min="0"
            max="5"
            step="1"
            value={$puffRadiusMin}
            oninput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              puffRadiusMin.set(v);
              if (v > get(puffRadiusMax)) puffRadiusMax.set(v);
            }}
          />
          <span class="slider-value">{$puffRadiusMin}</span>
        </div>
      </div>
      <div class="light-control">
        <label for="puff-radius-max">Max</label>
        <div class="slider-row">
          <input
            id="puff-radius-max"
            type="range"
            min="0"
            max="5"
            step="1"
            value={$puffRadiusMax}
            oninput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              puffRadiusMax.set(v);
              if (v < get(puffRadiusMin)) puffRadiusMin.set(v);
            }}
          />
          <span class="slider-value">{$puffRadiusMax}</span>
        </div>
      </div>
    {:else}
      <div class="light-control">
        <label for="puff-sphere-size">Sphere size</label>
        <div class="slider-row">
          <input
            id="puff-sphere-size"
            type="range"
            min="0"
            max="5"
            step="1"
            value={$puffRadius}
            oninput={(e) => puffRadius.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="slider-value">{$puffRadius}</span>
        </div>
      </div>
    {/if}
    <div class="light-control">
      <label for="puff-scatter">Scatter</label>
      <div class="slider-row">
        <input
          id="puff-scatter"
          type="range"
          min="0"
          max="4"
          step="1"
          value={$puffScatter}
          oninput={(e) => puffScatter.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="slider-value">{$puffScatter}</span>
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

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    accent-color: var(--link-color);
  }
</style>
