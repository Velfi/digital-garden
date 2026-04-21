# .voxelle File Format

Binary format for Voxelle voxel models.

## Structure

After decompression, the payload is either **BSON** (v1/v2) or **v3 wire** (see below). The logical model is:

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

- **Desktop v4+ extension:** `[x, y, z, color, material, objectId]` — adds a scene object grouping id. The web viewer accepts this row length and ignores `objectId`.

## Storage Format

**New files (recommended):** Gzip-compressed BSON. Full key names are used for versioning and tooling.

**Share / blob store:** Same transport as local files: gzip-compressed bytes. The decompressed payload may be BSON (v1/v2) or v3 wire. Shares use `?m=<id>`; the id refers to the blob.

**Detection order:**

1. Magic `VX5` + `0x1a` (`56 58 35 1a`) → **v5 container** (zstd). Decode container, then parse inner payload as BSON or v3 wire.
2. Magic `VX4` + `0x1a` (`56 58 34 1a`) → **v4 container** (gzip). Decode container, then parse inner payload as BSON or v3 wire.
3. First 2 bytes `0x1f 0x8b` → gzip-compressed payload. Decompress, then parse as BSON or v3 wire.
4. Magic `VX3` + `0x1a` (`56 58 33 1a`) → bare **v3 wire** (uncompressed).
5. Otherwise → raw BSON.

## Desktop container formats (v4 and v5)

Files saved by Voxelle Desktop are wrapped in a container that adds integrity checking and compression. The inner payload after decompression is BSON or v3 wire.

### V4 container (`VX4\x1a`, gzip)

| Offset | Size | Type       | Field                                        |
| ------ | ---- | ---------- | -------------------------------------------- |
| 0      | 4    | magic      | `56 58 34 1a`                                |
| 4      | 4    | `uint32` LE | Uncompressed inner payload length            |
| 8      | 4    | `uint32` LE | CRC-32 (IEEE/zlib) of uncompressed payload   |
| 12     | N    | bytes      | Gzip-compressed inner payload (BSON or v3 wire) |

### V5 container (`VX5\x1a`, zstd)

Identical structure to V4 but uses **zstd** compression instead of gzip for faster load/save times.

| Offset | Size | Type       | Field                                        |
| ------ | ---- | ---------- | -------------------------------------------- |
| 0      | 4    | magic      | `56 58 35 1a`                                |
| 4      | 4    | `uint32` LE | Uncompressed inner payload length            |
| 8      | 4    | `uint32` LE | CRC-32 (IEEE/zlib) of uncompressed payload   |
| 12     | N    | bytes      | Zstd-compressed inner payload (BSON or v3 wire) |

CRC-32 matches the output of `crc32fast::hash` (Rust) and the `crc32` helper in `voxelleFormatCore.ts`.

## Version 3 wire layout (large models)

Used when saving models with **50,000 or more** voxel rows (visible + hidden combined). Avoids a single huge BSON array while keeping the same logical fields.

| Region | Contents |
| ------ | -------- |
| 0–3 | Magic bytes `56 58 33 1a` |
| 4–7 | `uint32` LE wire version: **3** (web) or **4** (desktop, 24-byte records) |
| 8–11 | `uint32` LE length of the following BSON header |
| header | BSON document: `version`, `gridSize`, `scene`, `voxelCount`, `hiddenCount` (no voxel arrays) |
| body | `voxelCount` + `hiddenCount` contiguous **records** |

**20-byte record** (wire version 3, little-endian): `int32 x`, `int32 y`, `int32 z`, `uint32 color` (RGB in lower 24 bits), `uint8` material index (plastic=0, metal=1, rubber=2, glass=3, water=4, glow=5), then 3 padding bytes (reserved).

**24-byte record** (wire version 4, desktop extension): same 20-byte prefix plus `uint32 LE object_id`. The web viewer reads `object_id` but ignores it.

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
