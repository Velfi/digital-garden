<script lang="ts">
  import { enableSky, backgroundColor } from '../store/index';
  import { safeColorInputValue } from '$lib/colorInput';

  const FALLBACK_HEX = '#000000';
</script>

<h2>Scene</h2>
<div class="light-control">
  <label class="checkbox-label">
    <input
      type="checkbox"
      checked={$enableSky}
      onchange={(e) => enableSky.set((e.target as HTMLInputElement).checked)}
    />
    Sky & horizon
  </label>
</div>
<div class="light-control">
  <label for="background-color">Background</label>
  <input
    id="background-color"
    type="color"
    defaultValue={safeColorInputValue($backgroundColor, FALLBACK_HEX)}
    value={safeColorInputValue($backgroundColor, FALLBACK_HEX)}
    oninput={(e) => backgroundColor.set((e.target as HTMLInputElement).value)}
  />
</div>

<style>
</style>
