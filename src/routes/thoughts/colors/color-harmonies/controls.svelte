<script lang="ts">
  import { harmonyType, baseHue, saturation, lightness } from './store';
  import type { HarmonyType } from './store';

  const harmonyTypes: HarmonyType[] = [
    'complementary',
    'analogous',
    'triadic',
    'split-complementary',
    'square'
  ];
</script>

<div class="span-columns">
  <h2 class="center">Command the Harmonies!</h2>
</div>

<label for="harmony-type">Harmony Type</label>
<select id="harmony-type" bind:value={$harmonyType} title={$harmonyType}>
  {#each harmonyTypes as type (type)}
    <option value={type}>{type.replace('-', ' ')}</option>
  {/each}
</select>

<label for="base-hue">Base Hue</label>
<input
  type="range"
  id="base-hue"
  bind:value={$baseHue}
  min="0"
  max="359"
  step="1"
  title={String($baseHue) + '°'}
/>

<label for="saturation">Saturation</label>
<input
  type="range"
  id="saturation"
  bind:value={$saturation}
  min="0"
  max="100"
  step="1"
  title={String($saturation) + '%'}
/>

<label for="lightness">Lightness</label>
<input
  type="range"
  id="lightness"
  bind:value={$lightness}
  min="0"
  max="100"
  step="1"
  title={String($lightness) + '%'}
/>

<style lang="scss">
  div.span-columns {
    grid-column: span 2;
  }

  h2 {
    font-size: 2rem;
    line-height: 1;
    margin-top: 0;
  }

  select {
    width: 100%;
  }
</style>
