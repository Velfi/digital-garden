import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { voxels, selection, gridSize, resetUndo } from './core';
import {
  mergeSelection,
  getFillSelectionAt,
  getFillEmptyAt,
  selectAll,
  deselectAll,
  growSelection,
  shrinkSelection,
  hollowOut,
  selectConnected,
  deselectVoxels,
  deselectEmptySpaces,
  invertSelection
} from './selection';

function makeSel(entries: [number, number, number][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [x, y, z] of entries) m.set(`${x},${y},${z}`, 0x888888);
  return m;
}

function makeVoxels(entries: [number, number, number, number][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [x, y, z, col] of entries) m.set(`${x},${y},${z}`, col);
  return m;
}

describe('mergeSelection', () => {
  it('replace mode replaces current with incoming', () => {
    const current = makeSel([[0, 0, 0], [1, 1, 1]]);
    const incoming = makeSel([[2, 2, 2]]);
    const result = mergeSelection(current, incoming, 'replace');
    expect(result.size).toBe(1);
    expect(result.has('2,2,2')).toBe(true);
  });

  it('add mode unions current and incoming', () => {
    const current = makeSel([[0, 0, 0]]);
    const incoming = makeSel([[1, 1, 1]]);
    const result = mergeSelection(current, incoming, 'add');
    expect(result.size).toBe(2);
    expect(result.has('0,0,0')).toBe(true);
    expect(result.has('1,1,1')).toBe(true);
  });

  it('subtract mode removes incoming from current', () => {
    const current = makeSel([[0, 0, 0], [1, 1, 1]]);
    const incoming = makeSel([[1, 1, 1]]);
    const result = mergeSelection(current, incoming, 'subtract');
    expect(result.size).toBe(1);
    expect(result.has('0,0,0')).toBe(true);
    expect(result.has('1,1,1')).toBe(false);
  });

  it('toggle mode adds new and removes existing', () => {
    const current = makeSel([[0, 0, 0], [1, 1, 1]]);
    const incoming = makeSel([[1, 1, 1], [2, 2, 2]]);
    const result = mergeSelection(current, incoming, 'toggle');
    expect(result.size).toBe(2);
    expect(result.has('0,0,0')).toBe(true);  // untouched
    expect(result.has('1,1,1')).toBe(false); // toggled off
    expect(result.has('2,2,2')).toBe(true);  // toggled on
  });

  it('intersect mode keeps only coords in both', () => {
    const current = makeSel([[0, 0, 0], [1, 1, 1]]);
    const incoming = makeSel([[1, 1, 1], [2, 2, 2]]);
    const result = mergeSelection(current, incoming, 'intersect');
    expect(result.size).toBe(1);
    expect(result.has('1,1,1')).toBe(true);
  });
});

describe('getFillSelectionAt', () => {
  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    selection.set(new Map());
    resetUndo();
  });

  it('returns empty when target is empty', () => {
    voxels.set(makeVoxels([[1, 1, 1, 0xff0000]]));
    const result = getFillSelectionAt(0, 0, 0, false);
    expect(result.size).toBe(0);
  });

  it('returns connected region with 6-adj', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000],
        [2, 0, 0, 0xff0000]
      ])
    );
    const result = getFillSelectionAt(0, 0, 0, false);
    expect(result.size).toBe(3);
    expect(result.has('0,0,0')).toBe(true);
    expect(result.has('1,0,0')).toBe(true);
    expect(result.has('2,0,0')).toBe(true);
  });

  it('respects color when respectsColor=true', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0x00ff00]
      ])
    );
    const result = getFillSelectionAt(0, 0, 0, false, true);
    expect(result.size).toBe(1);
    expect(result.has('0,0,0')).toBe(true);
  });

  it('ignores color when respectsColor=false', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0x00ff00]
      ])
    );
    const result = getFillSelectionAt(0, 0, 0, false, false);
    expect(result.size).toBe(2);
  });

  it('26-adj connects diagonally', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 1, 0, 0xff0000]
      ])
    );
    const result6 = getFillSelectionAt(0, 0, 0, false);
    const result26 = getFillSelectionAt(0, 0, 0, true);
    expect(result6.size).toBe(1);
    expect(result26.size).toBe(2);
  });
});

describe('getFillEmptyAt', () => {
  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    selection.set(new Map());
    resetUndo();
  });

  it('returns empty when target has voxel', () => {
    voxels.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    const result = getFillEmptyAt(0, 0, 0, false);
    expect(result.size).toBe(0);
  });

  it('returns connected empty region including start', () => {
    voxels.set(
      makeVoxels([
        [-1, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000]
      ])
    );
    const result = getFillEmptyAt(0, 0, 0, false);
    expect(result.size).toBeGreaterThan(0);
    expect(result.has('0,0,0')).toBe(true);
  });

  it('bounds empty region by voxels', () => {
    voxels.set(
      makeVoxels([
        [-1, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000],
        [0, -1, 0, 0xff0000],
        [0, 1, 0, 0xff0000],
        [0, 0, -1, 0xff0000],
        [0, 0, 1, 0xff0000]
      ])
    );
    const result = getFillEmptyAt(0, 0, 0, false);
    expect(result.size).toBe(1);
  });
});

describe('selection store actions', () => {
  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    selection.set(new Map());
    resetUndo();
  });

  it('selectAll selects all voxels', () => {
    voxels.set(makeVoxels([[0, 0, 0, 0xff0000], [1, 1, 1, 0x00ff00]]));
    selectAll();
    expect(get(selection).size).toBe(2);
  });

  it('deselectAll clears selection', () => {
    voxels.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    selection.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    deselectAll();
    expect(get(selection).size).toBe(0);
  });

  it('growSelection expands to adjacent voxels', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000]
      ])
    );
    selection.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    growSelection();
    expect(get(selection).size).toBe(2);
    expect(get(selection).has('1,0,0')).toBe(true);
  });

  it('shrinkSelection removes boundary voxels', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000]
      ])
    );
    selection.set(makeVoxels([[0, 0, 0, 0xff0000], [1, 0, 0, 0xff0000]]));
    shrinkSelection();
    expect(get(selection).size).toBe(0);
  });

  it('hollowOut removes interior voxels', () => {
    const positions: [number, number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        for (let z = 0; z < 3; z++) positions.push([x, y, z, 0xff0000]);
    voxels.set(makeVoxels(positions));
    selection.set(get(voxels));
    hollowOut();
    const v = get(voxels);
    expect(v.has('1,1,1')).toBe(false);
    expect(v.has('0,0,0')).toBe(true);
  });

  it('selectConnected selects same-color region', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000],
        [2, 0, 0, 0x00ff00]
      ])
    );
    selection.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    selectConnected();
    expect(get(selection).size).toBe(2);
    expect(get(selection).has('2,0,0')).toBe(false);
  });

  it('deselectVoxels keeps only selection entries with no voxel', () => {
    voxels.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    selection.set(makeVoxels([[0, 0, 0, 0xff0000], [1, 1, 1, 0x00ff00]]));
    deselectVoxels();
    expect(get(selection).size).toBe(1);
    expect(get(selection).has('1,1,1')).toBe(true);
    expect(get(selection).has('0,0,0')).toBe(false);
  });

  it('deselectEmptySpaces keeps only selection keys that have voxels', () => {
    voxels.set(makeVoxels([[0, 0, 0, 0xff0000], [1, 1, 1, 0x00ff00]]));
    selection.set(makeVoxels([[0, 0, 0, 0xff0000], [2, 2, 2, 0x0000ff]]));
    deselectEmptySpaces();
    expect(get(selection).size).toBe(1);
    expect(get(selection).has('0,0,0')).toBe(true);
    expect(get(selection).has('2,2,2')).toBe(false);
  });

  it('invertSelection selects unselected voxels', () => {
    voxels.set(makeVoxels([[0, 0, 0, 0xff0000], [1, 1, 1, 0x00ff00]]));
    selection.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    invertSelection();
    expect(get(selection).size).toBe(1);
    expect(get(selection).has('1,1,1')).toBe(true);
  });
});
