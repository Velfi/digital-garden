<script lang="ts">
  import { color, backgroundColor, palette } from '../store';
  import ParamLabel from '../ParamLabel.svelte';
  import PalettePicker from '$lib/components/PalettePicker.svelte';
  import { safeColorInputValue } from '$lib/colorInput';

  const FG_FALLBACK = '#000000';
  const BG_FALLBACK = '#ffffff';

  function swapColors() {
    const fg = $color;
    color.set($backgroundColor);
    backgroundColor.set(fg);
  }
</script>

<h2>Color</h2>
<div class="brush-params-grid">
  <label class="brush-param">
    <ParamLabel
      label="Foreground"
      tip="Primary paint color. Left click to paint"
      id="tip-foreground"
    />
    <input
      type="color"
      defaultValue={safeColorInputValue($color, FG_FALLBACK)}
      value={safeColorInputValue($color, FG_FALLBACK)}
      oninput={(e) => color.set((e.target as HTMLInputElement).value)}
    />
  </label>
  <label class="brush-param">
    <ParamLabel
      label="Background"
      tip="Canvas background and erase color. Right click to erase."
      id="tip-background"
    />
    <input
      type="color"
      defaultValue={safeColorInputValue($backgroundColor, BG_FALLBACK)}
      value={safeColorInputValue($backgroundColor, BG_FALLBACK)}
      oninput={(e) => backgroundColor.set((e.target as HTMLInputElement).value)}
    />
  </label>
  <button type="button" class="swap-btn" onclick={swapColors}>Swap FG/BG</button>
</div>

<PalettePicker {color} {palette} defaultSlug="resurrect-64" />

<style>
  input[type='color'] {
    width: 100%;
    height: 2rem;
    padding: 2px;
    cursor: pointer;
  }

  .brush-params-grid {
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto;
    gap: 0.25rem 0.5rem;
    align-items: center;
  }

  .brush-param {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    gap: 0.5rem;
    font-size: 0.9rem;
    align-items: center;
  }

  .swap-btn {
    grid-column: 1 / -1;
    justify-self: start;
  }
</style>
