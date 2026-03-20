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
  invertSelection,
  SELECTION_BOUNDS_MARGIN
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
    const current = makeSel([
      [0, 0, 0],
      [1, 1, 1]
    ]);
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
    const current = makeSel([
      [0, 0, 0],
      [1, 1, 1]
    ]);
    const incoming = makeSel([[1, 1, 1]]);
    const result = mergeSelection(current, incoming, 'subtract');
    expect(result.size).toBe(1);
    expect(result.has('0,0,0')).toBe(true);
    expect(result.has('1,1,1')).toBe(false);
  });

  it('toggle mode adds new and removes existing', () => {
    const current = makeSel([
      [0, 0, 0],
      [1, 1, 1]
    ]);
    const incoming = makeSel([
      [1, 1, 1],
      [2, 2, 2]
    ]);
    const result = mergeSelection(current, incoming, 'toggle');
    expect(result.size).toBe(2);
    expect(result.has('0,0,0')).toBe(true); // untouched
    expect(result.has('1,1,1')).toBe(false); // toggled off
    expect(result.has('2,2,2')).toBe(true); // toggled on
  });

  it('intersect mode keeps only coords in both', () => {
    const current = makeSel([
      [0, 0, 0],
      [1, 1, 1]
    ]);
    const incoming = makeSel([
      [1, 1, 1],
      [2, 2, 2]
    ]);
    const result = mergeSelection(current, incoming, 'intersect');
    expect(result.size).toBe(1);
    expect(result.has('1,1,1')).toBe(true);
  });
});

describe('getFillSelectionAt', () => {
  beforeEach(() => {
    /* gridSize does not clip selection floods; normalized value only for store reset. */
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

  it('ignores gridSize: same flood for different nominal grids', () => {
    const layout = makeVoxels([
      [0, 0, 0, 0xff0000],
      [1, 0, 0, 0xff0000]
    ]);
    gridSize.set(8);
    voxels.set(new Map(layout));
    const smallGrid = getFillSelectionAt(0, 0, 0, false);
    gridSize.set(1024);
    voxels.set(new Map(layout));
    const largeGrid = getFillSelectionAt(0, 0, 0, false);
    expect(smallGrid.size).toBe(largeGrid.size);
    expect([...smallGrid.keys()].sort()).toEqual([...largeGrid.keys()].sort());
  });

  it('works when content is far from origin (content-derived bbox)', () => {
    const ox = 80;
    voxels.set(
      makeVoxels([
        [ox, 0, 0, 0xff0000],
        [ox + 1, 0, 0, 0xff0000],
        [ox + 2, 0, 0, 0xff0000]
      ])
    );
    const result = getFillSelectionAt(ox, 0, 0, false);
    expect(result.size).toBe(3);
    expect(result.has(`${ox + 2},0,0`)).toBe(true);
  });
});

describe('getFillEmptyAt', () => {
  const m = SELECTION_BOUNDS_MARGIN;

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

  it('fills all empty cells inside voxel bbox ± margin (two pillars)', () => {
    voxels.set(
      makeVoxels([
        [-1, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000]
      ])
    );
    const result = getFillEmptyAt(0, 0, 0, false);
    const xSpan = 2 + 2 * m + 1;
    const ySpan = 2 * m + 1;
    const zSpan = 2 * m + 1;
    expect(result.size).toBe(xSpan * ySpan * zSpan - 2);
    expect(result.has('0,0,0')).toBe(true);
    expect(result.has(`${m + 2},0,0`)).toBe(false);
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

  it('ignores gridSize when flood is cage-limited (O(1) region)', () => {
    const cage = makeVoxels([
      [-1, 0, 0, 0xff0000],
      [1, 0, 0, 0xff0000],
      [0, -1, 0, 0xff0000],
      [0, 1, 0, 0xff0000],
      [0, 0, -1, 0xff0000],
      [0, 0, 1, 0xff0000]
    ]);
    gridSize.set(4);
    voxels.set(new Map(cage));
    const tight = getFillEmptyAt(0, 0, 0, false);
    gridSize.set(512);
    voxels.set(new Map(cage));
    const wide = getFillEmptyAt(0, 0, 0, false);
    expect(tight.size).toBe(1);
    expect(wide.size).toBe(1);
  });

  it('with no voxels, empty fill reaches ±margin from origin only', () => {
    voxels.set(new Map());
    const result = getFillEmptyAt(0, 0, 0, false);
    expect(result.has('0,0,0')).toBe(true);
    expect(result.has(`${m},0,0`)).toBe(true);
    expect(result.has(`${m + 1},0,0`)).toBe(false);
  });

  it('empty fill between bookends offset in workspace', () => {
    const ox = 40;
    voxels.set(
      makeVoxels([
        [ox - 1, 0, 0, 0xff0000],
        [ox + 1, 0, 0, 0xff0000]
      ])
    );
    const result = getFillEmptyAt(ox, 0, 0, false);
    expect(result.has(`${ox},0,0`)).toBe(true);
    expect(result.has(`${ox + m + 2},0,0`)).toBe(false);
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
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 1, 1, 0x00ff00]
      ])
    );
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
    selection.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000]
      ])
    );
    shrinkSelection();
    expect(get(selection).size).toBe(0);
  });

  it('hollowOut removes interior voxels', () => {
    const positions: [number, number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) positions.push([x, y, z, 0xff0000]);
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
    selection.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 1, 1, 0x00ff00]
      ])
    );
    deselectVoxels();
    expect(get(selection).size).toBe(1);
    expect(get(selection).has('1,1,1')).toBe(true);
    expect(get(selection).has('0,0,0')).toBe(false);
  });

  it('deselectEmptySpaces keeps only selection keys that have voxels', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 1, 1, 0x00ff00]
      ])
    );
    selection.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [2, 2, 2, 0x0000ff]
      ])
    );
    deselectEmptySpaces();
    expect(get(selection).size).toBe(1);
    expect(get(selection).has('0,0,0')).toBe(true);
    expect(get(selection).has('2,2,2')).toBe(false);
  });

  it('invertSelection selects unselected voxels', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 1, 1, 0x00ff00]
      ])
    );
    selection.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    invertSelection();
    expect(get(selection).size).toBe(1);
    expect(get(selection).has('1,1,1')).toBe(true);
  });

  it('growSelection uses content-derived bounds, not gridSize', () => {
    const ox = 50;
    voxels.set(
      makeVoxels([
        [ox, 0, 0, 0xff0000],
        [ox + 1, 0, 0, 0xff0000]
      ])
    );
    selection.set(makeVoxels([[ox, 0, 0, 0xff0000]]));
    gridSize.set(16);
    growSelection();
    expect(get(selection).has(`${ox + 1},0,0`)).toBe(true);
  });

  it('selectConnected reaches along chain away from origin', () => {
    const ox = 60;
    voxels.set(
      makeVoxels([
        [ox, 0, 0, 0xff0000],
        [ox + 1, 0, 0, 0xff0000],
        [ox + 2, 0, 0, 0x00ff00]
      ])
    );
    selection.set(makeVoxels([[ox, 0, 0, 0xff0000]]));
    selectConnected();
    expect(get(selection).size).toBe(2);
    expect(get(selection).has(`${ox + 1},0,0`)).toBe(true);
    expect(get(selection).has(`${ox + 2},0,0`)).toBe(false);
  });
});
