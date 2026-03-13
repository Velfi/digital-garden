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

### State (`store.ts`)

Central state in writable stores. Voxels and selection are `Map<string, number>`: key = `"x,y,z"` (from `coordKey`), value = hex color. Use `coordKey(x,y,z)` / `parseCoordKey(key)` for conversions.

- `voxels`, `selection`, `gridSize`, `tool`, `color`, `strokeMode`, `planeAxis`, etc.
- Undo/redo via `history.undo()`, `history.redo()`; mutations go through `updateVoxels` or `updateVoxelsInStroke` (during drag).
- `pushUndo()` before mutating voxels or selection.

### Components

| File | Role |
|------|------|
| `+page.svelte` | Layout, global shortcuts (Ctrl+Z/Y/A) |
| `VoxelCanvas.svelte` | Three.js scene, raycasting, tools, greedy mesh, orbit/fly controls |
| `Sidebar.svelte` | Tool picker, stroke modes, color, light/sky settings, New Grid, Share |
| `AddPanel.svelte` | Add shape modal (position, rotation, shape type, size) |
| `OrbitGizmo.svelte` | View orientation widget |
| `greedyMesh.ts` | Culled meshing, vertex AO, `buildGreedyMesh()` |
| `exportGltf.ts` | Export voxels to `.glb` |

### Tools

`voxel`, `remove`, `paint`, `select`, `selectByColor`, `stamp`, `fly`, `eyedropper`. Stroke modes: `line`, `plane`, `cuboid`, `polygon`, `fill`.

### Greedy Meshing

`buildGreedyMesh(voxels, options)` returns meshes by color. Options include `enableAO` and `aoIntensity`. Only visible faces; merges coplanar quads. Uses Minecraft-style corner AO.

## Conventions

- **Coords**: Integer voxel positions. Grid centered at origin; `gridSize` defines `[-size/2, size/2)` per axis.
- **Colors**: 24-bit hex stored as `number`; `hexToInt('#ff5733')`, `intToHex(n)` for conversions.
- **Faces**: `FaceNormal` = `[nx, ny, nz]` (1, 0, or -1).
- **Shapes**: `cube`, `orb`, `cylinder`, `hollowCube`, `empty`. Rotation in quarter-turns (0–3) per axis.

## Guidelines for Changes

1. Use `updateVoxels` or `updateVoxelsInStroke` for voxel changes; call `pushUndo()` before edits.
2. Keep greedy mesh logic in `greedyMesh.ts`; VoxelCanvas consumes it.
3. Selection is `Map<string, number>` like voxels; use `getSelectionBounds`, `getSelectionAnchor`, etc.
4. Avoid touching `meshesByColor` internals except via `buildGreedyMesh`.
5. Run `greedyMesh.test.ts` after changes to meshing.
