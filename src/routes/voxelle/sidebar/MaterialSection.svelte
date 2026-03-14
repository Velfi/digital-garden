<script lang="ts">
  import { roughness, metalness } from '../store';
</script>

<h2>Material (PBR)</h2>
<div class="light-control">
  <label for="roughness">Roughness</label>
  <div class="slider-row">
    <input
      id="roughness"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={$roughness}
      oninput={(e) => roughness.set(Number((e.target as HTMLInputElement).value))}
    />
    <span class="slider-value">{$roughness.toFixed(2)}</span>
  </div>
</div>
<div class="light-control">
  <label for="metalness">Metalness</label>
  <div class="slider-row">
    <input
      id="metalness"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={$metalness}
      oninput={(e) => metalness.set(Number((e.target as HTMLInputElement).value))}
    />
    <span class="slider-value">{$metalness.toFixed(2)}</span>
  </div>
</div>

<style>
</style>
