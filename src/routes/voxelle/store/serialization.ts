export function cloneVoxels(voxels: Map<string, number>): Map<string, number> {
  return new Map(voxels);
}

export function serializeVoxels(voxels: Map<string, number>): string {
  return JSON.stringify([...voxels.entries()]);
}

export function deserializeVoxels(json: string): Map<string, number> {
  const entries = JSON.parse(json) as [string, number][];
  return new Map(entries);
}
