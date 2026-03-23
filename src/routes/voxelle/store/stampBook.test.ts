import { describe, it, expect } from 'vitest';
import { coordKey } from '../coordUtils';
import { plasticVoxel } from '../voxelMaterial';
import {
  selectionToStampEntries,
  entriesToSelectionMap,
  parseStampLibraryJson,
  stampRecordsToLibraryJson,
  normalizeStampTags,
  stampMatchesSearch
} from './stampBook';
import type { StampBookRecord, StampBookEntryTuple } from '../stampBookStorage';

describe('stampBook serialization', () => {
  it('selectionToStampEntries matches bbox-relative tuples', () => {
    const voxels = new Map([
      [coordKey(5, 6, 7), plasticVoxel(0xff0000)],
      [coordKey(6, 6, 7), plasticVoxel(0x00ff00)]
    ]);
    const selection = new Map([
      [coordKey(5, 6, 7), plasticVoxel(0x111111)],
      [coordKey(6, 6, 7), plasticVoxel(0x222222)]
    ]);
    const entries = selectionToStampEntries(voxels, selection);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(2);
    const set = new Set(entries!.map((e) => `${e[0]},${e[1]},${e[2]},${e[3].toString(16)}`));
    expect(set.has('0,0,0,ff0000')).toBe(true);
    expect(set.has('1,0,0,ff00')).toBe(true);
  });

  it('entriesToSelectionMap is inverse for relative-origin stamps', () => {
    const entries: StampBookEntryTuple[] = [
      [0, 0, 0, 0xabcabc, 'plastic'],
      [1, 2, 0, 0x112233, 'metal']
    ];
    const map = entriesToSelectionMap(entries);
    expect(map.get(coordKey(0, 0, 0))).toEqual(plasticVoxel(0xabcabc));
    expect(map.get(coordKey(1, 2, 0))?.material).toBe('metal');
    expect(map.get(coordKey(1, 2, 0))?.color).toBe(0x112233);
  });

  it('ignores selection keys without voxels', () => {
    const voxels = new Map([[coordKey(0, 0, 0), plasticVoxel(0xff)]]);
    const selection = new Map([
      [coordKey(0, 0, 0), plasticVoxel(0xff)],
      [coordKey(9, 9, 9), plasticVoxel(0xff)]
    ]);
    const entries = selectionToStampEntries(voxels, selection);
    expect(entries).not.toBeNull();
    expect(entries!.length).toBe(1);
  });
});

describe('stamp library JSON', () => {
  it('parseStampLibraryJson rejects wrong magic', () => {
    const r = parseStampLibraryJson('{"foo":1}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Voxelle stamp library/i);
  });

  it('parseStampLibraryJson rejects empty stamps array', () => {
    const r = parseStampLibraryJson('{"voxelleStampLibrary":1,"stamps":[]}');
    expect(r.ok).toBe(false);
  });

  it('roundtrips through stampRecordsToLibraryJson', () => {
    const records: StampBookRecord[] = [
      {
        id: 'id-a',
        name: 'One',
        order: 0,
        createdAt: 1,
        tags: ['tree', 'wood'],
        entries: [
          [0, 0, 0, 0xff00aa],
          [0, 1, 0, 0x334455, 'glass']
        ]
      }
    ];
    const text = stampRecordsToLibraryJson(records);
    const parsed = parseStampLibraryJson(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.stamps.length).toBe(1);
    expect(parsed.stamps[0]!.name).toBe('One');
    expect(parsed.stamps[0]!.entries.length).toBe(2);
    expect(parsed.stamps[0]!.entries[1]![4]).toBe('glass');
    expect(parsed.stamps[0]!.tags).toEqual(['tree', 'wood']);
  });
});

describe('stamp tags and search', () => {
  it('normalizeStampTags parses comma and semicolon lists', () => {
    expect(normalizeStampTags('A, B ; c')).toEqual(['a', 'b', 'c']);
    expect(normalizeStampTags(['X', 'x', 'Y'])).toEqual(['x', 'y']);
  });

  it('stampMatchesSearch matches name and tag substrings', () => {
    const r: StampBookRecord = {
      id: '1',
      name: 'Castle Gate',
      order: 0,
      createdAt: 1,
      tags: ['medieval', 'stone'],
      entries: [[0, 0, 0, 0xff0000]]
    };
    expect(stampMatchesSearch(r, '')).toBe(true);
    expect(stampMatchesSearch(r, 'gate')).toBe(true);
    expect(stampMatchesSearch(r, 'med')).toBe(true);
    expect(stampMatchesSearch(r, 'stone medieval')).toBe(true);
    expect(stampMatchesSearch(r, 'modern')).toBe(false);
  });
});
