<script>
  import XyInput from '$lib/components/XYInput.svelte';
  import { triangleSize, triangleSpacing, waveIntensity, hue, waveScale, hueScale } from './store';
</script>

<div class="span-columns">
  <h2 class="center">Command the Triangles!</h2>
</div>
<label for="triangleSize">Triangle Size</label>
<input
  name="triangleSize"
  type="range"
  min="50"
  max="200"
  bind:value={$triangleSize}
  title={String(triangleSize)}
/>
<label for="triangleSpacing">Triangle Spacing</label>
<input
  name="triangleSpacing"
  type="range"
  min="0.1"
  max="2"
  step={0.01}
  bind:value={$triangleSpacing}
  title={String(triangleSpacing)}
/>
<label for="hue">Hue</label>
<input name="hue" type="range" min="0" max="360" bind:value={$hue} title={String(hue)} />
<label for="hueScale">Hue Scale</label>
<input
  name="hueScale"
  type="range"
  min="0.1"
  max="2"
  step="0.1"
  bind:value={$hueScale}
  title={String(hueScale)}
/>
<label for="waveIntensity">Wave Intensity</label>
<input
  name="waveIntensity"
  type="range"
  min="1"
  max="50"
  bind:value={$waveIntensity}
  title={String(waveIntensity)}
/>
<div class="span-columns">
  <XyInput
    xLabel="Side-to-side Wave Scale"
    yLabel="Up-and-down Wave Scale"
    min={0.1}
    max={10}
    step={0.1}
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
