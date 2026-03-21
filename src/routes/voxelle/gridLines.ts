import { coordKey, parseCoordKey } from './coordUtils';
import type { Voxel } from './voxelMaterial';

export const CUBE_EDGES: number[][] = [
  [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5],
  [-0.5, -0.5, -0.5, -0.5, 0.5, -0.5],
  [-0.5, -0.5, -0.5, -0.5, -0.5, 0.5],
  [0.5, -0.5, -0.5, 0.5, 0.5, -0.5],
  [0.5, -0.5, -0.5, 0.5, -0.5, 0.5],
  [-0.5, 0.5, -0.5, 0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5, -0.5, 0.5, 0.5],
  [-0.5, -0.5, 0.5, 0.5, -0.5, 0.5],
  [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5],
  [0.5, 0.5, -0.5, 0.5, 0.5, 0.5],
  [0.5, -0.5, 0.5, 0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
];

export const EDGE_NEIGHBORS: [number, number, number][][] = [
  [
    [0, -1, 0],
    [0, 0, -1]
  ],
  [
    [-1, 0, 0],
    [0, 0, -1]
  ],
  [
    [-1, 0, 0],
    [0, -1, 0]
  ],
  [
    [1, 0, 0],
    [0, 0, -1]
  ],
  [
    [1, 0, 0],
    [0, -1, 0]
  ],
  [
    [0, 1, 0],
    [0, 0, -1]
  ],
  [
    [-1, 0, 0],
    [0, 1, 0]
  ],
  [
    [0, -1, 0],
    [0, 0, 1]
  ],
  [
    [-1, 0, 0],
    [0, 0, 1]
  ],
  [
    [1, 0, 0],
    [0, 1, 0]
  ],
  [
    [1, 0, 0],
    [0, 0, 1]
  ],
  [
    [0, 1, 0],
    [0, 0, 1]
  ]
];

/** Returns flat position array for grid lines (x1,y1,z1,x2,y2,z2,...). Empty if no visible edges. */
export function buildGridPositions(v: Map<string, Voxel>, surfaceLift = 0): number[] {
  if (v.size === 0) return [];
  const positions: number[] = [];
  const has = (x: number, y: number, z: number) => v.has(coordKey(x, y, z));
  for (const key of v.keys()) {
    const [x, y, z] = parseCoordKey(key);
    for (let i = 0; i < CUBE_EDGES.length; i++) {
      const [[dx1, dy1, dz1], [dx2, dy2, dz2]] = EDGE_NEIGHBORS[i];
      const n1 = has(x + dx1, y + dy1, z + dz1);
      const n2 = has(x + dx2, y + dy2, z + dz2);
      if (n1 && n2) continue;
      const edge = CUBE_EDGES[i];
      let ox = 0;
      let oy = 0;
      let oz = 0;
      if (surfaceLift > 0) {
        // Nudge visible edges away from coplanar faces to reduce depth-fighting flicker at far zoom.
        if (!n1) {
          ox += dx1;
          oy += dy1;
          oz += dz1;
        }
        if (!n2) {
          ox += dx2;
          oy += dy2;
          oz += dz2;
        }
        const len = Math.hypot(ox, oy, oz);
        if (len > 0) {
          const k = surfaceLift / len;
          ox *= k;
          oy *= k;
          oz *= k;
        }
      }
      positions.push(
        x + edge[0] + ox,
        y + edge[1] + oy,
        z + edge[2] + oz,
        x + edge[3] + ox,
        y + edge[4] + oy,
        z + edge[5] + oz
      );
    }
  }
  return positions;
}
