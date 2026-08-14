import { describe, it, expect } from 'vitest';
import type { BadgeDocument, BadgePath, Vec2 } from '../store/types';
import { computeTopology } from './planar';

function ngon(cx: number, cy: number, r: number, sides: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function mkPath(id: string, pts: Vec2[], closed: boolean, strokeWidth: number): BadgePath {
  return {
    id,
    kind: 'shape',
    closed,
    start: pts[0],
    nodes: pts.slice(1).map((to) => ({ type: 'line' as const, to })),
    strokeWidth
  };
}

function mkDoc(paths: BadgePath[], size = 30): BadgeDocument {
  return {
    canvas: { width: size, height: size },
    metal: { paths, texts: [], baseThickness: 1.6, wallHeight: 1.2, bevelRatio: 0.5, minWallWidth: 1 },
    colorAssignments: {},
    materialAssignments: {},
    palette: [],
    render: { finish: 'gold', metalSurface: 'polished', enamelFinish: 'soft', background: '#000', maxSamples: 256 }
  };
}

describe('computeTopology — crossing dividers', () => {
  it('two crossing dividers inside a circle produce four wedge cells', () => {
    const outline = mkPath('outer', ngon(15, 15, 10, 64), true, 0);
    const divA = mkPath('a', [{ x: 5, y: 15 }, { x: 25, y: 15 }], false, 0.5);
    const divB = mkPath('b', [{ x: 15, y: 5 }, { x: 15, y: 25 }], false, 0.5);
    const topo = computeTopology(mkDoc([outline, divA, divB]));
    expect(topo.cells).toHaveLength(4);
  });

  it('two crossing dividers at default stroke width (0.4mm)', () => {
    const outline = mkPath('outer', ngon(15, 15, 10, 64), true, 0);
    const divA = mkPath('a', [{ x: 5, y: 15 }, { x: 25, y: 15 }], false, 0.4);
    const divB = mkPath('b', [{ x: 15, y: 5 }, { x: 15, y: 25 }], false, 0.4);
    const topo = computeTopology(mkDoc([outline, divA, divB]));
    expect(topo.cells).toHaveLength(4);
  });

  it('two crossing dividers at narrow stroke width (0.2mm)', () => {
    const outline = mkPath('outer', ngon(15, 15, 10, 64), true, 0);
    const divA = mkPath('a', [{ x: 5, y: 15 }, { x: 25, y: 15 }], false, 0.2);
    const divB = mkPath('b', [{ x: 15, y: 5 }, { x: 15, y: 25 }], false, 0.2);
    const topo = computeTopology(mkDoc([outline, divA, divB]));
    expect(topo.cells).toHaveLength(4);
  });

  it('two crossing dividers at very narrow stroke width (0.1mm)', () => {
    const outline = mkPath('outer', ngon(15, 15, 10, 64), true, 0);
    const divA = mkPath('a', [{ x: 5, y: 15 }, { x: 25, y: 15 }], false, 0.1);
    const divB = mkPath('b', [{ x: 15, y: 5 }, { x: 15, y: 25 }], false, 0.1);
    const topo = computeTopology(mkDoc([outline, divA, divB]));
    expect(topo.cells).toHaveLength(4);
  });

  it('two crossing dividers at stroke width 1.0mm', () => {
    const outline = mkPath('outer', ngon(15, 15, 10, 64), true, 0);
    const divA = mkPath('a', [{ x: 5, y: 15 }, { x: 25, y: 15 }], false, 1.0);
    const divB = mkPath('b', [{ x: 15, y: 5 }, { x: 15, y: 25 }], false, 1.0);
    const topo = computeTopology(mkDoc([outline, divA, divB]));
    expect(topo.cells).toHaveLength(4);
  });
});
