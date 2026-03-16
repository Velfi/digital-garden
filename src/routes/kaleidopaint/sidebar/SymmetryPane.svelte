<script lang="ts">
  import {
    symmetryEnabled,
    symmetryMode,
    symmetryFolds,
    symmetryOriginX,
    symmetryOriginY,
    symmetryRotation,
    showSymmetryPreview,
    brushRotateWithSymmetry,
    mosaicType
  } from '../store';
  import { MOSAIC_TYPES } from '../symmetry';
  import ParamLabel from '../ParamLabel.svelte';

  const linearFolds = [2, 4, 8];
  const polarFolds = [3, 4, 5, 6, 8, 12];
</script>

<h2>Symmetry</h2>
<div class="symmetry-section">
  <label class="toggle">
    <input type="checkbox" bind:checked={$symmetryEnabled} />
    Symmetry on
    <select bind:value={$symmetryMode} disabled={!$symmetryEnabled}>
      <option value="linear">Linear</option>
      <option value="polar">Polar</option>
      <option value="mosaic">Mosaic</option>
    </select>
  </label>

  {#if $symmetryEnabled && $symmetryMode === 'linear'}
    <div class="folds">
      {#each linearFolds as n}
        <button
          type="button"
          class="fold"
          class:active={$symmetryFolds === n}
          onclick={() => symmetryFolds.set(n)}
        >
          {n}-fold
        </button>
      {/each}
    </div>
  {/if}
  {#if $symmetryEnabled && $symmetryMode === 'polar'}
    <div class="folds">
      {#each polarFolds as n}
        <button
          type="button"
          class="fold"
          class:active={$symmetryFolds === n}
          onclick={() => symmetryFolds.set(n)}
        >
          {n}-fold
        </button>
      {/each}
    </div>
  {/if}
  {#if $symmetryEnabled && $symmetryMode === 'mosaic'}
    <label class="brush-param">
      <span class="label">Pattern</span>
      <select bind:value={$mosaicType}>
        {#each MOSAIC_TYPES as { value, label }}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>
  {/if}
  {#if $symmetryEnabled}
    <label class="brush-param">
      <ParamLabel
        label="Rotation"
        tip="Angle of the symmetry axis (linear) or first fold (polar)."
        id="tip-symmetry-rotation"
      />
      <input type="range" min="0" max="360" bind:value={$symmetryRotation} />
      <span class="value">{$symmetryRotation}°</span>
    </label>
    <button
      type="button"
      onclick={() => {
        symmetryOriginX.set(0.5);
        symmetryOriginY.set(0.5);
      }}
      title="Reset symmetry origin to center"
    >
      Center origin
    </button>
  {/if}

  <label class="toggle">
    <input type="checkbox" bind:checked={$showSymmetryPreview} />
    Show symmetry preview
  </label>
  {#if $symmetryEnabled}
    <label class="toggle">
      <input type="checkbox" bind:checked={$brushRotateWithSymmetry} />
      Rotate brush with symmetry
    </label>
  {/if}
</div>

<style>
  .symmetry-section {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
    align-items: start;
  }

  .folds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .fold.active {
    font-weight: bold;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .brush-param {
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .value {
    justify-self: end;
    text-align: right;
  }
</style>
