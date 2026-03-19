# Voxelle

A 3D voxel sculpting tool that runs in the browser. Add, remove, and paint voxels; use brushes, shapes, stamps, and clay-style tools; then export to GLTF or save/load `.voxelle` files.

## What it does

- **Sculpt** – Draw, erase, fill, paint. Tools: voxel, remove, paint, select, stamp, clay, eyedropper, fly camera.
- **Stroke modes** – Line, plane, cuboid, polygon, fill, airbrush (scattered spheres along path).
- **Clay modes** – Bulk, smooth, level, gouge, branch, melt, rope, wall, inflate.
- **Scene** – Configurable grid, lighting, camera (orbit/fly), materials. Undo/redo, copy/paste, selection grow/shrink.
- **Persistence** – Auto-save to browser storage; save/load `.voxelle` (gzipped BSON); share via URL; export to GLB.

## Structure

| Area | Purpose |
|------|--------|
| `+page.svelte` | App shell, global shortcuts |
| `VoxelCanvas.svelte` | Three.js scene, raycasting, greedy-mesh rendering, orbit/fly controls |
| `Sidebar.svelte` + `sidebar/*` | Tool picker, stroke mode, color, camera, lights, scene, modals |
| `store/` | Central state: voxels, selection, tool, undo, clipboard, storage, `.voxelle` I/O, import |
| `greedyMesh*.ts` | Culled meshing (only visible faces, merged quads); optional worker |
| `coordUtils.ts`, `strokeGeometry.ts`, `flyControls.ts` | Coords, stroke shapes, fly movement |
| `exportGltf.ts` | Voxels → GLB |
| `VOXELLE_FORMAT.md` | `.voxelle` file format |

Tech: Svelte 5, SvelteKit, Three.js. See `AGENTS.md` for conventions and implementation notes.

## Try it

[https://zeldas.page/voxelle](https://zeldas.page/voxelle)
