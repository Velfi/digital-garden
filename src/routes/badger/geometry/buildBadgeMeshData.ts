import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BadgeDocument, Cell, EnamelMaterial, MetalSurface, Vec2 } from '../store/types';
import {
  clipPolygonToOutlines,
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
  polygonArea,
  signedArea,
  strokeClosedPath,
  thickenPolyline
} from '../topology/geometry';
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
  // Enamel-only: which color to use for this cell's material.
  colorHex?: string;
  // Enamel-only: surface material applied at assemble time. Omitted for
  // metal/wall pieces and treated as 'plain' when missing on an enamel piece.
  material?: EnamelMaterial;
};

export type BadgeMeshData = {
  pieces: BadgeMeshPiece[];
  // Parameters the main-thread assembler needs to synthesize materials.
  finishColor: number;
  metalSurface: MetalSurface;
  enamelFinish: 'soft' | 'hard';
  // Y-offset that wall and enamel meshes sit at above the base plane.
  baseThickness: number;
};

// ExtrudeGeometry emits per-face vertices (positions duplicated at every
// shared edge) and writes a flat per-face normal onto each copy, so
// mergeVertices alone won't fuse them — it hashes on all attributes, not
// just position. Strip normals & UVs first, then merge by position, then
// recompute normals with a crease threshold: adjacent triangles contribute
// to a shared vertex normal only when their face normals are within
// CREASE_COS of each other. This smooths the bevel-to-face transition
// (shallow angle) while keeping the cap/side 90° edge crisp when the bevel
// is zero or disabled.
const CREASE_COS = Math.cos((35 * Math.PI) / 180);
function smooth(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const stripped = geom.clone();
  stripped.deleteAttribute('normal');
  stripped.deleteAttribute('uv');
  const merged = mergeVertices(stripped, 1e-4);
  stripped.dispose();

  const posAttr = merged.getAttribute('position') as THREE.BufferAttribute;
  const idxAttr = merged.getIndex();
  if (!idxAttr) {
    merged.computeVertexNormals();
    return merged;
  }
  const pos = posAttr.array as Float32Array;
  const idx = idxAttr.array as ArrayLike<number>;
  const vertCount = posAttr.count;
  const triCount = idx.length / 3;

  // Per-triangle face normal.
  const faceN = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a = idx[t * 3] * 3;
    const b = idx[t * 3 + 1] * 3;
    const c = idx[t * 3 + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    faceN[t * 3] = nx / L;
    faceN[t * 3 + 1] = ny / L;
    faceN[t * 3 + 2] = nz / L;
  }

  // For each vertex, collect incident triangle indices.
  const vertTris: number[][] = new Array(vertCount);
  for (let v = 0; v < vertCount; v++) vertTris[v] = [];
  for (let t = 0; t < triCount; t++) {
    vertTris[idx[t * 3]].push(t);
    vertTris[idx[t * 3 + 1]].push(t);
    vertTris[idx[t * 3 + 2]].push(t);
  }

  // For each triangle corner, average with neighbours at the same vertex
  // whose face normal is within the crease threshold. Corners that disagree
  // stay sharp because their averages diverge — we emit them as separate
  // vertices below.
  const newPos: number[] = [];
  const newNrm: number[] = [];
  const newIdx: number[] = [];
  // Cache averaged-normal-per-corner, keyed by tri*3+corner.
  const cornerNrm = new Float32Array(triCount * 3 * 3);
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      const fnx = faceN[t * 3];
      const fny = faceN[t * 3 + 1];
      const fnz = faceN[t * 3 + 2];
      let sx = 0, sy = 0, sz = 0;
      const tris = vertTris[v];
      for (let i = 0; i < tris.length; i++) {
        const tt = tris[i];
        const nx = faceN[tt * 3];
        const ny = faceN[tt * 3 + 1];
        const nz = faceN[tt * 3 + 2];
        if (fnx * nx + fny * ny + fnz * nz >= CREASE_COS) {
          sx += nx; sy += ny; sz += nz;
        }
      }
      const L = Math.hypot(sx, sy, sz) || 1;
      const base = (t * 3 + k) * 3;
      cornerNrm[base] = sx / L;
      cornerNrm[base + 1] = sy / L;
      cornerNrm[base + 2] = sz / L;
    }
  }

  // Dedupe corners: two corners at the same vertex sharing (nearly) the
  // same averaged normal collapse to one output vertex; creased corners
  // get split. Keyed by vertex + quantized normal.
  const keyToOut = new Map<string, number>();
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k];
      const base = (t * 3 + k) * 3;
      const nx = cornerNrm[base];
      const ny = cornerNrm[base + 1];
      const nz = cornerNrm[base + 2];
      const qx = Math.round(nx * 1000);
      const qy = Math.round(ny * 1000);
      const qz = Math.round(nz * 1000);
      const key = v + '|' + qx + ',' + qy + ',' + qz;
      let out = keyToOut.get(key);
      if (out === undefined) {
        out = newPos.length / 3;
        keyToOut.set(key, out);
        const vb = v * 3;
        newPos.push(pos[vb], pos[vb + 1], pos[vb + 2]);
        newNrm.push(nx, ny, nz);
      }
      newIdx.push(out);
    }
  }

  merged.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPos), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(newNrm), 3));
  out.setIndex(newIdx);
  return out;
}

// Extract transferable typed arrays from an indexed BufferGeometry and
// dispose it. Returns a standalone piece record.
function geomToPiece(
  role: BadgePieceRole,
  geom: THREE.BufferGeometry,
  colorHex?: string,
  material?: EnamelMaterial
): BadgeMeshPiece {
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geom.getAttribute('normal') as THREE.BufferAttribute;
  const idx = geom.getIndex();
  // Copy to fresh buffers so the BufferAttribute's internal buffer can be
  // disposed without invalidating the piece data.
  const positions = new Float32Array(pos.array as ArrayLike<number>);
  const normals = new Float32Array(nrm.array as ArrayLike<number>);
  const indices = idx
    ? new Uint32Array(idx.array as ArrayLike<number>)
    : new Uint32Array(0);
  geom.dispose();
  return { role, positions, normals, indices, colorHex, material };
}

// Inset a polygon by `amount` (or outset, if amount < 0). Crude vertex-normal
// averaging; returns [] when a positive inset collapses the polygon.
export function insetPolygon(poly: Vec2[], amount: number): Vec2[] {
  if (poly.length < 3 || amount === 0) return [...poly];
  const n = poly.length;
  // Ensure CCW so inward normals point inside.
  const ccw = signedArea(poly) > 0;
  const src = ccw ? poly : [...poly].reverse();
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n];
    const cur = src[i];
    const next = src[(i + 1) % n];
    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    const L1 = Math.hypot(d1x, d1y) || 1;
    const L2 = Math.hypot(d2x, d2y) || 1;
    // inward normal = rotate edge direction 90° CW
    const n1 = { x: d1y / L1, y: -d1x / L1 };
    const n2 = { x: d2y / L2, y: -d2x / L2 };
    const nx = n1.x + n2.x;
    const ny = n1.y + n2.y;
    const L = Math.hypot(nx, ny) || 1;
    const sx = nx / L;
    const sy = ny / L;
    // scale to maintain offset via half-angle
    const dot = (n1.x * sx + n1.y * sy) || 1;
    const scale = Math.min(4, 1 / Math.max(0.25, dot));
    out.push({ x: cur.x - sx * amount * scale, y: cur.y - sy * amount * scale });
  }
  // Reject only when the caller asked for a positive inset that collapsed the
  // polygon. Outsets can't collapse a simple polygon for small |amount|.
  if (amount > 0) {
    const a = polygonArea(out);
    if (a < 0.01) return [];
  }
  return ccw ? out : out.reverse();
}

// Offset a closed polygon outward (positive amount). Equivalent to
// insetPolygon with the offset direction flipped — no collapse check since
// growing a simple polygon never self-intersects for small amounts.
export function inflatePolygon(poly: Vec2[], amount: number): Vec2[] {
  return insetPolygon(poly, -amount);
}

// Distance from point (px,py) to the closest segment of a closed polygon ring.
// Sign is ignored — we only use this to bound bevel size, and the bevel cares
// about proximity to the ring regardless of which side.
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

// Approximate the smallest "throat" of a ring — the radius of the largest
// inscribed circle we can confidently fit. We sample each vertex and the
// midpoint of each edge, measure the distance from that sample to every
// *other* segment, and take the minimum. This underestimates the true
// inradius, but that's fine: the goal is to find a bevel size that provably
// won't self-intersect, and conservative is safe.
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
    // Vertex i: skip the two edges touching it.
    sample(a.x, a.y, (i - 1 + n) % n, i);
    // Midpoint of edge i: skip that edge only.
    sample((a.x + b.x) / 2, (a.y + b.y) / 2, i, -1);
  }
  return Math.sqrt(best);
}

// Maximum bevel that won't collapse the given shape. Bounds against:
//   - each ring's own throat (so convex round-overs can't cross the medial)
//   - gap between outer and each hole (so an outer-bevel growing inward can't
//     meet a hole-bevel growing outward)
// Scaled by 0.4 so there's headroom for the bevel's vertical component and
// for the clipping-library's edge insertion fuzz.
function safeBevel(shape: UnionShape, requested: number): number {
  if (requested <= 0) return 0;
  let limit = ringThroat(shape.outer);
  for (const hole of shape.holes) {
    limit = Math.min(limit, ringThroat(hole));
    // outer ↔ hole gap: worst-case shortest approach.
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
  const safe = limit * 0.4;
  return Math.min(requested, safe);
}

// Pure-data version of the badge mesh builder. Produces typed-array geometry
// pieces plus the material params needed to assemble them on the main
// thread. No THREE.Mesh/Material/Group is created here, so this function is
// safe to run inside a Web Worker.
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
  // doc → world mapping: x -> X, y -> -Z (flip so 2D top becomes back in 3D).
  // The Y-flip inverts winding, so callers must re-normalize before passing
  // to THREE.Shape — use `toWorldCCW` / `toWorldCW` below.
  const toWorld = (p: Vec2) => new THREE.Vector2(p.x - centerX, -(p.y - centerY));
  // ExtrudeGeometry needs the contour CCW and holes CW in shape-local 2D.
  // Source polygons are CCW in doc space; the Y-flip reverses that, so we
  // reverse back. Without this, side-wall normals face inward and the walls
  // render as invisible (backface-culled) black gaps.
  const toWorldCCW = (poly: Vec2[]): THREE.Vector2[] => {
    const pts = poly.map(toWorld);
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      s += a.x * b.y - b.x * a.y;
    }
    return s < 0 ? pts.reverse() : pts;
  };
  const toWorldCW = (poly: Vec2[]): THREE.Vector2[] => {
    const pts = toWorldCCW(poly);
    return pts.reverse();
  };

  const baseThickness = doc.metal.baseThickness;
  const wallHeight = doc.metal.wallHeight;
  // Enamel is kept clear of every outline/cutout wall by this much. Divider
  // edges need no inset because thickened-divider walls sit fully outside the
  // cell polygon — the cell boundary is already at the divider's inner edge.
  const enamelInsetOutline = doc.metal.minWallWidth;
  // Hard enamel fills nearly to the wall top but stays below it so the rounded
  // top cap of the extrude (bevel grows outward and upward) can't overhang the
  // gold rim. Soft enamel pools lower by capillary.
  const enamelHeight = enamelFinish === 'hard' ? wallHeight * 0.85 : wallHeight * 0.6;
  // Soft enamel dips below the rim by κ·sqrt(2(1 − sin θ)) per Young–Laplace
  // (see meniscusProfile.ts). The dip must leave a minimum enamel floor
  // thickness above the metal base, otherwise the bath-level bottom of the
  // meniscus ends up coplanar with z=0 and z-fights the metal base plane
  // (visible as metal bleeding through enamel in large cells). Floor
  // clearance scales with wall height but is clamped so very short walls
  // still get a visible dip.
  const meniscusFloorClearance = Math.max(0.05, Math.min(wallHeight * 0.15, 0.2));
  const meniscusDepth =
    enamelFinish === 'soft'
      ? Math.min(meniscusDipAtWall(), Math.max(0, enamelHeight - meniscusFloorClearance))
      : 0;
  // Wall edges get a small round-over so polished metal reads as cast/plated
  // rather than extruded. Scaled to wall height to avoid swallowing short walls.
  const wallBevel = Math.min(doc.metal.minWallWidth * 0.25, wallHeight * 0.3, 0.2);

  const outlinePaths = doc.metal.paths.filter((p) => effectiveKind(p) === 'outline');
  const cutoutPaths = doc.metal.paths.filter((p) => effectiveKind(p) === 'cutout');

  // Tessellation tolerance for cutout/outline polylines feeding ExtrudeGeometry.
  // Tied to the bevel size: finer than the bevel means the bevel's round-over
  // is the dominant curvature signal, coarser risks visible facets along the
  // rim. Flatness is in doc units (mm). Capped hard at 0.02mm so even a
  // large bevel radius still produces a smooth circular hole.
  const pathFlatness = Math.min(0.02, Math.max(0.005, doc.metal.bevelRadius * 0.1));
  const flattenForMesh = (p: Parameters<typeof flattenPath>[0]) =>
    flattenPath(p, { flatness: pathFlatness });

  // Normalize closed outlines and cutouts through polygon-clipping's non-zero
  // fill rule up front, so every downstream consumer (THREE.Shape extrude,
  // insetPolygon, inflatePolygon, ring arithmetic) sees only simple rings.
  // A self-intersecting bowtie outline yields two disjoint shapes; a
  // self-overlapping outline with opposite-winding lobes yields one shape
  // with a hole (reinterpreted as cutout territory, since it's negative
  // space in the silhouette).
  const rawOutlineShapes: UnionShape[] = [];
  const cutoutPolys: Vec2[][] = [];
  for (const o of outlinePaths) {
    const flat = flattenForMesh(o);
    if (flat.length < 3) continue;
    for (const s of normalizeClosedRing(flat)) {
      rawOutlineShapes.push({ outer: s.outer, holes: [] });
      for (const h of s.holes) cutoutPolys.push(h);
    }
  }
  for (const c of cutoutPaths) {
    const flat = flattenForMesh(c);
    if (flat.length < 3) continue;
    // Inner islands of a self-overlapping cutout (shape.holes) are dropped —
    // see planar.collectWallPolygons for the same simplification. Supporting
    // them would require recursively reintroducing metal through a cutout,
    // which isn't a meaningful authoring case.
    for (const s of normalizeClosedRing(flat)) cutoutPolys.push(s.outer);
  }
  // Merge overlapping outlines into a single silhouette. Without this, two
  // closed shapes that cover the same area each extrude their own base, and
  // the coplanar top/bottom faces z-fight — visible as the outline of each
  // interior shape ghosting through the back of the badge in the render
  // view. Any holes that emerge from the union (opposing-winding overlap)
  // are reinterpreted as cutouts so downstream code treats them uniformly.
  const outlineShapes = unionPolygons(rawOutlineShapes);
  for (const s of outlineShapes) {
    for (const h of s.holes) cutoutPolys.push(h);
    s.holes = [];
  }
  const outlinePolys = outlineShapes.map((s) => s.outer);

  // Inflate each cutout polygon by a tiny amount before subtracting. The
  // polygon-clipping library is numerically robust in theory, but near-tangent
  // edges between the outline inset (the wall ring's inner edge) and the
  // cutout boundary can leave sub-pixel slivers of the wall poking into the
  // hole — visible as thin fins after extrusion. Buffering the cutout by a
  // fraction of the flatness tolerance swallows those slivers without
  // visibly changing the hole size.
  const cutoutBuffer = Math.max(pathFlatness * 0.5, 0.01);
  const inflatedCutouts = cutoutPolys
    .map((c) => inflatePolygon(c, cutoutBuffer))
    .filter((p) => p.length >= 3);

  // ---- metal base ----
  // Route outlines-with-cutout-holes through subtractPolygons (same flow the
  // walls layer uses) so the clipping library resolves overlaps and emits
  // well-formed rings, rather than stacking raw holes on THREE.Shape where a
  // hole larger than the bevel can collapse the extrude.
  const baseShapes = inflatedCutouts.length > 0
    ? subtractPolygons(outlineShapes, inflatedCutouts)
    : outlineShapes;
  for (const shape of baseShapes) {
    const three = new THREE.Shape(toWorldCCW(shape.outer));
    for (const hole of shape.holes) three.holes.push(new THREE.Path(toWorldCW(hole)));
    const bevel = safeBevel(shape, doc.metal.bevelRadius);
    const raw = new THREE.ExtrudeGeometry(three, {
      depth: baseThickness,
      bevelEnabled: bevel > 0,
      bevelSegments: 2,
      bevelSize: bevel,
      bevelThickness: bevel * 0.75,
      steps: 1,
      curveSegments: 12
    });
    const geom = smooth(raw);
    raw.dispose();
    pieces.push(geomToPiece('metal', geom));
  }

  // ---- walls layer: union all wall pieces into a single 2D shape ----
  // Every non-cutout path — open divider or closed shape-outline — becomes a
  // symmetric stroke of width = p.strokeWidth centered on the centerline,
  // then gets clipped to the silhouette so nothing hangs off the base plate.
  // One unified pipeline replaces the old outline-vs-divider split, which
  // had outlines stroke at 2×-and-clip (to produce an inward-only ribbon
  // matching the silhouette edge). That trick made boundary outlines look
  // full-width but silently doubled the wall thickness of *interior* closed
  // shapes like a figure-8 decoration, since nothing got clipped away.
  // Single-width + silhouette-clip is faithful in both cases: boundary
  // outlines render as half-ribbons (the other half would be off-base and
  // can't exist), interior outlines render as full-width ribbons. The
  // canvas SVG views apply the same silhouette clip so previews match.
  // Closed centerlines still go through strokeClosedPath so self-crossings
  // (figure-8, knots) become real X-junctions rather than pinched bowties.
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
      // Stroked ribbon is a ring-shape with a hole in the middle (the area
      // enclosed by the centerline), so we must clip as shapes-with-holes.
      // clipPolygonToOutlines would silently drop the hole and fill it in.
      const ribbon = unionPolygons(stroked.map((outer) => ({ outer, holes: [] })));
      for (const piece of intersectShapes(ribbon, outlineShapes)) {
        if (piece.outer.length < 3) continue;
        wallShapes.push(piece);
      }
      continue;
    }
    const thickened = thickenPolyline(flat, width);
    if (thickened.length < 3) continue;
    const pieces2 = clipPolygonToOutlines(thickened, outlinePolys);
    for (const piece of pieces2) {
      if (piece.outer.length < 3) continue;
      wallShapes.push(piece);
    }
  }
  // Each cutout needs its own wall ribbon so enamel in adjacent cells doesn't
  // spill into the hole. Mirror of the outline wall: grow the cutout outward
  // by minWallWidth to form the ribbon's outer, with the cutout itself as the
  // inner hole. Union merges this with touching dividers/outline-wall, so a
  // cutout near the rim produces one continuous wall.
  for (const poly of cutoutPolys) {
    const outer = inflatePolygon(poly, doc.metal.minWallWidth);
    if (outer.length < 3) continue;
    wallShapes.push({ outer, holes: [poly] });
  }
  let mergedWalls = unionPolygons(wallShapes);
  if (inflatedCutouts.length > 0) mergedWalls = subtractPolygons(mergedWalls, inflatedCutouts);
  for (const shape of mergedWalls) {
    const three = new THREE.Shape(toWorldCCW(shape.outer));
    for (const hole of shape.holes) three.holes.push(new THREE.Path(toWorldCW(hole)));
    const bevel = safeBevel(shape, wallBevel);
    const raw = new THREE.ExtrudeGeometry(three, {
      depth: wallHeight - bevel,
      bevelEnabled: bevel > 0,
      bevelSegments: 3,
      bevelSize: bevel,
      bevelThickness: bevel,
      steps: 1,
      curveSegments: 6
    });
    const geom = smooth(raw);
    raw.dispose();
    pieces.push(geomToPiece('wall', geom));
  }

  // ---- enamel cells ----
  // Build a "safe enamel region": the area where enamel can sit without
  // touching outline walls or cutout walls. Outlines inset by minWallWidth
  // give the outer bound; cutouts inflated by minWallWidth punch holes into
  // that region so enamel keeps clear of the cutout-wall ribbons too. Each
  // cell polygon gets intersected with this region, so even when a cell edge
  // runs along an outline or cutout the enamel is guaranteed to be pulled
  // inward by minWallWidth there. Divider-adjacent edges aren't affected
  // because dividers don't appear in the safe-region boundary.
  const safeRegionShapes: UnionShape[] = [];
  for (const outline of outlinePolys) {
    const inner = insetPolygon(outline, enamelInsetOutline);
    if (inner.length < 3) continue;
    safeRegionShapes.push({ outer: inner, holes: [] });
  }
  const cutoutBarriers: Vec2[][] = [];
  for (const poly of cutoutPolys) {
    const barrier = inflatePolygon(poly, enamelInsetOutline);
    if (barrier.length >= 3) cutoutBarriers.push(barrier);
  }
  const safeRegion = cutoutBarriers.length > 0
    ? subtractPolygons(safeRegionShapes, cutoutBarriers)
    : safeRegionShapes;

  for (const c of cells) {
    const colorHex = doc.colorAssignments[c.id];
    if (!colorHex) continue;
    const material = doc.materialAssignments[c.id] ?? 'plain';
    // Clip the cell polygon to the safe region so outline/cutout-adjacent
    // edges pull in by minWallWidth. The clipper emits full shapes (possibly
    // with holes) — for a single contiguous cell this is usually one shape,
    // but a cell wrapping around a cutout barrier can legitimately split.
    const clipped = intersectPolygonWithShapes(c.polygon, safeRegion);
    if (clipped.length === 0) continue;
    // Additionally clip each shape's holes (which come from c.holes) — holes
    // are closed loops nested inside the cell, always outline/cutout-type, so
    // they get their own safe buffer.
    const cellHoleBarriers: Vec2[][] = [];
    for (const h of c.holes) {
      const inflated = inflatePolygon(h, enamelInsetOutline);
      if (inflated.length >= 3) cellHoleBarriers.push(inflated);
    }
    const finalShapes = cellHoleBarriers.length > 0
      ? subtractPolygons(clipped, cellHoleBarriers)
      : clipped;

    for (const shape of finalShapes) {
      if (shape.outer.length < 3) continue;
      const insetPts = toWorldCCW(shape.outer);
      const insetHoles = shape.holes.filter((h) => h.length >= 3);
      let raw: THREE.BufferGeometry;
      // Meniscus (soft finish) is built from a single ring only. For ring-shaped
      // cells, fall through to the extruded path so the hole is actually cut;
      // accepting a flat top is better than painting enamel across the inner
      // disc where a neighbour cell has its own fill.
      if (enamelFinish === 'soft' && insetHoles.length === 0) {
        raw = buildMeniscusGeometry(insetPts, enamelHeight, meniscusDepth);
      } else {
        const threeShape = new THREE.Shape(insetPts);
        for (const hole of insetHoles) threeShape.holes.push(new THREE.Path(toWorldCW(hole)));
        // ExtrudeGeometry's bevel grows outward in XY from the shape. The
        // enamel polygon is already inset by enamelInsetOutline on outline/
        // cutout edges, so any bevelSize >= that inset pushes the top cap
        // past the wall. Bound the bevel well under the inset so the rounded
        // cap stays inside the cell even on thin walls.
        const bevelSize = Math.min(0.15, enamelInsetOutline * 0.3);
        const bevelThickness = Math.min(bevelSize, enamelHeight * 0.3);
        raw = new THREE.ExtrudeGeometry(threeShape, {
          depth: enamelHeight - bevelThickness,
          bevelEnabled: bevelSize > 0,
          bevelSegments: 1,
          bevelSize,
          bevelThickness,
          steps: 1,
          curveSegments: 6
        });
      }
      const geom = smooth(raw);
      raw.dispose();
      pieces.push(geomToPiece('enamel', geom, colorHex, material));
    }
  }

  return {
    pieces,
    finishColor,
    metalSurface,
    enamelFinish,
    baseThickness
  };
}

// Transferables covering every geometry buffer in a BadgeMeshData. Pass this
// to postMessage so the typed arrays move without a copy. TS widens
// TypedArray.buffer to ArrayBufferLike (which could be SharedArrayBuffer);
// we construct these ourselves from regular ArrayBuffers, so the cast is safe.
export function transferablesFromBadgeMeshData(data: BadgeMeshData): ArrayBuffer[] {
  const t: ArrayBuffer[] = [];
  for (const p of data.pieces) {
    t.push(p.positions.buffer as ArrayBuffer);
    t.push(p.normals.buffer as ArrayBuffer);
    t.push(p.indices.buffer as ArrayBuffer);
  }
  return t;
}

// Build a single enamel cell with a concave (meniscus) top surface driven by
// the Young–Laplace equation. Surface tension pulls liquid enamel up the
// metal walls to the contact line (height `top` at the perimeter); the
// interior drops toward the flat bath level. Each point's dip comes from
// meniscusDipAt (linearised 1D Young–Laplace on the cell's inradius), so
// small cells dip less than large ones — physical cell-size dependence,
// unlike the old fixed-amplitude cosine easing. `dipCap` caps the drop so
// thin pins can't lose their enamel layer to capillary. Interior
// triangulation via THREE.Shape + ShapeGeometry handles arbitrary polygons;
// we subdivide triangles until edges are short enough that curvature reads
// smoothly under polished clearcoat.
function buildMeniscusGeometry(
  ring: THREE.Vector2[],
  top: number,
  dipCap: number
): THREE.BufferGeometry {
  const n = ring.length;
  const geom = new THREE.BufferGeometry();
  if (n < 3) return geom;

  const ringPts = ring.map((p) => ({ x: p.x, y: p.y }));
  const profileCtx = cellMeniscusContext(ringPts);
  const extent = Math.max(
    profileCtx.bbox.maxX - profileCtx.bbox.minX,
    profileCtx.bbox.maxY - profileCtx.bbox.minY
  );

  // ShapeGeometry triangulates the interior. Subdivide any triangle whose
  // longest edge exceeds a target length so curvature is resolved.
  const shape = new THREE.Shape(ring);
  const base = new THREE.ShapeGeometry(shape, 24);
  const basePos = base.getAttribute('position') as THREE.BufferAttribute;
  const baseIdx = base.getIndex();
  if (!baseIdx) {
    base.dispose();
    return geom;
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

  // Meniscus curvature lives in the capillary boundary layer (first ~κ from
  // the wall) and decays exponentially past that. Tying triangle size to cell
  // extent (which has nothing to do with curvature) lets large cells end up
  // with triangles that straddle the whole boundary layer: the face normal
  // jumps sharply from one triangle to the next, the 35° crease threshold
  // in smooth() fires, and the rendered surface breaks into flat facets.
  // Scale target edge to κ/4 so there are always several triangles across
  // the curved zone regardless of cell size. Ceiling at extent/6 so tiny
  // cells still get a few triangles; floor at 0.1mm so we can't blow up
  // vertex counts on a pathologically small extent.
  const targetEdge = Math.max(0.1, Math.min(ENAMEL_CAPILLARY_LENGTH_MM / 4, extent / 6));
  const targetEdge2 = targetEdge * targetEdge;

  // Midpoint subdivision, memoized. Splits any triangle whose longest edge
  // exceeds target; repeats until stable or cap hit (safety against tiny
  // targets blowing up vertex count on huge cells).
  const midCache = new Map<string, number>();
  const midOf = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const va = verts[a];
    const vb = verts[b];
    const idx = verts.length;
    verts.push({ x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 });
    midCache.set(key, idx);
    return idx;
  };
  // Pass cap is a safety net; the `changed` check exits earlier when target
  // edge is reached. Sized for ~log2(cell_extent / targetEdge) + slack so
  // large cells with a capillary-scale target actually converge.
  for (let pass = 0; pass < 8; pass++) {
    const next: [number, number, number][] = [];
    let changed = false;
    for (const [a, b, c] of tris) {
      const va = verts[a];
      const vb = verts[b];
      const vc = verts[c];
      const ab2 = (va.x - vb.x) ** 2 + (va.y - vb.y) ** 2;
      const bc2 = (vb.x - vc.x) ** 2 + (vb.y - vc.y) ** 2;
      const ca2 = (vc.x - va.x) ** 2 + (vc.y - va.y) ** 2;
      const maxEdge2 = Math.max(ab2, bc2, ca2);
      if (maxEdge2 <= targetEdge2) {
        next.push([a, b, c]);
        continue;
      }
      changed = true;
      const mab = midOf(a, b);
      const mbc = midOf(b, c);
      const mca = midOf(c, a);
      next.push([a, mab, mca]);
      next.push([b, mbc, mab]);
      next.push([c, mca, mbc]);
      next.push([mab, mbc, mca]);
    }
    tris = next;
    if (!changed) break;
  }

  const positions: number[] = [];
  const indices: number[] = [];

  // Top surface vertices. Dip is clamped to `dipCap` so thin pins can't
  // punch enamel below the metal base.
  for (const v of verts) {
    const dip = Math.min(dipCap, meniscusDipAt(v.x, v.y, profileCtx));
    positions.push(v.x, v.y, top - dip);
  }
  // Match ShapeGeometry's winding (its triangles are CCW with +Z facing up in
  // this local frame, matching the rotation the caller applies).
  for (const [a, b, c] of tris) indices.push(a, b, c);

  // Side walls + bottom cap: use the original `ring` independent of the
  // interior triangulation so wall quads line up with the outline exactly.
  const wallTopBase = positions.length / 3;
  for (const p of ring) positions.push(p.x, p.y, top);
  const wallBottomBase = positions.length / 3;
  for (const p of ring) positions.push(p.x, p.y, 0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const t0 = wallTopBase + i;
    const t1 = wallTopBase + j;
    const b0 = wallBottomBase + i;
    const b1 = wallBottomBase + j;
    indices.push(t0, b0, b1);
    indices.push(t0, b1, t1);
  }
  for (let i = 1; i < n - 1; i++) {
    indices.push(wallBottomBase, wallBottomBase + i + 1, wallBottomBase + i);
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

