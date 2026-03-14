import { describe, it, expect } from 'vitest';
import { thickenPathForStroke, thickenPath } from './strokeGeometry';

const defaultParams = {
  strokeMode: 'line',
  clayBrushRadius: 1,
  branchTaper: false,
  puffRadius: 1,
  puffScatter: 0,
  puffRadiusRange: false,
  puffRadiusMin: 0,
  puffRadiusMax: 2,
  airbrushRadius: 1,
  airbrushScatter: 0,
  airbrushRadiusRange: false,
  airbrushRadiusMin: 0,
  airbrushRadiusMax: 2
};

describe('thickenPathForStroke', () => {
  it('clay modes ignore stroke mode (e.g. airbrush) and use clay brush logic', () => {
    // Bug: stroke mode was checked before clay mode, so clay tools (melt, smooth, etc.)
    // incorrectly used airbrush spherical expansion when stroke mode was "airbrush".
    // Clay with brush radius 1 should use thickenPath (3x3 cube = 27 voxels per point),
    // not puffPath (sphere ≈ 7 voxels per point for r=1).
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const clayResult = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'airbrush',
      clayMode: 'melt',
      clayBrushRadius: 1
    });
    const expectedClayBrush = thickenPath(singlePoint, 1);
    expect(clayResult).toEqual(expectedClayBrush);
    expect(clayResult.length).toBe(27); // 3x3x3 cube, not sphere
  });

  it('stroke mode airbrush applies when not using clay', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const airbrushResult = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'airbrush',
      clayBrushRadius: 1
    });
    // Airbrush uses puffPath (sphere); r=1 gives 7 voxels (center + 6 face neighbors)
    expect(airbrushResult.length).toBe(7);
  });
});
