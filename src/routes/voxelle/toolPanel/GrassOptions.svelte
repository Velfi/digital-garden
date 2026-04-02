<script lang="ts">
  import { tool, grassRadius, grassDensity, grassHeight } from '../store/index';
</script>

{#if $tool === 'grass'}
  <section class="tool-panel-section" aria-label="Grass">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Radius</span>
      <input
        type="range"
        min="2"
        max="20"
        step="1"
        value={$grassRadius}
        oninput={(e) => grassRadius.set(Number((e.target as HTMLInputElement).value))}
        title="Patch radius (2–20 voxels)"
      />
      <span class="tool-panel-value">{$grassRadius}</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Density</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round($grassDensity * 100)}
        oninput={(e) => grassDensity.set(Number((e.target as HTMLInputElement).value) / 100)}
        title="Blade density (0–100%)"
      />
      <span class="tool-panel-value">{Math.round($grassDensity * 100)}%</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Height</span>
      <input
        type="range"
        min="1"
        max="40"
        step="1"
        value={$grassHeight}
        oninput={(e) => grassHeight.set(Number((e.target as HTMLInputElement).value))}
        title="Max blade height (1–40 voxels)"
      />
      <span class="tool-panel-value">{$grassHeight}</span>
    </div>
  </section>
{/if}
