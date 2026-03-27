<script lang="ts">
  import {
    tool,
    ropeBrushShape,
    ropeBrushRadius,
    ropeGravityDirection,
    MAX_BRUSH_SIZE
  } from '../store/index';

  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;
</script>

{#if $tool === 'rope' || $tool === 'cloth'}
  <section class="tool-panel-section" aria-label="Rope and cloth">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Gravity</span>
      <select
        aria-label="Gravity direction for rope or cloth"
        title="Direction of gravity (rope sags / cloth hangs toward this axis)"
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
      <div class="stroke-buttons" role="group" aria-label="Rope or cloth brush shape">
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
  </section>
{/if}
