<script lang="ts">
  import {
    colorsTool,
    activeColor,
    activeMaterial,
    document as docStore,
    cells,
    updateDocument,
    showCellBorders
  } from '../store';
  import type { ColorsTool, EnamelMaterial } from '../store/types';

  const tools: { id: ColorsTool; label: string }[] = [
    { id: 'fill', label: 'Fill' },
    { id: 'eyedropper', label: 'Pick' }
  ];

  const materials: { id: EnamelMaterial; label: string }[] = [
    { id: 'plain', label: 'Plain' },
    { id: 'glitter', label: 'Glitter' },
    { id: 'metallic', label: 'Metallic' }
  ];

  function addToPalette() {
    const c = $activeColor;
    updateDocument((d) => {
      if (!d.palette.includes(c)) d.palette = [...d.palette, c];
    });
  }

  function removeFromPalette(c: string) {
    updateDocument((d) => {
      d.palette = d.palette.filter((p) => p !== c);
    });
  }

  function clearAllFills() {
    if (!confirm('Clear all cell colors?')) return;
    updateDocument((d) => {
      d.colorAssignments = {};
    });
  }

  let filledCount = $derived(Object.keys($docStore.colorAssignments).length);
</script>

<h2>Color tool</h2>
<div class="tool-buttons">
  {#each tools as t (t.id)}
    <button type="button" class:active={$colorsTool === t.id} onclick={() => colorsTool.set(t.id)}>
      {t.label}
    </button>
  {/each}
</div>

<h2>Material</h2>
<div class="tool-buttons">
  {#each materials as m (m.id)}
    <button
      type="button"
      class:active={$activeMaterial === m.id}
      onclick={() => activeMaterial.set(m.id)}
    >
      {m.label}
    </button>
  {/each}
</div>

<h2>Active color</h2>
<div class="active-row">
  <input
    type="color"
    value={$activeColor}
    oninput={(e) => activeColor.set((e.target as HTMLInputElement).value)}
  />
  <input
    type="text"
    class="hex-input"
    value={$activeColor}
    oninput={(e) => {
      const val = (e.target as HTMLInputElement).value;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) activeColor.set(val);
    }}
  />
  <button type="button" onclick={addToPalette} title="Add to palette">+</button>
</div>

<h2>Palette</h2>
<div class="palette">
  {#each $docStore.palette as c (c)}
    <button
      type="button"
      class="swatch"
      class:active={$activeColor.toLowerCase() === c.toLowerCase()}
      style:background={c}
      title={c}
      onclick={() => activeColor.set(c)}
      oncontextmenu={(e) => {
        e.preventDefault();
        removeFromPalette(c);
      }}
    ></button>
  {/each}
</div>
<p class="small">Right-click a swatch to remove it.</p>

<h2>Overlays</h2>
<label class="checkbox-label">
  <input type="checkbox" bind:checked={$showCellBorders} />
  Show cell borders
</label>

<h2>Stats</h2>
<p class="small">
  {$cells.length} cells · {filledCount} filled
</p>

<div class="danger">
  <button type="button" onclick={clearAllFills}>Clear all fills</button>
</div>

<style>
  .active-row {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .active-row input[type='color'] {
    width: 2rem;
    height: 2rem;
    padding: 2px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    background: var(--bg-color);
  }

  .hex-input {
    flex: 1;
    font-family: monospace;
    padding: 0.25rem 0.4rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: inherit;
  }

  .active-row button {
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: inherit;
    cursor: pointer;
  }

  .palette {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    gap: 2px;
    margin-bottom: 0.35rem;
  }

  .swatch {
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    cursor: pointer;
    padding: 0;
  }

  .swatch.active {
    border-color: var(--link-color);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35);
  }

  .small {
    font-size: 0.8rem;
    opacity: 0.8;
    margin: 0 0 0.5rem 0;
  }

  .danger {
    margin-top: 0.75rem;
  }

  .danger button {
    width: 100%;
    padding: 0.35rem 0.5rem;
    border: 1px solid #a33;
    background: transparent;
    color: inherit;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .danger button:hover {
    background: rgba(200, 60, 60, 0.15);
  }
</style>
