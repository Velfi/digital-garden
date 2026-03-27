# Voxelle Help

<img src="/voxelle/VoxelleTitle.png" alt="Voxelle" width="100%" height="auto">

Voxelle is a 3D sculpting tool made of blocks (voxels).

## If You Want To...

### Add and erase blocks

1. Open the **Draw** tab.
2. Under **Tool**, pick **Add** to place blocks or **Remove** to erase.
3. Click or drag in the canvas.

### Paint your model

1. Pick a color in the sidebar.
2. Use **Paint** to recolor blocks.
3. Use **Eyedropper** to sample a color from an existing block.

### Move around the scene

- Drag in empty space to orbit the camera.
- Use the **Fly** tab for first-person movement:
  - **WASD** move
  - **E / Q** up/down
  - **Shift** slower movement
  - **Escape** exit fly mode

### Fix mistakes quickly

- **Cmd/Ctrl + Z** undo
- **Cmd/Ctrl + Shift + Z** or **Ctrl + Y** redo
- **Cmd/Ctrl + A** select all

### Copy repeated parts

1. Under **Selection**, use **Select** to pick voxels (or load a shape from the Stamp book).
2. Switch to **Stamp**.
3. Click to place copies of the selection.

### Save or share work

- **File -> Save .voxelle** downloads a project file.
- **File -> Open...** opens a `.voxelle` file.
- **File -> Share link** creates a URL (on the deployed site the project is uploaded directly to storage so large models are not limited by the small server request size cap).
- **File -> Save as GLTF** exports `.glb` for Blender/Unity/other 3D apps.

---

## Draw Tools

**Tool** column (left):

- **Add** - place blocks
- **Remove** - erase blocks
- **Paint** - recolor blocks

**Selection** column (right):

- **Select** - select blocks for Stamp/Punch or editing
- **Stamp** - place a copy of the selected pattern
- **Punch** - cut the stamp pattern into the surface

Other:

- **Eyedropper** - pick a color from the model (from menus / shortcuts as exposed in the app)

### Selection method (sidebar)

How strokes behave depends on the category, then the **Area shape** in the floating tool panel.

**Row 1 — Stroke · Surface · Solid**

- **Stroke** — **Area shape**: **Line** or **Precise** (lock a plane from a face, then place or drag).
- **Surface** — **Area shape**: **Plane**, **Circle**, or **Polygon** (flat region: rectangle, disk, or point outline).
- **Solid** — **Area shape**: **Cube**, **Cylinder**, or **Polygon** (extruded volume: box, round column, or outlined extrusion).

**Row 2 — Spray · Fill**

- **Spray** — soft droplets along the stroke (options in the tool panel).
- **Fill** — flood connected voxels or empty space (depends on tool: Add / Remove / Paint / Select).

Fill and Spray have no second shape row; choosing them sets the mode directly.

### Selection method options explained

#### Stroke → Line: Axis-align

- **What it does**: locks the line to a single axis (X, Y, or Z), based on your drag direction.
- **When ON**: great for clean, blocky straight lines.
- **When OFF**: line follows your full drag in 3D, which is better for diagonal placement.
- **How to turn it off**: in the floating tool options panel, uncheck **Axis-align** while **Line** is selected under **Area shape**.

#### Plane options (Surface / Solid shapes that use a plane)

- **Plane options** in the tool panel: **X / Y / Z** force orientation; **Auto** uses the face you clicked.
- **Hollow**: keep only the outer shell (edge of a plane, or walls of a box/cylinder).
- **Tip**: while dragging many plane-based shapes, hold **Alt** and scroll to cycle X/Y/Z quickly.
- **Solid** → **Cylinder**: **Taper** slider makes the column taper to a cone.

#### Fill options

- **Include diagonals**: treats corner-touching voxels as connected.
- **Respect color**: only fills voxels with the same starting color.
- **Constrain to plane**: keeps fill on a single plane instead of spreading in full 3D.

#### Spray options

- **Size**: fixed droplet size.
- **Size range**: random size between Min and Max each step.
- **Scatter**: how far droplets spread from the center path.

### Helpful draw options (tool panel)

- **Area shape** — depends on **Stroke** / **Surface** / **Solid** (see above); not the same as brush stamp.
- **Brush shape** — **Cube**, **Sphere**, **Pyramid** (stamp used when drawing with Add / Remove / Paint and similar strokes).
- **Brush size** — slider (1–64 voxels by radius index).
- **Snap to surface (embed)** — offsets the brush along the face normal so it sits on the surface instead of cutting through.
- **Stamp rotation**: rotate copied selection in quarter-turns before placing

---

## Sculpt tools (fast sculpting)

Open the **Sculpt** tab in the sidebar. Names are Blender-inspired, but everything runs on a **voxel grid**: brushes add/remove/move whole cells, not mesh vertices. Behavior matches the tooltips and the notes below.

- **Draw** (fill empty voxels along the stroke), **Scrape** (delete solid voxels in the brush), **Smooth** (majority fill/remove in the brush, or optional **Mesh** Taubin smooth on a local surface then revoxelize; see below), **Extrude** (add voxels along a stroke; direction uses **Extrusion** options below), **Wall**, **Terrain** (heightfield on column tops; Y-up)

**Rope** (Generators tab) — draw a hanging rope between two points.

### Sculpt options explained

#### Brush size (most sculpt modes)

- Used by **Draw, Smooth, Scrape, Extrude**, and **Terrain**.
- Bigger brush edits a wider area with each stroke.

#### Brush strength & falloff (floating tool panel)

- **Strength** (1–100): how much of the brush footprint tends to apply on each stroke. Lower values thin the stroke using the same seed per drag so results stay repeatable.
- **Falloff** (0–100): **0** = hard edge (uniform inside the brush shape). **Higher** = softer weights from the stroke path out toward the brush radius (Blender-like soft brush).

#### Smooth: Majority vs Mesh

- **Majority** (default): counts solid neighbors in a 3D window and fills empty cells or removes thin spikes—pure voxel logic. **Reach** and **Strength** control neighborhood size and how aggressive the rule is.
- **Mesh**: builds a **greedy mesh** of solid voxels in a box around the stroke (brush bounds plus **Reach** as extra margin), runs **Taubin** smoothing on mesh vertices (with boundary vertices on that box pinned), then treats each voxel cell as inside/outside the smoothed surface (primarily **+X ray parity** against the triangle soup, with a **padded vertex bounding box** fallback for cells that were solid in that region so merged quads do not drop interior voxels). Colors and materials are copied from the **nearest original voxel** in the box, so seams between materials may blend. **Passes** and **Relax** control iteration count and step strength.
- **Caveats**: hollow cavities fully inside the edit box can classify oddly after remeshing; very large regions may fall back to **Majority** automatically for performance (ROI cell budget).

#### Extrude (branch): Extrusion reference

- **Camera** (default): drag distance sets length; drag direction is mapped through the view plane (camera **right** and **up**), so “up on screen” grows along screen-up in the world, not along the camera look axis.
- **Auto**: extrude along the dominant world axis of the **start face** normal (same idea as face snapping elsewhere). If the pick has no face, behavior matches **Camera**.
- **X / Y / Z**: extrude along that world axis only; **plus or minus** follows your drag projected onto the view plane (when the projection is ambiguous, the positive axis is used).

#### Extrude (branch): Taper

- When enabled, extrusions start thicker and end thinner.
- Good for horns, roots, tree-like forms.

#### Puffy: Size, Size range, Scatter

- **Size** sets blob size when range is off.
- **Size range** randomizes each blob between Min and Max.
- **Scatter** spreads blobs away from the path for a fluffier look.

#### Rope: Tension, Shape, Size

- Workflow:
  1. Click first point.
  2. Click second point.
  3. Adjust **Tension** and click **Done**.
- **Tension**:
  - low = more sag
  - high = straighter rope
- You can adjust tension with the on-canvas slider or the +/- buttons.
- **Shape** chooses rounder (`Sphere`) or blockier (`Cube`) rope thickness.
- **Size** controls rope thickness.

#### Wall: Direction, Width, Height, Lock start height

- **Direction** chooses which way the wall extends:
  - `Auto` uses the face you started on
  - or pick a fixed axis direction (`X+`, `X-`, `Y+`, `Y-`, `Z+`, `Z-`)
- **Width** controls wall thickness along the path.
- **Height** controls how far the wall extrudes in the chosen direction.
- **Lock start height** keeps your path on its starting plane, useful for closed wall loops.

---

## Symmetry

Use **X**, **Y**, and **Z** symmetry toggles to mirror edits across axes.

---

## Sidebar Controls

### Draw tab

- **Tool** and **Selection** are two columns with a divider between them: **Add**, **Remove**, and **Paint** on the left; **Select**, **Stamp**, and **Punch** on the right.
- **Selection method**: top row **Stroke · Surface · Solid**; bottom row **Spray · Fill**. Choosing **Stroke**, **Surface**, or **Solid** unlocks **Area shape** buttons in the floating tool panel (bottom of the canvas).

### Sculpt tab

- **Sculpt mode** is a single row of mode buttons. The floating tool panel shows brush strength/falloff and mode-specific options when **Sculpt** is active.

### Color

- **Color picker**: choose a color visually.
- **Hex field**: type an exact color value (for example `#ff8800`).
- **Palette**: pick swatches from the built-in palette.
- **Tip**: if you already have voxels selected, changing color also updates those selected voxels.

### Camera

- **Orthographic view**:
  - ON = no perspective distortion (great for precise building and alignment)
  - OFF = normal perspective view (more depth feel)
- **Focal length** (perspective only):
  - lower values = wider, more dramatic view
  - higher values = flatter, zoomed-in look

### Scene

- **Rendering**:
  - **Blocky (greedy mesh)** keeps crisp voxel faces
  - **Smooth (marching cubes)** rounds surfaces for an organic look
- **Show borders**: shows/hides edge lines between voxels.
- **Sky & horizon**: toggles gradient sky background.
- **Background**: solid background color (only used when sky is off).

### Light

- **Ambient**: base brightness for the whole scene.
- **Color**: color of the main directional light.
- **Angle**: rotates the light around your model.
- **Elevation**: raises/lowers the light in the sky.
- **Shadows**: toggles directional shadows.
- **Ambient occlusion**:
  - **Off** = clean/flat shading
  - **Subtle** = mild depth in corners
  - **Strong** = stronger corner darkening and contrast

### Material

- **Roughness**:
  - low = shiny/smooth
  - high = matte/rough
- **Metalness**:
  - low = non-metal (plastic/clay-like)
  - high = metallic look

### Origin

- **Center**: moves the whole model so its center sits at world origin.
- **To selection**: moves the model so selected voxels are centered at origin.
- **Shift**:
  - if you have a selection, it shifts only that selection
  - if nothing is selected, it shifts the whole model
- Use **Shift** to nudge parts into place with exact x/y/z offsets.

---

## Menus

### File

- New project
- Open...
- Save .voxelle
- Import image...
- Share link
- Save as GLTF

### Edit

- Undo / Redo
- Cut / Copy / Paste
- Hollow out (remove interior blocks)

### Add

- Add shape...

### Selection

- Select All / Deselect All / Invert
- Select by color
- Grow / Shrink
- Select Connected
- Deselect voxels
- Deselect empty spaces
- Selection mode: Replace / Add / Subtract / Intersect

### Help

- Show help
- Show startup screen

---

## Notes

- Work auto-saves in your browser.
- Import image places voxels on a flat plane.
- Large image imports may ask for confirmation.
- If the app does not run, your browser may not support WebGL.
