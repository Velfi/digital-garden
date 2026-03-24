# Voxelle – Agent Guidance

3D voxel sculpting tool. Users add/remove/paint voxels, select, stamp, and export to GLTF.

## Acronyms

- **SM** – Selection Method
- **AO** – Ambient Occlusion

## Tech Stack

- **Svelte 5** – `$state`, `$effect`, `$derived` (no `$:` reactive statements)
- **Three.js** – scene, camera, raycasting, meshes, OrbitControls, PointerLockControls
- **SvelteKit** – routes, `$app/environment`

## Architecture

### State (`store/`)

Central state in writable stores. Import from `'./store/index'` (barrel at `store/index.ts`). Voxels and selection are `Map<string, Voxel>`: key = `"x,y,z"` (from `coordKey`), value = `{ color: number, material: VoxelMaterialId }` (`plastic` \| `metal` \| `glass` \| `glow`). Brush material is `voxelMaterial`; `getPaintColorResolver()` returns a full `Voxel`. Legacy bare RGB numbers normalize to plastic at I/O boundaries.

- **`store/toolRegistry.ts`** – `ToolDescriptor` (id, category, label, title, defaultPane) and `getToolDescriptor` / `listToolDescriptors`. Add an entry when introducing a new tool id; wire pointer/UI separately. **`sidebar/GeneratorPicker.svelte`** reads generator rows from `GENERATOR_TOOLS` + this registry.

- `store/core.ts` – voxels, selection, gridSize, tool, color, `voxelMaterial`, updateVoxels, updateVoxelsInStroke, `applySelectionTranslationInStroke`, `applySelectionTranslationAlongAxis`, `applySelectionRotationInStroke` (90° about selection bbox center), `selectionGizmoMode` (`move` \| `rotate`), etc. Re-exports **`store/generatorSettings.ts`** (rocks/grass/ashlar/flora/piscina/roof writables). Updaters receive **`VoxelUpdaterMap`** (`Pick<Map, 'get'|'set'|'delete'|'has'>`): with symmetry on, `set`/`delete` mirror across axes.
- `store/generators/registry.ts` – `GENERATOR_TOOLS`, `GENERATOR_FACE_CLICK_TOOLS`, `isGeneratorTool`, `isGeneratorFaceClickTool` (single source for tool panel + canvas “generator” wiring).
- `store/interactionMode.ts` – `canvasInteractionMode` derived store (`fly` \| `hand` \| `add_panel` \| `sculpt`); `shouldEnableOrbitControls(tool, gizmoSuppressed)` used by VoxelCanvas for OrbitControls.
- `store/editCommands.ts` – `commitSelectionMergeEdit`, `commitVoxelMapReplace` (thin undo-boundary helpers; prefer at feature edges).
- `store/selection.ts` – growSelection, shrinkSelection, mergeSelection, getFillSelectionAt / getFillEmptyAt plus async cancellable variants with progress (`getFillSelectionAtAsync` / `getFillEmptyAtAsync`), etc.
- `store/shapes.ts` – initShape, getShapePositionsAt
- `store/undo.ts` – pushUndo, history
- `store/url.ts` – encodeModelForUrl (delegate to voxelleFile encodeForTransport)
- `shareStorage.ts` – IndexedDB storage for localhost shares (storeShareInIndexedDB, getShareFromIndexedDB)
- `stampBookStorage.ts` – IndexedDB stamp book (`voxelle-stamp-book`): ordered stamps with voxel entries + optional PNG preview blob
- `store/stampBook.ts` – selection ↔ clipboard-shaped entries, optional **tags** (normalized lowercase), search/filter (`stampMatchesSearch`), import/export JSON (`voxelleStampLibrary: 1`); **Use** from stamp book sets `bookStampPattern` + clears edit `selection` (stamp/punch read book pattern or selection); non-empty selection clears `bookStampPattern`
- `stampBookThumbnail.ts` – offscreen WebGL greedy-mesh snapshot → PNG for stamp previews
- `api/voxelle/share` (POST) – stores model in Vercel Blob, returns short id
- `api/voxelle/model/[id]` (GET) – fetches stored model by id
- `store/clipboard.ts` – copySelection, cutSelection, pasteFromClipboard
- `store/storage.ts` – loadFromStorage (localStorage only), loadFromStorageAsync (IndexedDB + localStorage migration), saveToStorage
- `store/idbAutosave.ts` – IndexedDB snapshot for autosave (larger quota than localStorage)
- `store/preferences.ts` – `loadPreferences`, `savePreferences`, reactive `voxellePreferences` (`voxelle-preferences`: `showMovementDeltaHint`, `showDragDeltaHint`, `gizmosAlwaysOnTop`, `toneMapping`, **`rendererBackend`**: `auto` \| `webgpu` \| `webgl`)
- `toneMappingPreference.ts` – maps preference id → `THREE` tone mapping; used by `VoxelCanvas` renderer and Preferences
- `store/voxelleFile.ts` – saveToFile, loadFromFile, .voxelle format (BSON + gzip; full key names for versioning)
- `VOXELLE_FORMAT.md` – .voxelle file format specification
- Undo/redo via `history.undo()`, `history.redo()`; call `pushUndo()` before mutating voxels or selection.

### Utilities

| File                | Role                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `coordUtils.ts`     | coordKey, parseCoordKey, positionsToVoxelMap, inBounds, getSelectionBounds, getVoxelBounds, etc.              |
| `strokeGeometry.ts` | getAxisAlignedLine, getAxisAlignedPlaneFromNormal, getAxisAlignedCuboid, getPolygonVoxels                     |
| `gridLines.ts`      | buildGridPositions, CUBE_EDGES, EDGE_NEIGHBORS                                                                |
| `flyControls.ts`    | createFlyMoveState, createFlyKeyHandlers, applyFlyMovement                                                    |
| `greedyMesh.ts`     | Culled meshing, vertex AO, `buildGreedyMesh()`, `PREVIEW_MESH_OPTIONS`, `buildPreviewGeometry()`              |
| `exportGltf.ts`     | Export voxels to `.glb` (greedy mode uses same `createVoxelSurfaceMaterial`; glass exports with transmission) |

### Canvas layer (`canvas/`)

- **`canvas/sceneSetup.ts`** – Async **`createSceneSetupAsync`**: scene graph, cameras, **`VoxelleRenderer`** (`WebGLRenderer` or `WebGPURenderer` from `three/webgpu`), env map, voxel group, previews, lights, ground, grid group, controls, raycaster. Preference **`rendererBackend`** (`auto` \| `webgpu` \| `webgl`) in `store/preferences.ts`; **Auto** / **WebGPU** call `await renderer.init()` for WebGPU. **WebGL-only:** `Sky` shader, Fat Lines grid (`LineMaterial` / `LineSegments2`), `renderer.transmissionResolutionScale`, `renderer.shadowMap.autoUpdate`. **WebGPU MVP:** large back-face **sphere** skydome (`MeshBasicMaterial`) instead of `Sky`; grid uses **`LineSegments` + `LineBasicMaterial`**. **Glass:** same **`MeshPhysicalMaterial.transmission`** + **`depthWrite:false`** on WebGL and WebGPU; WebGPU scene is rasterized to a **single HalfFloat RT** before bloom so transmission’s viewport sampling stays valid (see `webgpuBloom.ts`). **Shadow maps:** `dirLight.shadow.autoUpdate` is `false`; VoxelCanvas invalidates when voxels or light/frustum change. WebGPU `renderer.shadowMap` has no `needsUpdate`; invalidation uses `dirLight.shadow.needsUpdate` only. **WebGPU** keeps **`shadowMap.transmitted`** off so glass shadows follow depth occlusion.
- **`canvas/rendererUtils.ts`** – `isWebGLRenderer` / `isWebGPURenderer` for gating **EffectComposer** (WebGL) vs **TSL `RenderPipeline`** bloom (WebGPU).
- **`canvas/webgpuBloom.ts`** – `createWebGPUBloomPipeline`: scene **`renderer.render` → single HalfFloat `RenderTarget`** (no MRT), then **`texture(sceneRT) + BloomNode`** + **`RenderPipeline`** to canvas. Offscreen pass uses **`NoToneMapping`** + working color space; final output tone-maps in the pipeline. Tunables: **`WEBGPU_BLOOM_*`** (threshold biased for glow-only–ish bloom on full HDR).
- **`canvas/meshManager.ts`** – Voxel mesh rebuild (worker), grid, selection overlay, AABB wireframe, preview mesh. **`isWebGPU`:** grid uses `LineSegments` + basic material. **Glass shadows (WebGL + WebGPU):** `MeshDepthMaterial` + vertex Z bias via `customDepthMaterial`; `syncGlassShadowUniformsFromBuckets` runs only on WebGL in VoxelCanvas `render()`. Subscribes via getOptions; exposes `requestRebuildVoxelMeshes`, `rebuildSelectionOverlay`, `buildGrid`, `updatePreviewMesh`, `destroy`, `getMeshesByBucket`.
- **`canvas/voxelRayDda.ts`**, **`canvas/voxelRayTsl.ts`**, **`canvas/voxelRayGpuResources.ts`**, **`canvas/voxelRayProgressive.ts`** – **`ray`** mode: WebGPU-only render path with GPU voxel acceleration uploads (dense `Data3DTexture` or hash table texture), plus ray shading parity with the progressive tracer (shadow rays, glass Fresnel + Beer-Lambert, glow bloom source). CPU DDA remains the picking path for tools. `VoxelCanvas` feeds ray beauty + bloom textures into the same selective bloom pipeline.
- **`canvas/previewMeshUtils.ts`** – Occluded-pass tint shared by add-shape ghost and gizmo materials; `assignSharedDualPreviewGeometry` for two meshes sharing one `BufferGeometry`.
- **`canvas/selectionGizmo.ts`** – `createSelectionGizmoController`: move/rotate handle meshes, raycast, drag preview on `selectionGroup`, **world-space centroid line** while moving a selection (original bbox center → preview center), **`getMoveDragDeltaLabel`** for integer Δx,Δy,Δz (VoxelCanvas projects the original centroid and shows a HUD label), placement updates to `addPanelStore`, commit callbacks wired from VoxelCanvas pointer-up. Rotate preview pivots all `userData.voxelleSelectionPivotChild` children (overlay meshes + bbox wireframe).
- **`canvas/handlers/`** – Pointer dispatch. `pointerHandler.ts`: overlay passthrough, `fly.ts`, optional **`generatorPointer.ts`** (RMB reseed / ashlar preview / gesture cancel via `GeneratorRmbDeps`), `handleFlyPointerUp`. Face-click placement on pointer up: `applyGeneratorFaceClickPointerUp`. **`voxelPointerCore.ts`** builds `GeneratorRmbDeps` / `GeneratorPrimaryPointerUpDeps` from bridge objects wired in VoxelCanvas. Extend `types.ts` / sidecar contexts as more tools move out of the component.
- **`canvas/pointerOrchestrator.ts`** – `runPointerDownPrelude` / `runPointerMovePrelude`: updates pointer ray then runs `pointerHandler` early dispatch (UI passthrough, fly, generator RMB). VoxelCanvas calls these before sculpt/stroke logic.
- **`canvas/toolPhaseState.ts`** – Types for cuboid/polygon/roof/rope phases and `isSegmentedStrokeGestureActive()` shared predicate.
- **`canvas/voxelCanvasInit.ts`** – Shared **`PRECISE_GUIDE_TEX_SIZE`**, `loadVoxelCanvasBootstrapModel` (URL share + storage bootstrap), `createPreciseGuidePlaneInScene`.
- **`canvas/voxelCanvasRaycast.ts`**, **`canvas/voxelCanvasLighting.ts`**, **`canvas/voxelCanvasBloomRender.ts`**, **`canvas/voxelCanvasAnimate.ts`**, **`canvas/voxelCanvasStrokeCommit.ts`** – Ray/plane helpers, lighting + shadow invalidation, primary render path, animation step, stroke/commit + generator placement (`createVoxelCanvasStrokeCommit`).

### Components

| File                              | Role                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `+page.svelte`                    | Layout, global shortcuts (Ctrl+Z/Y/A, X deletes selection)                                                                                                                                                                                                                                                                                                                                    |
| `VoxelCanvas.svelte`              | `await createSceneSetupAsync` + `createMeshManager`; render loop, orbit/fly, pointers, tools. **Bloom:** WebGL `EffectComposer`; WebGPU scene RT + **`RenderPipeline`** + `BloomNode`. **Manual test WebGPU:** Chrome/Edge → Preferences → Graphics API → Auto or WebGPU → reload. Transform gizmo / add-shape: `canvas/selectionGizmo.ts`. HUD / overlays: **`VoxelCanvasOverlays.svelte`**. |
| `VoxelCanvasOverlays.svelte`      | In-canvas HUD: ray refine, mesh spinner, fill progress, cuboid/roof/polygon/piscina/rope UI, FPS / Δ labels, `ToolPanel`, `SelectionCountPanel`, fly hint vs `OrbitGizmo` + zoom bar.                                                                                                                                                                                                         |
| `Sidebar.svelte`                  | Shell; composes sidebar panel components                                                                                                                                                                                                                                                                                                                                                      |
| `sidebar/ToolPicker.svelte`       | Tool buttons                                                                                                                                                                                                                                                                                                                                                                                  |
| `sidebar/StrokeModePicker.svelte` | Stroke mode + fill options + plane axis                                                                                                                                                                                                                                                                                                                                                       |
| `sidebar/ColorSection.svelte`     | Color picker + LospecPalette                                                                                                                                                                                                                                                                                                                                                                  |
| `sidebar/CameraSection.svelte`    | Ortho, focal length                                                                                                                                                                                                                                                                                                                                                                           |
| `sidebar/SceneSection.svelte`     | Grid, sky, background                                                                                                                                                                                                                                                                                                                                                                         |
| `sidebar/LightSection.svelte`     | Ambient, color, angle, elevation, shadows, AO                                                                                                                                                                                                                                                                                                                                                 |
| `sidebar/MaterialSection.svelte`  | Voxel material preset picker (plastic / metal / glass / glow)                                                                                                                                                                                                                                                                                                                                 |
| `sidebar/OriginSection.svelte`    | Center controls, shift inputs                                                                                                                                                                                                                                                                                                                                                                 |
| `sidebar/ShareModal.svelte`       | Share URL modal                                                                                                                                                                                                                                                                                                                                                                               |
| `sidebar/PreferencesModal.svelte` | Preferences (File menu); settings in `localStorage` via `store/preferences.ts`                                                                                                                                                                                                                                                                                                                |
| `sidebar/StampBookModal.svelte`   | Stamp book (View menu): two-page spread UI—thumbnail grid + detail/library panel; skeuomorphic styling; IndexedDB + JSON import/export                                                                                                                                                                                                                                                        |
| `MenuBar.svelte`                  | Top menus: **View** → Stamp book… (`modalRequest`); File, Edit, Add, Selection, Help                                                                                                                                                                                                                                                                                                          |
| `sidebar/NewGridModal.svelte`     | New grid size/shape modal                                                                                                                                                                                                                                                                                                                                                                     |
| `ToolPanel.svelte`                | Shell; shows `toolPanel/SelectionGizmoTabs` when a selection exists or Add panel is open; plus `DrawToolOptions`, `ClayToolOptions`, etc. by tool/pane.                                                                                                                                                                                                                                       |
| `toolPanel/toolVisibility.ts`     | Shared predicates for draw/stamp/clay/generator tool-panel visibility (`toolPanelShellVisible`, etc.).                                                                                                                                                                                                                                                                                        |
| `toolPanel/*Options.svelte`       | Per-tool options; **`GeneratorToolOptions.svelte`** composes `RocksOptions`, `GrassOptions`, `AshlarOptions`, `FloraOptions`, `PiscinaOptions`, `RoofOptions`.                                                                                                                                                                                                                                |
| `AddPanel.svelte`                 | Add shape modal: ghost preview in scene; Done runs `addShapeAt`; position/rotation/size fields + canvas gizmo / wheel shortcuts                                                                                                                                                                                                                                                               |
| `OrbitGizmo.svelte`               | View orientation widget                                                                                                                                                                                                                                                                                                                                                                       |

### Tools

`voxel`, `remove`, `paint`, `select`, `selectByColor`, `stamp`, `punch`, `fly`, `eyedropper`, `clay`. Generators: `rocks`, `grass`, `ashlar`, `flora` (click to place on a face; procedural stems/trunks with optional multi-stem cluster, branches, braid strands, taper, bark jitter; presets + sliders in tool panel; RMB reseed like grass), `piscina` (fish: `store/generators/piscina/` — species-specific **outline** curves, shared **pipeline** that samples a curvable spine, builds a moving body frame, thickens elliptical cross-sections, then places orientable fins; species set is Bass/Trout/Goldfish/Tuna/Eel; voxel budget `computePiscinaVoxelCap` scales with body size up to `PISCINA_VOXEL_CAP_MAX`; hover preview in pick phase, click face → shape phase, then use tool-panel sliders (body, placement, fins, spine); `Place fish` / Enter to commit; RMB reseed), `roof` (4+ coplanar corners, then Done; styles include flat, flat+parapet, pyramid, cone, shed, saltbox, gable, hip, barrel vault, mansard, gambrel, Dutch gable). Stroke modes: `line`, `plane`, `circle`, `precise`, `cuboid`, `polygon`, `fill`, `airbrush`. Clay modes: `bulk`, `smooth`, `level`, `gouge`, `branch`, `melt`, `rope`, `wall`, `inflate` (e.g. bulk = Blender Snake Hook–style pull from surface; use Draw + airbrush for scattered spheres along path).

### Greedy Meshing

`buildGreedyMesh(voxels, options)` returns `Map<bucketKey, BufferGeometry>` where `bucketKey` is `color|material`. Options: `aoEnabled` (deprecated), `aoStrength` (0/1/2), `skipMerge`. Only visible faces; merges coplanar quads within a bucket. Uses Minecraft-style corner AO. Use `PREVIEW_MESH_OPTIONS` or `buildPreviewGeometry(positions, voxel)` for preview/overlay meshes.

### Piscina (fish)

- **Pipeline** – `store/generators/piscina/pipeline.ts` fills superellipse cross-sections along the spine; species profiles in `species/outlines.ts`. **Snout** uses `applySnoutTaper()` on the outline at low `t` so the rostrum narrows instead of a flat frontal “wall”; **along‑T** bridging (extra samples along the tangent to plug holes) is **skipped** for the first few nose stations so those layers don’t stack into a blunt face.
- **Eyes** – **not** voxel geometry. The placed fish uses one material like the rest of the body. **Fish radar** (`toolPanel/PiscinaRadarPanel.svelte`) draws a 2D decorative eye on the **radar silhouette** only (~12% along nose→tail on the profile), not in the 3D scene.

## Conventions

- **Coords**: Integer voxel positions. Placement is unbounded; selection/fill/clay use content-derived bounds (getEffectiveBounds). `gridSize` is used for New Grid initial shape and file format only.
- **Colors**: 24-bit hex in `Voxel.color`; `hexToInt('#ff5733')`, `intToHex(n)` for conversions. Select-by-color / flood fill with `respectsColor` compare **color only** (`sameVoxelColor`).
- **Faces**: `FaceNormal` = `[nx, ny, nz]` (1, 0, or -1).
- **Shapes**: `cube`, `orb`, `cylinder`, `hollowCube`, `plane`, `circle`, `empty`. Rotation in quarter-turns (0–3) per axis.
- **Brush size indices**: Most UI size sliders store `0..(MAX_BRUSH_SIZE-1)` and map to `1..MAX_BRUSH_SIZE` voxels (default 25) via radius `index * 0.5`.

## Guidelines for Changes

1. Use `updateVoxels` or `updateVoxelsInStroke` for voxel changes; call `pushUndo()` before edits.
2. Keep greedy mesh logic in `greedyMesh.ts`; VoxelCanvas consumes it.
3. Selection is `Map<string, Voxel>` like voxels (values often mirror tint for recolor); use `getSelectionBounds`, `getSelectionAnchor`, etc.
4. Avoid touching per-bucket mesh map internals; MeshManager owns them and exposes `getMeshesByBucket()`.
5. Run `greedyMesh.test.ts` after changes to meshing.
6. **Workers**: Heavy logic lives in `*WorkerLogic.ts` (unit-tested). Thin `*.worker.ts` / `*Worker.ts` files call `attach*Worker(self)` from `*Worker.bind.ts`; `webWorkerBindings.test.ts` mocks `self` to assert `postMessage` payloads and transfer lists (Node has no `Worker` global).
7. **New tools / options**: Add pointer handling in VoxelCanvas (or `canvas/handlers/`); add UI in ToolPanel (or `toolPanel/*Options.svelte`). Register procedural tools in `store/generators/registry.ts` if they belong with generators. Tool/stroke-mode lists (e.g. `DRAW_TOOLS_USING_STROKE_MODE`) are defined once in `store/core.ts` and imported elsewhere.
