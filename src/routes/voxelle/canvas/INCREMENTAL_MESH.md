# Incremental mesh & ray accel (future work)

Greedy meshing and ray GPU acceleration currently consume the **full** voxel map on each rebuild. Batched rAF rebuilds and sparse undo reduce main-thread and undo overhead; the worker still repacks the whole scene each time.

## Chunk-local greedy mesh (design)

1. **Partition** voxel keys into fixed-size chunks (e.g. 32³), matching the existing `chunkSize` threshold in `meshManager.ts`.
2. **Track dirty chunks** per edit: map each touched cell coordinate to chunk id; expand by ±1 chunk if ambient occlusion or transmissive neighbors require it.
3. **Worker message**: send `{ fullMap | dirtyChunkIds, mode, options }`; worker rebuilds only dirty buckets for affected chunks, then merge into prior bucket geometries (or replace bucket sub-ranges if geometries are split per chunk).
4. **Glass / full-scene repair**: keep a narrow fallback when `replaceGlassBucketsWithFullSceneGreedy` triggers, so correctness is preserved.

## GPU ray acceleration (design)

`VoxelRayTsl` currently disposes and rebuilds `buildVoxelRayGpuResources` on every content invalidation. Incremental path:

1. **Dense grid**: suballocate bricks; mark dirty bricks from touched voxels; `texelStore` or buffer partial upload per brick.
2. **Hash table mode**: rehash only affected slots (or incremental open addressing repair if feasible); fall back to full rebuild when load factor or bounds change.

Enable incremental paths only when dirty region volume ≪ full scene volume; otherwise keep full rebuild.
