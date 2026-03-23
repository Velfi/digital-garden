/** Typed-array buffers to transfer alongside greedy/voxel mesh worker results. */
export function transferablesFromMeshResults(
  results: ReadonlyArray<{
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    slabThickness: Float32Array;
    indices: Uint32Array;
  }>
): Transferable[] {
  const transferables: Transferable[] = [];
  for (const r of results) {
    transferables.push(
      r.positions.buffer,
      r.normals.buffer,
      r.colors.buffer,
      r.slabThickness.buffer,
      r.indices.buffer
    );
  }
  return transferables;
}
