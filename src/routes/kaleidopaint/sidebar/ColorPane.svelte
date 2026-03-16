<script lang="ts">
  import { color, backgroundColor, palette } from '../store';
  import ParamLabel from '../ParamLabel.svelte';
  import LospecPalette from '$lib/components/LospecPalette.svelte';

  function swapColors() {
    const fg = $color;
    color.set($backgroundColor);
    backgroundColor.set(fg);
  }
</script>

<h2>Color</h2>
<div class="brush-params-grid">
  <label class="brush-param">
    <ParamLabel label="Foreground" tip="Primary paint color. Left click to paint" id="tip-foreground" />
    <input type="color" bind:value={$color} />
  </label>
  <label class="brush-param">
    <ParamLabel label="Background" tip="Canvas background and erase color. Right click to erase." id="tip-background" />
    <input type="color" bind:value={$backgroundColor} />
  </label>
  <button type="button" class="swap-btn" onclick={swapColors}>Swap FG/BG</button>
</div>

<LospecPalette {color} {palette} defaultSlug="resurrect-64" />

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
