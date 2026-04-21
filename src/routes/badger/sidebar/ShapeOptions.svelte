<script lang="ts">
  import {
    metalTool,
    rectCornerStyle,
    rectCornerRadius,
    polygonSides,
    polygonCornerStyle,
    polygonCornerRadius
  } from '../store';
  import type { RectCornerStyle, PolygonCornerStyle } from '../store/types';

  const rectStyles: { id: RectCornerStyle; label: string; title: string }[] = [
    { id: 'sharp', label: 'Sharp', title: 'Right-angle corners' },
    { id: 'round', label: 'Round', title: 'Circular corners (quarter circle)' },
    { id: 'squircle', label: 'Squircle', title: 'iOS-style continuous-curvature corners' }
  ];

  const polyStyles: { id: PolygonCornerStyle; label: string; title: string }[] = [
    { id: 'sharp', label: 'Sharp', title: 'Straight corners' },
    { id: 'round', label: 'Round', title: 'Rounded corners' }
  ];
</script>

{#if $metalTool === 'rect'}
  <div class="shape-options">
    <h3>Rect corners</h3>
    <div class="pill-row" role="group" aria-label="Rect corner style">
      {#each rectStyles as s (s.id)}
        <button
          type="button"
          class:active={$rectCornerStyle === s.id}
          onclick={() => rectCornerStyle.set(s.id)}
          title={s.title}
        >
          {s.label}
        </button>
      {/each}
    </div>
    {#if $rectCornerStyle !== 'sharp'}
      <label class="sidebar-label">
        Radius
        <div class="slider-row">
          <input
            type="range"
            min="0.2"
            max="20"
            step="0.1"
            value={$rectCornerRadius}
            oninput={(e) => rectCornerRadius.set(+(e.target as HTMLInputElement).value)}
          />
          <span class="slider-value">{$rectCornerRadius.toFixed(1)}</span>
        </div>
      </label>
    {/if}
  </div>
{:else if $metalTool === 'polygon'}
  <div class="shape-options">
    <h3>Polygon</h3>
    <label class="sidebar-label">
      Sides
      <div class="slider-row">
        <input
          type="range"
          min="3"
          max="24"
          step="1"
          value={$polygonSides}
          oninput={(e) => polygonSides.set(+(e.target as HTMLInputElement).value)}
        />
        <span class="slider-value">{$polygonSides}</span>
      </div>
    </label>
    <div class="pill-row" role="group" aria-label="Polygon corner style">
      {#each polyStyles as s (s.id)}
        <button
          type="button"
          class:active={$polygonCornerStyle === s.id}
          onclick={() => polygonCornerStyle.set(s.id)}
          title={s.title}
        >
          {s.label}
        </button>
      {/each}
    </div>
    {#if $polygonCornerStyle !== 'sharp'}
      <label class="sidebar-label">
        Radius
        <div class="slider-row">
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={$polygonCornerRadius}
            oninput={(e) => polygonCornerRadius.set(+(e.target as HTMLInputElement).value)}
          />
          <span class="slider-value">{$polygonCornerRadius.toFixed(1)}</span>
        </div>
      </label>
    {/if}
  </div>
{/if}

<style>
  .shape-options {
    margin-bottom: 0.5rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.9;
  }

  .pill-row {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0.25rem;
  }

  .pill-row button {
    padding: 0.3rem 0.25rem;
    font-size: 0.78rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .pill-row button:hover {
    filter: brightness(1.08);
  }

  .pill-row button.active {
    border-color: var(--link-color);
    box-shadow: 0 0 0 1px var(--link-color);
  }
</style>
