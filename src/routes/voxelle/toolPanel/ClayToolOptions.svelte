<script lang="ts">
  import {
    tool,
    clayMode,
    clayBrushRadius,
    bulkBrushShape,
    inflateStrength,
    branchTaper,
    branchTaperStartSize,
    branchTaperEndSize,
    ropeBrushShape,
    ropeBrushRadius,
    ropeGravityDirection,
    sprayDirection,
    sprayStreakLength,
    wallWidth,
    wallHeight,
    wallLockStartHeight,
    wallAxisAlign,
    MAX_BRUSH_SIZE
  } from '../store/index';
  import type { SprayDirection } from '../store/index';

  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;
  const clayVisible = $derived($tool === 'clay');
</script>

{#if clayVisible}
  <section class="tool-panel-section tool-panel-clay" aria-label="Clay">
    {#if ['bulk', 'smooth', 'level', 'gouge', 'branch', 'melt', 'inflate'].includes($clayMode)}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Brush</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$clayBrushRadius}
          oninput={(e) => clayBrushRadius.set(Number((e.target as HTMLInputElement).value))}
          title="Brush size (1–{MAX_BRUSH_SIZE} voxels)"
        />
        <span class="tool-panel-value">{$clayBrushRadius + 1}</span>
      </div>
      {#if $clayMode === 'bulk'}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Brush shape</span>
          <div class="stroke-buttons" role="group" aria-label="Bulk brush shape">
            <button
              type="button"
              class:active={$bulkBrushShape === 'cube'}
              onclick={() => bulkBrushShape.set('cube')}
              title="Square footprint in the surface plane"
            >
              Cube
            </button>
            <button
              type="button"
              class:active={$bulkBrushShape === 'sphere'}
              onclick={() => bulkBrushShape.set('sphere')}
              title="Round footprint in the surface plane"
            >
              Sphere
            </button>
          </div>
        </div>
      {/if}
      {#if $clayMode === 'branch'}
        <div class="tool-panel-row">
          <label class="tool-panel-check">
            <input
              type="checkbox"
              checked={$branchTaper}
              onchange={(e) => branchTaper.set((e.target as HTMLInputElement).checked)}
              title="Taper from thick base to thin tip"
            />
            Taper
          </label>
        </div>
        {#if $branchTaper}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Start</span>
            <input
              type="range"
              min="0"
              max={BRUSH_SIZE_MAX}
              step="1"
              value={$branchTaperStartSize}
              oninput={(e) =>
                branchTaperStartSize.set(Number((e.target as HTMLInputElement).value))}
              title="Taper start size (1–{MAX_BRUSH_SIZE} voxels)"
            />
            <span class="tool-panel-value">{$branchTaperStartSize + 1}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">End</span>
            <input
              type="range"
              min="0"
              max={BRUSH_SIZE_MAX}
              step="1"
              value={$branchTaperEndSize}
              oninput={(e) => branchTaperEndSize.set(Number((e.target as HTMLInputElement).value))}
              title="Taper end size (1–{MAX_BRUSH_SIZE} voxels)"
            />
            <span class="tool-panel-value">{$branchTaperEndSize + 1}</span>
          </div>
        {/if}
      {/if}
      {#if $clayMode === 'inflate'}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Strength</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={$inflateStrength}
            oninput={(e) => inflateStrength.set(Number((e.target as HTMLInputElement).value))}
            title="Probability of adding each outward voxel (0–100%)"
          />
          <span class="tool-panel-value">{Math.round($inflateStrength * 100)}%</span>
        </div>
      {/if}
    {/if}
    {#if $clayMode === 'wall'}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Direction</span>
        <select
          class="tool-panel-select"
          value={$sprayDirection}
          title="Auto = face normal; or pick axis (e.g. Y− for rain)"
          onchange={(e) =>
            sprayDirection.set((e.target as HTMLSelectElement).value as SprayDirection)}
        >
          <option value="auto">Auto</option>
          <option value="none">None</option>
          <option value="right">X+</option>
          <option value="left">X−</option>
          <option value="up">Y+</option>
          <option value="down">Y−</option>
          <option value="back">Z+</option>
          <option value="forward">Z−</option>
        </select>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Width</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$wallWidth}
          oninput={(e) => wallWidth.set(Number((e.target as HTMLInputElement).value))}
          title="Path thickness (1–{MAX_BRUSH_SIZE} voxels)"
        />
        <span class="tool-panel-value">{$wallWidth + 1}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Height</span>
        <input
          type="range"
          min="2"
          max="20"
          step="1"
          value={$wallHeight}
          oninput={(e) => wallHeight.set(Math.max(2, Number((e.target as HTMLInputElement).value)))}
          title="Voxels to extend along direction (min 2)"
        />
        <span class="tool-panel-value">{$wallHeight}</span>
      </div>
      <label class="tool-panel-check">
        <input
          type="checkbox"
          checked={$wallLockStartHeight}
          onchange={(e) => wallLockStartHeight.set((e.target as HTMLInputElement).checked)}
          title="Keep path on starting plane for enclosed loops"
        />
        Lock start height
      </label>
      <label class="tool-panel-check">
        <input
          type="checkbox"
          checked={$wallAxisAlign}
          onchange={(e) => wallAxisAlign.set((e.target as HTMLInputElement).checked)}
          title="Straight wall along dominant axis from stroke start (same idea as draw line axis-align)"
        />
        Axis-align
      </label>
    {/if}
    {#if $clayMode === 'rope'}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Gravity</span>
        <select
          aria-label="Rope gravity direction"
          title="Direction of gravity (rope sags toward this axis)"
          bind:value={$ropeGravityDirection}
        >
          <option value="down">Down (−Y)</option>
          <option value="up">Up (+Y)</option>
          <option value="left">Left (−X)</option>
          <option value="right">Right (+X)</option>
          <option value="forward">Forward (−Z)</option>
          <option value="back">Back (+Z)</option>
        </select>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Shape</span>
        <div class="stroke-buttons" role="group" aria-label="Rope brush shape">
          <button
            type="button"
            class:active={$ropeBrushShape === 'sphere'}
            onclick={() => ropeBrushShape.set('sphere')}
            title="Spherical brush"
          >
            Sphere
          </button>
          <button
            type="button"
            class:active={$ropeBrushShape === 'cube'}
            onclick={() => ropeBrushShape.set('cube')}
            title="Cube brush"
          >
            Cube
          </button>
        </div>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Size</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$ropeBrushRadius}
          oninput={(e) => ropeBrushRadius.set(Number((e.target as HTMLInputElement).value))}
          title="Brush size (1–{MAX_BRUSH_SIZE} voxels)"
        />
        <span class="tool-panel-value">{$ropeBrushRadius + 1}</span>
      </div>
    {/if}
  </section>
{/if}
