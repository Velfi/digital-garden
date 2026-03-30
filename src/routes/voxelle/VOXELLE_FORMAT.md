# .voxelle File Format

Binary format for Voxelle voxel models.

## Structure

After decompression (if gzipped), the payload is either **BSON** (v1/v2) or **v3 wire** (see below). The logical model is:

| Field                | Type    | Required | Description                                                                                                                                                       |
| -------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`            | number  | yes      | Format version. Current writers use **2**. Readers accept **1** and **2** (legacy v1 rows are normalized on load).                                                |
| `gridSize`           | number  | yes      | Grid size (integer ≥ 1). Nominal bounds `[-size/2, size/2)` per axis; the editor treats space as unbounded. When saving, gridSize is at least the content extent. |
| `voxels`             | array   | yes      | Array of voxel rows (see below).                                                                                                                                  |
| `scene`              | object  | no       | Optional camera/view settings.                                                                                                                                    |
| `scene.focalLength`  | number  | no       | Camera focal length (typically 15–200).                                                                                                                           |
| `scene.orthographic` | boolean | no       | Whether the camera is orthographic.                                                                                                                               |
| `scene.atmosphere`   | object  | no       | Optional mood/post settings (fog, distance tint, grain, sun shafts).                                                                                             |

### Voxel rows

- **Version 2 (preferred):** `[x, y, z, color, material]`
  - `x, y, z` — integers
  - `color` — 24-bit RGB as a number (`0xRRGGBB`)
  - `material` — string: `plastic` \| `metal` \| `glass` \| `glow`

- **Legacy (version 1):** `[x, y, z, color]` — treated as **`plastic`** for `material` when loading.

## Storage Format

**New files (recommended):** Gzip-compressed BSON. Full key names are used for versioning and tooling.

**Share / blob store:** Same transport as local files: gzip-compressed bytes. The decompressed payload may be BSON (v1/v2) or v3 wire. Shares use `?m=<id>`; the id refers to the blob.

**Detection:** First 2 bytes `0x1f 0x8b` → gzip. Decompress, then: if the next bytes are magic `VX3` + `0x1a` (`56 58 33 1a`), parse as **v3 wire**; otherwise parse as BSON.

## Version 3 wire layout (large models)

Used when saving models with **50,000 or more** voxel rows (visible + hidden combined). Avoids a single huge BSON array while keeping the same logical fields.

| Region | Contents |
| ------ | -------- |
| 0–3 | Magic bytes `56 58 33 1a` |
| 4–7 | `uint32` LE wire version, always **3** |
| 8–11 | `uint32` LE length of the following BSON header |
| header | BSON document: `version`, `gridSize`, `scene`, `voxelCount`, `hiddenCount` (no voxel arrays) |
| body | `voxelCount` + `hiddenCount` contiguous **records**, 20 bytes each |

**Record** (little-endian): `int32 x`, `int32 y`, `int32 z`, `uint32 color` (RGB in lower 24 bits), `uint8` material index (same order as runtime material ids: plastic, metal, rubber, glass, water, glow), then 3 padding bytes (reserved).

Readers still accept v1/v2 BSON-only payloads; v3 is optional on write for large saves.

## Example (JSON representation)

```json
{
  "version": 2,
  "gridSize": 32,
  "voxels": [
    [0, 0, 0, 8947848, "plastic"],
    [1, 0, 0, 8947848, "metal"]
  ],
  "scene": {
    "focalLength": 29,
    "orthographic": false
  }
}
```

## Coordinates and Colors

- **Coordinates:** Integer voxel positions. Grid is centered at origin.
- **Colors:** 24-bit RGB stored as a number. `0xRRGGBB` (e.g. `0xff5733` = orange). Use `(color >>> 0)` to ensure unsigned 32-bit when parsing.

## Versioning

When adding fields in future versions:

- Use optional fields only.
- Ignore unknown fields when reading.
- Old files remain valid in new editors.
