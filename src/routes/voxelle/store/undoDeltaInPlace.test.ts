import { afterEach, describe, expect, it } from 'vitest';
import { replaceVoxelChunkIndexFromMap } from './voxelChunkIndex';
import {
  applyUndoDeltaForward,
  applyUndoDeltaInverse,
  computeUndoDelta,
  type UndoDelta
} from './serialization';
import {
  applyUndoDeltaForwardToSelectionInPlace,
  applyUndoDeltaForwardToVoxelsInPlace,
  applyUndoDeltaInverseToSelectionInPlace,
  applyUndoDeltaInverseToVoxelsInPlace
} from './undoDeltaInPlace';
import { plasticVoxel } from '../voxelMaterial';

function mapsEqual(a: Map<string, ReturnType<typeof plasticVoxel>>, b: Map<string, ReturnType<typeof plasticVoxel>>) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const o = b.get(k);
    if (!o || o.color !== v.color || o.material !== v.material) return false;
  }
  return true;
}

function cloneMap<K, V>(m: Map<K, V>): Map<K, V> {
  return new Map(m);
}

describe('undoDeltaInPlace', () => {
  afterEach(() => {
    replaceVoxelChunkIndexFromMap(new Map());
  });

  it('inverse in-place matches applyUndoDeltaInverse on clone', () => {
    const baseV = new Map([
      ['0,0,0', plasticVoxel(0xff0000)],
      ['1,0,0', plasticVoxel(0x111111)]
    ]);
    const baseS = new Map([['0,0,0', plasticVoxel(0xff0000)]]);
    const nextV = new Map([
      ['1,0,0', plasticVoxel(0x111111)],
      ['2,0,0', plasticVoxel(0x00ff00)]
    ]);
    const nextS = new Map<string, ReturnType<typeof plasticVoxel>>();
    const delta = computeUndoDelta(baseV, baseS, nextV, nextS);

    const viaClone = applyUndoDeltaInverse(cloneMap(nextV), cloneMap(nextS), delta);
    const v2 = cloneMap(nextV);
    const s2 = cloneMap(nextS);
    applyUndoDeltaInverseToVoxelsInPlace(v2, delta);
    applyUndoDeltaInverseToSelectionInPlace(s2, delta);

    expect(mapsEqual(v2, viaClone.v)).toBe(true);
    expect(mapsEqual(s2, viaClone.s)).toBe(true);
  });

  it('forward in-place matches applyUndoDeltaForward on clone', () => {
    const baseV = new Map([['0,0,0', plasticVoxel(0xff0000)]]);
    const baseS = new Map<string, ReturnType<typeof plasticVoxel>>();
    const nextV = new Map([['1,1,1', plasticVoxel(0x00ff00)]]);
    const nextS = new Map([['1,1,1', plasticVoxel(0x00ff00)]]);
    const delta = computeUndoDelta(baseV, baseS, nextV, nextS);

    const viaClone = applyUndoDeltaForward(cloneMap(baseV), cloneMap(baseS), delta);
    const v2 = cloneMap(baseV);
    const s2 = cloneMap(baseS);
    applyUndoDeltaForwardToVoxelsInPlace(v2, delta);
    applyUndoDeltaForwardToSelectionInPlace(s2, delta);

    expect(mapsEqual(v2, viaClone.v)).toBe(true);
    expect(mapsEqual(s2, viaClone.s)).toBe(true);
  });

  it('empty delta is no-op', () => {
    const empty: UndoDelta = {
      voxelAdded: [],
      voxelRemoved: [],
      selectionAdded: [],
      selectionRemoved: []
    };
    const v = new Map([['0,0,0', plasticVoxel(1)]]);
    const before = JSON.stringify([...v]);
    applyUndoDeltaInverseToVoxelsInPlace(v, empty);
    expect(JSON.stringify([...v])).toBe(before);
  });
});
