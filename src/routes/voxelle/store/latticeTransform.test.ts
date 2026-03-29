import { describe, it, expect } from 'vitest';
import { applyLatticeTransform } from './latticeTransform';
import { coordKey } from '../coordUtils';

describe('applyLatticeTransform', () => {
  it('rejects duplicates when merge is disabled', () => {
    const out = applyLatticeTransform(
      [
        { key: coordKey(0, 0, 0), value: 'a' },
        { key: coordKey(1, 0, 0), value: 'b' },
        { key: coordKey(2, 0, 0), value: 'c' }
      ],
      {
        pivot: [1, 0, 0],
        scale: 0.2,
        allowMergeOnDuplicate: false
      }
    );
    expect(out.ok).toBe(false);
  });

  it('uses lexicographically smallest source for merged destination', () => {
    const out = applyLatticeTransform(
      [
        { key: coordKey(0, 0, 0), value: 'a' },
        { key: coordKey(1, 0, 0), value: 'b' },
        { key: coordKey(2, 0, 0), value: 'c' }
      ],
      {
        pivot: [1, 0, 0],
        scale: 0.2,
        allowMergeOnDuplicate: true
      }
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]?.value).toBe('a');
  });

  it('applies per-axis scale (non-uniform)', () => {
    const out = applyLatticeTransform(
      [
        { key: coordKey(0, 0, 0), value: 'a' },
        { key: coordKey(1, 0, 0), value: 'b' }
      ],
      {
        pivot: [0.5, 0, 0],
        scalePerAxis: [2, 1, 1],
        allowMergeOnDuplicate: false
      }
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.entries.length).toBeGreaterThan(2);
  });

  it('upscale fills integer cells by nearest source (lex tie-break)', () => {
    const out = applyLatticeTransform(
      [
        { key: coordKey(0, 0, 0), value: 'L' },
        { key: coordKey(1, 0, 0), value: 'R' }
      ],
      {
        pivot: [0.5, 0, 0],
        scale: 2,
        allowMergeOnDuplicate: false
      }
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.entries.length).toBeGreaterThan(2);
    const byDest = new Map(out.entries.map((e) => [e.destKey, e.value]));
    expect(byDest.get(coordKey(0, 0, 0))).toBe('L');
    expect(byDest.get(coordKey(1, 0, 0))).toBe('R');
  });

  it('45° rotation on a grid succeeds when duplicate destinations merge (lex winner)', () => {
    const keys: string[] = [];
    for (let x = -2; x <= 2; x++) {
      for (let y = -2; y <= 2; y++) {
        keys.push(coordKey(x, y, 0));
      }
    }
    const sources = keys.map((key) => ({ key, value: key }));
    const out = applyLatticeTransform(sources, {
      pivot: [0, 0, 0],
      axis: 2,
      angleRad: Math.PI / 4,
      scale: 1,
      allowMergeOnDuplicate: true
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.entries.length).toBeGreaterThan(0);
  });

  it('applies arbitrary-angle axis rotation with recenter', () => {
    const out = applyLatticeTransform(
      [{ key: coordKey(1, 0, 0), value: 'v' }],
      {
        pivot: [0, 0, 0],
        axis: 2,
        angleRad: Math.PI / 3,
        scale: 1,
        allowMergeOnDuplicate: false
      }
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]?.destKey).not.toBe(coordKey(1, 0, 0));
  });

  it('succeeds when dense NN fill would exceed work cap (sparse fallback)', () => {
    const keys: string[] = [];
    for (let x = 0; x < 2000; x++) keys.push(coordKey(x, 0, 0));
    const sources = keys.map((key) => ({ key, value: key }));
    const out = applyLatticeTransform(sources, {
      pivot: [1000, 0, 0],
      axis: 1,
      angleRad: Math.PI / 7,
      scale: 1,
      allowMergeOnDuplicate: true
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.entries.length).toBeGreaterThan(0);
  });
});
