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
    atmosphereHeightBias,
    atmosphereHeightFalloff,
    atmosphereDriftEnabled,
    atmosphereDriftAmount,
    atmosphereDriftScale,
    atmosphereDriftSpeed,
    atmospherePlaneValid,
    clearAtmospherePlane,
    isMoodTool,
    distanceTintEnabled,
    distanceTintNearColor,
    distanceTintMidColor,
    distanceTintFarColor,
    distanceTintNearDistance,
    distanceTintFarDistance,
    distanceTintStrength,
    grainEnabled,
    grainStrength,
    grainAnimated,
    grainSpeed,
    sunShaftsEnabled,
    sunShaftsStrength,
    sunShaftsDecay,
    sunShaftsDensity,
    sunShaftsWeight,
    sunShaftsSamples
  } from '../store/index';
</script>

{#if isMoodTool($tool)}
  <div class="mood-options">
    <h3 class="section-title">
      {$tool === 'atmosphere'
        ? 'Atmosphere'
        : $tool === 'sunShafts'
          ? 'Sun shafts'
          : $tool === 'distanceTint'
            ? 'Distance tint'
            : 'Grain'}
    </h3>
    {#if $renderingMode === 'ray'}
      <p class="hint dimmed">Atmosphere is not available in Ray rendering mode.</p>
    {/if}
    {#if $tool === 'atmosphere'}
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
      <label class="row">
        <span>Height bias</span>
        <input
          type="range"
          min="-200"
          max="200"
          step="1"
          value={$atmosphereHeightBias}
          disabled={$renderingMode === 'ray'}
          oninput={(e) => atmosphereHeightBias.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="val">{$atmosphereHeightBias}</span>
      </label>
      <label class="row">
        <span>Height falloff</span>
        <input
          type="range"
          min="10"
          max="400"
          step="1"
          value={$atmosphereHeightFalloff}
          disabled={$renderingMode === 'ray'}
          oninput={(e) => atmosphereHeightFalloff.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="val">{$atmosphereHeightFalloff}</span>
      </label>
      <label class="row">
        <input
          type="checkbox"
          checked={$atmosphereDriftEnabled}
          disabled={$renderingMode === 'ray'}
          onchange={(e) => atmosphereDriftEnabled.set((e.target as HTMLInputElement).checked)}
        />
        Drift
      </label>
      {#if $atmosphereDriftEnabled}
        <label class="row">
          <span>Drift amount</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={$atmosphereDriftAmount}
            disabled={$renderingMode === 'ray'}
            oninput={(e) => atmosphereDriftAmount.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="val">{$atmosphereDriftAmount.toFixed(2)}</span>
        </label>
        <label class="row">
          <span>Drift scale</span>
          <input
            type="range"
            min="0.002"
            max="0.1"
            step="0.001"
            value={$atmosphereDriftScale}
            disabled={$renderingMode === 'ray'}
            oninput={(e) => atmosphereDriftScale.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="val">{$atmosphereDriftScale.toFixed(3)}</span>
        </label>
        <label class="row">
          <span>Drift speed</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={$atmosphereDriftSpeed}
            disabled={$renderingMode === 'ray'}
            oninput={(e) => atmosphereDriftSpeed.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="val">{$atmosphereDriftSpeed.toFixed(2)}</span>
        </label>
      {/if}
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
    {:else if $tool === 'distanceTint'}
      <label class="row">
        <input
          type="checkbox"
          checked={$distanceTintEnabled}
          onchange={(e) => distanceTintEnabled.set((e.target as HTMLInputElement).checked)}
        />
        Enable distance tint
      </label>
      <label class="row"><span>Near</span><input type="color" value={$distanceTintNearColor} oninput={(e) => distanceTintNearColor.set((e.target as HTMLInputElement).value)} /></label>
      <label class="row"><span>Mid</span><input type="color" value={$distanceTintMidColor} oninput={(e) => distanceTintMidColor.set((e.target as HTMLInputElement).value)} /></label>
      <label class="row"><span>Far</span><input type="color" value={$distanceTintFarColor} oninput={(e) => distanceTintFarColor.set((e.target as HTMLInputElement).value)} /></label>
      <label class="row"><span>Near dist</span><input type="range" min="1" max="256" step="1" value={$distanceTintNearDistance} oninput={(e) => distanceTintNearDistance.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$distanceTintNearDistance}</span></label>
      <label class="row"><span>Far dist</span><input type="range" min="8" max="512" step="1" value={$distanceTintFarDistance} oninput={(e) => distanceTintFarDistance.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$distanceTintFarDistance}</span></label>
      <label class="row"><span>Strength</span><input type="range" min="0" max="1" step="0.01" value={$distanceTintStrength} oninput={(e) => distanceTintStrength.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$distanceTintStrength.toFixed(2)}</span></label>
    {:else if $tool === 'sunShafts'}
      <label class="row">
        <input
          type="checkbox"
          checked={$sunShaftsEnabled}
          onchange={(e) => sunShaftsEnabled.set((e.target as HTMLInputElement).checked)}
        />
        Enable sun shafts
      </label>
      <label class="row"><span>Strength</span><input type="range" min="0" max="1.5" step="0.01" value={$sunShaftsStrength} oninput={(e) => sunShaftsStrength.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$sunShaftsStrength.toFixed(2)}</span></label>
      <label class="row"><span>Decay</span><input type="range" min="0.5" max="0.99" step="0.01" value={$sunShaftsDecay} oninput={(e) => sunShaftsDecay.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$sunShaftsDecay.toFixed(2)}</span></label>
      <label class="row"><span>Density</span><input type="range" min="0.1" max="1.5" step="0.01" value={$sunShaftsDensity} oninput={(e) => sunShaftsDensity.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$sunShaftsDensity.toFixed(2)}</span></label>
      <label class="row"><span>Weight</span><input type="range" min="0" max="1.5" step="0.01" value={$sunShaftsWeight} oninput={(e) => sunShaftsWeight.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$sunShaftsWeight.toFixed(2)}</span></label>
      <label class="row"><span>Samples</span><input type="range" min="6" max="32" step="1" value={$sunShaftsSamples} oninput={(e) => sunShaftsSamples.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$sunShaftsSamples}</span></label>
    {:else}
      <label class="row">
        <input
          type="checkbox"
          checked={$grainEnabled}
          onchange={(e) => grainEnabled.set((e.target as HTMLInputElement).checked)}
        />
        Enable grain
      </label>
      <label class="row"><span>Strength</span><input type="range" min="0" max="0.5" step="0.01" value={$grainStrength} oninput={(e) => grainStrength.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$grainStrength.toFixed(2)}</span></label>
      <label class="row">
        <input
          type="checkbox"
          checked={$grainAnimated}
          onchange={(e) => grainAnimated.set((e.target as HTMLInputElement).checked)}
        />
        Animated
      </label>
      <label class="row"><span>Speed</span><input type="range" min="0" max="4" step="0.05" value={$grainSpeed} oninput={(e) => grainSpeed.set(Number((e.target as HTMLInputElement).value))} /><span class="val">{$grainSpeed.toFixed(2)}</span></label>
    {/if}
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
