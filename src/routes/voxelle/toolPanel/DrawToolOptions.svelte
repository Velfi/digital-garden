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
    drawBrushShape,
    drawBrushSize,
    drawBrushSnapToSurface,
    airbrushBrushShape,
    airbrushRadius,
    airbrushScatter,
    airbrushRadiusRange,
    airbrushRadiusMin,
    airbrushRadiusMax,
    fillSelectDiagonals,
    fillRespectsColor,
    constrainToPlaneEnabled,
    constrainToPlaneRef,
    polygonOffsetFromNormal,
    MAX_BRUSH_SIZE
  } from '../store/index';
  import { DRAW_BRUSH_SHAPES } from './constants';
  import {
    airbrushVisible as airbrushVisibleFn,
    constrainPlaneSectionVisible as constrainPlaneSectionVisibleFn,
    fillVisible as fillVisibleFn,
    lineAxisAlignVisible as lineAxisAlignVisibleFn,
    planeAxisVisible as planeAxisVisibleFn,
    planeOrCuboidStroke as planeOrCuboidStrokeFn,
    polygonVisible as polygonVisibleFn,
    showBrushSection as showBrushSectionFn
  } from './toolVisibility';

  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;

  const planeAxisVisible = $derived(planeAxisVisibleFn($strokeMode, $tool));
  const planeOrCuboidStroke = $derived(planeOrCuboidStrokeFn($strokeMode));
  const lineAxisAlignVisible = $derived(lineAxisAlignVisibleFn($strokeMode, $tool));
  const airbrushVisible = $derived(airbrushVisibleFn($strokeMode, $tool));
  const fillVisible = $derived(fillVisibleFn($strokeMode, $tool));
  const constrainPlaneSectionVisible = $derived(
    constrainPlaneSectionVisibleFn($strokeMode, $tool)
  );
  const polygonVisible = $derived(polygonVisibleFn($strokeMode, $tool));
  const showBrushSection = $derived(showBrushSectionFn($toolPane, $strokeMode, $tool));
</script>

{#if showBrushSection}
  <section class="tool-panel-section" aria-label="Draw brush">
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
  <section class="tool-panel-section" aria-label="Plane axis">
    <div class="stroke-buttons" role="group" aria-label="Plane axis">
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
        title="Only perimeter (plane/circle) or shell (cuboid)"
      />
      Hollow
    </label>
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
          title="Hollow shell depth in voxels (plane and cuboid)"
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
          title="Limit fill flood and airbrush stroke to a plane through the click/drag start"
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

{#if airbrushVisible}
  <section class="tool-panel-section" aria-label="Airbrush">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Droplet</span>
      <div class="stroke-buttons" role="group" aria-label="Airbrush droplet shape">
        <button
          type="button"
          class:active={$airbrushBrushShape === 'sphere'}
          onclick={() => airbrushBrushShape.set('sphere')}
          title="Round spray (Euclidean sphere per droplet)"
        >
          Sphere
        </button>
        <button
          type="button"
          class:active={$airbrushBrushShape === 'cube'}
          onclick={() => airbrushBrushShape.set('cube')}
          title="Boxy spray (axis-aligned cube per droplet)"
        >
          Cube
        </button>
      </div>
    </div>
    <div class="tool-panel-row">
      <label class="tool-panel-check">
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
      <div class="tool-panel-row">
        <span class="tool-panel-label">Min</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$airbrushRadiusMin}
          oninput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            airbrushRadiusMin.set(v);
            if (v > get(airbrushRadiusMax)) airbrushRadiusMax.set(v);
          }}
        />
        <span class="tool-panel-value">{$airbrushRadiusMin + 1}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Max</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$airbrushRadiusMax}
          oninput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            airbrushRadiusMax.set(v);
            if (v < get(airbrushRadiusMin)) airbrushRadiusMin.set(v);
          }}
        />
        <span class="tool-panel-value">{$airbrushRadiusMax + 1}</span>
      </div>
    {:else}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Size</span>
        <input
          type="range"
          min="0"
          max={BRUSH_SIZE_MAX}
          step="1"
          value={$airbrushRadius}
          oninput={(e) => airbrushRadius.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="tool-panel-value">{$airbrushRadius + 1}</span>
      </div>
    {/if}
    <div class="tool-panel-row">
      <span class="tool-panel-label">Scatter</span>
      <input
        type="range"
        min="0"
        max={BRUSH_SIZE_MAX}
        step="1"
        value={$airbrushScatter}
        oninput={(e) => airbrushScatter.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="tool-panel-value">{$airbrushScatter}</span>
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

{#if polygonVisible}
  <section class="tool-panel-section" aria-label="Polygon">
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
