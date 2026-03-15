# Voxelle

<img src="/voxelle/VoxelleTitle.png" alt="Voxelle" width="100%" height="auto">

A 3D voxel sculpting tool. Add or remove voxels to create sculptures.

## App Layout

- **Canvas** – Main 3D view. Orbit (drag) or fly tool (WASD) to navigate. Click to sculpt.
- **Sidebar** – Tools, stroke modes, color, camera, lighting, and scene settings.
- **Menu bar** – File, Edit, Add, Selection, Help.

---

## Tools

Voxelle offers three Categories of tools:

- **Draw** – precise tools (voxel, remove, paint, etc.) with stroke modes.
- **Clay** – fast sculpting modes for blocking in forms.
- **Fly** – first-person camera navigation.

### Draw tools

- **Voxel** – Add voxels with the current color.
- **Remove** – Delete voxels.
- **Paint** – Change voxel colors to the current color.
- **Select** – Click or drag to select voxels for stamping.
- **Stamp** – Place copies of the selection. Requires a selection; click to place each copy.
- **Eyedropper** – Click a voxel to sample its color.

#### Stroke Modes

Selection method controls how each tool applies voxels:

- **Line** – Draw axis-aligned lines. Click to place a single voxel.
- **Plane** – Fill a whole plane. Alt+scroll during drag to cycle orientation.
- **Cuboid** – Drag to set the base plane, scroll to set depth, click or Done to apply.
- **Polygon** – Click to place points, Done to fill the convex hull.
- **Fill** – Click to flood-fill. Voxel fills empty space; Remove/Paint fills voxels; Select/Select by color fills the selection. Options: Include diagonals (8-connected vs 6-connected), Respect color (fill only matching voxels).
- **Airbrush** – Drag to paint a soft spherical brush along the path. Options: Size (0–5), Size range (min/max for spray effect), Scatter (0–4).

#### Plane Axis

When using **Plane** or **Cuboid** stroke mode, it's possible to constrain the tool to a specific axis.

- **X** – Vertical plane (YZ). **Y** – Horizontal plane (XZ). **Z** – Vertical plane (XY).
- **Auto** – Use the clicked face normal. In plain english, this means that the tool will automatically orient the plane to the face you click on.
- Alt+scroll during a drag cycles the plane orientation.

### Clay Tools

The **Clay** tab holds fast, imprecise sculpting modes—opposite of the Draw tools above.

#### Modes

- **Bulk** – Pull voxels along the cursor path. Use for broad sculpting.
- **Smooth** – Soften edges and fill small gaps.
- **Level** – Flatten the surface to the height you click.
- **Gouge** – Carve a trench along the path.
- **Branch** – Extrude limbs or horns into empty space, following cursor direction. Option: Taper (thick base to thin tip).
- **Puffy** – Organic spheres for clouds. Options: Size, Size range (min/max), Scatter.
- **Melt** – Spread voxels downhill, highest first.
- **Rope** – Draw a catenary curve between two points. Click to place the first point, click again for the second, then adjust tension (0=max sag, 1=taut) and click Done to apply. Options: Brush shape (sphere or cube), Brush radius (0–5).
- **Wall** – Drag a path on a surface; voxels extend along a direction from each path point. **Direction**: Auto (face normal), None, or axis (X+, X−, Y+, Y−, Z+, Z−). **Width** (0–5): path thickness. **Height** (2–20): extension along direction. **Lock start height**: keep path on the starting plane for enclosed loops (e.g. walls around a building).

Brush size (0–2) applies to Bulk, Smooth, Level, Gouge, Branch, and Melt.

### Fly Tool

The **Fly** tool is a first-person camera. Click the canvas to capture the pointer, then: WASD to move, E/Q to go up/down, Shift held for 1/8 speed. Move the mouse to look. Press Escape to exit.

Moving in this way changes the origin of the orbit camera. When you exit fthe fly tool, you can click "reset" in the lower right corner of the canvas to reset the camera to the default orbit origin.

---

## Sidebar Sections

### Color

Color picker, hex input, and Lospec palette.

### Camera

- **Orthographic view** – No perspective distortion.
- **Focal length** (15–200 mm) – Only when perspective is on.

### Scene

- **Rendering** – Choose `Blocky (greedy mesh)` for crisp voxel faces or `Smooth (marching cubes)` for an isosurface look.
- **Show borders** – Toggle the voxel gridlines.
- **Sky & horizon** – Gradient sky with horizon.
- **Background** – Solid color (when sky is off).

### Light

- **Ambient** – Overall brightness.
- **Color** – Directional light color.
- **Angle** – Horizontal rotation (0–360°).
- **Elevation** – Height above horizon (5–90°).
- **Shadows** – Directional shadows.
- **Ambient occlusion** – Darken corners for depth.

### Material (PBR)

- **Roughness** – Surface matte/gloss (0–1).
- **Metalness** – Metallic look (0–1).

### Origin

- **Center** – Move voxels so the object center is at the origin.
- **To selection** – Move voxels so the selection center is at the origin.
- **Shift** – Move the whole object or just the selection by x, y, z.

---

## Keyboard Shortcuts

- **F** – Fullscreen canvas (for screenshots); press F or Escape to exit
- **Ctrl+Z** / Cmd+Z – Undo
- **Ctrl+Shift+Z** / **Ctrl+Y** / Cmd+Y – Redo
- **Ctrl+A** / Cmd+A – Select all
- **Escape** – Cancel polygon mode, close modals, exit fly tool

---

## Menus

### File

- **New project** – New grid size and starting shape.
- **Open…** – Load a .voxelle file.
- **Save .voxelle** – Download the project.
- **Import image…** – Convert pixels to voxels on a flat Y=0 plane.
- **Share link** – Create a shareable URL.
- **Save as GLTF** – Export for use in other 3D apps.

### Edit

- **Undo** / **Redo**
- **Cut** / **Copy** / **Paste**
- **Hollow out** – Remove interior voxels, leaving a shell.

### Add

- **Add shape…** – Add a shape at a position with rotation and size.

### Selection

- **Select all** / **Deselect all** / **Invert**
- **Select by color** – Switch to Select by color tool; click a voxel to select all of that color.
- **Grow** / **Shrink** – Expand or contract selection by one layer.
- **Select connected** – Select all voxels connected to the current selection.
- **Deselect voxels** – Remove voxel positions from selection.
- **Deselect empty spaces** – Remove orphaned positions (no voxel there).
- **Selection mode** – Replace, Add to selection, Subtract from selection, Intersect with selection.

### Help

- **Show help** – This page.
- **Show startup screen** – Quick overview.

---

## File & Project

- Work is **auto-saved** to your browser's local storage. Projects persist until you start a new project or clear site data.
- **Share link** – On localhost, links use IndexedDB; deployed, links use Vercel Blob storage.
- **Import image** – Each pixel becomes a voxel. Image is centered; fully transparent pixels are skipped. Large images may prompt for confirmation.
- **Export GLTF** – Saves a .glb file for Blender, Unity, or other 3D software.

---

## Add Shape

Add → Add shape… opens a dialog:

- **Position** – x, y, z coordinates.
- **Rotation** – 0–3 per axis (0°–270° in quarter-turns).
- **Shape** – Cube, Orb, Cylinder, Hollow cube, Plane.
- **Size** – 1–256 voxels.

---

## New Grid

File → New project:

- **Grid size** – 1–256. Defines the workspace bounds.
- **Starting shape** – Cube, Orb, Cylinder, Hollow cube, Plane, or Empty.
