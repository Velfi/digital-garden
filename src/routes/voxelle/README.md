# Voxelle

A 3D voxel sculpting tool that runs in the browser. Use **Add**, **Remove**, and **Paint**; selection method categories (**Stroke**, **Surface**, **Solid**, **Spray**, **Fill**); stamps and clay-style tools; export to GLTF or save/load `.voxelle` files.

## What it does

- **Sculpt** – Draw, erase, fill, paint. Draw tab: **Add** (place voxels), Remove, Paint, Select, Stamp, Punch; clay, eyedropper, fly elsewhere.
- **Selection method** – Sidebar: **Stroke**, **Surface**, **Solid**, **Spray**, **Fill**. Floating panel sets **Area shape** (e.g. Line, Plane, Cube, Cylinder, Polygon) and **Brush shape** (Cube, Sphere, Pyramid stamp). **Spray** = soft stroke along path; **Fill** = flood.
- **Clay modes** – Bulk, smooth, level, gouge, branch, melt, rope, wall, inflate.
- **Scene** – Configurable grid, lighting, camera (orbit/fly), materials. Undo/redo, copy/paste, selection grow/shrink.
- **Persistence** – Auto-save to browser storage; save/load `.voxelle` (gzipped BSON); share via URL; export to GLB.

## Structure

| Area                                                   | Purpose                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `+page.svelte`                                         | App shell, global shortcuts                                                              |
| `VoxelCanvas.svelte`                                   | Three.js scene, raycasting, greedy-mesh rendering, orbit/fly controls                    |
| `Sidebar.svelte` + `sidebar/*`                         | Tool / Selection picker, selection method, color, camera, lights, scene, modals                           |
| `store/`                                               | Central state: voxels, selection, tool, undo, clipboard, storage, `.voxelle` I/O, import |
| `greedyMesh*.ts`                                       | Culled meshing (only visible faces, merged quads); optional worker                       |
| `coordUtils.ts`, `strokeGeometry.ts`, `flyControls.ts` | Coords, stroke shapes, fly movement                                                      |
| `exportGltf.ts`                                        | Voxels → GLB                                                                             |
| `VOXELLE_FORMAT.md`                                    | `.voxelle` file format                                                                   |

Tech: Svelte 5, SvelteKit, Three.js. See `AGENTS.md` for conventions and implementation notes.

## Try it

[https://zeldas.page/voxelle](https://zeldas.page/voxelle)
