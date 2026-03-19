<script lang="ts">
  import { orthographic, focalLength } from '../store/index';
</script>

<h2>Camera</h2>
<div class="light-control">
  <label class="checkbox-label">
    <input
      type="checkbox"
      checked={$orthographic}
      onchange={(e) => orthographic.set((e.target as HTMLInputElement).checked)}
    />
    Orthographic view
  </label>
</div>
{#if !$orthographic}
  <div class="light-control">
    <label for="focal-length">Focal length</label>
    <div class="slider-row">
      <input
        id="focal-length"
        type="range"
        min="15"
        max="200"
        value={$focalLength}
        oninput={(e) => focalLength.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="slider-value">{$focalLength} mm</span>
    </div>
  </div>
{/if}

<style>
</style>
