<script lang="ts">
  import { get } from 'svelte/store';
  import {
    strokeMode,
    tool,
    sidebarOpen,
    airbrushRadius,
    airbrushScatter,
    airbrushRadiusRange,
    airbrushRadiusMin,
    airbrushRadiusMax
  } from './store';

  const STROKE_TOOLS = ['voxel', 'remove', 'paint', 'select', 'selectByColor'] as const;
  const isStrokeTool = (t: string) => STROKE_TOOLS.includes(t as (typeof STROKE_TOOLS)[number]);
  const show = $derived($strokeMode === 'airbrush' && isStrokeTool($tool));
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="add-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    aria-modal="false"
    aria-label="Airbrush options"
    tabindex="-1"
  >
    <div class="add-panel-row">
      <label class="add-panel-check">
        <input
          type="checkbox"
          checked={$airbrushRadiusRange}
          onchange={(e) => airbrushRadiusRange.set((e.target as HTMLInputElement).checked)}
          title="Vary droplet size for spray effect"
        />
        Size range
      </label>
    </div>
    {#if $airbrushRadiusRange}
      <div class="add-panel-row">
        <span class="add-panel-label">Min</span>
        <input
          type="range"
          min="0"
          max="5"
          step="1"
          value={$airbrushRadiusMin}
          oninput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            airbrushRadiusMin.set(v);
            if (v > get(airbrushRadiusMax)) airbrushRadiusMax.set(v);
          }}
        />
        <span class="add-panel-value">{$airbrushRadiusMin}</span>
      </div>
      <div class="add-panel-row">
        <span class="add-panel-label">Max</span>
        <input
          type="range"
          min="0"
          max="5"
          step="1"
          value={$airbrushRadiusMax}
          oninput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            airbrushRadiusMax.set(v);
            if (v < get(airbrushRadiusMin)) airbrushRadiusMin.set(v);
          }}
        />
        <span class="add-panel-value">{$airbrushRadiusMax}</span>
      </div>
    {:else}
      <div class="add-panel-row">
        <span class="add-panel-label">Size</span>
        <input
          type="range"
          min="0"
          max="5"
          step="1"
          value={$airbrushRadius}
          oninput={(e) => airbrushRadius.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="add-panel-value">{$airbrushRadius}</span>
      </div>
    {/if}
    <div class="add-panel-row">
      <span class="add-panel-label">Scatter</span>
      <input
        type="range"
        min="0"
        max="4"
        step="1"
        value={$airbrushScatter}
        oninput={(e) => airbrushScatter.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="add-panel-value">{$airbrushScatter}</span>
    </div>
  </div>
{/if}

<style>
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
