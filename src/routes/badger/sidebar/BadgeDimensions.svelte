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
<DimensionSlider
  label="Bevel radius"
  valueMm={$docStore.metal.bevelRadius}
  minMm={0}
  maxMm={0.5}
  stepMm={0.02}
  onInputMm={(v) => updateDocument((d) => (d.metal.bevelRadius = v))}
/>
<DimensionSlider
  label="Min wall"
  valueMm={$docStore.metal.minWallWidth}
  minMm={0.2}
  maxMm={3}
  stepMm={0.05}
  onInputMm={(v) => updateDocument((d) => (d.metal.minWallWidth = v))}
/>
