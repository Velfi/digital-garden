<script lang="ts">
  import { strokeMode, fillSelectDiagonals, fillRespectsColor, planeAxis, airbrushRadius, airbrushScatter, airbrushRadiusRange, airbrushRadiusMin, airbrushRadiusMax } from '../store';
  import { get } from 'svelte/store';
</script>

<div class="stroke-mode" role="group" aria-labelledby="stroke-label">
  <span id="stroke-label" class="stroke-label">Selection method</span>
  <div class="stroke-buttons">
    <button
      type="button"
      class:active={$strokeMode === 'line'}
      onclick={() => strokeMode.set('line')}
      title="Draw lines (axis-aligned)"
    >
      Line
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'plane'}
      onclick={() => strokeMode.set('plane')}
      title="Fill whole plane (Alt+scroll to cycle orientation)"
    >
      Plane
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'cuboid'}
      onclick={() => strokeMode.set('cuboid')}
      title="Drag to set plane (Alt+scroll to cycle), scroll for depth, click or Done to apply"
    >
      Cuboid
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'polygon'}
      onclick={() => strokeMode.set('polygon')}
      title="Click to place points, Done to fill convex hull"
    >
      Polygon
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'fill'}
      onclick={() => strokeMode.set('fill')}
      title="Click to flood-fill: Voxel (empty space), Remove/Paint (voxels), Select/SelectByColor (selection)"
    >
      Fill
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'airbrush'}
      onclick={() => strokeMode.set('airbrush')}
      title="Drag to paint a soft spherical brush along the path"
    >
      Airbrush
    </button>
  </div>
  {#if $strokeMode === 'fill'}
    <div class="stroke-buttons" role="group" aria-label="Fill options">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={$fillSelectDiagonals}
          onchange={(e) => fillSelectDiagonals.set((e.target as HTMLInputElement).checked)}
        />
        Include diagonals
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={$fillRespectsColor}
          onchange={(e) => fillRespectsColor.set((e.target as HTMLInputElement).checked)}
        />
        Respect color
      </label>
    </div>
  {/if}
  {#if $strokeMode === 'airbrush'}
    <div class="airbrush-options" role="group" aria-label="Airbrush options">
      <div class="light-control">
        <label class="checkbox-label">
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
        <div class="light-control">
          <label for="airbrush-radius-min">Min</label>
          <div class="slider-row">
            <input
              id="airbrush-radius-min"
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
            <span class="slider-value">{$airbrushRadiusMin}</span>
          </div>
        </div>
        <div class="light-control">
          <label for="airbrush-radius-max">Max</label>
          <div class="slider-row">
            <input
              id="airbrush-radius-max"
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
            <span class="slider-value">{$airbrushRadiusMax}</span>
          </div>
        </div>
      {:else}
        <div class="light-control">
          <label for="airbrush-radius">Brush size</label>
          <div class="slider-row">
            <input
              type="range"
              id="airbrush-radius"
              min="0"
              max="5"
              step="1"
              value={$airbrushRadius}
              oninput={(e) => airbrushRadius.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="slider-value">{$airbrushRadius}</span>
          </div>
        </div>
      {/if}
      <div class="light-control">
        <label for="airbrush-scatter">Scatter</label>
        <div class="slider-row">
          <input
            id="airbrush-scatter"
            type="range"
            min="0"
            max="4"
            step="1"
            value={$airbrushScatter}
            oninput={(e) => airbrushScatter.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="slider-value">{$airbrushScatter}</span>
        </div>
      </div>
    </div>
  {/if}
  {#if $strokeMode === 'plane' || $strokeMode === 'cuboid'}
    <div class="stroke-buttons plane-axis" role="group" aria-label="Plane axis">
      <button
        type="button"
        class:active={$planeAxis === 'auto'}
        onclick={() => planeAxis.set('auto')}
        title="Auto: use clicked face"
      >
        Auto
      </button>
      <button
        type="button"
        class:active={$planeAxis === 0}
        onclick={() => planeAxis.set(0)}
        title="Vertical plane (YZ)"
      >
        X
      </button>
      <button
        type="button"
        class:active={$planeAxis === 1}
        onclick={() => planeAxis.set(1)}
        title="Horizontal plane (XZ)"
      >
        Y
      </button>
      <button
        type="button"
        class:active={$planeAxis === 2}
        onclick={() => planeAxis.set(2)}
        title="Vertical plane (XY)"
      >
        Z
      </button>
    </div>
  {/if}
</div>

<style>
  .stroke-mode {
    margin-bottom: 0.5rem;
  }

  .airbrush-options {
    margin-top: 0.5rem;
  }
</style>
