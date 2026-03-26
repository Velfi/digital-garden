<script lang="ts">
  import {
    tool,
    renderingMode,
    atmosphereEnabled,
    atmosphereColor,
    atmosphereThickness,
    atmosphereDensity,
    atmosphereMode,
    atmosphereSpatialMode,
    atmospherePlaneValid,
    clearAtmospherePlane,
    isMoodTool
  } from '../store/index';
</script>

{#if isMoodTool($tool)}
  <div class="mood-options">
    <h3 class="section-title">Atmosphere</h3>
    {#if $renderingMode === 'ray'}
      <p class="hint dimmed">Atmosphere is not available in Ray rendering mode.</p>
    {/if}
    <label class="row">
      <input
        type="checkbox"
        checked={$atmosphereEnabled}
        disabled={$renderingMode === 'ray'}
        onchange={(e) => atmosphereEnabled.set((e.target as HTMLInputElement).checked)}
      />
      Enable fog
    </label>
    <label class="row">
      <span>Fog color</span>
      <input
        type="color"
        value={$atmosphereColor}
        disabled={$renderingMode === 'ray'}
        oninput={(e) => atmosphereColor.set((e.target as HTMLInputElement).value)}
      />
    </label>
    <div class="row mode-row">
      <span class="mode-label">Coverage</span>
      <label>
        <input
          type="radio"
          name="atmosphereSpatial"
          checked={$atmosphereSpatialMode === 'plane'}
          disabled={$renderingMode === 'ray'}
          onchange={() => atmosphereSpatialMode.set('plane')}
        />
        Ground / plane (click a face)
      </label>
      <label>
        <input
          type="radio"
          name="atmosphereSpatial"
          checked={$atmosphereSpatialMode === 'aerial'}
          disabled={$renderingMode === 'ray'}
          onchange={() => atmosphereSpatialMode.set('aerial')}
        />
        Whole scene (camera depth)
      </label>
    </div>
    <label class="row">
      <span>{$atmosphereSpatialMode === 'aerial' ? 'Depth scale' : 'Falloff'}</span>
      <input
        type="range"
        min="1"
        max="200"
        step="1"
        value={$atmosphereThickness}
        disabled={$renderingMode === 'ray'}
        oninput={(e) =>
          atmosphereThickness.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="val">{$atmosphereThickness}</span>
    </label>
    <label class="row">
      <span>Density</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={$atmosphereDensity}
        disabled={$renderingMode === 'ray'}
        oninput={(e) =>
          atmosphereDensity.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="val">{$atmosphereDensity.toFixed(2)}</span>
    </label>
    {#if $atmosphereSpatialMode === 'plane'}
      <div class="row mode-row">
        <span class="mode-label">Plane shape</span>
        <label>
          <input
            type="radio"
            name="atmosphereMode"
            checked={$atmosphereMode === 'slab'}
            disabled={$renderingMode === 'ray'}
            onchange={() => atmosphereMode.set('slab')}
          />
          Layer (both sides, soft belt)
        </label>
        <label>
          <input
            type="radio"
            name="atmosphereMode"
            checked={$atmosphereMode === 'positiveSide'}
            disabled={$renderingMode === 'ray'}
            onchange={() => atmosphereMode.set('positiveSide')}
          />
          Above face (+normal, haze into the sky)
        </label>
      </div>
    {/if}
    <p class="hint">
      {#if $atmosphereSpatialMode === 'aerial'}
        No face needed — fog increases along view depth. Higher Depth scale = thinner air; Density sets
        peak strength at distance.
      {:else}
        Click a voxel face to anchor the fog plane. Larger Falloff = a wide soft layer instead of a thin
        ribbon.
      {/if}
    </p>
    {#if $atmosphereSpatialMode === 'plane' && $atmospherePlaneValid}
      <p class="hint dimmed">Plane is set.</p>
    {:else if $atmosphereSpatialMode === 'plane'}
      <p class="hint dimmed">No plane yet — click a face while this tool is active.</p>
    {/if}
    <button
      type="button"
      class="clear-btn"
      disabled={$renderingMode === 'ray'}
      onclick={() => clearAtmospherePlane()}
    >
      Clear plane
    </button>
  </div>
{/if}

<style>
  .mood-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.25rem;
    border-top: 1px solid var(--border-color);
  }
  .section-title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-color);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
  }
  .mode-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .mode-label {
    font-weight: 500;
  }
  .val {
    min-width: 2.5rem;
    font-variant-numeric: tabular-nums;
  }
  .hint {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.35;
    color: var(--text-color);
  }
  .dimmed {
    opacity: 0.75;
  }
  .clear-btn {
    align-self: flex-start;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }
  .clear-btn:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }
  .clear-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
