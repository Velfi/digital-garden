<script lang="ts">
  import { showGrid, enableSky, backgroundColor } from '../store';
</script>

<h2>Scene</h2>
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
<div class="light-control" class:dimmed={$enableSky}>
  <label for="background-color">Background</label>
  <input
    id="background-color"
    type="color"
    value={$backgroundColor}
    oninput={(e) => backgroundColor.set((e.target as HTMLInputElement).value)}
    disabled={$enableSky}
  />
</div>

<style>
</style>
