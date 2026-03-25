# Voxelle rendering pipeline

This document describes how a Voxelle session gets from application state (`Map` of voxels) to pixels on screen. The orchestration lives mainly in [`VoxelCanvas.svelte`](../VoxelCanvas.svelte); scene construction is in [`canvas/sceneSetup.ts`](../canvas/sceneSetup.ts).

## Overview

1. **Bootstrap** – Load optional share/autosave model, then create the Three.js renderer, scene, cameras, lights, and empty groups for voxels, selection, and UI overlays.
2. **State → geometry** – Voxel edits are tracked; mesh (or ray acceleration) updates run on a worker and/or GPU upload path depending on **rendering mode**.
3. **Per-frame loop** – `requestAnimationFrame` runs controls, batches pending mesh/grid/ray work, advances ray tracing if needed, and calls the display `render()` only when something changed.
4. **Primary draw** – Either rasterize the voxel meshes (and helpers) with Three.js, or composite **ray-traced** beauty/bloom textures as the scene background, then apply **selective bloom** for glow voxels when enabled.

Supported **backends**: WebGL (`THREE.WebGLRenderer`) or WebGPU (`WebGPURenderer` from `three/webgpu`), chosen from user preferences (`rendererBackend`: `auto` \| `webgpu` \| `webgl`). WebGPU is attempted when `auto` or `webgpu` and `navigator.gpu` exists; otherwise the app falls back to WebGL.

**Ray mode is WebGPU-only.** The Ray option appears in the Scene UI only when `activeRendererIsWebGPU` is true; if the renderer is WebGL, `VoxelCanvas` and `SceneSection` force `renderingMode` back to `greedy` so the app never stays in `ray` without WebGPU.

## 1. Scene setup (`createSceneSetupAsync`)

[`canvas/sceneSetup.ts`](../canvas/sceneSetup.ts) builds:

- **Renderer** – Pixel ratio respects `maxPixelRatio` when set (caps HiDPI cost). Tone mapping and output color space are configured for consistent HDR-ish lighting and sRGB output.
- **Scene graph** – `voxelGroup` holds meshed voxels; `selectionGroup` holds selection overlays; rollover/preview/add-shape/polygon/rope helper objects; `gridGroup` for surface grid lines; sky, hemisphere + directional light, optional ground.
- **Cameras** – Perspective (focal length from UI) and orthographic; one is active at a time.
- **Materials / variance by backend** – WebGL uses the `Sky` shader and wide grid lines (`LineSegments2` + `LineMaterial`). WebGPU uses a simple skydome mesh and basic line segments until equivalent features exist. Both paths share the same voxel **surface** material story (`voxelMaterial.ts`, `createVoxelSurfaceMaterial` via mesh manager).

Returned **refs** (cameras, `voxelGroup`, lights, controls, raycaster, etc.) are held by `VoxelCanvas` and passed into [`canvas/meshManager.ts`](../canvas/meshManager.ts).

## 2. Rendering modes

The store exposes `renderingMode`:

| Mode | Visible geometry | Notes |
|------|------------------|--------|
| `greedy` | Merged quads per color/material bucket | Default; Minecraft-style face culling + greedy merging; vertex AO. |
| `marchingCubes` | Same pipeline, different mesher in worker | Smoother surfaces; AO bias for glass shadows differs slightly. |
| `ray` | **No** greedy meshes in the scene for voxels | `voxelGroup` meshes are disposed. Beauty + bloom come from **CPU progressive** ray trace (`VoxelRayProgressive`) with GPU resource staging in [`canvas/voxelRayTsl.ts`](../canvas/voxelRayTsl.ts). Scene `background` is set to the beauty texture. Tools still raycast: CPU DDA in [`canvas/voxelRayDda.ts`](../canvas/voxelRayDda.ts) with a synthetic pick proxy. |

Mode switches trigger pipeline rebuilds (mesh path clears worker output; ray path invalidates GPU voxel resources).

## 3. Voxel mesh path (greedy / marching cubes)

### 3.1 Dirty tracking and batching

Edits record affected voxel keys in a global set in [`store/core.ts`](../store/core.ts). [`consumeDirtyVoxelKeys()`](../store/core.ts) snapshots and clears it when the mesh manager requests a rebuild.

`VoxelCanvas` **does not** rebuild synchronously on every keystroke. It sets flags (`pendingPipelineMesh`, `pendingPipelineGrid`, `pendingPipelineRay`) and runs [`applyPendingVoxelPipelineMutations()`](../VoxelCanvas.svelte) **once per animation frame**, then optionally `render()`. That coalesces burst edits into one worker post per frame.

### 3.2 Mesh manager and worker

[`createMeshManager`](../canvas/meshManager.ts):

- Spawns a **Web Worker** whose logic lives in [`voxelMeshWorkerLogic.ts`](../voxelMeshWorkerLogic.ts) (greedy via [`greedyMeshCore.ts`](../greedyMeshCore.ts), marching cubes via [`marchingCubesCore.ts`](../marchingCubesCore.ts)).
- **Packs** voxel data for `postMessage` using typed arrays; uses **transferable** buffers where possible ([`meshWorkerTransfer.ts`](../meshWorkerTransfer.ts)) to avoid copying large maps on the main thread.
- On worker reply, disposes old geometries, builds `THREE.BufferGeometry` per **bucket** (`color|material`), assigns `MeshPhysicalMaterial`-style materials (plastic/metal/glass/glow), handles **glass/water** depth materials for shadows, and attaches meshes under `voxelGroup`.

Buckets with the glow flag participate in **selective bloom** (userdata); non-glow meshes can be temporarily swapped to a dark material during the bloom pass.

### 3.3 Grid and selection overlays

- **Grid** – Optional surface-edge grid derived from occupied voxels ([`gridLines.ts`](../gridLines.ts)). Can rebuild fully or **patch incrementally** when the dirty key set is small (see performance doc).
- **Selection** – For modest selections, a greedy-mesh overlay + occluded pass + AABB wireframe. At [`SELECTION_OVERLAY_MESH_THRESHOLD`](../strokePreviewBounds.ts) (20 000 voxels) and above, the solid overlay uses **axis-aligned box** geometry instead of greedy surface meshing, still paired with the occluded pass and wireframe.

### 3.4 Lighting and shadows

- **Directional light** casts shadows when enabled. Shadow maps use **`autoUpdate: false`** on WebGL; the canvas **invalidates** the shadow map when voxels, light orientation, or relevant materials change ([`canvas/voxelCanvasLighting.ts`](../canvas/voxelCanvasLighting.ts) patterns referenced from `VoxelCanvas`).
- **Glass/water** use `depthWrite: false` on the beauty pass; a **custom depth material** encodes glass-aware shadow depth so slabs still participate in shadow maps. WebGPU keeps **transmitted** shadow features off to avoid light leaking through occluders.

Environment maps come from a small procedural cube map in scene setup; `scene.environment` feeds image-based lighting on PBR materials.

## 4. Ray tracing path (`ray`)

When `renderingMode === 'ray'`:

1. **`VoxelRayTsl.tick`** – On content or camera change, **rebuilds GPU voxel acceleration** ([`canvas/voxelRayGpuResources.ts`](../canvas/voxelRayGpuResources.ts) – dense 3D texture vs hash table, see [`canvas/gpuVoxelAccel.ts`](../canvas/gpuVoxelAccel.ts) budgets). Actual shading is still driven by the shared **CPU progressive** tracer for parity (`VoxelRayProgressive` in [`canvas/voxelRayProgressive.ts`](../canvas/voxelRayProgressive.ts)).
2. **Outputs** – `beautyTexture` (HDR-ish linear work) and `bloomTexture` (glow-only contribution) are `DataTexture`s updated incrementally within a **time budget** per frame.
3. **Scene composition** – The main scene renders **without** voxel meshes; `scene.background` is the beauty texture so orbit controls and non-voxel helpers still render on top. Picking uses the same voxel `Map` + DDA as the tracer.

Parameters (sun, ambient, sky, exposure, shadows) are packed each frame via [`buildVoxelRayTraceParams`](../canvas/voxelRayShared.ts).

## 5. Post-processing and bloom

Glow voxels need **selective bloom** (bloom only emissive materials, not the whole scene).

### WebGL

[`canvas/voxelCanvasBloomRender.ts`](../canvas/voxelCanvasBloomRender.ts) uses `EffectComposer`: a pass renders the scene with non-glow materials **stashed** to black, then bloom runs, then a final pass composites. Ray mode feeds the ray **bloom** texture into the same composer path so behavior matches.

### WebGPU

[`canvas/webgpuBloom.ts`](../canvas/webgpuBloom.ts) renders the scene to a **HalfFloat** render target first so `MeshPhysicalMaterial` **transmission** samples correct screen-space data (`viewportOpaqueMipTexture`). Then a second pass captures **glow-only** output; a TSL `RenderPipeline` composites beauty + bloom.

If there are **no** glow meshes, WebGPU can skip the extra targets and call `renderer.render` directly.

## 6. Primary `render()` step

In `VoxelCanvas.render()`:

1. Update selection gizmo matrices and optional HUD projection.
2. Optionally sync **glass shadow uniforms** from material presets (WebGL path).
3. Call **`renderVoxelCanvasPrimaryScene`** ([`voxelCanvasBloomRender.ts`](../canvas/voxelCanvasBloomRender.ts)) – branches on WebGPU vs WebGL, `ray` vs mesh, and glow presence.
4. Flush any **WebGPU shadow invalidation** needed after the draw.

The continuous **`animate`** loop always schedules the next frame; **`runVoxelCanvasAnimateStep`** ([`canvas/voxelCanvasAnimate.ts`](../canvas/voxelCanvasAnimate.ts)) decides whether to invoke `render()` (e.g. skip when idle in greedy mode with no dirty presentation flags).

## 7. Transmission (glass/water) in raster mode

[`transmissionPolicy.ts`](../transmissionPolicy.ts) computes an **adaptive transmission cap** from tint luminance and slab depth so thick voxels stay visible and dark colors are not crushed.

WebGL sets `renderer.transmissionResolutionScale` (see scene setup). WebGPU relies on the half-float offscreen pass for correct refraction sampling.

## 8. File map (quick reference)

| Concern | Files |
|--------|--------|
| Scene + renderer | `canvas/sceneSetup.ts` |
| Frame loop / batching | `VoxelCanvas.svelte`, `canvas/voxelCanvasAnimate.ts` |
| Meshes, grid, overlays | `canvas/meshManager.ts`, `greedyMesh.ts`, `greedyMeshCore.ts` |
| Worker | `voxelMeshWorker.ts`, `voxelMeshWorkerLogic.ts` |
| Ray trace | `canvas/voxelRayProgressive.ts`, `canvas/voxelRayTsl.ts`, `canvas/voxelRayDda.ts` |
| Bloom | `canvas/voxelCanvasBloomRender.ts`, `canvas/webgpuBloom.ts` |
| Materials | `voxelMaterial.ts` |
| State | `store/core.ts`, `store/index.ts` |

For agent-oriented upkeep, [`AGENTS.md`](../AGENTS.md) stays the source of truth for conventions and folder roles.
