<script lang="ts">
  import {
    tool,
    ropeBrushShape,
    ropeBrushRadius,
    ropeGravityDirection,
    clothSimGravityPct,
    clothSimStiffnessPct,
    clothSimIterations,
    clothSimConstraintPasses,
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

{#if $tool === 'cloth'}
  <section class="tool-panel-section" aria-label="Cloth simulation">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Sim gravity</span>
      <input
        type="range"
        min="50"
        max="200"
        step="5"
        value={$clothSimGravityPct}
        oninput={(e) => clothSimGravityPct.set(Number((e.target as HTMLInputElement).value))}
        title="Gravity strength for the draping pass (percent of built-in scale)"
      />
      <span class="tool-panel-value">{$clothSimGravityPct}%</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Stiffness</span>
      <input
        type="range"
        min="50"
        max="150"
        step="5"
        value={$clothSimStiffnessPct}
        oninput={(e) => clothSimStiffnessPct.set(Number((e.target as HTMLInputElement).value))}
        title="How strongly edge constraints resist stretch (percent)"
      />
      <span class="tool-panel-value">{$clothSimStiffnessPct}%</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Iterations</span>
      <input
        type="range"
        min="0"
        max="64"
        step="1"
        value={$clothSimIterations}
        oninput={(e) => clothSimIterations.set(Number((e.target as HTMLInputElement).value))}
        title="0 = automatic from tension; otherwise fixed PBD outer iterations"
      />
      <span class="tool-panel-value"
        >{$clothSimIterations === 0 ? 'Auto' : String($clothSimIterations)}</span
      >
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Passes</span>
      <input
        type="range"
        min="1"
        max="6"
        step="1"
        value={$clothSimConstraintPasses}
        oninput={(e) => clothSimConstraintPasses.set(Number((e.target as HTMLInputElement).value))}
        title="Constraint projection passes per outer iteration"
      />
      <span class="tool-panel-value">{$clothSimConstraintPasses}</span>
    </div>
  </section>
{/if}
