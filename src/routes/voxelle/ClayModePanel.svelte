<script lang="ts">
  import { get } from 'svelte/store';
  import {
    clayMode,
    clayBrushRadius,
    branchTaper,
    puffRadius,
    puffRadiusRange,
    puffRadiusMin,
    puffRadiusMax,
    puffScatter,
    tool,
    sidebarOpen
  } from './store';

  const show = $derived($tool === 'clay');

  const hasBrushSize = $derived(
    ['bulk', 'smooth', 'level', 'gouge', 'branch', 'melt'].includes($clayMode)
  );
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="add-panel clay-mode-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    aria-modal="false"
    aria-label="Clay options"
    tabindex="-1"
  >
    {#if hasBrushSize}
      <div class="add-panel-row">
        <span class="add-panel-label">Brush</span>
        <input
          type="range"
          min="0"
          max="2"
          step="1"
          value={$clayBrushRadius}
          oninput={(e) => clayBrushRadius.set(Number((e.target as HTMLInputElement).value))}
          title="Brush size (0–2)"
        />
        <span class="add-panel-value">{$clayBrushRadius}</span>
      </div>
      {#if $clayMode === 'branch'}
        <div class="add-panel-row">
          <label class="add-panel-check">
            <input
              type="checkbox"
              checked={$branchTaper}
              onchange={(e) => branchTaper.set((e.target as HTMLInputElement).checked)}
              title="Taper from thick base to thin tip"
            />
            Taper
          </label>
        </div>
      {/if}
    {/if}
    {#if $clayMode === 'puffy'}
      <div class="add-panel-row">
        <label class="add-panel-check">
          <input
            type="checkbox"
            checked={$puffRadiusRange}
            onchange={(e) => puffRadiusRange.set((e.target as HTMLInputElement).checked)}
            title="Vary sphere size per stamp"
          />
          Size range
        </label>
      </div>
      {#if $puffRadiusRange}
        <div class="add-panel-row">
          <span class="add-panel-label">Min</span>
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            value={$puffRadiusMin}
            oninput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              puffRadiusMin.set(v);
              if (v > get(puffRadiusMax)) puffRadiusMax.set(v);
            }}
          />
          <span class="add-panel-value">{$puffRadiusMin}</span>
        </div>
        <div class="add-panel-row">
          <span class="add-panel-label">Max</span>
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            value={$puffRadiusMax}
            oninput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              puffRadiusMax.set(v);
              if (v < get(puffRadiusMin)) puffRadiusMin.set(v);
            }}
          />
          <span class="add-panel-value">{$puffRadiusMax}</span>
        </div>
      {:else}
        <div class="add-panel-row">
          <span class="add-panel-label">Size</span>
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            value={$puffRadius}
            oninput={(e) => puffRadius.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="add-panel-value">{$puffRadius}</span>
        </div>
      {/if}
      <div class="add-panel-row">
        <span class="add-panel-label">Scatter</span>
        <input
          type="range"
          min="0"
          max="4"
          step="1"
          value={$puffScatter}
          oninput={(e) => puffScatter.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="add-panel-value">{$puffScatter}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .clay-mode-panel {
    max-height: min(80vh, 28rem);
    overflow-y: auto;
  }

  .add-panel-value {
    font-size: 0.85rem;
    opacity: 0.8;
    min-width: 1.5rem;
  }

  .add-panel-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .add-panel-check input[type='checkbox'] {
    accent-color: var(--link-color);
  }
</style>
