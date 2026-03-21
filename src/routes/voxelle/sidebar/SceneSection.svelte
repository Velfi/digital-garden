<script lang="ts">
  import {
    showGrid,
    enableSky,
    backgroundColor,
    renderingMode,
    type RenderingMode
  } from '../store/index';
</script>

<h2>Scene</h2>
<div class="light-control">
  <label for="rendering-mode">Rendering</label>
  <select
    id="rendering-mode"
    value={$renderingMode}
    onchange={(e) => renderingMode.set((e.target as HTMLSelectElement).value as RenderingMode)}
  >
    <option value="greedy">Blocky (greedy mesh)</option>
    <option value="marchingCubes">Smooth (marching cubes)</option>
  </select>
</div>
<div class="light-control">
  <label class="checkbox-label">
    <input
      type="checkbox"
      checked={$showGrid}
      onchange={(e) => showGrid.set((e.target as HTMLInputElement).checked)}
    />
    Show borders
  </label>
</div>
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
    value={$backgroundColor}
    oninput={(e) => backgroundColor.set((e.target as HTMLInputElement).value)}
  />
</div>

<style>
</style>
