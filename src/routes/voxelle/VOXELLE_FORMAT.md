# .voxelle File Format

Binary format for Voxelle voxel models.

## Structure

After decompression (if gzipped), the payload is BSON. The logical structure is:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | number | yes | Format version (currently 1). New editors should support all known versions. |
| `gridSize` | number | yes | Grid size (integer ≥ 1). Defines bounds `[-size/2, size/2)` per axis. |
| `voxels` | array | yes | Array of `[x, y, z, color]` tuples. Coordinates are integers; color is 24-bit RGB as a number (e.g. `0xff5733`). |
| `scene` | object | no | Optional camera/view settings. |
| `scene.focalLength` | number | no | Camera focal length (typically 15–200). |
| `scene.orthographic` | boolean | no | Whether the camera is orthographic. |

## Storage Format

**New files (recommended):** Gzip-compressed BSON. Full key names are used for versioning and tooling.

**Share / blob store:** Same format. The blob stores raw gzipped BSON (binary). Shares use `?m=<id>`; the id refers to the blob.

**Detection:** First 2 bytes `0x1f 0x8b` → gzip. Decompress, then parse as BSON.

## Example (JSON representation)

```json
{
  "version": 1,
  "gridSize": 32,
  "voxels": [
    [0, 0, 0, 8947848],
    [1, 0, 0, 8947848]
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
