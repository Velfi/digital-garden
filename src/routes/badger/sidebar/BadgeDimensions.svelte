<script lang="ts">
  import { document as docStore, updateDocument } from '../store';
  import DimensionSlider from './DimensionSlider.svelte';
</script>

<DimensionSlider
  label="Base thickness"
  valueMm={$docStore.metal.baseThickness}
  minMm={0.5}
  maxMm={5}
  stepMm={0.1}
  onInputMm={(v) => updateDocument((d) => (d.metal.baseThickness = v))}
/>
<DimensionSlider
  label="Wall height"
  valueMm={$docStore.metal.wallHeight}
  minMm={0.3}
  maxMm={3}
  stepMm={0.05}
  onInputMm={(v) => updateDocument((d) => (d.metal.wallHeight = v))}
/>
<label class="sidebar-label">
  Bevel
  <div class="slider-row">
    <input
      type="range"
      min="0"
      max="100"
      step="5"
      value={Math.round($docStore.metal.bevelRatio * 100)}
      oninput={(e) =>
        updateDocument((d) => (d.metal.bevelRatio = +(e.target as HTMLInputElement).value / 100))}
    />
    <span class="slider-value">{Math.round($docStore.metal.bevelRatio * 100)}%</span>
  </div>
</label>

<style>
  .slider-value {
    min-width: 4.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
<DimensionSlider
  label="Min wall"
  valueMm={$docStore.metal.minWallWidth}
  minMm={0.2}
  maxMm={3}
  stepMm={0.05}
  onInputMm={(v) => updateDocument((d) => (d.metal.minWallWidth = v))}
/>
