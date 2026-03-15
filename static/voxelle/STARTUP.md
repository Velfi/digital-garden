# Voxelle Overview

A 3D voxel sculpting tool. Add or remove voxels to create sculptures.

## App Layout

- **Canvas** – Main 3D view. Orbit (drag) or fly tool (WASD) to navigate. Click to sculpt.
- **Sidebar** – Tools, stroke modes, color, camera, lighting, and scene settings.
- **Menu bar** – File (open, save, share, export), Edit (undo, copy, paste), Add (shapes), Selection, Help.

## Getting Started

1. Pick a **tool**.
   - **Voxel**: Add voxels.
   - **Remove**: Remove voxels.
   - **Paint**: Paint voxels.
   - **Select**: Select voxels.
   - **Clay**: Fast but imprecise tools for sculpting.
2. Choose **stroke mode**.
   - **Line**: Draw lines (axis-aligned). Click to place single voxels.
   - **Plane**: Fill whole plane.
   - **Cuboid**: Drag to set plane, scroll for depth, click or Done to apply.
   - **Polygon**: Click to place points, Done to fill convex hull.
   - **Fill**: Click to flood-fill: Voxel (empty space), Remove/Paint (voxels), Select/SelectByColor (selection).
   - **Airbrush**: Drag to paint a soft spherical brush along the path.
   - **Wall** (Clay): Drag on a surface. Direction defaults to **Auto** (face normal). Set **Width**, **Height** (min 2), and **Lock start height** for enclosed loops.
3. Click and drag in the 3D view to sculpt.
4. **Undo**: Ctrl+Z. **Redo**: Ctrl+Shift+Z.
5. **Save** your work via File → Save .voxelle, or **Share** to get a link.
   - Your work is automatically saved to your browser's local storage. Projects stay saved until you start a new project or clear your browser's site data.

## Tips

- Use the **eyedropper** to sample colors from existing voxels.
- **Stamp** copies your selection. Select voxels, then click to place.
- **Export** to GLTF for use in other 3D apps.
