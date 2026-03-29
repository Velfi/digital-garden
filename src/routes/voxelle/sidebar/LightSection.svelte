<script lang="ts">
  import {
    ambientIntensity,
    sunlightIntensity,
    lightColor,
    lightAngle,
    lightElevation,
    enableShadows,
    aoStrength,
    sceneEnvironmentIntensity,
    TONE_MAPPING_EXPOSURE_MIN,
    TONE_MAPPING_EXPOSURE_MAX,
    toneMappingExposure,
    autoExposureEnabled,
    LIGHT_PRESETS,
    applyLightPreset,
    type LightPresetId
  } from '../store/index';
  import { safeColorInputValue } from '$lib/colorInput';

  function matchesPreset(id: LightPresetId): boolean {
    const p = LIGHT_PRESETS.find((x) => x.id === id);
    if (!p) return false;
    return (
      $ambientIntensity === p.ambientIntensity &&
      $sunlightIntensity === p.sunlightIntensity &&
      $lightColor.toLowerCase() === p.lightColor.toLowerCase() &&
      $lightAngle === p.lightAngle &&
      $lightElevation === p.lightElevation &&
      $enableShadows === p.enableShadows &&
      $sceneEnvironmentIntensity === p.sceneEnvironmentIntensity
    );
  }

  const FALLBACK_HEX = '#ffffff';
</script>

<div class="light-heading-row">
  <h2 class="light-title">Light</h2>
  <div class="preset-toolbar" role="toolbar" aria-label="Lighting presets">
    {#each LIGHT_PRESETS as preset (preset.id)}
      <button
        type="button"
        class="preset-btn"
        class:active={matchesPreset(preset.id)}
        title={preset.title}
        aria-label={`${preset.title} lighting`}
        aria-pressed={matchesPreset(preset.id)}
        onclick={() => applyLightPreset(preset.id)}
      >
        <span class="preset-emoji" aria-hidden="true"
          >{preset.id === 'sunny'
            ? '☀️'
            : preset.id === 'cloudy'
              ? '☁️'
              : preset.id === 'incandescent'
                ? '💡'
                : preset.id === 'fluorescent'
                  ? '🔦'
                  : preset.id === 'moonlight'
                    ? '🌙'
                    : '🌑'}</span
        >
      </button>
    {/each}
  </div>
</div>
<div class="light-control">
  <label for="tone-exposure">Exposure</label>
  <div class="slider-row">
    <input
      id="tone-exposure"
      type="range"
      min={TONE_MAPPING_EXPOSURE_MIN}
      max={TONE_MAPPING_EXPOSURE_MAX}
      step="0.01"
      value={$toneMappingExposure}
      oninput={(e) =>
        toneMappingExposure.set(Number((e.target as HTMLInputElement).value))}
      title={$autoExposureEnabled
        ? 'EV bias added to auto exposure (±5); neutral 0'
        : 'Exposure in EV stops (neutral 0); applied as 2^EV to tone mapping'}
    />
    <span class="slider-value"
      >{$autoExposureEnabled ? 'Bias ' : ''}{$toneMappingExposure >= 0 ? '+' : ''}{$toneMappingExposure.toFixed(
        2
      )} EV</span
    >
  </div>
</div>
<div class="light-control">
  <label class="checkbox-label">
    <input
      type="checkbox"
      checked={$autoExposureEnabled}
      onchange={(e) => autoExposureEnabled.set((e.target as HTMLInputElement).checked)}
      title="Adjust exposure each frame from viewport brightness (may add GPU readback cost)"
    />
    Autoexpose
  </label>
</div>
<div class="light-control">
  <label for="ambient-intensity">Ambient light</label>
  <div class="slider-row">
    <input
      id="ambient-intensity"
      type="range"
      min="0"
      max="1.5"
      step="0.1"
      value={$ambientIntensity}
      oninput={(e) => ambientIntensity.set(Number((e.target as HTMLInputElement).value))}
    />
    <span class="slider-value">{$ambientIntensity.toFixed(1)}</span>
  </div>
</div>
<div class="light-control">
  <label for="sunlight-intensity">Sunlight</label>
  <div class="slider-row">
    <input
      id="sunlight-intensity"
      type="range"
      min="0"
      max="4"
      step="0.1"
      value={$sunlightIntensity}
      oninput={(e) => sunlightIntensity.set(Number((e.target as HTMLInputElement).value))}
    />
    <span class="slider-value">{$sunlightIntensity.toFixed(1)}</span>
  </div>
</div>
<div class="light-control">
  <label for="light-color">Color</label>
  <input
    id="light-color"
    type="color"
    defaultValue={safeColorInputValue($lightColor, FALLBACK_HEX)}
    value={safeColorInputValue($lightColor, FALLBACK_HEX)}
    oninput={(e) => lightColor.set((e.target as HTMLInputElement).value)}
  />
</div>
<div class="light-control">
  <label for="light-angle">Angle</label>
  <div class="slider-row">
    <input
      id="light-angle"
      type="range"
      min="0"
      max="360"
      value={$lightAngle}
      oninput={(e) => lightAngle.set(Number((e.target as HTMLInputElement).value))}
    />
    <span class="slider-value">{$lightAngle}°</span>
  </div>
</div>
<div class="light-control">
  <label for="light-elevation">Elevation</label>
  <div class="slider-row">
    <input
      id="light-elevation"
      type="range"
      min="5"
      max="90"
      value={$lightElevation}
      oninput={(e) => lightElevation.set(Number((e.target as HTMLInputElement).value))}
    />
    <span class="slider-value">{$lightElevation}°</span>
  </div>
</div>
<div class="light-control">
  <label class="checkbox-label">
    <input
      type="checkbox"
      checked={$enableShadows}
      onchange={(e) => enableShadows.set((e.target as HTMLInputElement).checked)}
    />
    Shadows
  </label>
</div>
<div class="light-control">
  <label for="ao-strength">Ambient occlusion</label>
  <div class="slider-row">
    <input
      id="ao-strength"
      type="range"
      min="0"
      max="2"
      step="1"
      value={$aoStrength}
      oninput={(e) => aoStrength.set(Number((e.target as HTMLInputElement).value) as 0 | 1 | 2)}
    />
    <span class="slider-value">
      {$aoStrength === 0 ? 'Off' : $aoStrength === 1 ? 'Subtle' : 'Strong'}
    </span>
  </div>
</div>

<style>
  .light-heading-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    margin-bottom: 0.35rem;
  }

  .light-title {
    margin: 0;
    font-size: 1rem;
  }

  .preset-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .preset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .preset-btn:hover {
    filter: brightness(1.08);
  }

  .preset-btn.active {
    border-color: var(--accent-color, #3399ff);
    box-shadow: 0 0 0 1px var(--accent-color, #3399ff);
  }

  .preset-emoji {
    font-size: 1.15rem;
    line-height: 1;
  }
</style>
