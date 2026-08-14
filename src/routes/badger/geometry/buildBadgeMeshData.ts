import * as THREE from 'three';
import type { BadgeDocument, Cell, EnamelMaterial, MetalSurface, Vec2 } from '../store/types';
import {
  intersectPolygonWithShapes,
  intersectShapes,
  normalizeClosedRing,
  subtractPolygons,
  unionPolygons
} from '../topology/clipping';
import type { UnionShape } from '../topology/clipping';
import {
  flattenPath,
  isEffectivelyClosed,
  signedArea,
  strokeClosedPath,
  thickenPolyline
} from '../topology/geometry';
import {
  offsetRingSingle,
  shrinkShapeFromAllBoundaries
} from '../topology/offset';
import { effectiveKind } from '../topology/planar';
import {
  ENAMEL_CAPILLARY_LENGTH_MM,
  cellMeniscusContext,
  meniscusDipAt,
  meniscusDipAtWall
} from './meniscusProfile';

// Serializable product of the mesh pipeline. Each piece corresponds to one
// future THREE.Mesh; the main thread turns these back into meshes + materials
// in assembleBadgeMesh. Keeping geometry as raw typed arrays lets us ship
// this whole object across a worker boundary via Transferable.
export type BadgePieceRole = 'metal' | 'wall' | 'enamel';

export type BadgeMeshPiece = {
  role: BadgePieceRole;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  colorHex?: string;
  material?: EnamelMaterial;
};

export type BadgeMeshData = {
  pieces: BadgeMeshPiece[];
  finishColor: number;
  metalSurface: MetalSurface;
  enamelFinish: 'soft' | 'hard';
  baseThickness: number;
  // World-Y where the base's top cap sits. The direct base builder keeps
  // the top cap at exactly the nominal thickness; the chamfer band is
  // carved inward from the outer silhouette, not raised above it, so
  // walls and enamel can always sit at y = baseThickness without
  // embedding into the chamfer.
  baseTopY: number;
};

// ============================================================================
//                           Direct mesh assembly
// ============================================================================
//
// The old pipeline fed every 3D piece through THREE.ExtrudeGeometry, then
// ran a crease-threshold smoother over the result to rebuild vertex
// normals. That combination produced two classes of artefacts:
//
//   1. ExtrudeGeometry's bevel grows the silhouette outward from the 2D
//      shape, but we wanted a chamfer that carves inward (so the top rim
//      rounds visibly without the wall bulging past the ribbon footprint).
//      Working around that needed bevelOffset: -bevel, which stacked a
//      second offset onto the hand-rolled insetPolygon used to build the
//      ribbon — errors compounded at concave corners.
//   2. The 35°-crease smoother split/merged vertices based on triangle-
//      to-triangle angle, so near-threshold corners snapped inconsistently
//      under floating-point noise. Visible as the black slivers and
//      uneven borders the user reported.
//
// This pipeline replaces both. Every piece is assembled from a handful of
// primitives that emit face-exact normals per band:
//
//   * emitCap(ring, holes, z, ±1): triangulates a horizontal cap.
//   * emitBand(lower, upper, zLower, zUpper, outwardSign): one quad per
//     edge between two aligned rings at two heights, with the band's face
//     normal written directly onto each vertex.
//   * buildSlab(shape, zBottom, zTop, chamferSize, chamferHeight): the
//     composite used for metal base, walls, and hard-enamel cells.
//
// Because each band owns its vertices, sharp edges stay sharp (adjacent
// bands get different normals at the same position) and smooth regions
// stay smooth (a single band shares its normal across its quads). No
// crease threshold, no mergeVertices, no post-processing.

interface MeshAccum {
  positions: number[];
  normals: number[];
  indices: number[];
}

function newAccum(): MeshAccum {
  return { positions: [], normals: [], indices: [] };
}

function accumToGeom(a: MeshAccum): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(a.positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(a.normals, 3));
  geom.setIndex(a.indices);
  return geom;
}

function pushVertex(
  a: MeshAccum,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): number {
  const idx = a.positions.length / 3;
  a.positions.push(x, y, z);
  a.normals.push(nx, ny, nz);
  return idx;
}

// Triangulate a polygon-with-holes ring using THREE's earcut and emit
// horizontal cap triangles at height z with a fixed normal (+Z for top
// caps, −Z for bottom caps). CCW outer + CW holes produce triangles
// wound CCW when viewed from +Z; we flip the winding for −Z caps.
function emitCap(
  a: MeshAccum,
  outer: Vec2[],
  holes: Vec2[][],
  z: number,
  nz: number
): void {
  if (outer.length < 3) return;
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const hole of holes) {
    if (hole.length < 3) continue;
    shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
  }
  const geom = new THREE.ShapeGeometry(shape);
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const idxAttr = geom.getIndex();
  const n = posAttr.count;
  const baseIdx = a.positions.length / 3;
  for (let i = 0; i < n; i++) {
    a.positions.push(posAttr.getX(i), posAttr.getY(i), z);
    a.normals.push(0, 0, nz);
  }
  if (idxAttr) {
    const src = idxAttr.array as ArrayLike<number>;
    if (nz >= 0) {
      for (let i = 0; i < src.length; i++) a.indices.push(baseIdx + src[i]);
    } else {
      for (let i = 0; i < src.length; i += 3) {
        a.indices.push(baseIdx + src[i], baseIdx + src[i + 2], baseIdx + src[i + 1]);
      }
    }
  }
  geom.dispose();
}

// Emit a band of quads between two 2D rings at two heights. Each edge i
// of `lower` connects to edge i of `upper` forming one quad; `outwardSign`
// flips the normal for holes so the normal points into solid material.
// Normals are computed per edge (face-exact) and shared by both triangles
// of that edge's quad, but *not* shared across edges — adjacent-edge
// corners emit two vertices with two normals. That's what keeps the band
// shaded as a faceted ribbon without bleeding into the cap or the next
// band.
function emitBand(
  a: MeshAccum,
  lower: Vec2[],
  upper: Vec2[],
  zLower: number,
  zUpper: number,
  outwardSign: 1 | -1
): void {
  const n = lower.length;
  if (n < 3 || upper.length !== n) return;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const l0 = lower[i];
    const l1 = lower[j];
    const u0 = upper[i];
    const u1 = upper[j];
    const ex = l1.x - l0.x;
    const ey = l1.y - l0.y;
    const ux = u0.x - l0.x;
    const uy = u0.y - l0.y;
    const uz = zUpper - zLower;
    let nx = ey * uz;
    let ny = -ex * uz;
    let nz = ex * uy - ey * ux;
    nx *= outwardSign;
    ny *= outwardSign;
    nz *= outwardSign;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-9) continue;
    nx /= L; ny /= L; nz /= L;
    const v00 = pushVertex(a, l0.x, l0.y, zLower, nx, ny, nz);
    const v10 = pushVertex(a, l1.x, l1.y, zLower, nx, ny, nz);
    const v11 = pushVertex(a, u1.x, u1.y, zUpper, nx, ny, nz);
    const v01 = pushVertex(a, u0.x, u0.y, zUpper, nx, ny, nz);
    a.indices.push(v00, v10, v11);
    a.indices.push(v00, v11, v01);
  }
}

// Build a slab piece with an optional chamfered top outer edge. The outer
// ring at the top-cap height is drawn at the chamfered silhouette
// (smaller than the straight-side silhouette by `chamferSize`), and a
// slanted band connects the two. Holes stay vertical-walled — only the
// outer edge gets the round-over, matching a stamped base plate whose
// rim is tumbled smooth while interior cutout edges stay square.
function buildSlab(
  shape: UnionShape,
  zBottom: number,
  zTop: number,
  chamferSize: number,
  chamferHeight: number,
  opts?: { chamferHoles?: boolean }
): MeshAccum {
  const a = newAccum();

  const outerCCW = signedArea(shape.outer) >= 0 ? shape.outer : [...shape.outer].reverse();
  const holesCW = shape.holes.map((h) => (signedArea(h) < 0 ? h : [...h].reverse()));
  const chamferHoles = opts?.chamferHoles === true;

  let chamferOuter: Vec2[] | null = null;
  const zChamferStart = zTop - chamferHeight;
  if (chamferSize > 0 && chamferHeight > 0) {
    for (let scale = 1; scale >= 0.2; scale -= 0.1) {
      const trySize = chamferSize * scale;
      const inset = offsetRingSingle(outerCCW, -trySize);
      if (inset.length >= 3) {
        chamferOuter = reprojectRing(outerCCW, inset, trySize);
        break;
      }
    }
  }
  const chamferHolesCW: Vec2[][] = [];
  for (const hole of holesCW) {
    let chamferHole: Vec2[] | null = null;
    if (chamferHoles && chamferSize > 0 && chamferHeight > 0) {
      for (let scale = 1; scale >= 0.2; scale -= 0.1) {
        const trySize = chamferSize * scale;
        const expanded = offsetRingSingle(hole, trySize);
        if (expanded.length >= 3) {
          const expandedCW = signedArea(expanded) < 0 ? expanded : [...expanded].reverse();
          chamferHole = reprojectRing(hole, expandedCW, -trySize);
          break;
        }
      }
    }
    chamferHolesCW.push(chamferHole ?? hole);
  }

  emitCap(a, outerCCW, holesCW, zBottom, -1);

  const outerTopZ = chamferOuter ? zChamferStart : zTop;
  emitBand(a, outerCCW, outerCCW, zBottom, outerTopZ, +1);

  if (chamferOuter) {
    emitBand(a, outerCCW, chamferOuter, zChamferStart, zTop, +1);
  }

  for (let i = 0; i < holesCW.length; i++) {
    const hole = holesCW[i];
    const chamferHole = chamferHolesCW[i];
    const holeTopZ = chamferHole !== hole ? zChamferStart : zTop;
    emitBand(a, hole, hole, zBottom, holeTopZ, -1);
    if (chamferHole !== hole) {
      emitBand(a, hole, chamferHole, zChamferStart, zTop, -1);
    }
  }

  emitCap(a, chamferOuter ?? outerCCW, chamferHolesCW, zTop, +1);

  return a;
}

function buildWallSlab(
  shape: UnionShape,
  zBottom: number,
  zTop: number,
  crownSize: number
): MeshAccum {
  if (crownSize <= 1e-4) return buildSlab(shape, zBottom, zTop, 0, 0);

  const a = newAccum();
  const outerCCW = signedArea(shape.outer) >= 0 ? shape.outer : [...shape.outer].reverse();
  const holesCW = shape.holes.map((h) => (signedArea(h) < 0 ? h : [...h].reverse()));

  emitCap(a, outerCCW, holesCW, zBottom, -1);
  emitBand(a, outerCCW, outerCCW, zBottom, zTop - crownSize, +1);
  for (const hole of holesCW) emitBand(a, hole, hole, zBottom, zTop - crownSize, -1);

  // Approximate a rounded crown with several inset bands. This makes high
  // bevel values visually read as a domed wall top rather than a tiny single
  // chamfer strip.
  const steps = [
    { t: 0.35, h: 0.45 },
    { t: 0.68, h: 0.82 },
    { t: 1.0, h: 1.0 }
  ];
  let prevOuter = outerCCW;
  let prevHoles = holesCW;
  let prevZ = zTop - crownSize;
  for (const step of steps) {
    const amount = crownSize * step.t;
    const nextOuter = offsetRingByAmount(outerCCW, -amount, +1);
    if (!nextOuter) break;
    const nextHoles: Vec2[][] = [];
    let valid = true;
    for (let i = 0; i < prevHoles.length; i++) {
      const nextHole = offsetRingByAmount(holesCW[i], amount, -1);
      if (!nextHole) {
        valid = false;
        break;
      }
      nextHoles.push(nextHole);
    }
    if (!valid) break;
    const z = zTop - crownSize + crownSize * step.h;
    emitBand(a, prevOuter, nextOuter, prevZ, z, +1);
    for (let i = 0; i < prevHoles.length; i++) {
      emitBand(a, prevHoles[i], nextHoles[i], prevZ, z, -1);
    }
    prevOuter = nextOuter;
    prevHoles = nextHoles;
    prevZ = z;
  }

  emitCap(a, prevOuter, prevHoles, zTop, +1);
  return a;
}

// Project each vertex of `source` inward by `distance` along its corner
// bisector to produce a ring usable as the upper edge of a chamfer band —
// one output vertex per source vertex so emitBand's per-edge
// correspondence is preserved. `target` (the robust Minkowski-inset
// ring) is a fallback for very thin arms where the bisector projection
// collapses.
function reprojectRing(source: Vec2[], target: Vec2[], distance: number): Vec2[] {
  const n = source.length;
  const out: Vec2[] = [];
  const sourceArea = signedArea(source);
  for (let i = 0; i < n; i++) {
    const prev = source[(i - 1 + n) % n];
    const cur = source[i];
    const next = source[(i + 1) % n];
    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    const L1 = Math.hypot(d1x, d1y) || 1;
    const L2 = Math.hypot(d2x, d2y) || 1;
    const n1x = d1y / L1;
    const n1y = -d1x / L1;
    const n2x = d2y / L2;
    const n2y = -d2x / L2;
    const nx = n1x + n2x;
    const ny = n1y + n2y;
    const L = Math.hypot(nx, ny) || 1;
    const dot = Math.max(0.35, (n1x * nx + n1y * ny) / L);
    const bis = 1 / dot;
    out.push({
      x: cur.x + (nx / L) * distance * bis,
      y: cur.y + (ny / L) * distance * bis
    });
  }
  const outArea = signedArea(out);
  if (Math.abs(outArea) < 1e-9 || outArea * sourceArea <= 0) {
    return sampleRingToLength(target, n);
  }
  return out;
}

function offsetRingByAmount(
  current: Vec2[],
  amount: number,
  fallbackDirection: 1 | -1
): Vec2[] | null {
  const target = offsetRingSingle(current, amount);
  if (target.length < 3) return null;
  const targetOriented =
    signedArea(target) * signedArea(current) > 0 ? target : [...target].reverse();
  const reprojection = reprojectRing(
    current,
    targetOriented,
    Math.abs(amount) * fallbackDirection
  );
  return reprojection.length >= 3 ? reprojection : targetOriented;
}

function sampleRingToLength(ring: Vec2[], target: number): Vec2[] {
  const n = ring.length;
  if (n === 0 || target <= 0) return [];
  const cum: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    cum.push(cum[cum.length - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-9) return Array.from({ length: target }, () => ({ ...ring[0] }));
  const out: Vec2[] = [];
  for (let i = 0; i < target; i++) {
    const s = (i / target) * total;
    let j = 0;
    while (j < n && cum[j + 1] < s) j++;
    const segLen = cum[j + 1] - cum[j] || 1;
    const t = (s - cum[j]) / segLen;
    const a = ring[j];
    const b = ring[(j + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function distToRing(px: number, py: number, ring: Vec2[]): number {
  let best = Infinity;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = px - a.x;
    const apy = py - a.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = (apx * abx + apy * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

function ringThroat(ring: Vec2[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let best = Infinity;
  const sample = (px: number, py: number, skipA: number, skipB: number) => {
    for (let j = 0; j < n; j++) {
      if (j === skipA || j === skipB) continue;
      const a = ring[j];
      const b = ring[(j + 1) % n];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const apx = px - a.x;
      const apy = py - a.y;
      const len2 = abx * abx + aby * aby || 1;
      let t = (apx * abx + apy * aby) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + abx * t;
      const cy = a.y + aby * t;
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
  };
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sample(a.x, a.y, (i - 1 + n) % n, i);
    sample((a.x + b.x) / 2, (a.y + b.y) / 2, i, -1);
  }
  return Math.sqrt(best);
}

function safeChamferSize(shape: UnionShape, requested: number): number {
  if (requested <= 0) return 0;
  let limit = ringThroat(shape.outer);
  for (const hole of shape.holes) {
    limit = Math.min(limit, ringThroat(hole));
    let gap = Infinity;
    for (const v of hole) {
      const d = distToRing(v.x, v.y, shape.outer);
      if (d < gap) gap = d;
    }
    for (const v of shape.outer) {
      const d = distToRing(v.x, v.y, hole);
      if (d < gap) gap = d;
    }
    limit = Math.min(limit, gap);
  }
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(requested, Math.max(0, limit - 1e-3));
}

export function buildBadgeMeshData(
  doc: BadgeDocument,
  cells: Cell[],
  finishColor: number,
  metalSurface: MetalSurface,
  enamelFinish: 'soft' | 'hard'
): BadgeMeshData {
  const pieces: BadgeMeshPiece[] = [];

  const w = doc.canvas.width;
  const h = doc.canvas.height;
  const centerX = w / 2;
  const centerY = h / 2;
  // doc → world mapping: x -> X, y -> -Y in the XY plane, Z is depth.
  // The assemble step rotates -90° around X so +Z becomes +Y world-up.
  const toWorld = (p: Vec2): Vec2 => ({ x: p.x - centerX, y: -(p.y - centerY) });
  const toWorldCCW = (poly: Vec2[]): Vec2[] => {
    const pts = poly.map(toWorld);
    return signedArea(pts) >= 0 ? pts : pts.reverse();
  };
  const toWorldCW = (poly: Vec2[]): Vec2[] => {
    const pts = poly.map(toWorld);
    return signedArea(pts) < 0 ? pts : pts.reverse();
  };
  const shapeToWorld = (s: UnionShape): UnionShape => ({
    outer: toWorldCCW(s.outer),
    holes: s.holes.map(toWorldCW)
  });

  const baseThickness = doc.metal.baseThickness;
  const wallHeight = doc.metal.wallHeight;
  const enamelInsetOutline = doc.metal.minWallWidth;
  const enamelHeight = enamelFinish === 'hard' ? wallHeight * 0.85 : wallHeight * 0.6;
  const meniscusFloorClearance = Math.max(0.05, Math.min(wallHeight * 0.15, 0.2));
  const meniscusDepth =
    enamelFinish === 'soft'
      ? Math.min(meniscusDipAtWall(), Math.max(0, enamelHeight - meniscusFloorClearance))
      : 0;
  // Top-edge round-overs are explicit chamfers: the top silhouette
  // shrinks inward by chamferSize, and a slanted band connects it to the
  // straight side.
  const bevelTargetMm = doc.metal.bevelRatio * doc.metal.minWallWidth * 0.5;
  const baseChamferSize = Math.min(bevelTargetMm, baseThickness * 0.45);
  const baseChamferHeight = baseChamferSize;
  // Walls want a visibly larger dome than the base rim: minWallWidth is a
  // manufacturing floor, not the actual width of most rendered wall ribs.
  // Drive the requested wall chamfer from wall height, then let buildSlab
  // back off automatically if a particular wall is too thin to support it.
  const wallChamferCap = wallHeight * 0.45;

  const outlinePaths = doc.metal.paths.filter((p) => effectiveKind(p) === 'outline');
  const cutoutPaths = doc.metal.paths.filter((p) => effectiveKind(p) === 'cutout');

  // Fixed 0.015mm tessellation tolerance — below the canvas pixel grid,
  // coarse enough that typical badge outlines stay under ~400 segments.
  const pathFlatness = 0.015;
  const flattenForMesh = (p: Parameters<typeof flattenPath>[0]) =>
    flattenPath(p, { flatness: pathFlatness });

  const rawOutlineShapes: UnionShape[] = [];
  const cutoutPolys: Vec2[][] = [];
  for (const o of outlinePaths) {
    const flat = flattenForMesh(o);
    if (flat.length < 3) continue;
    for (const s of normalizeClosedRing(flat)) {
      rawOutlineShapes.push({ outer: s.outer, holes: [] });
      for (const hLoop of s.holes) cutoutPolys.push(hLoop);
    }
  }
  for (const c of cutoutPaths) {
    const flat = flattenForMesh(c);
    if (flat.length < 3) continue;
    for (const s of normalizeClosedRing(flat)) cutoutPolys.push(s.outer);
  }
  const outlineShapes = unionPolygons(rawOutlineShapes);
  for (const s of outlineShapes) {
    for (const hLoop of s.holes) cutoutPolys.push(hLoop);
    s.holes = [];
  }

  // Buffer each cutout outward by a fraction of the flatness tolerance
  // before subtracting from other shapes. Near-tangent edges can leave
  // sub-pixel slivers that render as thin fins; the small outward
  // offset absorbs those without visibly widening the hole.
  const cutoutBuffer = Math.max(pathFlatness * 0.5, 0.01);
  const inflatedCutouts = cutoutPolys
    .map((c) => offsetRingSingle(c, cutoutBuffer))
    .filter((p) => p.length >= 3);

  // ---- metal base ----
  const baseShapes: UnionShape[] =
    inflatedCutouts.length > 0
      ? subtractPolygons(outlineShapes, inflatedCutouts)
      : outlineShapes;
  for (const shape of baseShapes) {
    const worldShape = shapeToWorld(shape);
    const accum = buildSlab(worldShape, 0, baseThickness, baseChamferSize, baseChamferHeight);
    pieces.push(geomToPiece('metal', accumToGeom(accum)));
  }

  // ---- walls layer ----
  const wallPaths = doc.metal.paths.filter((p) => effectiveKind(p) !== 'cutout');
  const wallShapes: UnionShape[] = [];
  for (const p of wallPaths) {
    const flat = flattenForMesh(p);
    if (flat.length < 2) continue;
    const width = Math.max(0.1, p.strokeWidth);
    if (isEffectivelyClosed(p)) {
      if (flat.length < 3) continue;
      const stroked = strokeClosedPath(flat, width);
      if (stroked.length === 0) continue;
      const ribbon = unionPolygons(stroked.map((outer) => ({ outer, holes: [] })));
      for (const piece of intersectShapes(ribbon, outlineShapes)) {
        if (piece.outer.length < 3) continue;
        wallShapes.push(piece);
      }
      continue;
    }
    const thickened = thickenPolyline(flat, width);
    if (thickened.length < 3) continue;
    const ribbon = unionPolygons([{ outer: thickened, holes: [] }]);
    for (const piece of intersectShapes(ribbon, outlineShapes)) {
      if (piece.outer.length < 3) continue;
      wallShapes.push(piece);
    }
  }
  // Each cutout needs its own wall ribbon so enamel in adjacent cells
  // doesn't spill into the hole. The robust offset's round joins give
  // even ribbon width around reflex corners — the old hand-rolled
  // insetPolygon clamped the miter length to 4× and produced the visible
  // width asymmetry the user reported.
  for (const poly of cutoutPolys) {
    const outer = offsetRingSingle(poly, doc.metal.minWallWidth);
    if (outer.length < 3) continue;
    wallShapes.push({ outer, holes: [poly] });
  }
  let mergedWalls = unionPolygons(wallShapes);
  if (inflatedCutouts.length > 0) mergedWalls = subtractPolygons(mergedWalls, inflatedCutouts);
  for (const shape of mergedWalls) {
    const localWallHalfWidth = safeChamferSize(shape, Number.POSITIVE_INFINITY);
    // Make the top flatten vanish faster near the high end of the slider.
    // Users read "90%" as "almost fully rounded", not "leave 10% of the
    // half-width untouched on each side".
    const easedBevelRatio = 1 - (1 - doc.metal.bevelRatio) ** 2;
    const wallChamfer = Math.min(wallChamferCap, localWallHalfWidth * easedBevelRatio);
    const worldShape = shapeToWorld(shape);
    const accum = buildWallSlab(worldShape, 0, wallHeight, wallChamfer);
    pieces.push(geomToPiece('wall', accumToGeom(accum)));
  }

  // ---- enamel cells ----
  // Build a "safe enamel region": the area where enamel can sit without
  // touching outline walls or cutout walls. shrinkShapeFromAllBoundaries
  // handles this in one operation: outer rings of outlineShapes shrink
  // by enamelInsetOutline, cutout barriers (holes) grow by the same
  // amount.
  const safeRegion: UnionShape[] = [];
  for (const s of outlineShapes) {
    const shapeWithCutouts: UnionShape = {
      outer: s.outer,
      holes: cutoutPolys.filter((c) => ringInside(c, s.outer))
    };
    for (const shrunk of shrinkShapeFromAllBoundaries(shapeWithCutouts, enamelInsetOutline)) {
      safeRegion.push(shrunk);
    }
  }

  for (const c of cells) {
    const colorHex = doc.colorAssignments[c.id];
    if (!colorHex) continue;
    const material = doc.materialAssignments[c.id] ?? 'plain';
    const clipped = intersectPolygonWithShapes(c.polygon, safeRegion);
    if (clipped.length === 0) continue;
    const cellHoleBarriers: Vec2[][] = [];
    for (const hLoop of c.holes) {
      const inflated = offsetRingSingle(hLoop, enamelInsetOutline);
      if (inflated.length >= 3) cellHoleBarriers.push(inflated);
    }
    const finalShapes =
      cellHoleBarriers.length > 0 ? subtractPolygons(clipped, cellHoleBarriers) : clipped;

    for (const shape of finalShapes) {
      if (shape.outer.length < 3) continue;
      const worldShape = shapeToWorld(shape);
      let accum: MeshAccum;
      if (enamelFinish === 'soft' && worldShape.holes.length === 0) {
        accum = buildMeniscusAccum(worldShape.outer, enamelHeight, meniscusDepth);
      } else {
        // Hard enamel: flat slab with a tiny inward chamfer on the top
        // outer edge. Sized so the chamfer band can't eat past the
        // enamel inset — otherwise the chamfered silhouette would poke
        // through the metal wall.
        const enamelChamferSize = Math.min(0.08, enamelInsetOutline * 0.25);
        const enamelChamferHeight = Math.min(enamelChamferSize, enamelHeight * 0.25);
        accum = buildSlab(worldShape, 0, enamelHeight, enamelChamferSize, enamelChamferHeight);
      }
      pieces.push(geomToPiece('enamel', accumToGeom(accum), colorHex, material));
    }
  }

  return {
    pieces,
    finishColor,
    metalSurface,
    enamelFinish,
    baseThickness,
    baseTopY: baseThickness
  };
}

// Quick "is this ring entirely inside that ring" test used to bucket
// cutout holes under the right outline shape when building the safe
// enamel region. Exact containment isn't needed — cutouts are always
// disjoint simple polygons, so a single interior sample is definitive.
function ringInside(inner: Vec2[], outer: Vec2[]): boolean {
  if (inner.length === 0 || outer.length < 3) return false;
  const p = inner[0];
  let inside = false;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const a = outer[i];
    const b = outer[j];
    if (a.y > p.y !== b.y > p.y) {
      const xIntersect = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xIntersect) inside = !inside;
    }
  }
  return inside;
}

function geomToPiece(
  role: BadgePieceRole,
  geom: THREE.BufferGeometry,
  colorHex?: string,
  material?: EnamelMaterial
): BadgeMeshPiece {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geom.getAttribute('normal') as THREE.BufferAttribute;
  const idx = geom.getIndex();
  const positions = new Float32Array(pos.array as ArrayLike<number>);
  const normals = new Float32Array(nrm.array as ArrayLike<number>);
  const indices = idx
    ? new Uint32Array(idx.array as ArrayLike<number>)
    : new Uint32Array(0);
  geom.dispose();
  return { role, positions, normals, indices, colorHex, material };
}

// Build a meniscus-topped enamel cell. Surface tension pulls enamel up
// the metal walls to the contact line (height `top` at the perimeter);
// the interior drops toward the flat bath level. Each point's dip comes
// from meniscusDipAt (linearised 1D Young–Laplace on the cell's
// inradius), so small cells dip less than large ones. `dipCap` caps the
// drop so thin pins can't lose their enamel layer to capillary.
function buildMeniscusAccum(ring: Vec2[], top: number, dipCap: number): MeshAccum {
  const a = newAccum();
  const n = ring.length;
  if (n < 3) return a;

  const profileCtx = cellMeniscusContext(ring);
  const extent = Math.max(
    profileCtx.bbox.maxX - profileCtx.bbox.minX,
    profileCtx.bbox.maxY - profileCtx.bbox.minY
  );

  const shape = new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, p.y)));
  const base = new THREE.ShapeGeometry(shape, 24);
  const basePos = base.getAttribute('position') as THREE.BufferAttribute;
  const baseIdx = base.getIndex();
  if (!baseIdx) {
    base.dispose();
    return a;
  }

  type V = { x: number; y: number };
  const verts: V[] = [];
  for (let i = 0; i < basePos.count; i++) {
    verts.push({ x: basePos.getX(i), y: basePos.getY(i) });
  }
  let tris: [number, number, number][] = [];
  for (let i = 0; i < baseIdx.count; i += 3) {
    tris.push([baseIdx.getX(i), baseIdx.getX(i + 1), baseIdx.getX(i + 2)]);
  }
  base.dispose();

  // Meniscus curvature lives in the capillary boundary layer (first ~κ
  // from the wall) and decays exponentially past that. Tying triangle
  // size to the capillary length (rather than cell extent) keeps the
  // boundary layer resolved at every scale.
  const targetEdge = Math.max(0.1, Math.min(ENAMEL_CAPILLARY_LENGTH_MM / 4, extent / 6));
  const targetEdge2 = targetEdge * targetEdge;

  const midCache = new Map<string, number>();
  const midOf = (pa: number, pb: number) => {
    const key = pa < pb ? `${pa}:${pb}` : `${pb}:${pa}`;
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const va = verts[pa];
    const vb = verts[pb];
    const idx = verts.length;
    verts.push({ x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 });
    midCache.set(key, idx);
    return idx;
  };
  for (let pass = 0; pass < 8; pass++) {
    const next: [number, number, number][] = [];
    let changed = false;
    for (const [pa, pb, pc] of tris) {
      const va = verts[pa];
      const vb = verts[pb];
      const vc = verts[pc];
      const ab2 = (va.x - vb.x) ** 2 + (va.y - vb.y) ** 2;
      const bc2 = (vb.x - vc.x) ** 2 + (vb.y - vc.y) ** 2;
      const ca2 = (vc.x - va.x) ** 2 + (vc.y - va.y) ** 2;
      const maxEdge2 = Math.max(ab2, bc2, ca2);
      if (maxEdge2 <= targetEdge2) {
        next.push([pa, pb, pc]);
        continue;
      }
      changed = true;
      const mab = midOf(pa, pb);
      const mbc = midOf(pb, pc);
      const mca = midOf(pc, pa);
      next.push([pa, mab, mca]);
      next.push([pb, mbc, mab]);
      next.push([pc, mca, mbc]);
      next.push([mab, mbc, mca]);
    }
    tris = next;
    if (!changed) break;
  }

  // Top meniscus surface. Write zero normals and fix up below via face-
  // normal accumulation — curvy surface, no sharp edges to preserve.
  const topBase = a.positions.length / 3;
  for (const v of verts) {
    const dip = Math.min(dipCap, meniscusDipAt(v.x, v.y, profileCtx));
    a.positions.push(v.x, v.y, top - dip);
    a.normals.push(0, 0, 0);
  }
  for (const [pa, pb, pc] of tris) {
    a.indices.push(topBase + pa, topBase + pb, topBase + pc);
  }
  accumulateSmoothNormals(a, topBase, topBase + verts.length, topBase, tris);

  // Side walls: one vertical quad band from z=0 to z=top around the ring.
  emitBand(a, ring, ring, 0, top, +1);

  // Bottom cap (faces −Z).
  emitCap(a, ring, [], 0, -1);

  return a;
}

// Accumulate face-normal contributions onto vertex normals for a
// contiguous run of vertices. Used by the meniscus surface to get
// vertex-smooth shading; the rest of the mesh stays face-normal-sharp.
function accumulateSmoothNormals(
  a: MeshAccum,
  vStart: number,
  vEnd: number,
  triOffset: number,
  tris: [number, number, number][]
): void {
  for (const [pa, pb, pc] of tris) {
    const ia = (triOffset + pa) * 3;
    const ib = (triOffset + pb) * 3;
    const ic = (triOffset + pc) * 3;
    const ax = a.positions[ia], ay = a.positions[ia + 1], az = a.positions[ia + 2];
    const bx = a.positions[ib], by = a.positions[ib + 1], bz = a.positions[ib + 2];
    const cx = a.positions[ic], cy = a.positions[ic + 1], cz = a.positions[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    a.normals[ia] += nx; a.normals[ia + 1] += ny; a.normals[ia + 2] += nz;
    a.normals[ib] += nx; a.normals[ib + 1] += ny; a.normals[ib + 2] += nz;
    a.normals[ic] += nx; a.normals[ic + 1] += ny; a.normals[ic + 2] += nz;
  }
  for (let v = vStart; v < vEnd; v++) {
    const i = v * 3;
    const nx = a.normals[i], ny = a.normals[i + 1], nz = a.normals[i + 2];
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-9) {
      a.normals[i] = 0; a.normals[i + 1] = 0; a.normals[i + 2] = 1;
      continue;
    }
    a.normals[i] = nx / L;
    a.normals[i + 1] = ny / L;
    a.normals[i + 2] = nz / L;
  }
}

export function transferablesFromBadgeMeshData(data: BadgeMeshData): ArrayBuffer[] {
  const t: ArrayBuffer[] = [];
  for (const p of data.pieces) {
    t.push(p.positions.buffer as ArrayBuffer);
    t.push(p.normals.buffer as ArrayBuffer);
    t.push(p.indices.buffer as ArrayBuffer);
  }
  return t;
}
