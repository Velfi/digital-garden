<script lang="ts">
  import {
    tool,
    sculptMode,
    sculptBrushRadius,
    sculptBrushShape,
    smoothNeighborRadius,
    smoothAggressiveness,
    sculptSmoothVariant,
    smoothLaplacianIterations,
    smoothLaplacianRelax,
    sculptBrushStrength,
    sculptBrushFalloff,
    branchTaper,
    branchTaperStartSize,
    branchTaperEndSize,
    branchBrushProfile,
    branchEndCap,
    sprayDirection,
    wallWidth,
    wallHeight,
    wallLockStartHeight,
    wallAxisAlign,
    MAX_BRUSH_SIZE,
    terrainSculptOp,
    terrainBaseY,
    terrainStrength,
    terrainSmoothRadius
  } from '../store/index';
  import type { SprayDirection } from '../store/index';
  import { SMOOTH_NEIGHBOR_RADIUS_MAX } from '../sculptOps';

  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;
  const sculptPanelVisible = $derived($tool === 'sculpt');

  const MODES_WITH_BRUSH = new Set([
    'draw',
    'smooth',
    'gouge',
    'branch',
    'terrain'
  ]);
</script>

{#if sculptPanelVisible}
  <section class="tool-panel-section tool-panel-sculpt" aria-label="Sculpt">
    {#if MODES_WITH_BRUSH.has($sculptMode)}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Brush</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$sculptBrushRadius}
          oninput={(e) => sculptBrushRadius.set(Number((e.target as HTMLInputElement).value))}
          title="Brush size (1–{MAX_BRUSH_SIZE} voxels)"
        />
        <span class="tool-panel-value">{$sculptBrushRadius + 1}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Strength</span>
        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={$sculptBrushStrength}
          oninput={(e) => sculptBrushStrength.set(Number((e.target as HTMLInputElement).value))}
          title="How much of the brush footprint applies (with falloff weights); lower = sparser stroke"
        />
        <span class="tool-panel-value">{$sculptBrushStrength}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Falloff</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={$sculptBrushFalloff}
          oninput={(e) => sculptBrushFalloff.set(Number((e.target as HTMLInputElement).value))}
          title="0 = hard edge; higher = softer falloff from stroke path toward brush radius"
        />
        <span class="tool-panel-value">{$sculptBrushFalloff}</span>
      </div>
      {#if $sculptMode === 'draw' || $sculptMode === 'smooth' || $sculptMode === 'gouge'}
        <div class="tool-panel-row tool-panel-row--brush-shape">
          <span class="tool-panel-label">Brush shape</span>
          <div class="sculpt-brush-shape-rows" role="group" aria-label="Sculpt brush shape">
            <div class="stroke-buttons">
              <button
                type="button"
                class:active={$sculptBrushShape === 'square'}
                onclick={() => sculptBrushShape.set('square')}
                title="Flat square in the surface plane (single layer)"
              >
                Square
              </button>
              <button
                type="button"
                class:active={$sculptBrushShape === 'circle'}
                onclick={() => sculptBrushShape.set('circle')}
                title="Flat circle in the surface plane (single layer)"
              >
                Circle
              </button>
            </div>
            <div class="stroke-buttons">
              <button
                type="button"
                class:active={$sculptBrushShape === 'cube'}
                onclick={() => sculptBrushShape.set('cube')}
                title="3D axis-aligned cube (Chebyshev) along the stroke"
              >
                Cube
              </button>
              <button
                type="button"
                class:active={$sculptBrushShape === 'sphere'}
                onclick={() => sculptBrushShape.set('sphere')}
                title="3D Euclidean sphere along the stroke"
              >
                Sphere
              </button>
            </div>
          </div>
        </div>
      {/if}
      {#if $sculptMode === 'terrain'}
        <div class="tool-panel-row tool-panel-row--brush-shape">
          <span class="tool-panel-label">Brush shape</span>
          <div class="stroke-buttons" role="group" aria-label="Terrain brush shape (horizontal XZ)">
            <button
              type="button"
              class:active={$sculptBrushShape === 'square' || $sculptBrushShape === 'cube'}
              onclick={() => sculptBrushShape.set('square')}
              title="Square footprint in XZ (world horizontal)"
            >
              Square
            </button>
            <button
              type="button"
              class:active={$sculptBrushShape === 'circle' || $sculptBrushShape === 'sphere'}
              onclick={() => sculptBrushShape.set('circle')}
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
              class:active={$terrainSculptOp === 'raise'}
              onclick={() => terrainSculptOp.set('raise')}
              title="Raise surface height under the brush"
            >
              Raise
            </button>
            <button
              type="button"
              class:active={$terrainSculptOp === 'lower'}
              onclick={() => terrainSculptOp.set('lower')}
              title="Lower surface height (valleys)"
            >
              Lower
            </button>
            <button
              type="button"
              class:active={$terrainSculptOp === 'smooth'}
              onclick={() => terrainSculptOp.set('smooth')}
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
        {#if $terrainSculptOp === 'raise' || $terrainSculptOp === 'lower'}
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
        {#if $terrainSculptOp === 'smooth'}
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
      {#if $sculptMode === 'branch'}
        <div class="tool-panel-row tool-panel-row--brush-shape">
          <span class="tool-panel-label">Profile</span>
          <div class="stroke-buttons" role="group" aria-label="Branch brush profile">
            <button
              type="button"
              class:active={$branchBrushProfile === 'cube'}
              onclick={() => branchBrushProfile.set('cube')}
              title="Axis-aligned cube along the stroke (default)"
            >
              Cube
            </button>
            <button
              type="button"
              class:active={$branchBrushProfile === 'cylinder'}
              onclick={() => branchBrushProfile.set('cylinder')}
              title="Cylinder aligned to the stroke direction"
            >
              Cylinder
            </button>
          </div>
        </div>
        {#if $branchBrushProfile === 'cylinder'}
          <div class="tool-panel-row tool-panel-row--brush-shape">
            <span class="tool-panel-label">Caps</span>
            <div class="stroke-buttons" role="group" aria-label="Branch cylinder end caps">
              <button
                type="button"
                class:active={$branchEndCap === 'flat'}
                onclick={() => branchEndCap.set('flat')}
                title="Flat circular ends"
              >
                Flat
              </button>
              <button
                type="button"
                class:active={$branchEndCap === 'rounded'}
                onclick={() => branchEndCap.set('rounded')}
                title="Rounded (capsule-style) ends"
              >
                Rounded
              </button>
              <button
                type="button"
                class:active={$branchEndCap === 'pointed'}
                onclick={() => branchEndCap.set('pointed')}
                title="Conical tips past the stroke ends"
              >
                Pointed
              </button>
            </div>
          </div>
        {/if}
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
      {#if $sculptMode === 'smooth'}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Smooth</span>
          <div class="stroke-buttons" role="group" aria-label="Smooth algorithm">
            <button
              type="button"
              class:active={$sculptSmoothVariant === 'majority'}
              onclick={() => sculptSmoothVariant.set('majority')}
              title="Voxel majority: fill pockets and remove isolated voxels in the brush"
            >
              Majority
            </button>
            <button
              type="button"
              class:active={$sculptSmoothVariant === 'meshLaplacian'}
              onclick={() => sculptSmoothVariant.set('meshLaplacian')}
              title="Mesh Taubin smooth in a box around the brush, then snap back to voxels (see Help)"
            >
              Mesh
            </button>
          </div>
        </div>
        {#if $sculptSmoothVariant === 'majority'}
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
        {:else}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Reach</span>
            <input
              type="range"
              min="0"
              max={SMOOTH_NEIGHBOR_RADIUS_MAX}
              step="1"
              value={$smoothNeighborRadius}
              oninput={(e) => smoothNeighborRadius.set(Number((e.target as HTMLInputElement).value))}
              title="Extra margin around the brush for the mesh smooth region (larger = wider ROI)"
            />
            <span class="tool-panel-value">{$smoothNeighborRadius}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Passes</span>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={$smoothLaplacianIterations}
              oninput={(e) =>
                smoothLaplacianIterations.set(Number((e.target as HTMLInputElement).value))}
              title="Taubin smoothing iterations (each pass is λ then μ)"
            />
            <span class="tool-panel-value">{$smoothLaplacianIterations}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Relax</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={$smoothLaplacianRelax}
              oninput={(e) => smoothLaplacianRelax.set(Number((e.target as HTMLInputElement).value))}
              title="0 = almost no move; 100 = full Taubin step scale"
            />
            <span class="tool-panel-value">{$smoothLaplacianRelax}</span>
          </div>
        {/if}
      {/if}
    {/if}
    {#if $sculptMode === 'wall'}
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
  </section>
{/if}
