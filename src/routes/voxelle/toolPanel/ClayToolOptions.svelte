<script lang="ts">
  import {
    tool,
    clayMode,
    clayBrushRadius,
    clayBrushShape,
    inflateStrength,
    smoothNeighborRadius,
    smoothAggressiveness,
    meltMaxPasses,
    meltStyle,
    branchTaper,
    branchTaperStartSize,
    branchTaperEndSize,
    ropeBrushShape,
    ropeBrushRadius,
    ropeGravityDirection,
    sprayDirection,
    wallWidth,
    wallHeight,
    wallLockStartHeight,
    wallAxisAlign,
    MAX_BRUSH_SIZE,
    terrainClayOp,
    terrainBaseY,
    terrainStrength,
    terrainSmoothRadius
  } from '../store/index';
  import type { SprayDirection } from '../store/index';
  import { SMOOTH_NEIGHBOR_RADIUS_MAX } from '../clayOps';

  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;
  const clayVisible = $derived($tool === 'clay');
</script>

{#if clayVisible}
  <section class="tool-panel-section tool-panel-clay" aria-label="Clay">
    {#if ['bulk', 'smooth', 'level', 'gouge', 'branch', 'melt', 'inflate', 'terrain'].includes($clayMode)}
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
      {#if $clayMode === 'bulk' || $clayMode === 'smooth' || $clayMode === 'melt'}
        <div class="tool-panel-row tool-panel-row--brush-shape">
          <span class="tool-panel-label">Brush shape</span>
          <div class="clay-brush-shape-rows" role="group" aria-label="Clay brush shape">
            <div class="stroke-buttons">
              <button
                type="button"
                class:active={$clayBrushShape === 'square'}
                onclick={() => clayBrushShape.set('square')}
                title="Flat square in the surface plane (single layer)"
              >
                Square
              </button>
              <button
                type="button"
                class:active={$clayBrushShape === 'circle'}
                onclick={() => clayBrushShape.set('circle')}
                title="Flat circle in the surface plane (single layer)"
              >
                Circle
              </button>
            </div>
            <div class="stroke-buttons">
              <button
                type="button"
                class:active={$clayBrushShape === 'cube'}
                onclick={() => clayBrushShape.set('cube')}
                title="3D axis-aligned cube (Chebyshev) along the stroke"
              >
                Cube
              </button>
              <button
                type="button"
                class:active={$clayBrushShape === 'sphere'}
                onclick={() => clayBrushShape.set('sphere')}
                title="3D Euclidean sphere along the stroke"
              >
                Sphere
              </button>
            </div>
          </div>
        </div>
      {/if}
      {#if $clayMode === 'terrain'}
        <div class="tool-panel-row tool-panel-row--brush-shape">
          <span class="tool-panel-label">Brush shape</span>
          <div class="stroke-buttons" role="group" aria-label="Terrain brush shape (horizontal XZ)">
            <button
              type="button"
              class:active={$clayBrushShape === 'square' || $clayBrushShape === 'cube'}
              onclick={() => clayBrushShape.set('square')}
              title="Square footprint in XZ (world horizontal)"
            >
              Square
            </button>
            <button
              type="button"
              class:active={$clayBrushShape === 'circle' || $clayBrushShape === 'sphere'}
              onclick={() => clayBrushShape.set('circle')}
              title="Circular footprint in XZ (cube/sphere also use this for terrain)"
            >
              Circle
            </button>
          </div>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Terrain</span>
          <div class="stroke-buttons" role="group" aria-label="Terrain operation">
            <button
              type="button"
              class:active={$terrainClayOp === 'raise'}
              onclick={() => terrainClayOp.set('raise')}
              title="Raise surface height under the brush"
            >
              Raise
            </button>
            <button
              type="button"
              class:active={$terrainClayOp === 'lower'}
              onclick={() => terrainClayOp.set('lower')}
              title="Lower surface height (valleys)"
            >
              Lower
            </button>
            <button
              type="button"
              class:active={$terrainClayOp === 'smooth'}
              onclick={() => terrainClayOp.set('smooth')}
              title="Blur heights in XZ (rolling hills)"
            >
              Smooth
            </button>
          </div>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Base Y</span>
          <input
            type="number"
            value={$terrainBaseY}
            min={-512}
            max={512}
            step="1"
            title="Fill floor when building columns (deep voxels below this are preserved)"
            oninput={(e) =>
              terrainBaseY.set(
                Math.max(-512, Math.min(512, Number((e.target as HTMLInputElement).value) || 0))
              )}
          />
        </div>
        {#if $terrainClayOp === 'raise' || $terrainClayOp === 'lower'}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Strength</span>
            <input
              type="range"
              min="1"
              max="32"
              step="1"
              value={$terrainStrength}
              oninput={(e) => terrainStrength.set(Number((e.target as HTMLInputElement).value))}
              title="Max voxels of raise/lower at brush center (falls off toward edge)"
            />
            <span class="tool-panel-value">{$terrainStrength}</span>
          </div>
        {/if}
        {#if $terrainClayOp === 'smooth'}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Smooth reach</span>
            <input
              type="range"
              min="0"
              max="8"
              step="1"
              value={$terrainSmoothRadius}
              oninput={(e) => terrainSmoothRadius.set(Number((e.target as HTMLInputElement).value))}
              title="XZ box radius (in columns) for averaging neighbor heights"
            />
            <span class="tool-panel-value">{$terrainSmoothRadius}</span>
          </div>
        {/if}
      {/if}
      {#if $clayMode === 'melt'}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Style</span>
          <div class="stroke-buttons" role="group" aria-label="Melt style">
            <button
              type="button"
              class:active={$meltStyle === 'friedEgg'}
              onclick={() => meltStyle.set('friedEgg')}
              title="Flatten orb into a puddle with a thicker center (yolk)"
            >
              Fried egg
            </button>
            <button
              type="button"
              class:active={$meltStyle === 'gravity'}
              onclick={() => meltStyle.set('gravity')}
              title="Voxels flow downhill inside the brush until settled"
            >
              Gravity
            </button>
          </div>
        </div>
        {#if $meltStyle === 'gravity'}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Passes</span>
            <input
              type="range"
              min="0"
              max="256"
              step="1"
              value={$meltMaxPasses}
              oninput={(e) => meltMaxPasses.set(Number((e.target as HTMLInputElement).value))}
              title="Max gravity steps per stroke (0 = auto from model height)"
            />
            <span class="tool-panel-value">{$meltMaxPasses === 0 ? 'Auto' : $meltMaxPasses}</span>
          </div>
        {/if}
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
      {#if $clayMode === 'smooth'}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Reach</span>
          <input
            type="range"
            min="0"
            max={SMOOTH_NEIGHBOR_RADIUS_MAX}
            step="1"
            value={$smoothNeighborRadius}
            oninput={(e) => smoothNeighborRadius.set(Number((e.target as HTMLInputElement).value))}
            title="Neighborhood size: 0 = face-adjacent only; higher = wider smoothing for large models"
          />
          <span class="tool-panel-value">{$smoothNeighborRadius}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Strength</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={$smoothAggressiveness}
            oninput={(e) => smoothAggressiveness.set(Number((e.target as HTMLInputElement).value))}
            title="0 = gentle; 100 = strongest fill/remove (legacy behavior at reach 0)"
          />
          <span class="tool-panel-value">{$smoothAggressiveness}</span>
        </div>
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
