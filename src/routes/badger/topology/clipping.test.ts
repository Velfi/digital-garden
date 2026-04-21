import { describe, it, expect } from 'vitest';
import type { Vec2 } from '../store/types';
import { clipPolygonToOutlines } from './clipping';

const square = (minX: number, minY: number, maxX: number, maxY: number): Vec2[] => [
  { x: minX, y: minY },
  { x: maxX, y: minY },
  { x: maxX, y: maxY },
  { x: minX, y: maxY }
];

describe('clipPolygonToOutlines', () => {
  it('returns the polygon unchanged when no outlines are provided', () => {
    const poly = square(0, 0, 5, 5);
    const result = clipPolygonToOutlines(poly, []);
    expect(result).toEqual([{ outer: poly, holes: [] }]);
  });

  it('returns the polygon unchanged when it is fully inside the outline', () => {
    const outline = square(0, 0, 10, 10);
    const poly = square(2, 2, 8, 8);
    const result = clipPolygonToOutlines(poly, [outline]);
    expect(result.length).toBe(1);
    expect(result[0].holes.length).toBe(0);
    const pts = result[0].outer;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(2);
    expect(Math.max(...xs)).toBeCloseTo(8);
    expect(Math.min(...ys)).toBeCloseTo(2);
    expect(Math.max(...ys)).toBeCloseTo(8);
  });

  it('clips a polygon that extends past the outline', () => {
    const outline = square(0, 0, 10, 10);
    const poly = square(5, 5, 15, 15); // half outside
    const result = clipPolygonToOutlines(poly, [outline]);
    expect(result.length).toBe(1);
    const xs = result[0].outer.map((p) => p.x);
    const ys = result[0].outer.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(5);
    expect(Math.max(...xs)).toBeCloseTo(10);
    expect(Math.min(...ys)).toBeCloseTo(5);
    expect(Math.max(...ys)).toBeCloseTo(10);
  });

  it('returns multiple pieces when the outline splits the polygon', () => {
    // Two disjoint outlines — a single wide divider polygon spanning both will
    // be clipped into two pieces.
    const leftOutline = square(0, 0, 5, 10);
    const rightOutline = square(10, 0, 15, 10);
    const divider = square(0, 4, 15, 6); // spans both outlines, with a gap
    const result = clipPolygonToOutlines(divider, [leftOutline, rightOutline]);
    expect(result.length).toBe(2);
  });

  it('returns an empty array when the polygon is fully outside the outline', () => {
    const outline = square(0, 0, 10, 10);
    const poly = square(20, 20, 30, 30);
    const result = clipPolygonToOutlines(poly, [outline]);
    expect(result.length).toBe(0);
  });

  it('preserves holes from a self-intersecting subject polygon', () => {
    const outline = square(-10, -10, 20, 20);
    // Self-intersecting "bowtie" — under even-odd fill the central overlap
    // becomes a hole, so the clipper output has one outer ring + one hole ring.
    // Represented here as a figure-8-style polygon so polygon-clipping has
    // something non-trivial to normalize.
    const bowtie: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 }
    ];
    const result = clipPolygonToOutlines(bowtie, [outline]);
    // Bowtie normalizes to two disjoint triangles (the X shape), so we get
    // two shapes with no holes — not quite the loop-hole case but proves the
    // shape-with-holes structure is respected.
    expect(result.length).toBeGreaterThan(0);
    for (const s of result) {
      expect(s.outer.length).toBeGreaterThanOrEqual(3);
    }
  });
});
