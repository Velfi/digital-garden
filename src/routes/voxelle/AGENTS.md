# Voxelle – Agent Guidance

3D voxel sculpting tool. Users add/remove/paint voxels, select, stamp, and export to GLTF.

## Acronyms

- **SM** – Selection Method
- **AO** – Ambient Occlusion
-

## Tech Stack

- **Svelte 5** – `$state`, `$effect`, `$derived` (no `$:` reactive statements)
- **Three.js** – scene, camera, raycasting, meshes, OrbitControls, PointerLockControls
- **SvelteKit** – routes, `$app/environment`

## Architecture

### State (`store/`)

Central state in writable stores. Import from `'./store/index'` (barrel at `store/index.ts`). Voxels and selection are `Map<string, number>`: key = `"x,y,z"` (from `coordKey`), value = hex color.

- `store/core.ts` – voxels, selection, gridSize, tool, color, updateVoxels, updateVoxelsInStroke, etc.
- `store/selection.ts` – growSelection, shrinkSelection, mergeSelection, getFillSelectionAt, etc.
- `store/shapes.ts` – initShape, getShapePositionsAt
- `store/undo.ts` – pushUndo, history
- `store/url.ts` – encodeModelForUrl (delegate to voxelleFile encodeForTransport)
- `shareStorage.ts` – IndexedDB storage for localhost shares (storeShareInIndexedDB, getShareFromIndexedDB)
- `api/voxelle/share` (POST) – stores model in Vercel Blob, returns short id
- `api/voxelle/model/[id]` (GET) – fetches stored model by id
- `store/clipboard.ts` – copySelection, cutSelection, pasteFromClipboard
- `store/storage.ts` – loadFromStorage, saveToStorage
- `store/voxelleFile.ts` – saveToFile, loadFromFile, .voxelle format (BSON + gzip; full key names for versioning)
- `VOXELLE_FORMAT.md` – .voxelle file format specification
- Undo/redo via `history.undo()`, `history.redo()`; call `pushUndo()` before mutating voxels or selection.

### Utilities

| File                | Role                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `coordUtils.ts`     | coordKey, parseCoordKey, positionsToVoxelMap, inBounds, getSelectionBounds, getVoxelBounds, etc. |
| `strokeGeometry.ts` | getAxisAlignedLine, getAxisAlignedPlaneFromNormal, getAxisAlignedCuboid, getPolygonVoxels        |
| `gridLines.ts`      | buildGridPositions, CUBE_EDGES, EDGE_NEIGHBORS                                                   |
| `flyControls.ts`    | createFlyMoveState, createFlyKeyHandlers, applyFlyMovement                                       |
| `greedyMesh.ts`     | Culled meshing, vertex AO, `buildGreedyMesh()`, `PREVIEW_MESH_OPTIONS`, `buildPreviewGeometry()` |
| `exportGltf.ts`     | Export voxels to `.glb`                                                                          |

### Canvas layer (`canvas/`)

- **`canvas/sceneSetup.ts`** – Creates the Three.js scene graph: scene, perspective/orthographic cameras, renderer, env map, voxel group, rollover mesh, preview/add-preview meshes, polygon/rope point meshes, lights (hemisphere, directional), sky, ground plane, grid group, orbit/fly controls, raycaster, pointer. No tool or pointer logic. Used by VoxelCanvas onMount and by MeshManager.
- **`canvas/meshManager.ts`** – Manages voxel mesh rebuild (worker), grid geometry, selection overlay, and preview mesh geometry. Subscribes to store via getOptions callback; exposes `requestRebuildVoxelMeshes`, `rebuildSelectionOverlay`, `buildGrid`, `updatePreviewMesh`, `destroy`, `getMeshesByColor`. No tool or pointer logic.
- **`canvas/handlers/`** – Pointer event handling by tool. `pointerHandler.ts` dispatches to per-tool handlers (e.g. `fly.ts`). VoxelCanvas calls `handlePointerDown` / `handlePointerMove` with a context; more tools can be moved here by extending `PointerHandlerContext` in `types.ts` and adding handlers.

### Components

| File                              | Role                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `+page.svelte`                    | Layout, global shortcuts (Ctrl+Z/Y/A)                              |
| `VoxelCanvas.svelte`              | Composes scene via `createSceneSetup`, mesh via `createMeshManager`; owns render loop, orbit/fly, pointer events, and all tool/pointer logic (draw, clay, selection, stamp, generators). Delegates mesh rebuild/grid/selection/preview to MeshManager. |
| `Sidebar.svelte`                  | Shell; composes sidebar panel components                           |
| `sidebar/ToolPicker.svelte`       | Tool buttons                                                       |
| `sidebar/StrokeModePicker.svelte` | Stroke mode + fill options + plane axis                            |
| `sidebar/ColorSection.svelte`     | Color picker + LospecPalette                                       |
| `sidebar/CameraSection.svelte`    | Ortho, focal length                                                |
| `sidebar/SceneSection.svelte`     | Grid, sky, background                                              |
| `sidebar/LightSection.svelte`     | Ambient, color, angle, elevation, shadows, AO                      |
| `sidebar/MaterialSection.svelte`  | PBR (roughness, metalness, env)                                    |
| `sidebar/OriginSection.svelte`    | Center controls, shift inputs                                      |
| `sidebar/ShareModal.svelte`       | Share URL modal                                                    |
| `sidebar/NewGridModal.svelte`     | New grid size/shape modal                                          |
| `ToolPanel.svelte`                | Shell; shows one of `toolPanel/DrawToolOptions`, `ClayToolOptions`, `StampToolOptions`, `GeneratorToolOptions` by tool/pane. |
| `AddPanel.svelte`                 | Add shape modal (position, rotation, shape type, size)             |
| `OrbitGizmo.svelte`               | View orientation widget                                            |

### Tools

`voxel`, `remove`, `paint`, `select`, `selectByColor`, `stamp`, `fly`, `eyedropper`, `clay`. Stroke modes: `line`, `plane`, `cuboid`, `polygon`, `fill`, `airbrush`. Clay modes: `bulk`, `smooth`, `level`, `gouge`, `branch`, `melt`, `rope`, `wall`, `inflate` (e.g. bulk = Blender Snake Hook–style pull from surface; use Draw + airbrush for scattered spheres along path).

### Greedy Meshing

`buildGreedyMesh(voxels, options)` returns meshes by color. Options: `aoEnabled` (deprecated), `aoStrength` (0/1/2), `skipMerge`. Only visible faces; merges coplanar quads. Uses Minecraft-style corner AO. Use `PREVIEW_MESH_OPTIONS` or `buildPreviewGeometry(positions, color)` for preview/overlay meshes.

## Conventions

- **Coords**: Integer voxel positions. Placement is unbounded; selection/fill/clay use content-derived bounds (getEffectiveBounds). `gridSize` is used for New Grid initial shape and file format only.
- **Colors**: 24-bit hex stored as `number`; `hexToInt('#ff5733')`, `intToHex(n)` for conversions.
- **Faces**: `FaceNormal` = `[nx, ny, nz]` (1, 0, or -1).
- **Shapes**: `cube`, `orb`, `cylinder`, `hollowCube`, `plane`, `circle`, `empty`. Rotation in quarter-turns (0–3) per axis.
- **Brush size indices**: Most UI size sliders store `0..(MAX_BRUSH_SIZE-1)` and map to `1..MAX_BRUSH_SIZE` voxels (default 25) via radius `index * 0.5`.

## Guidelines for Changes

1. Use `updateVoxels` or `updateVoxelsInStroke` for voxel changes; call `pushUndo()` before edits.
2. Keep greedy mesh logic in `greedyMesh.ts`; VoxelCanvas consumes it.
3. Selection is `Map<string, number>` like voxels; use `getSelectionBounds`, `getSelectionAnchor`, etc.
4. Avoid touching `meshesByColor` internals; MeshManager owns them and exposes `getMeshesByColor()`.
5. Run `greedyMesh.test.ts` after changes to meshing.
6. **Workers**: Heavy logic lives in `*WorkerLogic.ts` (unit-tested). Thin `*.worker.ts` / `*Worker.ts` files call `attach*Worker(self)` from `*Worker.bind.ts`; `webWorkerBindings.test.ts` mocks `self` to assert `postMessage` payloads and transfer lists (Node has no `Worker` global).
7. **New tools / options**: Add pointer handling in VoxelCanvas (or future `canvas/handlers/`); add UI in ToolPanel (or `toolPanel/*Options.svelte`). Tool/stroke-mode lists (e.g. `DRAW_TOOLS_USING_STROKE_MODE`) are defined once in `store/core.ts` and imported elsewhere.
