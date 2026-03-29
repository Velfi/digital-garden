<script lang="ts">
  import { get } from 'svelte/store';
  import OrbitGizmo from './OrbitGizmo.svelte';
  import ToolPanel from './ToolPanel.svelte';
  import SelectionCountPanel from './SelectionCountPanel.svelte';
  import { renderingMode, ropeTension, clothTension, tool, voxellePreferences } from './store/index';
  import type {
    VoxelCanvasFillHudProps,
    VoxelCanvasLoadingHudProps,
    VoxelCanvasViewportHudProps
  } from './canvas/voxelCanvasOverlayProps';

  interface Props {
    gizmoRef?: { draw: () => void } | undefined;
    loadingHud: VoxelCanvasLoadingHudProps;
    fillHud: VoxelCanvasFillHudProps;
    cuboidPhase: 'plane' | 'depth' | null;
    cuboidDepth: number;
    updateCuboidFromDepth: () => void;
    commitCuboid: () => void;
    cylinderPhase: 'plane' | 'depth' | null;
    cylinderDepth: number;
    updateCylinderFromDepth: () => void;
    commitCylinder: () => void;
    polygonPhase: 'placing' | null;
    polygonPointCount: number;
    commitPolygon: () => void;
    cancelPolygon: () => void;
    wallPolygonPhase: 'placing' | null;
    wallPolygonPointCount: number;
    commitWallPolygon: () => void;
    cancelWallPolygon: () => void;
    solidPolygonPhase: 'placing' | 'depth' | null;
    solidPolygonPointCount: number;
    solidPolygonExtrudable: boolean;
    beginSolidPolygonDepth: () => void;
    solidPolygonDepth: number;
    updateSolidPolygonFromDepth: () => void;
    commitSolidPolygon: () => void;
    cancelSolidPolygon: () => void;
    roofPhase: 'placing' | null;
    /** When false, hide Done/Cancel (e.g. roof footprint mode before first gesture). */
    roofHudVisible: boolean;
    roofDoneDisabled: boolean;
    commitRoof: () => void;
    cancelRoof: () => void;
    piscinaPhase: 'pick' | 'shape';
    commitPiscinaFish: () => void;
    pickAgainPiscina: () => void;
    insectaPhase: 'pick' | 'shape';
    commitInsectaPlacement: () => void;
    pickAgainInsecta: () => void;
    faunaPhase: 'pick' | 'shape';
    commitFaunaPlacement: () => void;
    pickAgainFauna: () => void;
    squishyHasMetaballs: boolean;
    commitSquishySession: () => void;
    cancelSquishySession: () => void;
    ropePhase: 'placing' | 'tension' | null;
    commitRope: () => void;
    cancelRope: () => void;
    clothPhase: 'placing' | 'tension' | null;
    clothPointCount: number;
    finishClothPlacing: () => void;
    commitCloth: () => void;
    cancelCloth: () => void;
    viewportHud: VoxelCanvasViewportHudProps;
  }

  let {
    gizmoRef = $bindable(),
    loadingHud,
    fillHud,
    cuboidPhase,
    cuboidDepth = $bindable(),
    updateCuboidFromDepth,
    commitCuboid,
    cylinderPhase,
    cylinderDepth = $bindable(),
    updateCylinderFromDepth,
    commitCylinder,
    polygonPhase,
    polygonPointCount,
    commitPolygon,
    cancelPolygon,
    wallPolygonPhase,
    wallPolygonPointCount,
    commitWallPolygon,
    cancelWallPolygon,
    solidPolygonPhase,
    solidPolygonPointCount,
    solidPolygonExtrudable,
    beginSolidPolygonDepth,
    solidPolygonDepth = $bindable(),
    updateSolidPolygonFromDepth,
    commitSolidPolygon,
    cancelSolidPolygon,
    roofPhase,
    roofHudVisible,
    roofDoneDisabled,
    commitRoof,
    cancelRoof,
    piscinaPhase,
    commitPiscinaFish,
    pickAgainPiscina,
    insectaPhase,
    commitInsectaPlacement,
    pickAgainInsecta,
    faunaPhase,
    commitFaunaPlacement,
    pickAgainFauna,
    squishyHasMetaballs,
    commitSquishySession,
    cancelSquishySession: resetSquishySession,
    ropePhase,
    commitRope,
    cancelRope,
    clothPhase,
    clothPointCount,
    finishClothPlacing,
    commitCloth,
    cancelCloth,
    viewportHud
  }: Props = $props();

  let depthSliderPointerId: number | null = $state(null);
  let depthSliderStartY = $state(0);
  let depthSliderStartDepth = $state(0);

  let ropeTensionSliderPointerId: number | null = $state(null);
  let ropeTensionSliderStartY = $state(0);
  let ropeTensionSliderStartVal = $state(0);

  let clothTensionSliderPointerId: number | null = $state(null);
  let clothTensionSliderStartY = $state(0);
  let clothTensionSliderStartVal = $state(0);
</script>

{#if $renderingMode === 'ray' && loadingHud.rayRefinementProgress < 1}
  <div
    class="ray-refine-progress"
    role="progressbar"
    aria-live="polite"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(loadingHud.rayRefinementProgress * 100)}
    aria-label="Ray trace refinement"
  >
    <div
      class="ray-refine-progress-fill"
      style="transform: scaleX({loadingHud.rayRefinementProgress})"
    ></div>
  </div>
{/if}
{#if loadingHud.showGreedyMeshSpinner}
  <div class="greedy-mesh-spinner" role="status" aria-live="polite">
    <div class="spinner" aria-hidden="true"></div>
    <span>Building mesh…</span>
  </div>
{/if}
{#if loadingHud.projectOpenLoadingActive}
  <div class="project-open-loading" role="status" aria-live="polite">
    <div class="project-open-loading-card">
      <div class="project-open-loading-title">Opening project</div>
      <div class="project-open-loading-message">{loadingHud.projectOpenLoadingMessage}</div>
      <div
        class="project-open-loading-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(loadingHud.projectOpenLoadingProgress * 100)}
        aria-label="Project open progress"
      >
        <div
          class="project-open-loading-progress-fill"
          style="transform: scaleX({loadingHud.projectOpenLoadingProgress})"
        ></div>
      </div>
      <div class="project-open-loading-percent">
        {Math.round(loadingHud.projectOpenLoadingProgress * 100)}%
      </div>
    </div>
  </div>
{/if}
{#if fillHud.fillBusy}
  <div class="fill-progress" role="status" aria-live="polite" data-voxelle-no-passthrough>
    <div class="fill-progress-title">{fillHud.fillMessage}</div>
    <div class="fill-progress-stats">
      <span>Visited: {fillHud.fillVisited.toLocaleString()}</span>
      <span>Matched: {fillHud.fillMatched.toLocaleString()}</span>
    </div>
    <button type="button" class="fill-cancel-btn" onclick={() => fillHud.cancelActiveFill()}>Cancel</button>
  </div>
{/if}
{#if cuboidPhase === 'depth'}
  <div class="depth-slider-container" data-voxelle-no-passthrough>
    <div
      class="depth-slider-track"
      role="slider"
      aria-label="Cuboid depth"
      aria-valuemin={-256}
      aria-valuemax={256}
      aria-valuenow={cuboidDepth}
      tabindex="0"
      onpointerdown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        depthSliderPointerId = e.pointerId;
        depthSliderStartY = e.clientY;
        depthSliderStartDepth = cuboidDepth;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onpointermove={(e) => {
        e.preventDefault();
        if (depthSliderPointerId !== e.pointerId) return;
        const dy = depthSliderStartY - e.clientY;
        cuboidDepth = Math.max(-256, Math.min(256, depthSliderStartDepth + Math.round(dy / 10)));
        updateCuboidFromDepth();
      }}
      onpointerup={(e) => {
        if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
      }}
      onpointercancel={(e) => {
        if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
      }}
    >
      <div
        class="depth-slider-thumb"
        style="bottom: {Math.min(99, Math.max(1, 50 + (cuboidDepth / 512) * 98))}%"
      ></div>
    </div>
    <div class="depth-slider-controls">
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => {
          cuboidDepth = Math.max(-256, cuboidDepth - 1);
          updateCuboidFromDepth();
        }}
        aria-label="Decrease depth">−</button
      >
      <span class="depth-slider-label">Depth: {cuboidDepth}</span>
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => {
          cuboidDepth = Math.min(256, cuboidDepth + 1);
          updateCuboidFromDepth();
        }}
        aria-label="Increase depth">+</button
      >
    </div>
  </div>
  <button
    type="button"
    class="cuboid-done-btn"
    data-voxelle-no-passthrough
    onpointerdown={(e) => e.stopPropagation()}
    onclick={() => commitCuboid()}
    title="Tap Done to apply"
    aria-label="Apply cuboid selection"
  >
    Done
  </button>
{/if}
{#if cylinderPhase === 'depth'}
  <div class="depth-slider-container" data-voxelle-no-passthrough>
    <div
      class="depth-slider-track"
      role="slider"
      aria-label="Cylinder depth"
      aria-valuemin={-256}
      aria-valuemax={256}
      aria-valuenow={cylinderDepth}
      tabindex="0"
      onpointerdown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        depthSliderPointerId = e.pointerId;
        depthSliderStartY = e.clientY;
        depthSliderStartDepth = cylinderDepth;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onpointermove={(e) => {
        e.preventDefault();
        if (depthSliderPointerId !== e.pointerId) return;
        const dy = depthSliderStartY - e.clientY;
        cylinderDepth = Math.max(-256, Math.min(256, depthSliderStartDepth + Math.round(dy / 10)));
        updateCylinderFromDepth();
      }}
      onpointerup={(e) => {
        if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
      }}
      onpointercancel={(e) => {
        if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
      }}
    >
      <div
        class="depth-slider-thumb"
        style="bottom: {Math.min(99, Math.max(1, 50 + (cylinderDepth / 512) * 98))}%"
      ></div>
    </div>
    <div class="depth-slider-controls">
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => {
          cylinderDepth = Math.max(-256, cylinderDepth - 1);
          updateCylinderFromDepth();
        }}
        aria-label="Decrease depth">−</button
      >
      <span class="depth-slider-label">Depth: {cylinderDepth}</span>
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => {
          cylinderDepth = Math.min(256, cylinderDepth + 1);
          updateCylinderFromDepth();
        }}
        aria-label="Increase depth">+</button
      >
    </div>
  </div>
  <button
    type="button"
    class="cuboid-done-btn"
    data-voxelle-no-passthrough
    onpointerdown={(e) => e.stopPropagation()}
    onclick={() => commitCylinder()}
    title="Tap Done to apply"
    aria-label="Apply cylinder selection"
  >
    Done
  </button>
{/if}
{#if solidPolygonPhase === 'depth'}
  <div class="depth-slider-container" data-voxelle-no-passthrough>
    <div
      class="depth-slider-track"
      role="slider"
      aria-label="Solid Polygon depth"
      aria-valuemin={-256}
      aria-valuemax={256}
      aria-valuenow={solidPolygonDepth}
      tabindex="0"
      onpointerdown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        depthSliderPointerId = e.pointerId;
        depthSliderStartY = e.clientY;
        depthSliderStartDepth = solidPolygonDepth;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onpointermove={(e) => {
        e.preventDefault();
        if (depthSliderPointerId !== e.pointerId) return;
        const dy = depthSliderStartY - e.clientY;
        solidPolygonDepth = Math.max(-256, Math.min(256, depthSliderStartDepth + Math.round(dy / 10)));
        updateSolidPolygonFromDepth();
      }}
      onpointerup={(e) => {
        if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
      }}
      onpointercancel={(e) => {
        if (depthSliderPointerId === e.pointerId) depthSliderPointerId = null;
      }}
    >
      <div
        class="depth-slider-thumb"
        style="bottom: {Math.min(99, Math.max(1, 50 + (solidPolygonDepth / 512) * 98))}%"
      ></div>
    </div>
    <div class="depth-slider-controls">
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => {
          solidPolygonDepth = Math.max(-256, solidPolygonDepth - 1);
          updateSolidPolygonFromDepth();
        }}
        aria-label="Decrease depth">−</button
      >
      <span class="depth-slider-label">Depth: {solidPolygonDepth}</span>
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => {
          solidPolygonDepth = Math.min(256, solidPolygonDepth + 1);
          updateSolidPolygonFromDepth();
        }}
        aria-label="Increase depth">+</button
      >
    </div>
  </div>
  <button
    type="button"
    class="cuboid-done-btn"
    data-voxelle-no-passthrough
    onpointerdown={(e) => e.stopPropagation()}
    onclick={() => commitSolidPolygon()}
    title="Tap Done to apply"
    aria-label="Apply Solid Polygon"
  >
    Done
  </button>
{/if}
{#if polygonPhase === 'placing' && polygonPointCount >= 2}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitPolygon()}
      title="Fill convex hull"
      aria-label="Apply polygon"
    >
      Done
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => cancelPolygon()}
      title="Cancel"
      aria-label="Cancel polygon"
    >
      Cancel
    </button>
  </div>
{/if}
{#if wallPolygonPhase === 'placing' && wallPolygonPointCount >= 2}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitWallPolygon()}
      title="Extrude wall along the polygon outline"
      aria-label="Apply wall polygon"
    >
      Done
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => cancelWallPolygon()}
      title="Cancel"
      aria-label="Cancel wall polygon"
    >
      Cancel
    </button>
  </div>
{/if}
{#if solidPolygonPhase === 'placing' && solidPolygonPointCount >= 2}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => beginSolidPolygonDepth()}
      disabled={!solidPolygonExtrudable}
      title={solidPolygonExtrudable
        ? 'Set depth, then Done to apply'
        : 'Need at least two corners (outline projects onto the first face you clicked)'}
      aria-label="Set depth for Solid Polygon outline"
    >
      Set depth
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => cancelSolidPolygon()}
      title="Cancel"
      aria-label="Cancel Solid Polygon outline"
    >
      Cancel
    </button>
  </div>
{/if}
{#if roofPhase === 'placing' && roofHudVisible}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitRoof()}
      disabled={roofDoneDisabled}
      title={roofDoneDisabled ? 'Complete the footprint (polygon: 4+ corners; circle/square: drag on a face)' : 'Build roof'}
      aria-label="Apply roof"
    >
      Done
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => cancelRoof()}
      title="Cancel"
      aria-label="Cancel roof"
    >
      Cancel
    </button>
  </div>
{/if}
{#if $tool === 'piscina' && piscinaPhase === 'shape'}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitPiscinaFish()}
      title="Done"
      aria-label="Done"
    >
      Done
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => pickAgainPiscina()}
      title="Cancel"
      aria-label="Cancel"
    >
      Cancel
    </button>
  </div>
{/if}
{#if $tool === 'insecta' && insectaPhase === 'shape'}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitInsectaPlacement()}
      title="Place insect"
      aria-label="Place insect"
    >
      Done
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => pickAgainInsecta()}
      title="Cancel"
      aria-label="Cancel"
    >
      Cancel
    </button>
  </div>
{/if}
{#if $tool === 'fauna' && faunaPhase === 'shape'}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitFaunaPlacement()}
      title="Stamp the creature as voxels and exit pose mode"
      aria-label="Place creature"
    >
      Done
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => pickAgainFauna()}
      title="Discard pose and pick a different face"
      aria-label="Pick another face"
    >
      Cancel
    </button>
  </div>
{/if}
{#if $tool === 'squishy'}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitSquishySession()}
      disabled={!squishyHasMetaballs}
      title={squishyHasMetaballs ? 'Voxelize metaballs and apply to model' : 'Add at least one metaball'}
      aria-label="Voxelize squishy metaballs"
    >
      Done
    </button>
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => resetSquishySession()}
      title="Reset"
      aria-label="Reset squishy session"
    >
      Reset
    </button>
  </div>
{/if}
{#if $tool === 'cloth' && clothPhase === 'placing'}
  <div class="polygon-actions" data-voxelle-no-passthrough>
    {#if clothPointCount >= 3}
      <button
        type="button"
        class="polygon-done-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => finishClothPlacing()}
        title="Simulate cloth and adjust tension"
        aria-label="Finish placing cloth pins"
      >
        Done
      </button>
    {/if}
    <button
      type="button"
      class="polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => cancelCloth()}
      title="Cancel"
      aria-label="Cancel cloth"
    >
      Cancel
    </button>
  </div>
{/if}
{#if ropePhase === 'tension'}
  <div class="rope-tension-slider depth-slider-container" data-voxelle-no-passthrough>
    <div
      class="depth-slider-track"
      role="slider"
      aria-label="Rope tension"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round($ropeTension * 100)}
      tabindex="0"
      onpointerdown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ropeTensionSliderPointerId = e.pointerId;
        ropeTensionSliderStartY = e.clientY;
        ropeTensionSliderStartVal = get(ropeTension);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onpointermove={(e) => {
        e.preventDefault();
        if (ropeTensionSliderPointerId !== e.pointerId) return;
        const dy = ropeTensionSliderStartY - e.clientY;
        const delta = dy / 200;
        ropeTension.set(Math.max(0, Math.min(1, ropeTensionSliderStartVal + delta)));
      }}
      onpointerup={(e) => {
        if (ropeTensionSliderPointerId === e.pointerId) ropeTensionSliderPointerId = null;
      }}
      onpointercancel={(e) => {
        if (ropeTensionSliderPointerId === e.pointerId) ropeTensionSliderPointerId = null;
      }}
    >
      <div
        class="depth-slider-thumb"
        style="bottom: {Math.min(99, Math.max(1, $ropeTension * 98))}%"
      ></div>
    </div>
    <div class="depth-slider-controls">
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => ropeTension.set(Math.max(0, $ropeTension - 0.05))}
        aria-label="Decrease tension">−</button
      >
      <span class="depth-slider-label">Tension: {Math.round($ropeTension * 100)}%</span>
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => ropeTension.set(Math.min(1, $ropeTension + 0.05))}
        aria-label="Increase tension">+</button
      >
    </div>
  </div>
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="rope-done-btn polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitRope()}
      title="Apply rope"
      aria-label="Apply rope"
    >
      Done
    </button>
    <button
      type="button"
      class="rope-cancel-btn polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => cancelRope()}
      title="Cancel"
      aria-label="Cancel rope"
    >
      Cancel
    </button>
  </div>
{/if}
{#if clothPhase === 'tension'}
  <div class="rope-tension-slider depth-slider-container" data-voxelle-no-passthrough>
    <div
      class="depth-slider-track"
      role="slider"
      aria-label="Cloth tension"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round($clothTension * 100)}
      tabindex="0"
      onpointerdown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        clothTensionSliderPointerId = e.pointerId;
        clothTensionSliderStartY = e.clientY;
        clothTensionSliderStartVal = get(clothTension);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onpointermove={(e) => {
        e.preventDefault();
        if (clothTensionSliderPointerId !== e.pointerId) return;
        const dy = clothTensionSliderStartY - e.clientY;
        const delta = dy / 200;
        clothTension.set(Math.max(0, Math.min(1, clothTensionSliderStartVal + delta)));
      }}
      onpointerup={(e) => {
        if (clothTensionSliderPointerId === e.pointerId) clothTensionSliderPointerId = null;
      }}
      onpointercancel={(e) => {
        if (clothTensionSliderPointerId === e.pointerId) clothTensionSliderPointerId = null;
      }}
    >
      <div
        class="depth-slider-thumb"
        style="bottom: {Math.min(99, Math.max(1, $clothTension * 98))}%"
      ></div>
    </div>
    <div class="depth-slider-controls">
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => clothTension.set(Math.max(0, $clothTension - 0.05))}
        aria-label="Decrease cloth tension">−</button
      >
      <span class="depth-slider-label">Tension: {Math.round($clothTension * 100)}%</span>
      <button
        type="button"
        class="depth-btn"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => clothTension.set(Math.min(1, $clothTension + 0.05))}
        aria-label="Increase cloth tension">+</button
      >
    </div>
  </div>
  <div class="polygon-actions" data-voxelle-no-passthrough>
    <button
      type="button"
      class="rope-done-btn polygon-done-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => commitCloth()}
      title="Apply cloth"
      aria-label="Apply cloth"
    >
      Done
    </button>
    <button
      type="button"
      class="rope-cancel-btn polygon-cancel-btn"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={() => cancelCloth()}
      title="Cancel"
      aria-label="Cancel cloth"
    >
      Cancel
    </button>
  </div>
{/if}
{#if $voxellePreferences.showFpsCounter}
  <div class="fps-counter" role="status" aria-live="polite">
    {viewportHud.fpsCounterDisplayed} FPS
  </div>
{/if}
{#if viewportHud.preciseLocationHint}
  <div
    class="precise-stroke-hud"
    role="status"
    aria-live="polite"
    style="left: {viewportHud.pointerScreen.x}px; top: {viewportHud.pointerScreen.y}px;"
  >
    <div class="precise-coords-line">
      {viewportHud.formatSignedDelta(viewportHud.preciseLocationHint.x)}, {viewportHud.formatSignedDelta(
        viewportHud.preciseLocationHint.y
      )}, {viewportHud.formatSignedDelta(viewportHud.preciseLocationHint.z)}
    </div>
    {#if viewportHud.deltaDisplay && $voxellePreferences.showMovementDeltaHint}
      <div class="precise-delta-line">
        Δ {viewportHud.formatSignedDelta(viewportHud.deltaDisplay.dx)}, {viewportHud.formatSignedDelta(
          viewportHud.deltaDisplay.dy
        )}, {viewportHud.formatSignedDelta(viewportHud.deltaDisplay.dz)}
      </div>
    {/if}
  </div>
{:else if viewportHud.deltaDisplay && $voxellePreferences.showMovementDeltaHint}
  <div
    class="delta-display"
    aria-live="polite"
    style="left: {viewportHud.pointerScreen.x}px; top: {viewportHud.pointerScreen.y}px;"
  >
    Δ {viewportHud.formatSignedDelta(viewportHud.deltaDisplay.dx)}, {viewportHud.formatSignedDelta(
      viewportHud.deltaDisplay.dy
    )}, {viewportHud.formatSignedDelta(viewportHud.deltaDisplay.dz)}
  </div>
{/if}
{#if viewportHud.moveGizmoDragLabel}
  <div
    class="move-gizmo-delta-label"
    role="status"
    aria-live="polite"
    style="left: {viewportHud.moveGizmoDragLabel.x}px; top: {viewportHud.moveGizmoDragLabel.y}px;"
  >
    {viewportHud.formatSignedDelta(viewportHud.moveGizmoDragLabel.dx)}, {viewportHud.formatSignedDelta(
      viewportHud.moveGizmoDragLabel.dy
    )}, {viewportHud.formatSignedDelta(viewportHud.moveGizmoDragLabel.dz)}
  </div>
{/if}
<ToolPanel />
<SelectionCountPanel />
{#if $tool === 'fly' && viewportHud.showFlyHint}
  <div class="fly-hint" role="status" aria-live="polite">
    Click to capture · WASD move · E/Q up/down · Shift 1/8 speed · Move mouse to look
  </div>
{:else}
  {#if viewportHud.camera && viewportHud.orbitControls}
    <OrbitGizmo
      bind:this={gizmoRef}
      camera={viewportHud.camera}
      controls={viewportHud.orbitControls}
      onRender={viewportHud.render}
    />
  {/if}
  <div
    class="zoom-controls"
    data-voxelle-no-passthrough
    role="toolbar"
    aria-label="Zoom controls"
    tabindex="0"
    onpointerdown={(e) => e.stopPropagation()}
  >
    <button
      type="button"
      onclick={viewportHud.zoomOut}
      title="Zoom out"
      aria-label="Zoom out">−</button>
    <span class="zoom-percent">{viewportHud.zoomPercent}%</span>
    <button type="button" onclick={viewportHud.zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
    <button
      type="button"
      class="fit-btn"
      onclick={viewportHud.fitToView}
      title="Fit to view"
      aria-label="Fit sculpture to view">Fit</button>
    <button
      type="button"
      class="fit-btn"
      onclick={viewportHud.resetCamera}
      title="Reset camera"
      aria-label="Reset camera to default view">Reset</button>
  </div>
{/if}

<style>
  .ray-refine-progress {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    background: rgba(255, 200, 160, 0.18);
    z-index: 2;
    pointer-events: none;
    overflow: hidden;
  }

  .ray-refine-progress-fill {
    height: 100%;
    width: 100%;
    background: linear-gradient(90deg, rgba(255, 140, 40, 0.95), rgba(255, 200, 120, 0.98));
    transform-origin: left center;
    will-change: transform;
  }

  .greedy-mesh-spinner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 0.9rem;
    z-index: 10;
    pointer-events: none;
  }

  .greedy-mesh-spinner .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: greedy-mesh-spin 0.8s linear infinite;
  }

  .project-open-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(7, 10, 18, 0.82);
    z-index: 14;
    pointer-events: auto;
  }

  .project-open-loading-card {
    width: min(30rem, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem 1.1rem;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 0.55rem;
    background: rgba(0, 0, 0, 0.56);
    color: #fff;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
  }

  .project-open-loading-title {
    font-size: 1rem;
    font-weight: 700;
  }

  .project-open-loading-message {
    font-size: 0.86rem;
    opacity: 0.9;
  }

  .project-open-loading-progress {
    height: 0.52rem;
    width: 100%;
    background: rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    overflow: hidden;
  }

  .project-open-loading-progress-fill {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #58a6ff, #9ed6ff);
    transform-origin: left center;
    will-change: transform;
  }

  .project-open-loading-percent {
    font-size: 0.8rem;
    opacity: 0.86;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .fill-progress {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.7rem 0.8rem;
    min-width: 13rem;
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.4rem;
    color: #fff;
    font-size: 0.82rem;
    z-index: 12;
    pointer-events: auto;
  }

  .fill-progress-title {
    font-weight: 600;
  }

  .fill-progress-stats {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    opacity: 0.9;
  }

  .fill-cancel-btn {
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    border-radius: 0.35rem;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
  }

  .fill-cancel-btn:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  @keyframes greedy-mesh-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .cuboid-done-btn {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    color: #fff;
    font-size: 0.9rem;
    cursor: pointer;
    pointer-events: auto;
    z-index: 1;
  }

  .cuboid-done-btn:hover {
    background: rgba(0, 0, 0, 0.85);
  }

  .cuboid-done-btn:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .polygon-actions {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.5rem;
    z-index: 1;
  }

  .polygon-done-btn,
  .polygon-cancel-btn {
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    color: #fff;
    font-size: 0.9rem;
    cursor: pointer;
    pointer-events: auto;
  }

  .polygon-done-btn:hover,
  .polygon-cancel-btn:hover {
    background: rgba(0, 0, 0, 0.85);
  }

  .depth-slider-container {
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 4px;
    pointer-events: auto;
    /* Above .tool-panel (z-index 100) so depth / rope / cloth tension sliders stay usable */
    z-index: 110;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }

  .depth-slider-track {
    position: relative;
    width: 1rem;
    height: 6rem;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
  }

  .depth-slider-thumb {
    position: absolute;
    left: -2px;
    right: -2px;
    height: 0.75rem;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 2px;
    pointer-events: none;
  }

  .depth-slider-controls {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .depth-btn {
    min-width: 1.5rem;
    min-height: 1.5rem;
    padding: 0;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 3px;
    color: #fff;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  .depth-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .depth-slider-label {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
    min-width: 4rem;
    text-align: center;
  }

  .zoom-controls {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    pointer-events: auto;
    z-index: 1;
  }

  .zoom-controls button {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  .zoom-controls button:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .zoom-controls .fit-btn {
    width: auto;
    padding: 0 0.5rem;
  }

  .zoom-percent {
    min-width: 3ch;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .fly-hint {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.9);
    pointer-events: none;
  }

  .fps-counter {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.9);
    pointer-events: none;
    z-index: 1;
  }

  .delta-display {
    position: absolute;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;
    color: rgba(255, 255, 255, 0.9);
    pointer-events: none;
    z-index: 1;
  }

  .precise-stroke-hud {
    position: absolute;
    padding: 0.28rem 0.55rem;
    background: rgba(0, 0, 0, 0.62);
    border-radius: 4px;
    font-size: 0.82rem;
    font-family: monospace;
    color: rgba(230, 245, 255, 0.95);
    pointer-events: none;
    z-index: 1;
    transform: translate(10px, 10px);
    line-height: 1.35;
  }

  .precise-coords-line {
    letter-spacing: 0.02em;
  }

  .precise-delta-line {
    margin-top: 0.12rem;
    font-size: 0.8rem;
    color: rgba(180, 220, 255, 0.92);
  }

  .move-gizmo-delta-label {
    position: absolute;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.65);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;
    color: rgba(159, 216, 255, 0.95);
    pointer-events: none;
    z-index: 2;
    transform: translate(-50%, -50%);
    white-space: nowrap;
  }
</style>
