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
  getCoplanarFacesSelectionAt,
  getCoplanarEmptySelectionAt,
  SELECTION_BOUNDS_MARGIN
} from './selection';
import { plasticVoxel, type Voxel } from '../voxelMaterial';

const EMPTY_SEL_PLACEHOLDER = plasticVoxel(0x33aaff);

function makeSel(entries: [number, number, number][]): Map<string, Voxel> {
  const m = new Map<string, Voxel>();
  for (const [x, y, z] of entries) m.set(`${x},${y},${z}`, plasticVoxel(0x888888));
  return m;
}

function makeVoxels(entries: [number, number, number, number][]): Map<string, Voxel> {
  const m = new Map<string, Voxel>();
  for (const [x, y, z, col] of entries) m.set(`${x},${y},${z}`, plasticVoxel(col));
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
    const { region, truncated } = getFillSelectionAt(0, 0, 0, false);
    expect(region.size).toBe(0);
    expect(truncated).toBe(false);
  });

  it('returns connected region with 6-adj', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000],
        [2, 0, 0, 0xff0000]
      ])
    );
    const { region, truncated } = getFillSelectionAt(0, 0, 0, false);
    expect(region.size).toBe(3);
    expect(truncated).toBe(false);
    expect(region.has('0,0,0')).toBe(true);
    expect(region.has('1,0,0')).toBe(true);
    expect(region.has('2,0,0')).toBe(true);
  });

  it('respects color when respectsColor=true', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0x00ff00]
      ])
    );
    const { region, truncated } = getFillSelectionAt(0, 0, 0, false, true);
    expect(region.size).toBe(1);
    expect(truncated).toBe(false);
    expect(region.has('0,0,0')).toBe(true);
  });

  it('ignores color when respectsColor=false', () => {
    voxels.set(
      makeVoxels([
        [0, 0, 0, 0xff0000],
        [1, 0, 0, 0x00ff00]
      ])
    );
    const { region, truncated } = getFillSelectionAt(0, 0, 0, false, false);
    expect(region.size).toBe(2);
    expect(truncated).toBe(false);
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
    expect(result6.region.size).toBe(1);
    expect(result26.region.size).toBe(2);
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
    expect(smallGrid.region.size).toBe(largeGrid.region.size);
    expect([...smallGrid.region.keys()].sort()).toEqual([...largeGrid.region.keys()].sort());
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
    const { region, truncated } = getFillSelectionAt(ox, 0, 0, false);
    expect(region.size).toBe(3);
    expect(truncated).toBe(false);
    expect(region.has(`${ox + 2},0,0`)).toBe(true);
  });

  it('stops BFS once region exceeds maxRegionSize', () => {
    const cells: [number, number, number, number][] = [];
    for (let i = 0; i < 400; i++) cells.push([i, 0, 0, 0xff0000]);
    voxels.set(makeVoxels(cells));
    const capped = getFillSelectionAt(0, 0, 0, false, true, 256);
    expect(capped.truncated).toBe(true);
    expect(capped.region.size).toBe(257);
    const full = getFillSelectionAt(0, 0, 0, false, true);
    expect(full.truncated).toBe(false);
    expect(full.region.size).toBe(400);
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
    const { region, truncated } = getFillEmptyAt(0, 0, 0, false);
    expect(region.size).toBe(0);
    expect(truncated).toBe(false);
  });

  it('fills all empty cells inside voxel bbox ± margin (two pillars)', () => {
    voxels.set(
      makeVoxels([
        [-1, 0, 0, 0xff0000],
        [1, 0, 0, 0xff0000]
      ])
    );
    const { region, truncated } = getFillEmptyAt(0, 0, 0, false);
    const xSpan = 2 + 2 * m + 1;
    const ySpan = 2 * m + 1;
    const zSpan = 2 * m + 1;
    expect(region.size).toBe(xSpan * ySpan * zSpan - 2);
    expect(truncated).toBe(false);
    expect(region.has('0,0,0')).toBe(true);
    expect(region.has(`${m + 2},0,0`)).toBe(false);
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
    const { region, truncated } = getFillEmptyAt(0, 0, 0, false);
    expect(region.size).toBe(1);
    expect(truncated).toBe(false);
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
    expect(tight.region.size).toBe(1);
    expect(wide.region.size).toBe(1);
  });

  it('with no voxels, empty fill reaches ±margin from origin only', () => {
    voxels.set(new Map());
    const { region, truncated } = getFillEmptyAt(0, 0, 0, false);
    expect(truncated).toBe(false);
    expect(region.has('0,0,0')).toBe(true);
    expect(region.has(`${m},0,0`)).toBe(true);
    expect(region.has(`${m + 1},0,0`)).toBe(false);
  });

  it('empty fill between bookends offset in workspace', () => {
    const ox = 40;
    voxels.set(
      makeVoxels([
        [ox - 1, 0, 0, 0xff0000],
        [ox + 1, 0, 0, 0xff0000]
      ])
    );
    const { region, truncated } = getFillEmptyAt(ox, 0, 0, false);
    expect(truncated).toBe(false);
    expect(region.has(`${ox},0,0`)).toBe(true);
    expect(region.has(`${ox + m + 2},0,0`)).toBe(false);
  });

  it('stops empty BFS once region exceeds maxRegionSize', () => {
    voxels.set(
      makeVoxels([
        [-1, 0, 0, 0xff0000],
        [400, 0, 0, 0xff0000]
      ])
    );
    const capped = getFillEmptyAt(0, 0, 0, false, 256);
    expect(capped.truncated).toBe(true);
    expect(capped.region.size).toBe(257);
  });
});

describe('getCoplanarEmptySelectionAt', () => {
  beforeEach(() => {
    gridSize.set(32);
    voxels.set(new Map());
    selection.set(new Map());
    resetUndo();
  });

  it('selects 2x2 void in YZ plane ringed by solid at same x', () => {
    const solid: [number, number, number, number][] = [];
    const x = 0;
    for (const z of [-1, 2] as const) {
      for (const y of [-1, 0, 1, 2] as const) solid.push([x, y, z, 0xff0000]);
    }
    for (const z of [0, 1] as const) {
      solid.push([x, -1, z, 0xff0000]);
      solid.push([x, 2, z, 0xff0000]);
    }
    voxels.set(makeVoxels(solid));
    const region = getCoplanarEmptySelectionAt(0, 0, 0, [1, 0, 0]);
    expect(region.size).toBe(4);
    for (const y of [0, 1]) {
      for (const z of [0, 1]) {
        const k = `${x},${y},${z}`;
        expect(region.has(k)).toBe(true);
        expect(region.get(k)).toEqual(EMPTY_SEL_PLACEHOLDER);
      }
    }
  });

  it('returns empty when seed is solid', () => {
    voxels.set(makeVoxels([[0, 0, 0, 0xff0000]]));
    expect(getCoplanarEmptySelectionAt(0, 0, 0, [1, 0, 0]).size).toBe(0);
  });

  it('does not include coplanar solid from getCoplanarFacesSelectionAt slice', () => {
    const solid: [number, number, number, number][] = [];
    const x = 0;
    for (const z of [-1, 2] as const) {
      for (const y of [-1, 0, 1, 2] as const) solid.push([x, y, z, 0xff0000]);
    }
    for (const z of [0, 1] as const) {
      solid.push([x, -1, z, 0xff0000]);
      solid.push([x, 2, z, 0xff0000]);
    }
    voxels.set(makeVoxels(solid));
    const faces = getCoplanarFacesSelectionAt(0, -1, 0, [1, 0, 0]);
    const air = getCoplanarEmptySelectionAt(0, 0, 0, [1, 0, 0]);
    for (const k of air.keys()) {
      expect(faces.has(k)).toBe(false);
    }
    expect(faces.size).toBeGreaterThan(0);
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

  it('hollowOut with empty selection hollows using model bounds', () => {
    const positions: [number, number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) positions.push([x, y, z, 0xff0000]);
    voxels.set(makeVoxels(positions));
    selection.set(new Map());
    hollowOut();
    expect(get(voxels).has('1,1,1')).toBe(false);
  });

  it('hollowOut with partial shell selection still removes interior inside selection bbox', () => {
    const positions: [number, number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) positions.push([x, y, z, 0xff0000]);
    const full = makeVoxels(positions);
    voxels.set(full);
    const shell = new Map(full);
    shell.delete('1,1,1');
    selection.set(shell);
    hollowOut();
    expect(get(voxels).has('1,1,1')).toBe(false);
    expect(get(voxels).size).toBe(26);
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
