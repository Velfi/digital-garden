<script lang="ts">
  import { get } from 'svelte/store';
  import { color, palette, selectedColors, tool, toolBeforeEyedropper } from '../store/index';
  import {
    MATERIAL_BUILTIN_PALETTE_HEX,
    VOXELLE_BUILTIN_DEFAULT_BRUSH_HEX
  } from '../store/materialBuiltinPalette';
  import PalettePicker from '$lib/components/PalettePicker.svelte';

  const FALLBACK_HEX = '#ffffff';
  const HEX6 = /^#[0-9a-fA-F]{6}$/;
  const safeHexColor = (value: string): string => (HEX6.test(value) ? value : FALLBACK_HEX);
</script>

<div>
  <h2>Color</h2>
  <div class="color-row">
    <input
      id="color-picker"
      type="color"
      value={safeHexColor($color)}
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
  />
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
