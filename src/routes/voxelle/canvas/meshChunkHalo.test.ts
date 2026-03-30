import { describe, expect, it } from 'vitest';
import { deriveDirtyAndHaloChunkIds, deriveHaloMode } from './meshChunkHalo';
import { coordKey } from '../coordUtils';

const chunkSize = 32;

describe('deriveHaloMode', () => {
  it('uses face halo when AO is off', () => {
    expect(deriveHaloMode(new Set([coordKey(0, 0, 0)]), { aoStrength: 0, highScaleScene: false })).toBe(
      'face'
    );
  });

  it('uses full halo for strong AO', () => {
    expect(deriveHaloMode(new Set([coordKey(0, 0, 0)]), { aoStrength: 2, highScaleScene: false })).toBe(
      'full'
    );
  });

  it('uses omitCorners for subtle AO on typical edits', () => {
    expect(deriveHaloMode(new Set([coordKey(0, 0, 0)]), { aoStrength: 1, highScaleScene: false })).toBe(
      'omitCorners'
    );
  });

  it('uses face for legacy high-scale tiny stroke', () => {
    expect(deriveHaloMode(new Set([coordKey(0, 0, 0)]), { aoStrength: 1, highScaleScene: true })).toBe(
      'face'
    );
  });
});

describe('deriveDirtyAndHaloChunkIds', () => {
  it('omitCorners has fewer halo ids than full for one chunk (18 vs 26)', () => {
    const keys = new Set([coordKey(0, 0, 0)]);
    const full = deriveDirtyAndHaloChunkIds(keys, chunkSize, { aoStrength: 2, highScaleScene: false });
    const omit = deriveDirtyAndHaloChunkIds(keys, chunkSize, { aoStrength: 1, highScaleScene: false });
    expect(full.haloChunkIds.length).toBe(26);
    expect(omit.haloChunkIds.length).toBe(18);
  });

  it('omitCorners includes edge-diagonal chunk (1,1,0) from origin chunk', () => {
    const keys = new Set([coordKey(0, 0, 0)]);
    const { haloChunkIds } = deriveDirtyAndHaloChunkIds(keys, chunkSize, {
      aoStrength: 1,
      highScaleScene: false
    });
    expect(haloChunkIds).toContain('1,1,0');
  });

  it('face halo does not include diagonal (1,1,0)', () => {
    const keys = new Set([coordKey(0, 0, 0)]);
    const { haloChunkIds } = deriveDirtyAndHaloChunkIds(keys, chunkSize, {
      aoStrength: 0,
      highScaleScene: false
    });
    expect(haloChunkIds).not.toContain('1,1,0');
  });

  it('omitCorners is still cheaper than full on a line of keys', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 40; i++) keys.add(coordKey(i, 0, 0));
    const full = deriveDirtyAndHaloChunkIds(keys, chunkSize, { aoStrength: 2, highScaleScene: false });
    const omit = deriveDirtyAndHaloChunkIds(keys, chunkSize, { aoStrength: 1, highScaleScene: false });
    expect(omit.haloChunkIds.length).toBeLessThan(full.haloChunkIds.length);
  });
});
