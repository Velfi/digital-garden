<script lang="ts">
  import { get } from 'svelte/store';
  import {
    toolPane,
    tool,
    strokeMode,
    lineAxisAlign,
    planeAxis,
    planeCuboidHollow,
    PLANE_CUBOID_HOLLOW_WALL_MAX,
    planeCuboidHollowWallThickness,
    PLANE_CYLINDER_TAPER_PCT_MAX,
    planeCylinderTaperPct,
    drawBrushShape,
    drawBrushSize,
    drawBrushSnapToSurface,
    sprayBrushShape,
    sprayRadius,
    sprayScatter,
    sprayRadiusRange,
    sprayRadiusMin,
    sprayRadiusMax,
    fillSelectDiagonals,
    fillRespectsColor,
    constrainToPlaneEnabled,
    constrainToPlaneRef,
    polygonOffsetFromNormal,
    MAX_BRUSH_SIZE
  } from '../store/index';
  import { DRAW_BRUSH_SHAPES } from './constants';
  import {
    sprayVisible as sprayVisibleFn,
    constrainPlaneSectionVisible as constrainPlaneSectionVisibleFn,
    fillVisible as fillVisibleFn,
    isStrokeTool,
    lineAxisAlignVisible as lineAxisAlignVisibleFn,
    planeAxisVisible as planeAxisVisibleFn,
    planeOrCuboidStroke as planeOrCuboidStrokeFn,
    polygonHullVisible as polygonHullVisibleFn,
    solidPolygonVisible as solidPolygonVisibleFn,
    showBrushSection as showBrushSectionFn
  } from './toolVisibility';
  import {
    SELECTION_STROKE_FAMILY_VARIANTS,
    selectionStrokeFamilyShowsShapeVariants,
    strokeModeToSelectionStrokeFamily
  } from '../store/selectionStrokeFamily';

  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;

  const planeAxisVisible = $derived(planeAxisVisibleFn($strokeMode, $tool));
  const planeOrCuboidStroke = $derived(planeOrCuboidStrokeFn($strokeMode));
  const lineAxisAlignVisible = $derived(lineAxisAlignVisibleFn($strokeMode, $tool));
  const sprayVisible = $derived(sprayVisibleFn($strokeMode, $tool));
  const fillVisible = $derived(fillVisibleFn($strokeMode, $tool));
  const constrainPlaneSectionVisible = $derived(constrainPlaneSectionVisibleFn($strokeMode, $tool));
  const polygonHullVisible = $derived(polygonHullVisibleFn($strokeMode, $tool));
  const solidPolygonVisible = $derived(solidPolygonVisibleFn($strokeMode, $tool));
  const showBrushSection = $derived(showBrushSectionFn($toolPane, $strokeMode, $tool));

  const strokeShapeFamily = $derived(strokeModeToSelectionStrokeFamily($strokeMode));
  const strokeShapeVariants = $derived(SELECTION_STROKE_FAMILY_VARIANTS[strokeShapeFamily]);
  const strokeShapeSectionVisible = $derived(
    $toolPane === 'draw' &&
      isStrokeTool($tool) &&
      selectionStrokeFamilyShowsShapeVariants(strokeShapeFamily)
  );
</script>

{#if strokeShapeSectionVisible}
  <section class="tool-panel-section" aria-label="Area shape">
    <div class="tool-panel-row tool-panel-row--section-heading">
      <span class="tool-panel-label">Area shape</span>
    </div>
    <div class="stroke-buttons" role="group" aria-label="Area shape">
      {#each strokeShapeVariants as v (v.mode)}
        <button
          type="button"
          class:active={$strokeMode === v.mode}
          onclick={() => strokeMode.set(v.mode)}
          title={v.title}
        >
          {v.panelLabel ?? v.label}
        </button>
      {/each}
    </div>
  </section>
{/if}

{#if showBrushSection}
  <section
    class="tool-panel-section"
    class:tool-panel-section--divider-after-area={strokeShapeSectionVisible}
    aria-label="Brush"
  >
    <div class="tool-panel-row tool-panel-row--section-heading">
      <span class="tool-panel-label">Brush shape</span>
    </div>
    <div class="stroke-buttons" role="group" aria-label="Brush shape">
      {#each DRAW_BRUSH_SHAPES as s (s.id)}
        <button
          type="button"
          class:active={$drawBrushShape === s.id}
          onclick={() => drawBrushShape.set(s.id)}
          title={s.title}
        >
          {s.label}
        </button>
      {/each}
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Brush size</span>
      <input
        type="range"
        min="0"
        max={BRUSH_SIZE_MAX}
        step="1"
        value={$drawBrushSize}
        oninput={(e) => drawBrushSize.set(Number((e.target as HTMLInputElement).value))}
        title="Brush size (1–{MAX_BRUSH_SIZE} voxels)"
      />
      <span class="tool-panel-value">{$drawBrushSize + 1}</span>
    </div>
    <label class="tool-panel-check">
      <input
        type="checkbox"
        checked={$drawBrushSnapToSurface}
        onchange={(e) => drawBrushSnapToSurface.set((e.target as HTMLInputElement).checked)}
        title="Offset brush along surface normal so it sits on the face instead of through it"
      />
      Snap to surface
    </label>
  </section>
{/if}

{#if lineAxisAlignVisible}
  <section class="tool-panel-section" aria-label="Line options">
    <label class="tool-panel-check">
      <input
        type="checkbox"
        checked={$lineAxisAlign}
        onchange={(e) => lineAxisAlign.set((e.target as HTMLInputElement).checked)}
        title="Constrain line to dominant axis (X, Y, or Z)"
      />
      Axis-align
    </label>
  </section>
{/if}

{#if planeAxisVisible}
  <section class="tool-panel-section" aria-label="Plane options">
    <div class="tool-panel-row tool-panel-row--section-heading">
      <span class="tool-panel-label">Plane options</span>
    </div>
    <div class="stroke-buttons" role="group" aria-label="Plane orientation">
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
      <button
        type="button"
        class:active={$planeAxis === 'auto'}
        onclick={() => planeAxis.set('auto')}
        title="Auto: use clicked face"
      >
        Auto
      </button>
    </div>
    <label class="tool-panel-check">
      <input
        type="checkbox"
        checked={$planeCuboidHollow}
        onchange={(e) => planeCuboidHollow.set((e.target as HTMLInputElement).checked)}
        title="Hollow: keep only the outer shell (plane edge, or walls of box/cylinder)"
      />
      Hollow
    </label>
    {#if $strokeMode === 'cylinder'}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Taper</span>
        <input
          type="range"
          min="0"
          max={PLANE_CYLINDER_TAPER_PCT_MAX}
          step="1"
          value={Math.min(
            PLANE_CYLINDER_TAPER_PCT_MAX,
            Math.max(0, Math.round($planeCylinderTaperPct))
          )}
          oninput={(e) =>
            planeCylinderTaperPct.set(Number((e.target as HTMLInputElement).value))}
          title="0% = cylinder; 100% = cone (radius to zero at far end)"
        />
        <span class="tool-panel-value"
          >{Math.min(
            PLANE_CYLINDER_TAPER_PCT_MAX,
            Math.max(0, Math.round($planeCylinderTaperPct))
          )}%</span
        >
      </div>
    {/if}
    {#if $planeCuboidHollow && planeOrCuboidStroke}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Wall thickness</span>
        <input
          type="range"
          min="1"
          max={PLANE_CUBOID_HOLLOW_WALL_MAX}
          step="1"
          value={Math.min(
            PLANE_CUBOID_HOLLOW_WALL_MAX,
            Math.max(1, Math.floor($planeCuboidHollowWallThickness))
          )}
          oninput={(e) =>
            planeCuboidHollowWallThickness.set(Number((e.target as HTMLInputElement).value))}
          title="Hollow shell depth in voxels (plane, cuboid, cylinder)"
        />
        <span class="tool-panel-value"
          >{Math.min(
            PLANE_CUBOID_HOLLOW_WALL_MAX,
            Math.max(1, Math.floor($planeCuboidHollowWallThickness))
          )}</span
        >
      </div>
    {/if}
  </section>
{/if}

{#if solidPolygonVisible}
  <section class="tool-panel-section" aria-label="Polygon extrusion shell">
    <label class="tool-panel-check">
      <input
        type="checkbox"
        checked={$planeCuboidHollow}
        onchange={(e) => planeCuboidHollow.set((e.target as HTMLInputElement).checked)}
        title="Hollow: keep only the outer shell"
      />
      Hollow
    </label>
    {#if $planeCuboidHollow}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Wall thickness</span>
        <input
          type="range"
          min="1"
          max={PLANE_CUBOID_HOLLOW_WALL_MAX}
          step="1"
          value={Math.min(
            PLANE_CUBOID_HOLLOW_WALL_MAX,
            Math.max(1, Math.floor($planeCuboidHollowWallThickness))
          )}
          oninput={(e) =>
            planeCuboidHollowWallThickness.set(Number((e.target as HTMLInputElement).value))}
          title="Hollow shell depth in voxels"
        />
        <span class="tool-panel-value"
          >{Math.min(
            PLANE_CUBOID_HOLLOW_WALL_MAX,
            Math.max(1, Math.floor($planeCuboidHollowWallThickness))
          )}</span
        >
      </div>
    {/if}
  </section>
{/if}

{#if constrainPlaneSectionVisible}
  <section class="tool-panel-section" aria-label="Plane constraint">
    <div class="tool-panel-row">
      <label class="tool-panel-check">
        <input
          type="checkbox"
          checked={$constrainToPlaneEnabled}
          onchange={(e) => constrainToPlaneEnabled.set((e.target as HTMLInputElement).checked)}
          title="Limit fill flood and Spray stroke to a plane through the click/drag start"
        />
        Constrain to plane
      </label>
    </div>
    {#if $constrainToPlaneEnabled}
      <div class="stroke-buttons" role="group" aria-label="Plane reference">
        <button
          type="button"
          class:active={$constrainToPlaneRef === 'auto'}
          onclick={() => constrainToPlaneRef.set('auto')}
          title="Plane perpendicular to dominant axis of clicked face"
        >
          Auto
        </button>
        <button
          type="button"
          class:active={$constrainToPlaneRef === 'camera'}
          onclick={() => constrainToPlaneRef.set('camera')}
          title="View plane (camera look direction) through start"
        >
          Camera
        </button>
        <button
          type="button"
          class:active={$constrainToPlaneRef === 0}
          onclick={() => constrainToPlaneRef.set(0)}
          title="World YZ plane through seed (constant X)"
        >
          X
        </button>
        <button
          type="button"
          class:active={$constrainToPlaneRef === 1}
          onclick={() => constrainToPlaneRef.set(1)}
          title="World XZ plane through seed (constant Y)"
        >
          Y
        </button>
        <button
          type="button"
          class:active={$constrainToPlaneRef === 2}
          onclick={() => constrainToPlaneRef.set(2)}
          title="World XY plane through seed (constant Z)"
        >
          Z
        </button>
      </div>
    {/if}
  </section>
{/if}

{#if sprayVisible}
  <section class="tool-panel-section" aria-label="Spray">
    <div class="tool-panel-row tool-panel-row--section-heading">
      <span class="tool-panel-label">Brush shape</span>
    </div>
    <div class="stroke-buttons" role="group" aria-label="Spray brush shape">
      {#each DRAW_BRUSH_SHAPES as s (s.id)}
        <button
          type="button"
          class:active={$sprayBrushShape === s.id}
          onclick={() => sprayBrushShape.set(s.id)}
          title={s.title}
        >
          {s.label}
        </button>
      {/each}
    </div>
    <div class="tool-panel-row">
      <label class="tool-panel-check">
        <input
          type="checkbox"
          checked={$sprayRadiusRange}
          onchange={(e) => sprayRadiusRange.set((e.target as HTMLInputElement).checked)}
          title="Vary droplet size for spray effect"
        />
        Size range
      </label>
    </div>
    {#if $sprayRadiusRange}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Min</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$sprayRadiusMin}
          oninput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            sprayRadiusMin.set(v);
            if (v > get(sprayRadiusMax)) sprayRadiusMax.set(v);
          }}
        />
        <span class="tool-panel-value">{$sprayRadiusMin + 1}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Max</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$sprayRadiusMax}
          oninput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            sprayRadiusMax.set(v);
            if (v < get(sprayRadiusMin)) sprayRadiusMin.set(v);
          }}
        />
        <span class="tool-panel-value">{$sprayRadiusMax + 1}</span>
      </div>
    {:else}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Size</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$sprayRadius}
          oninput={(e) => sprayRadius.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$sprayRadius + 1}</span>
      </div>
    {/if}
    <div class="tool-panel-row">
      <span class="tool-panel-label">Scatter</span>
      <input
        type="range"
        min="0"
        max={BRUSH_SIZE_MAX}
        step="1"
        value={$sprayScatter}
        oninput={(e) => sprayScatter.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="tool-panel-value">{$sprayScatter}</span>
    </div>
  </section>
{/if}

{#if fillVisible}
  <section class="tool-panel-section" aria-label="Fill">
    <div class="tool-panel-row">
      <label class="tool-panel-check">
        <input
          type="checkbox"
          checked={$fillSelectDiagonals}
          onchange={(e) => fillSelectDiagonals.set((e.target as HTMLInputElement).checked)}
        />
        Include diagonals
      </label>
    </div>
    <div class="tool-panel-row">
      <label class="tool-panel-check">
        <input
          type="checkbox"
          checked={$fillRespectsColor}
          onchange={(e) => fillRespectsColor.set((e.target as HTMLInputElement).checked)}
        />
        Respect color
      </label>
    </div>
  </section>
{/if}

{#if polygonHullVisible || solidPolygonVisible}
  <section class="tool-panel-section" aria-label="Polygon offset">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Offset from normal</span>
      <input
        type="range"
        min="-8"
        max="8"
        step="1"
        value={$polygonOffsetFromNormal}
        oninput={(e) => polygonOffsetFromNormal.set(Number((e.target as HTMLInputElement).value))}
        title="Voxel steps along the face normal from the latest polygon anchor click"
      />
      <span class="tool-panel-value">{$polygonOffsetFromNormal}</span>
    </div>
  </section>
{/if}

<style>
  .tool-panel-section--divider-after-area {
    border-top: 1px solid var(--border-color);
    padding-top: 0.5rem;
    margin-top: 0.15rem;
  }

  .tool-panel-row--section-heading {
    margin-bottom: 0.2rem;
  }

  .tool-panel-row--section-heading :global(.tool-panel-label) {
    font-weight: 600;
    font-size: 0.82rem;
  }
</style>
