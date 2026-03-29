<script lang="ts">
  import { get } from 'svelte/store';
  import {
    color,
    palette,
    selectedColors,
    tool,
    toolBeforeEyedropper,
    paintColorDistribution,
    type PaintColorDistributionMode
  } from '../store/index';
  import {
    MATERIAL_BUILTIN_PALETTE_HEX,
    VOXELLE_BUILTIN_DEFAULT_BRUSH_HEX
  } from '../store/materialBuiltinPalette';
  import PalettePicker from '$lib/components/PalettePicker.svelte';
  import { safeColorInputValue } from '$lib/colorInput';
  import MultiColorPaintSection from './MultiColorPaintSection.svelte';

  const FALLBACK_HEX = '#ffffff';

  function modeLabel(m: PaintColorDistributionMode): string {
    switch (m) {
      case 'whiteNoise':
        return 'white noise';
      case 'randomSingle':
        return 'one random color per stroke';
      case 'fbmNoise':
        return 'FBM noise';
      case 'gradient':
        return 'gradient';
      case 'dither':
        return 'dither';
      default:
        return m;
    }
  }

  const multiColorHint = $derived(
    $selectedColors.length > 1
      ? `Active: ${modeLabel($paintColorDistribution.mode)}.`
      : undefined
  );
</script>

<div>
  <h2>Color</h2>
  <div class="color-row">
    <input
      id="color-picker"
      type="color"
      defaultValue={safeColorInputValue($color, FALLBACK_HEX)}
      value={safeColorInputValue($color, FALLBACK_HEX)}
      oninput={(e) => {
        const v = (e.target as HTMLInputElement).value;
        color.set(v);
        selectedColors.set([v]);
      }}
    />
    <input
      type="text"
      class="color-hex"
      value={$color}
      oninput={(e) => {
        const v = (e.target as HTMLInputElement).value;
        color.set(v);
        selectedColors.set([v]);
      }}
    />
    <div class="color-row-eyedropper tool-buttons">
      <button
        type="button"
        class:active={$tool === 'eyedropper'}
        title="Pick color and material from a voxel (returns to previous tool after picking)"
        onclick={() => {
          const t = get(tool);
          if (t !== 'eyedropper') toolBeforeEyedropper.set(t);
          tool.set('eyedropper');
        }}
      >
        Eyedropper
      </button>
    </div>
  </div>
  <PalettePicker
    {color}
    {palette}
    {selectedColors}
    builtinPalette={MATERIAL_BUILTIN_PALETTE_HEX}
    builtinDefaultHex={VOXELLE_BUILTIN_DEFAULT_BRUSH_HEX}
    multiColorHint={multiColorHint ?? undefined}
  />
  {#if $selectedColors.length > 1}
    <MultiColorPaintSection />
  {/if}
</div>

<style>
  .color-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .color-row-eyedropper {
    margin-bottom: 0;
    flex: 0 0 auto;
  }

  .color-row-eyedropper.tool-buttons button {
    min-width: unset;
    padding: 0.35rem 0.55rem;
    font-size: 0.8rem;
  }

  #color-picker {
    width: 2.5rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }

  .color-hex {
    flex: 1;
    min-width: 0;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }
</style>
