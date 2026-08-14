import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { BadgeDocument, BadgePath, Cell, Vec2 } from '../store/types';
import { computeTopology } from './planar';

// Min boundary gap between any two outline rings. Guarantees that parent and
// child boundaries stay apart by a comfortable margin so flattening error at
// the outline polygons (CELL_FLATNESS_MM) can't accidentally put a parent's
// sampled vertex on top of a child's, which would change the topology.
const MIN_GAP = 2;
// Min radius of any generated outline. Smaller rings trigger the "area ≤ 0.5"
// drop inside computeTopology, which the invariants below aren't written to
// handle (they assume each outline produces a cell).
const MIN_R = 3;

// ---- shape helpers ----

function ngon(cx: number, cy: number, r: number, sides: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function polyPath(id: string, pts: Vec2[]): BadgePath {
  return {
    id,
    kind: 'shape',
    closed: true,
    start: pts[0],
    nodes: pts.slice(1).map((to) => ({ type: 'line' as const, to })),
    strokeWidth: 0
  };
}

function makeDoc(paths: BadgePath[], size = 400): BadgeDocument {
  return {
    canvas: { width: size, height: size },
    metal: { paths, texts: [], baseThickness: 1.6, wallHeight: 1.2, bevelRatio: 0.5, minWallWidth: 1 },
    colorAssignments: {},
    materialAssignments: {},
    palette: [],
    render: { finish: 'gold', metalSurface: 'polished', enamelFinish: 'soft', background: '#000', maxSamples: 256 }
  };
}

function polyArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y) {
      const xI = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xI) inside = !inside;
    }
  }
  return inside;
}

// ---- tree-of-outlines generator ----

// A node in a nesting tree. Each node is a circle; its children sit strictly
// inside it, mutually non-overlapping, with a `MIN_GAP` buffer on every edge.
type Node = {
  cx: number;
  cy: number;
  r: number;
  sides: number;
  children: Node[];
};

// Try to place `count` non-overlapping child circles inside a parent. Returns
// fewer than `count` if the parent is too small to fit them all — this is a
// best-effort packer, not a guarantee.
function packChildren(
  parent: Node,
  count: number,
  rng: () => number
): Node[] {
  const out: Node[] = [];
  const maxInnerR = parent.r - MIN_GAP;
  if (maxInnerR < MIN_R) return out;
  let attempts = 0;
  while (out.length < count && attempts < count * 30) {
    attempts++;
    const r = MIN_R + rng() * (maxInnerR * 0.4);
    // Pick a center within parent that keeps the child fully inside with gap.
    const maxOffset = parent.r - r - MIN_GAP;
    if (maxOffset < 0) continue;
    const theta = rng() * Math.PI * 2;
    const rho = rng() * maxOffset;
    const cx = parent.cx + Math.cos(theta) * rho;
    const cy = parent.cy + Math.sin(theta) * rho;
    // Reject overlap with any already-placed sibling (including gap).
    let bad = false;
    for (const s of out) {
      const d = Math.hypot(cx - s.cx, cy - s.cy);
      if (d < r + s.r + MIN_GAP) {
        bad = true;
        break;
      }
    }
    if (bad) continue;
    const sides = 32 + Math.floor(rng() * 32); // 32..63
    out.push({ cx, cy, r, sides, children: [] });
  }
  return out;
}

// Build a random tree of outlines. depth: how many recursion levels. branch:
// max children at each node (best-effort — packer may fit fewer).
function buildTree(
  rootR: number,
  depth: number,
  branch: number,
  rng: () => number
): Node {
  const root: Node = { cx: 200, cy: 200, r: rootR, sides: 48, children: [] };
  const queue: { node: Node; depth: number }[] = [{ node: root, depth }];
  while (queue.length > 0) {
    const { node, depth: d } = queue.shift()!;
    if (d <= 0) continue;
    const childCount = 1 + Math.floor(rng() * branch);
    const kids = packChildren(node, childCount, rng);
    node.children = kids;
    for (const k of kids) queue.push({ node: k, depth: d - 1 });
  }
  return root;
}

// Flatten the tree into a list of paths, preserving an id→node mapping so
// tests can cross-reference.
function treeToPaths(root: Node): { paths: BadgePath[]; nodes: Node[]; idByNode: Map<Node, string> } {
  const nodes: Node[] = [];
  const idByNode = new Map<Node, string>();
  const walk = (n: Node) => {
    nodes.push(n);
    idByNode.set(n, `n${nodes.length - 1}`);
    for (const c of n.children) walk(c);
  };
  walk(root);
  const paths = nodes.map((n) => polyPath(idByNode.get(n)!, ngon(n.cx, n.cy, n.r, n.sides)));
  return { paths, nodes, idByNode };
}

// Match each tree node to a cell by centroid-containment + area affinity.
// Every node must map to exactly one cell and vice versa, or the topology
// produced something unexpected.
function matchNodesToCells(nodes: Node[], cells: Cell[]): Map<Node, Cell> {
  // For each cell, find the node whose disc contains the cell's centroid AND
  // whose radius is the smallest among such nodes. That's the cell's owner
  // (the innermost enclosing outline = the cell's own outline).
  const out = new Map<Node, Cell>();
  for (const cell of cells) {
    let owner: Node | null = null;
    let ownerR = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(cell.centroid.x - n.cx, cell.centroid.y - n.cy);
      if (d >= n.r) continue;
      if (n.r < ownerR) {
        owner = n;
        ownerR = n.r;
      }
    }
    if (owner) out.set(owner, cell);
  }
  return out;
}

// ---- properties ----

describe('computeTopology — property tests (nested outlines)', () => {
  it('every outline in a valid nested tree maps to exactly one cell', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 3 }), // depth
        fc.integer({ min: 1, max: 4 }), // branch
        (seed, depth, branch) => {
          const rng = mulberry32(seed);
          const tree = buildTree(80, depth, branch, rng);
          const { paths, nodes } = treeToPaths(tree);
          const topo = computeTopology(makeDoc(paths));

          expect(topo.cells).toHaveLength(nodes.length);
          const match = matchNodesToCells(nodes, topo.cells);
          expect(match.size).toBe(nodes.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('cell IDs are unique', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (seed, depth, branch) => {
          const rng = mulberry32(seed);
          const tree = buildTree(80, depth, branch, rng);
          const { paths } = treeToPaths(tree);
          const topo = computeTopology(makeDoc(paths));

          const ids = new Set(topo.cells.map((c) => c.id));
          expect(ids.size).toBe(topo.cells.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('each cell has one hole per direct child outline (and no others)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (seed, depth, branch) => {
          const rng = mulberry32(seed);
          const tree = buildTree(80, depth, branch, rng);
          const { paths, nodes } = treeToPaths(tree);
          const topo = computeTopology(makeDoc(paths));
          const match = matchNodesToCells(nodes, topo.cells);

          for (const n of nodes) {
            const cell = match.get(n)!;
            expect(cell.holes).toHaveLength(n.children.length);
            // Each direct child's circle-area should match one of the holes.
            for (const c of n.children) {
              const expectedArea = Math.PI * c.r * c.r;
              const found = cell.holes.some(
                (h) => Math.abs(polyArea(h) - expectedArea) / expectedArea < 0.02
              );
              expect(found).toBe(true);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('a cell’s centroid never lies inside any of its own holes (no stable-id collisions)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (seed, depth, branch) => {
          const rng = mulberry32(seed);
          const tree = buildTree(80, depth, branch, rng);
          const { paths } = treeToPaths(tree);
          const topo = computeTopology(makeDoc(paths));

          for (const cell of topo.cells) {
            for (const h of cell.holes) {
              expect(pointInPoly(cell.centroid, h)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('cell area equals the outer polygon area minus the sum of hole areas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (seed, depth, branch) => {
          const rng = mulberry32(seed);
          const tree = buildTree(80, depth, branch, rng);
          const { paths } = treeToPaths(tree);
          const topo = computeTopology(makeDoc(paths));

          for (const cell of topo.cells) {
            let expected = polyArea(cell.polygon);
            for (const h of cell.holes) expected -= polyArea(h);
            // Allow 1% slack for flattening error on the outer polygon.
            expect(Math.abs(cell.area - expected) / Math.max(expected, 1)).toBeLessThan(0.01);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('a random point inside the badge lands in exactly one cell (outer ∧ ¬holes)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (seed, depth, branch) => {
          const rng = mulberry32(seed);
          const tree = buildTree(80, depth, branch, rng);
          const { paths } = treeToPaths(tree);
          const topo = computeTopology(makeDoc(paths));

          // Sample 50 points inside the root disc and confirm each is in
          // exactly one cell. A point may land in the wall buffer between
          // parent boundary and child (the ring annulus) or in the innermost
          // disc — either way, exactly one cell should claim it.
          const root = topo.outlineUnion[0];
          if (!root) return;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of root) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          for (let i = 0; i < 50; i++) {
            const p = { x: minX + rng() * (maxX - minX), y: minY + rng() * (maxY - minY) };
            // Skip points outside the root silhouette.
            if (!pointInPoly(p, root)) continue;
            let hits = 0;
            for (const cell of topo.cells) {
              if (!pointInPoly(p, cell.polygon)) continue;
              let inHole = false;
              for (const h of cell.holes) {
                if (pointInPoly(p, h)) {
                  inHole = true;
                  break;
                }
              }
              if (!inHole) hits++;
            }
            expect(hits).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('computeTopology is deterministic — running twice yields the same cells', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 1, max: 4 }),
        (seed, depth, branch) => {
          const rng = mulberry32(seed);
          const tree = buildTree(80, depth, branch, rng);
          const { paths } = treeToPaths(tree);
          const topo1 = computeTopology(makeDoc(paths));
          const topo2 = computeTopology(makeDoc(paths));

          expect(topo2.cells).toHaveLength(topo1.cells.length);
          const ids1 = topo1.cells.map((c) => c.id).sort();
          const ids2 = topo2.cells.map((c) => c.id).sort();
          expect(ids2).toEqual(ids1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- seeded PRNG ----
// Mulberry32. Deterministic, so failures shrink cleanly against the seed alone.
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
