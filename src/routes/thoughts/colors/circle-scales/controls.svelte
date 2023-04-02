<script>
  import XyInput from '$lib/components/XYInput.svelte';
  import { circleSize, circleSpacing, Eccentricity, hue, hueScale, waveScale } from './store';
</script>

<div class="span-columns">
  <h2 class="center">Command the Scales!</h2>
</div>
<label for="scaleSize">Scale Size</label>
<input
  name="scaleSize"
  type="range"
  min="50"
  max="200"
  bind:value={$circleSize}
  title={String($circleSize)}
/>
<label for="scaleSpacing">Scale Spacing</label>
<input
  name="scaleSpacing"
  type="range"
  min="0.2"
  max="2"
  step={0.01}
  bind:value={$circleSpacing}
  title={String($circleSpacing)}
/>
<label for="hue">Hue</label>
<input name="hue" type="range" min="0" max="360" bind:value={$hue} title={String($hue)} />
<label for="hueScale">Hue Scale</label>
<input
  name="hueScale"
  type="range"
  min="1"
  max="20"
  step="0.1"
  bind:value={$hueScale}
  title={String($hueScale)}
/>
<label for="Eccentricity">Eccentricity</label>
<input
  name="Eccentricity"
  type="range"
  min="0"
  max="50"
  step="0.01"
  bind:value={$Eccentricity}
  title={String($Eccentricity)}
/>
<div class="span-columns">
  <XyInput
    xLabel="X Rotation Speed Mult."
    yLabel="Y Rotation Speed Mult."
    min={0.01}
    max={1.5}
    step={0.01}
    bind:value={$waveScale}
  />
</div>

<style lang="scss">
  div.span-columns {
    grid-column: span 2;
  }

  h2 {
    font-size: 2rem;
    line-height: 1;
    margin-top: 0;
  }
</style>
