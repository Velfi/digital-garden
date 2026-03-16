# Voxelle Help

<img src="/voxelle/VoxelleTitle.png" alt="Voxelle" width="100%" height="auto">

Voxelle is a 3D sculpting tool made of blocks (voxels).

## If You Want To...

### Add and erase blocks

1. Open the **Draw** tab.
2. Pick **Voxel** to add or **Remove** to erase.
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

1. Use **Select** to pick voxels.
2. Switch to **Stamp**.
3. Click to place copies of the selection.

### Save or share work

- **File -> Save .voxelle** downloads a project file.
- **File -> Open...** opens a `.voxelle` file.
- **File -> Share link** creates a URL.
- **File -> Save as GLTF** exports `.glb` for Blender/Unity/other 3D apps.

---

## Draw Tools

- **Voxel** - add blocks
- **Remove** - erase blocks
- **Paint** - recolor blocks
- **Select** - select blocks
- **Stamp** - place a copy of selected blocks
- **Eyedropper** - pick a color from the model

### Selection method (how dragging behaves)

- **Line** - draw a line between start and end points
- **Plane** - fill a flat plane
- **Cuboid** - draw a box
- **Polygon** - place points, then fill the inside
- **Fill** - flood fill connected area
- **Airbrush** - spray-like brush while dragging

### Selection method options explained

#### Line: Axis-align

- **What it does**: locks the line to a single axis (X, Y, or Z), based on your drag direction.
- **When ON**: great for clean, blocky straight lines.
- **When OFF**: line follows your full drag in 3D, which is better for diagonal placement.
- **How to turn it off**: in the floating tool options panel, uncheck **Axis-align** while using **Line** mode.

#### Plane and Cuboid: Axis

- **X / Y / Z**: force a specific plane orientation.
- **Auto**: use the face you clicked.
- **Tip**: while dragging Plane or Cuboid, hold **Alt** and scroll to cycle X/Y/Z quickly.

#### Fill options

- **Include diagonals**: treats corner-touching voxels as connected.
- **Respect color**: only fills voxels with the same starting color.
- **Constrain to plane**: keeps fill on a single plane instead of spreading in full 3D.

#### Airbrush options

- **Size**: fixed spray size.
- **Size range**: random size between Min and Max each spray step.
- **Scatter**: how far droplets spread from the center path.

### Helpful draw options

- **Brush shape**: Sphere, Cube, Pyramid
- **Brush size**: 0-5
- **Snap to surface**: keeps brush on surface instead of through it
- **Stamp rotation**: rotate copied selection in quarter-turns before placing

---

## Clay Tools (Fast Sculpting)

- **Bulk** - quickly build up mass
- **Smooth** - soften rough areas
- **Inflate** - push surface outward
- **Level** - flatten to a height
- **Gouge** - carve grooves
- **Branch** - pull out branch-like shapes
- **Puffy** - add soft blob shapes
- **Melt** - spread blocks downward
- **Rope** - draw a hanging rope between two points
- **Wall** - draw raised walls along a path

### Clay options explained

#### Brush size (most clay modes)

- Used by **Bulk, Smooth, Inflate, Level, Gouge, Branch, Melt**.
- Bigger brush edits a wider area with each stroke.

#### Inflate: Strength

- Controls how aggressively Inflate expands outward.
- **Higher strength** = fills outward neighbors more often (faster inflation).
- **Lower strength** = softer, noisier inflation.

#### Branch: Taper

- When enabled, branches start thicker and end thinner.
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
