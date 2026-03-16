<script lang="ts">
  import {
    ambientIntensity,
    lightColor,
    lightAngle,
    lightElevation,
    enableShadows,
    aoStrength
  } from '../store';
</script>

<h2>Light</h2>
<div class="light-control">
  <label for="ambient-intensity">Ambient</label>
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
  <label for="light-color">Color</label>
  <input
    id="light-color"
    type="color"
    value={$lightColor}
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
</style>
