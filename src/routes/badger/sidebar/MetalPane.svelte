<script lang="ts">
  import {
    document as docStore,
    selectedPathIds,
    updateDocument,
    showCellBorders,
    showManufacturingWarnings,
    activeStrokeWidth,
    pickStrokeWidth,
    referenceImage,
    referenceOpacity,
    referenceLayer,
    referenceVisible,
    metalTool
  } from '../store';
  import type { BadgePath } from '../store/types';
  import { effectiveKind } from '../topology/planar';
  import ShapePicker from './ShapePicker.svelte';
  import ShapeOptions from './ShapeOptions.svelte';
  import KindPicker from './KindPicker.svelte';
  import DimensionSlider from './DimensionSlider.svelte';
  import BadgeDimensions from './BadgeDimensions.svelte';
  import NodeToolbar from './NodeToolbar.svelte';
  import TextPane from './TextPane.svelte';

  let selectedPaths = $derived(
    $docStore.metal.paths.filter((p) => $selectedPathIds.has(p.id))
  );

  let displayStrokeWidth = $derived(
    selectedPaths.length > 0 ? selectedPaths[0].strokeWidth : $activeStrokeWidth
  );

  function updateSelected(mutator: (p: BadgePath) => void) {
    const ids = $selectedPathIds;
    if (ids.size === 0) return;
    updateDocument((d) => {
      for (const p of d.metal.paths) if (ids.has(p.id)) mutator(p);
    });
  }

  function raisePath(id: string, delta: number) {
    updateDocument((d) => {
      const idx = d.metal.paths.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const target = Math.max(0, Math.min(d.metal.paths.length - 1, idx + delta));
      const [item] = d.metal.paths.splice(idx, 1);
      d.metal.paths.splice(target, 0, item);
    });
  }

  function deletePath(id: string) {
    updateDocument((d) => {
      d.metal.paths = d.metal.paths.filter((p) => p.id !== id);
    });
    selectedPathIds.update((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  function clearAll() {
    if (!confirm('Delete all paths?')) return;
    updateDocument((d) => {
      d.metal.paths = [];
    });
  }

  let referenceInput: HTMLInputElement | undefined = $state();

  function onReferenceFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') referenceImage.set(reader.result);
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  function clearReference() {
    referenceImage.set(null);
  }
</script>

<h2>Tool</h2>
<ShapePicker />
<ShapeOptions />

<NodeToolbar />

<KindPicker />

<h2>Stroke width</h2>
<DimensionSlider
  label={$selectedPathIds.size > 0 ? 'Selected path width' : 'Divider width'}
  hint={$selectedPathIds.size > 0 ? 'Width of the selected path.' : 'Width for new divider strokes.'}
  valueMm={displayStrokeWidth}
  minMm={0.1}
  maxMm={5}
  stepMm={0.05}
  onInputMm={(v) => pickStrokeWidth(v)}
/>

{#if $metalTool === 'text'}
  <TextPane />
{/if}

<h2>Badge</h2>
<BadgeDimensions />

<h2>Overlays</h2>
<label class="checkbox-label">
  <input type="checkbox" bind:checked={$showCellBorders} />
  Show cell borders
</label>
<label class="checkbox-label">
  <input type="checkbox" bind:checked={$showManufacturingWarnings} />
  Show manufacturing warnings
</label>

<h2>Reference image</h2>
<p class="hint">
  Overlay an image over the canvas to trace from. Stored in memory only — reloading
  clears the image.
</p>
<input
  bind:this={referenceInput}
  type="file"
  accept="image/*"
  style="display:none"
  onchange={onReferenceFile}
/>
<div class="reference-buttons">
  <button type="button" onclick={() => referenceInput?.click()}>
    {$referenceImage ? 'Replace image…' : 'Upload image…'}
  </button>
  {#if $referenceImage}
    <button type="button" onclick={clearReference}>Clear</button>
  {/if}
</div>
{#if $referenceImage}
  <label class="checkbox-label">
    <input type="checkbox" bind:checked={$referenceVisible} />
    Show reference
  </label>
  <label class="sidebar-label">
    Placement
    <div class="placement-row">
      <label class="radio-option">
        <input
          type="radio"
          name="reference-layer"
          value="behind"
          checked={$referenceLayer === 'behind'}
          onchange={() => referenceLayer.set('behind')}
        />
        Behind
      </label>
      <label class="radio-option">
        <input
          type="radio"
          name="reference-layer"
          value="front"
          checked={$referenceLayer === 'front'}
          onchange={() => referenceLayer.set('front')}
        />
        Front
      </label>
    </div>
  </label>
  <label class="sidebar-label">
    Opacity
    <div class="slider-row">
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={$referenceOpacity}
        oninput={(e) => referenceOpacity.set(+(e.target as HTMLInputElement).value)}
      />
      <span class="slider-value">{Math.round($referenceOpacity * 100)}%</span>
    </div>
  </label>
{/if}

<h2>Layers ({$docStore.metal.paths.length})</h2>
<ul class="layer-list">
  {#each [...$docStore.metal.paths].reverse() as p (p.id)}
    {@const ek = effectiveKind(p)}
    <li class:selected={$selectedPathIds.has(p.id)}>
      <button
        type="button"
        class="layer-label"
        onclick={() => selectedPathIds.set(new Set([p.id]))}
      >
        <span class="chip chip-{ek}">{ek[0].toUpperCase()}</span>
        {ek} · {p.closed ? 'closed' : 'open'} · w{p.strokeWidth}
      </button>
      <button type="button" title="Raise" onclick={() => raisePath(p.id, 1)}>↑</button>
      <button type="button" title="Lower" onclick={() => raisePath(p.id, -1)}>↓</button>
      <button type="button" title="Delete" onclick={() => deletePath(p.id)}>×</button>
    </li>
  {/each}
</ul>

{#if selectedPaths.length === 1}
  <h2>Selected path</h2>
  <label class="checkbox-label">
    <input
      type="checkbox"
      checked={selectedPaths[0].closed}
      onchange={(e) =>
        updateSelected((p) => (p.closed = (e.target as HTMLInputElement).checked))}
    />
    Closed
  </label>
{/if}

<div class="danger">
  <button type="button" onclick={clearAll}>Clear all paths</button>
</div>

<style>
  .hint {
    font-size: 0.8rem;
    opacity: 0.85;
    margin: 0 0 0.5rem;
    line-height: 1.35;
  }

  .layer-list {
    list-style: none;
    padding: 0;
    margin: 0 0 0.5rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    max-height: 12rem;
    overflow-y: auto;
  }

  .layer-list li {
    display: flex;
    gap: 0.2rem;
    align-items: center;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    font-size: 0.8rem;
  }

  .layer-list li.selected {
    border-color: var(--link-color);
  }

  .layer-label {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    color: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
  }

  .chip {
    display: inline-block;
    width: 1.2rem;
    text-align: center;
    margin-right: 0.25rem;
    padding: 0 0.2rem;
    border-radius: 2px;
    font-weight: 600;
    font-size: 0.7rem;
    color: #fff;
  }
  .chip-outline {
    background: #555;
  }
  .chip-divider {
    background: #9b4c9b;
  }
  .chip-cutout {
    background: #b85c3a;
  }

  .layer-list button {
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    color: inherit;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    font-size: 0.75rem;
  }

  .layer-list button:hover {
    background: var(--block-quote-bg-color);
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

  .reference-buttons {
    display: flex;
    gap: 0.3rem;
    margin-bottom: 0.4rem;
  }

  .reference-buttons button {
    flex: 1;
    padding: 0.3rem 0.5rem;
    font-size: 0.8rem;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-color);
    color: inherit;
    cursor: pointer;
  }

  .reference-buttons button:hover {
    background: var(--block-quote-bg-color);
  }

  .placement-row {
    display: flex;
    gap: 0.75rem;
    margin-top: 0.2rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
