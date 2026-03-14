import { describe, it, expect } from 'vitest';
import { mergeSelection } from './selection';
function makeSel(entries: [number, number, number][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [x, y, z] of entries) m.set(`${x},${y},${z}`, 0x888888);
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
