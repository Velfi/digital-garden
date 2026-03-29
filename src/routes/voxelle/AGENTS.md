# Voxelle – Agent Guidance

3D voxel sculpting tool. Sidebar Add / Remove / Paint, selection tools, selection methods (Stroke / Surface / Solid / Spray / Fill), and export to GLTF.

## Tech Stack

- Svelte 5 (`$state`, `$effect`, `$derived`; no `$:` reactive statements)
- Three.js
- SvelteKit

## Core Model

State is centered in `store/` and typically imported from `./store/index.ts`. Voxels and selection are `Map<string, Voxel>` keyed by `coordKey(x, y, z)` with values `{ color, material }`, where material is `plastic`, `metal`, `glass`, or `glow`. Use `updateVoxels` / `updateVoxelsInStroke` for edits, and call `pushUndo()` before mutating voxels or selection.

## Where To Look

- `store/core.ts`: primary tool state, draw/sculpt state, voxel updaters, selection transforms
- `store/toolRegistry.ts`: add new tool descriptors (`id`, `category`, `label`, `title`, `defaultPane`)
- `store/generators/registry.ts`: generator ids and face-click generator lists
- `store/selectionStrokeFamily.ts` + `toolPanel/DrawToolOptions.svelte`: selection method families and area-shape labels
- `VoxelCanvas.svelte` + `canvas/handlers/` + `canvas/pointerOrchestrator.ts`: pointer flow and canvas tool behavior
- `canvas/meshManager.ts` + `greedyMesh.ts`: mesh rebuild, selection overlays, and preview geometry
- `store/storage.ts`, `store/preferences.ts`, `store/voxelleFile.ts`: persistence, preferences, file I/O

## Rendering Notes

Voxelle supports WebGL and WebGPU backends (`store/preferences.ts` via `rendererBackend`). Mesh mode is shared across both backends, while ray mode is WebGPU-oriented and falls back to greedy mesh rendering on WebGL. Rendering details live in `canvas/sceneSetup.ts`, `canvas/webgpuBloom.ts`, and the `canvas/voxelRay*.ts` modules.

For new tools, rendering, meshing, and preview internals, see `CONTRIBUTING.md` in this folder.

## Tools

- Draw tab ids: `voxel` (UI label Add), `remove`, `paint`, `select`, `stamp`, `punch`
- Other common ids: `sculpt`, `fly`, `eyedropper`, `squishy`, `hand`
- Generator ids: `rope`, `cloth`, `rocks`, `grass`, `ashlar`, `roof`, `flora`, `piscina`, `insecta`, `fauna`
- Mood ids: `atmosphere`, `sunShafts`, `distanceTint`, `grain`

## Conventions

- Coords are integer voxel positions; `gridSize` is for new-grid initialization and file format metadata
- Colors are 24-bit hex in `Voxel.color`; select-by-color logic compares color only
- `FaceNormal` is `[nx, ny, nz]` with components in `-1 | 0 | 1`
- Shapes include `cube`, `orb`, `cylinder`, `hollowCube`, `plane`, `circle`, `empty`; placement rotation uses per-axis degrees
- Most brush size sliders store `0..(MAX_BRUSH_SIZE - 1)` and map to voxel radius/size internally

## Guidelines for Changes

1. Use `updateVoxels` or `updateVoxelsInStroke` for voxel changes; call `pushUndo()` before edits.
2. Keep greedy meshing logic in `greedyMesh.ts` / `greedyMeshCore.ts`.
3. Selection is `Map<string, Voxel>` like voxels; use existing selection helpers (bounds, anchor, merge/fill utilities).
4. Do not mutate per-bucket mesh internals directly; `MeshManager` owns them (`getMeshesByBucket()` for reads).
5. Run `greedyMesh.test.ts` after meshing changes.
6. Keep heavy worker logic in `*WorkerLogic.ts`; thin worker wrappers should delegate and remain easy to test.
7. For new tools/options: wire pointer behavior in canvas handlers, UI in `ToolPanel` / `toolPanel/*Options.svelte`, and registry entries in `store/toolRegistry.ts` (plus `store/generators/registry.ts` for generators).

## More Detail

- Contributor deep dive: `src/routes/voxelle/CONTRIBUTING.md`
- File format spec: `src/routes/voxelle/VOXELLE_FORMAT.md`
- User-facing sculpt/tool help: `static/voxelle/HELP.md`
