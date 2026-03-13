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

Central state in writable stores. Import from `'./store'` (resolves to `store/index.ts`). Voxels and selection are `Map<string, number>`: key = `"x,y,z"` (from `coordKey`), value = hex color.

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

| File | Role |
|------|------|
| `coordUtils.ts` | coordKey, parseCoordKey, inBounds, getSelectionBounds, getVoxelBounds, etc. |
| `strokeGeometry.ts` | getAxisAlignedLine, getAxisAlignedPlaneFromNormal, getAxisAlignedCuboid, getPolygonVoxels |
| `gridLines.ts` | buildGridPositions, CUBE_EDGES, EDGE_NEIGHBORS |
| `flyControls.ts` | createFlyMoveState, createFlyKeyHandlers, applyFlyMovement |
| `greedyMesh.ts` | Culled meshing, vertex AO, `buildGreedyMesh()` |
| `exportGltf.ts` | Export voxels to `.glb` |

### Components

| File | Role |
|------|------|
| `+page.svelte` | Layout, global shortcuts (Ctrl+Z/Y/A) |
| `VoxelCanvas.svelte` | Three.js scene, raycasting, tools, greedy mesh, orbit/fly controls |
| `Sidebar.svelte` | Shell; composes sidebar panel components |
| `sidebar/ToolPicker.svelte` | Tool buttons |
| `sidebar/StrokeModePicker.svelte` | Stroke mode + fill options + plane axis |
| `sidebar/ColorSection.svelte` | Color picker + LospecPalette |
| `sidebar/CameraSection.svelte` | Ortho, focal length |
| `sidebar/SceneSection.svelte` | Grid, sky, background |
| `sidebar/LightSection.svelte` | Ambient, color, angle, elevation, shadows, AO |
| `sidebar/MaterialSection.svelte` | PBR (roughness, metalness, env) |
| `sidebar/OriginSection.svelte` | Center controls, shift inputs |
| `sidebar/ShareModal.svelte` | Share URL modal |
| `sidebar/NewGridModal.svelte` | New grid size/shape modal |
| `AddPanel.svelte` | Add shape modal (position, rotation, shape type, size) |
| `OrbitGizmo.svelte` | View orientation widget |

### Tools

`voxel`, `remove`, `paint`, `select`, `selectByColor`, `stamp`, `fly`, `eyedropper`. Stroke modes: `line`, `plane`, `cuboid`, `polygon`, `fill`.

### Greedy Meshing

`buildGreedyMesh(voxels, options)` returns meshes by color. Options include `enableAO` and `aoIntensity`. Only visible faces; merges coplanar quads. Uses Minecraft-style corner AO.

## Conventions

- **Coords**: Integer voxel positions. Grid centered at origin; `gridSize` defines `[-size/2, size/2)` per axis.
- **Colors**: 24-bit hex stored as `number`; `hexToInt('#ff5733')`, `intToHex(n)` for conversions.
- **Faces**: `FaceNormal` = `[nx, ny, nz]` (1, 0, or -1).
- **Shapes**: `cube`, `orb`, `cylinder`, `hollowCube`, `plane`, `empty`. Rotation in quarter-turns (0–3) per axis.

## Guidelines for Changes

1. Use `updateVoxels` or `updateVoxelsInStroke` for voxel changes; call `pushUndo()` before edits.
2. Keep greedy mesh logic in `greedyMesh.ts`; VoxelCanvas consumes it.
3. Selection is `Map<string, number>` like voxels; use `getSelectionBounds`, `getSelectionAnchor`, etc.
4. Avoid touching `meshesByColor` internals except via `buildGreedyMesh`.
5. Run `greedyMesh.test.ts` after changes to meshing.
