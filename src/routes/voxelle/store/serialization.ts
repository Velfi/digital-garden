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

/** Delta from old state to new state (forward). Used for memory-efficient undo. */
export type UndoDelta = {
  voxelAdded: [string, number][];
  voxelRemoved: [string, number][];
  selectionAdded: [string, number][];
  selectionRemoved: [string, number][];
};

function cloneMap(m: Map<string, number>): Map<string, number> {
  return new Map(m);
}

export function computeUndoDelta(
  oldV: Map<string, number>,
  oldS: Map<string, number>,
  newV: Map<string, number>,
  newS: Map<string, number>
): UndoDelta {
  const voxelAdded: [string, number][] = [];
  const voxelRemoved: [string, number][] = [];
  const selectionAdded: [string, number][] = [];
  const selectionRemoved: [string, number][] = [];
  for (const [k, c] of newV) {
    const oldC = oldV.get(k);
    if (oldC !== c) voxelAdded.push([k, c]);
  }
  for (const [k, c] of oldV) {
    if (!newV.has(k)) voxelRemoved.push([k, c]);
  }
  for (const [k, c] of newS) {
    const oldC = oldS.get(k);
    if (oldC !== c) selectionAdded.push([k, c]);
  }
  for (const [k, c] of oldS) {
    if (!newS.has(k)) selectionRemoved.push([k, c]);
  }
  return { voxelAdded, voxelRemoved, selectionAdded, selectionRemoved };
}

export function applyUndoDeltaForward(
  v: Map<string, number>,
  s: Map<string, number>,
  delta: UndoDelta
): { v: Map<string, number>; s: Map<string, number> } {
  const nextV = cloneMap(v);
  const nextS = cloneMap(s);
  for (const [k] of delta.voxelRemoved) nextV.delete(k);
  for (const [k, c] of delta.voxelAdded) nextV.set(k, c);
  for (const [k] of delta.selectionRemoved) nextS.delete(k);
  for (const [k, c] of delta.selectionAdded) nextS.set(k, c);
  return { v: nextV, s: nextS };
}

export function applyUndoDeltaInverse(
  v: Map<string, number>,
  s: Map<string, number>,
  delta: UndoDelta
): { v: Map<string, number>; s: Map<string, number> } {
  const nextV = cloneMap(v);
  const nextS = cloneMap(s);
  for (const [k] of delta.voxelAdded) nextV.delete(k);
  for (const [k, c] of delta.voxelRemoved) nextV.set(k, c);
  for (const [k] of delta.selectionAdded) nextS.delete(k);
  for (const [k, c] of delta.selectionRemoved) nextS.set(k, c);
  return { v: nextV, s: nextS };
}
