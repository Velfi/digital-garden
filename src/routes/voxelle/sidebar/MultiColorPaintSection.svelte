<script lang="ts">
  import {
    paintColorDistribution,
    loadPreferences,
    savePreferences,
    type PaintColorDistributionMode,
    type PaintColorDistributionState
  } from '../store/index';

  function persist(next: PaintColorDistributionState) {
    paintColorDistribution.set(next);
    savePreferences({ ...loadPreferences(), paintColorDistribution: next });
  }

  function setMode(mode: PaintColorDistributionMode) {
    persist({ ...$paintColorDistribution, mode });
  }

  function patchFbm(p: Partial<PaintColorDistributionState['fbm']>) {
    persist({ ...$paintColorDistribution, fbm: { ...$paintColorDistribution.fbm, ...p } });
  }

  function patchGradient(p: Partial<PaintColorDistributionState['gradient']>) {
    persist({ ...$paintColorDistribution, gradient: { ...$paintColorDistribution.gradient, ...p } });
  }

  function patchDither(p: Partial<PaintColorDistributionState['dither']>) {
    persist({ ...$paintColorDistribution, dither: { ...$paintColorDistribution.dither, ...p } });
  }
</script>

<section class="multi-color-paint" aria-label="Multi-color paint">
  <h3 class="multi-color-h3">Multi-color paint</h3>
  <div class="tool-panel-row">
    <span class="tool-panel-label">Mode</span>
    <select
      class="multi-color-select"
      value={$paintColorDistribution.mode}
      onchange={(e) => setMode((e.target as HTMLSelectElement).value as PaintColorDistributionMode)}
    >
      <option value="whiteNoise">White noise (spatial hash)</option>
      <option value="randomSingle">Random single color per stroke</option>
      <option value="fbmNoise">FBM noise</option>
      <option value="gradient">Gradient</option>
      <option value="dither">Dither</option>
    </select>
  </div>

  {#if $paintColorDistribution.mode === 'fbmNoise'}
    <div class="tool-panel-row">
      <span class="tool-panel-label">Octaves</span>
      <input
        type="range"
        min="1"
        max="12"
        step="1"
        value={$paintColorDistribution.fbm.octaves}
        oninput={(e) => patchFbm({ octaves: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="tool-panel-value">{$paintColorDistribution.fbm.octaves}</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Frequency</span>
      <input
        type="range"
        min="0.02"
        max="0.8"
        step="0.01"
        value={$paintColorDistribution.fbm.frequency}
        oninput={(e) => patchFbm({ frequency: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="tool-panel-value">{$paintColorDistribution.fbm.frequency.toFixed(2)}</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Lacunarity</span>
      <input
        type="range"
        min="1.5"
        max="3.5"
        step="0.05"
        value={$paintColorDistribution.fbm.lacunarity}
        oninput={(e) => patchFbm({ lacunarity: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="tool-panel-value">{$paintColorDistribution.fbm.lacunarity.toFixed(2)}</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Persistence</span>
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        value={$paintColorDistribution.fbm.persistence}
        oninput={(e) => patchFbm({ persistence: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="tool-panel-value">{$paintColorDistribution.fbm.persistence.toFixed(2)}</span>
    </div>
    <label class="tool-panel-check">
      <input
        type="checkbox"
        checked={$paintColorDistribution.fbm.quantized}
        onchange={(e) => patchFbm({ quantized: (e.target as HTMLInputElement).checked })}
      />
      Quantized (palette steps)
    </label>
  {/if}

  {#if $paintColorDistribution.mode === 'gradient'}
    <div class="tool-panel-row">
      <span class="tool-panel-label">Kind</span>
      <select
        class="multi-color-select"
        value={$paintColorDistribution.gradient.kind}
        onchange={(e) =>
          patchGradient({ kind: (e.target as HTMLSelectElement).value as 'linear' | 'radial' })}
      >
        <option value="linear">Linear (axis)</option>
        <option value="radial">Radial (distance from center)</option>
      </select>
    </div>
    {#if $paintColorDistribution.gradient.kind === 'linear'}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Axis</span>
        <select
          class="multi-color-select"
          value={String($paintColorDistribution.gradient.linearAxis)}
          onchange={(e) =>
            patchGradient({ linearAxis: Number((e.target as HTMLSelectElement).value) as 0 | 1 | 2 })}
        >
          <option value="0">X</option>
          <option value="1">Y</option>
          <option value="2">Z</option>
        </select>
      </div>
    {/if}
    {#if $paintColorDistribution.gradient.kind === 'radial'}
      <p class="multi-color-copy">Center (world voxels)</p>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Cx</span>
        <input
          type="number"
          step="1"
          class="multi-color-num"
          value={$paintColorDistribution.gradient.radialCenter[0]}
          oninput={(e) =>
            patchGradient({
              radialCenter: [
                Number((e.target as HTMLInputElement).value),
                $paintColorDistribution.gradient.radialCenter[1],
                $paintColorDistribution.gradient.radialCenter[2]
              ]
            })}
        />
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Cy</span>
        <input
          type="number"
          step="1"
          class="multi-color-num"
          value={$paintColorDistribution.gradient.radialCenter[1]}
          oninput={(e) =>
            patchGradient({
              radialCenter: [
                $paintColorDistribution.gradient.radialCenter[0],
                Number((e.target as HTMLInputElement).value),
                $paintColorDistribution.gradient.radialCenter[2]
              ]
            })}
        />
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Cz</span>
        <input
          type="number"
          step="1"
          class="multi-color-num"
          value={$paintColorDistribution.gradient.radialCenter[2]}
          oninput={(e) =>
            patchGradient({
              radialCenter: [
                $paintColorDistribution.gradient.radialCenter[0],
                $paintColorDistribution.gradient.radialCenter[1],
                Number((e.target as HTMLInputElement).value)
              ]
            })}
        />
      </div>
    {/if}
    <div class="tool-panel-row">
      <span class="tool-panel-label">Scale</span>
      <input
        type="range"
        min="0.01"
        max="0.5"
        step="0.005"
        value={$paintColorDistribution.gradient.scale}
        oninput={(e) => patchGradient({ scale: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="tool-panel-value">{$paintColorDistribution.gradient.scale.toFixed(3)}</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Phase</span>
      <input
        type="range"
        min="-3.15"
        max="3.15"
        step="0.05"
        value={$paintColorDistribution.gradient.phase}
        oninput={(e) => patchGradient({ phase: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="tool-panel-value">{$paintColorDistribution.gradient.phase.toFixed(2)}</span>
    </div>
    <label class="tool-panel-check">
      <input
        type="checkbox"
        checked={$paintColorDistribution.gradient.quantized}
        onchange={(e) => patchGradient({ quantized: (e.target as HTMLInputElement).checked })}
      />
      Quantized (palette steps)
    </label>
  {/if}

  {#if $paintColorDistribution.mode === 'dither'}
    <div class="tool-panel-row">
      <span class="tool-panel-label">Bayer</span>
      <select
        class="multi-color-select"
        value={String($paintColorDistribution.dither.orderedSize)}
        onchange={(e) =>
          patchDither({ orderedSize: Number((e.target as HTMLSelectElement).value) as 2 | 4 | 8 })}
      >
        <option value="2">2×2</option>
        <option value="4">4×4</option>
        <option value="8">8×8</option>
      </select>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Strength</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={$paintColorDistribution.dither.orderedStrength}
        oninput={(e) =>
          patchDither({ orderedStrength: Number((e.target as HTMLInputElement).value) })}
      />
      <span class="tool-panel-value">{$paintColorDistribution.dither.orderedStrength.toFixed(2)}</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Error diffusion</span>
      <select
        class="multi-color-select"
        value={$paintColorDistribution.dither.errorDiffusion}
        onchange={(e) =>
          patchDither({
            errorDiffusion: (e.target as HTMLSelectElement).value as 'none' | 'floydSteinberg'
          })}
      >
        <option value="none">None (ordered only)</option>
        <option value="floydSteinberg">Floyd–Steinberg (fills / full rectangles)</option>
      </select>
    </div>
    <p class="multi-color-copy">
      Base pattern is spatial hash; ordered Bayer adjusts thresholds. Error diffusion runs on flood
      fills when the region is a full rectangle in a plane (otherwise sequential fallback).
    </p>
  {/if}
</section>

<style>
  .multi-color-paint {
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-color, #333);
  }

  .multi-color-h3 {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .multi-color-select {
    flex: 1;
    min-width: 0;
    font-size: 0.85rem;
    padding: 0.25rem 0.35rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background: var(--bg-color);
    color: var(--text-color);
  }

  .multi-color-num {
    flex: 1;
    min-width: 0;
    max-width: 5rem;
    font-size: 0.85rem;
    padding: 0.2rem 0.35rem;
  }

  .multi-color-copy {
    margin: 0.25rem 0;
    font-size: 0.75rem;
    opacity: 0.85;
    line-height: 1.35;
  }

  .tool-panel-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
  }

  .tool-panel-label {
    flex: 0 0 5.5rem;
    opacity: 0.9;
  }

  .tool-panel-value {
    flex: 0 0 auto;
    min-width: 2.25rem;
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
  }

  .tool-panel-check {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0.25rem 0 0.35rem;
    font-size: 0.82rem;
    cursor: pointer;
  }
</style>
