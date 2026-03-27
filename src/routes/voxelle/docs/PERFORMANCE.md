# Voxelle performance optimizations

This document lists the main **performance-oriented mechanisms** in Voxelle, what problem each addresses, and where it lives in code. It pairs with [`RENDERING.md`](./RENDERING.md).

## Frame scheduling and redraw policy

**Problem** – Editing can fire many store updates per second; redrawing and meshing on every event wastes CPU/GPU.

**What we do**

- **Coalesced pipeline** – `VoxelCanvas` queues `mesh` / `grid` / `ray` invalidations and runs [`applyPendingVoxelPipelineMutations`](../VoxelCanvas.svelte) **once per `requestAnimationFrame`**, collapsing bursts into a single rebuild request per frame where possible.
- **Conditional `render()`** – [`runVoxelCanvasAnimateStep`](../canvas/voxelCanvasAnimate.ts) calls `render()` when:
  - `renderingMode === 'ray'` (progressive trace needs steady updates),
  - Orbit/fly controls moved the camera,
  - A tool gesture is active (drag, gizmo, cuboid/polygon/roof/rope phases),
  - Fly mode is enabled,
  - A pipeline mutation ran that frame, or
  - **Presentation** changed (lights, tone mapping, AO, etc.) via `markCanvasDirty()` / `canvasPresentationDirty`.

**Why** – Keeps idle greedy/marching views from burning GPU; keeps interaction smooth by always drawing when the user is moving the camera or sculpting.

## Main-thread offload: mesh worker + transferables

**Problem** – Greedy/marching meshing is O(voxels) in the edited region and blocks the UI if run synchronously on the main thread.

**What we do**

- Heavy work runs in [`voxelMeshWorkerLogic.ts`](../voxelMeshWorkerLogic.ts) behind [`voxelMeshWorker.ts`](../voxelMeshWorker.ts).
- [`meshWorkerTransfer.ts`](../meshWorkerTransfer.ts) packs voxels into **typed arrays** and uses **`postMessage(..., transfer)`** so large buffers are moved, not copied.

**Why** – Sculpting stays responsive; main thread only merges worker results into `BufferGeometry` and updates Three.js objects.

## Adaptive mesh rebuild strategy

**Problem** – Full-scene meshing on every small stroke is wasteful for large models; full uploads are still needed when incremental assumptions fail.

**What we do** ([`canvas/meshManager.ts`](../canvas/meshManager.ts))

| Mechanism                     | Threshold / rule                                                      | Purpose                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Spatial chunking**          | `v.size >= 50_000` → `chunkSize = 32`                                 | Splits work for the worker; enables dirty-chunk messaging.                                                                      |
| **Incremental dirty rebuild** | Chunking on, `dirtyKeys` non-empty, `dirtyKeys.size <= 2048`          | Sends only **dirty + halo** chunks ([`packSparseChunksForWorker`](../meshWorkerTransfer.ts)) so small edits touch fewer voxels. |
| **Transmissive fallback**     | If sparse pack has **≥ 256** transmissive voxels in the packed region | **Full** voxel pack to avoid wrong glass/water AO/neighbor behavior across chunk boundaries.                                    |
| **Large rebuild defer**       | `v.size >= 150_000` and **not** incremental                           | `requestAnimationFrame` before `postMessage` gives the browser a breath frame before heavy transfer/worker start.               |

**Note:** `chunkSize` is **32** only when `v.size >= 50_000`; otherwise it is **0** and the incremental dirty-chunk path is never used—each rebuild sends a **full** voxel pack. The table’s “chunking / incremental” rows apply only to large models.

**Why** – Scales edits on large projects; avoids incorrect thin-glass meshes when only sending a subset of voxels.

## UI feedback without blocking

**Problem** – Long rebuilds feel frozen without feedback; showing a spinner on every tiny edit is noisy.

**What we do**

- `onLoadingChange(true)` immediately; spinner via `onSpinnerChange` only after **`SPINNER_DELAY_MS` (2000 ms)** in mesh manager.

**Why** – Fast builds never flash the spinner; slow builds get a clear “working” state.

## Pixel ratio cap

**Problem** – `devicePixelRatio` of 2–3 multiplies fragment load and transmission RT size.

**What we do**

- User preference **`maxPixelRatio`** in [`store/preferences.ts`](../store/preferences.ts); applied in renderer setup and resize.

**Why** – Lets users trade sharpness for FPS on high-DPI displays.

## Ray mode: time budget, resolution cap, DPR

**Problems**

- Full-screen CPU ray trace every frame is expensive.
- High DPR multiplies pixel count.

**What we do** ([`canvas/voxelRayProgressive.ts`](../canvas/voxelRayProgressive.ts), [`canvas/voxelRayTsl.ts`](../canvas/voxelRayTsl.ts))

- **`DEFAULT_RAY_TICK_BUDGET_MS` (12 ms)** per `tick()` – progressive refinement yields partial frames and continues next frame.
- **`RAY_TRACE_MAX_BUFFER_DIM` (1920)** – internal trace buffer is clamped so cost does not grow unbounded with monitor width.
- **`rayDpr = Math.min(dpr, 1)`** in `VoxelRayTsl.tick` – ray buffer uses at most 1× pixel density for stability.

**Why** – Keeps ray mode interactive; refinement progress can surface in the UI.

## GPU voxel acceleration memory budgets

**Problem** – Dense 3D textures for the whole model can exceed GPU/RAM limits.

**What we do** ([`canvas/gpuVoxelAccel.ts`](../canvas/gpuVoxelAccel.ts))

- **`DENSE_CELL_BUDGET`** – max cells for dense 3D texture path.
- **`MAX_HASH_SLOTS`** – cap for open-addressed hash table upload when dense is too large.

**Why** – Chooses **dense vs hash** representation so ray prep stays within predictable memory while supporting large sparse models.

## Grid incremental updates

**Problem** – Recomputing every surface grid edge for huge models on each edit is costly.

**What we do** – When dirty keys exist and `dirty.size <= 256` and prior grid state exists, [`buildGrid`](../canvas/meshManager.ts) **patches** `gridEdgeSegments` around a neighborhood of dirty voxels instead of full rebuild.

**Why** – Small brush strokes avoid O(all voxels × edges) grid work.

## Selection and preview simplification

**Problem** – Greedy-meshing tens of thousands of selection voxels for overlay geometry is slow.

**What we do**

- **`SELECTION_OVERLAY_MESH_THRESHOLD`** ([`strokePreviewBounds.ts`](../strokePreviewBounds.ts)) – above ~20k selected voxels, use **AABB box** + wireframe instead of per-voxel greedy overlay.
- **`PREVIEW_BBOX_VOXEL_THRESHOLD`** – large stroke previews use analytic bounds / bbox paths instead of enumerating voxels.
- **[`previewMeshLod.ts`](../previewMeshLod.ts)** – downsample preview positions to a coarse grid (`computePreviewLodStride`) so ghost meshes stay cheap (Add panel and **large stroke** previews in `VoxelCanvas` / `meshManager.updatePreviewMeshLod`). Idle refinement swaps in full-resolution greedy mesh when the main thread is idle; placement commit still uses the full voxel list.
- **Spray** (selection method; `strokeMode` `spray`) – `expandPathWithBrushStamps` (sphere / cube / pyramid) merges each stamp into a shared set without allocating intermediate shape arrays; when scatter is 0 and radius range is off, the canvas **incrementally** extends that union along the stroke each move instead of rebuilding from scratch.

**Why** – Gizmos and previews stay fluid on large selections and fat brushes.

## Shadows: manual invalidation

**Problem** – Updating shadow maps every frame is expensive; voxel edits are discrete.

**What we do**

- WebGL: `shadowMap.autoUpdate = false`; canvas **invalidates** directional shadow maps when meshes, light, or glass uniforms change.
- WebGPU: similar **explicit** invalidation patterns (see [`AGENTS.md`](../AGENTS.md) / `voxelCanvasLighting` usage).

**Why** – Orbit-only movement can skip shadow re-render until needed; edits trigger one update.

## WebGPU-specific choices

**Problems** – Transmission + post-processing + shadow sampling interact badly at half-float; some shadow features mis-occlude glass.

**What we do** ([`canvas/sceneSetup.ts`](../canvas/sceneSetup.ts), [`canvas/webgpuBloom.ts`](../canvas/webgpuBloom.ts))

- **`BasicShadowMap`** – avoids PCF/sampler issues with half-float beauty targets.
- **`shadowMap.transmitted` disabled** – prevents “punch-through” on occluders with transmitted materials.
- **Scene → HalfFloat RT before bloom** – correct screen-space sampling for `transmission`.

**Why** – Stable visuals and performance on WebGPU without forcing full-scene bloom every frame (glow-only path when no emissive meshes).

## Observability

**Opt-in console timings**

- Set `localStorage.setItem('voxellePerf', '1')` and reload – [`canvas/voxellePerf.ts`](../canvas/voxellePerf.ts) logs phases like mesh pack, worker completion, grid rebuild, ray GPU resource rebuild.

**Edit latency metrics**

- [`store/projectPerf.ts`](../store/projectPerf.ts) (`projectPerfMetrics`) — surfaced in **Project stats** ([`sidebar/ProjectStatsModal.svelte`](../sidebar/ProjectStatsModal.svelte)).

## Ray mode skipping greedy mesh work

**Problem** – Building greedy meshes when the user only wants ray view wastes worker time and memory.

**What we do** – In [`requestRebuildVoxelMeshes`](../canvas/meshManager.ts), if `renderingMode === 'ray'`, the manager **disposes voxel meshes**, skips worker work, and triggers a quick `render` path.

**Why** – Ray mode uses the voxel `Map` + trace textures, not triangle soup for the volume.

---

When adding features, prefer extending these existing patterns (dirty sets, chunked worker input, explicit invalidate flags) instead of introducing new full-frame work without a guard.
