import * as THREE from 'three';
import { coordKey, parseCoordKey } from '../../coordUtils';
import type { FaceNormal, RoofStyleId } from '../core';
import type { Voxel } from '../../voxelMaterial';
import { plasticVoxel } from '../../voxelMaterial';
import { getCoplanarPolygonFillPositions } from '../../strokeGeometry';

export type GenerateRoofOptions = {
  style: RoofStyleId;
  /** Max rise in voxels (most pitched styles). */
  height: number;
  /** Slab depth for flat / flat_parapet base (voxels along extrusion). */
  thickness: number;
  /** Edge index 0..n-1 for shed / saltbox. */
  shedEdgeIndex: number;
  /**
   * Gable / barrel / hip: 0 = auto ridge (longer bbox axis), 1 = ridge parallel to U, 2 = along V.
   */
  gableOrientation?: number;
  /** Mansard / gambrel / pavilion: break along normalized distance from boundary (0.2–0.8). */
  breakRatio?: number;
  /** Dutch gable: wall layers below the pitched cap. */
  wallHeight?: number;
  /** Flat parapet: extra layers stacked on cells near the boundary. */
  parapetHeight?: number;
  /** Saltbox: skew along shed direction (-1…1, applied to normalized ramp). */
  saltSkew?: number;
  /** Keep only voxels with at least one empty 6-neighbor (hollow shell). */
  hollow?: boolean;
  color: number;
};

const ROOF_NEIGHBOR_DXYZ: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];

function roofMapSurfaceOnly(map: Map<string, Voxel>): Map<string, Voxel> {
  const surface = new Map<string, Voxel>();
  for (const [key, v] of map) {
    const [x, y, z] = parseCoordKey(key);
    let exposed = false;
    for (const [dx, dy, dz] of ROOF_NEIGHBOR_DXYZ) {
      if (!map.has(coordKey(x + dx, y + dy, z + dz))) {
        exposed = true;
        break;
      }
    }
    if (exposed) surface.set(key, v);
  }
  return surface;
}

function finalizeRoofMap(m: Map<string, Voxel>, hollow?: boolean): Map<string, Voxel> {
  if (!hollow || m.size === 0) return m;
  return roofMapSurfaceOnly(m);
}

function integerRoofStep(
  planeNx: number,
  planeNy: number,
  planeNz: number,
  placementNormal: FaceNormal
): [number, number, number] {
  const ax =
    Math.abs(planeNx) >= Math.abs(planeNy) && Math.abs(planeNx) >= Math.abs(planeNz)
      ? 0
      : Math.abs(planeNy) >= Math.abs(planeNz)
        ? 1
        : 2;
  const comp = ax === 0 ? planeNx : ax === 1 ? planeNy : planeNz;
  const step: [number, number, number] = [0, 0, 0];
  step[ax] = comp >= 0 ? 1 : -1;
  const pdot =
    step[0] * placementNormal[0] + step[1] * placementNormal[1] + step[2] * placementNormal[2];
  if (pdot < 0) step[ax] = -step[ax]!;
  return step;
}

function planeUnitNormalFromPoints(points: [number, number, number][]): THREE.Vector3 | null {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = points[i];
        const b = points[j];
        const c = points[k];
        const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const cross = new THREE.Vector3().crossVectors(ab, ac);
        if (cross.lengthSq() >= 1e-12) {
          return cross.normalize();
        }
      }
    }
  }
  return null;
}

function getDropUVAxes(n: THREE.Vector3): {
  dropAxis: 0 | 1 | 2;
  uAxis: 0 | 1 | 2;
  vAxis: 0 | 1 | 2;
} {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  const dropAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;
  const uAxis = (dropAxis === 0 ? 1 : 0) as 0 | 1 | 2;
  const vAxis = (dropAxis === 2 ? 1 : 2) as 0 | 1 | 2;
  return { dropAxis, uAxis, vAxis };
}

function toUV(
  p: [number, number, number],
  uAxis: 0 | 1 | 2,
  vAxis: 0 | 1 | 2
): [number, number] {
  const c = p;
  return [c[uAxis], c[vAxis]];
}

function dot2(a: [number, number], b: [number, number]): number {
  return a[0] * b[0] + a[1] * b[1];
}

function sub2(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}

function len2(a: [number, number]): number {
  return Math.hypot(a[0], a[1]);
}

function distPointToSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  const t =
    abLenSq < 1e-18 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  return Math.hypot(px - cx, py - cy);
}

function minDistToPolygonBoundary2D(
  uv: [number, number],
  poly: [number, number][]
): number {
  let m = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    m = Math.min(m, distPointToSegment2D(uv[0], uv[1], a[0], a[1], b[0], b[1]));
  }
  return m;
}

function norm2(a: [number, number]): [number, number] | null {
  const L = len2(a);
  if (L < 1e-12) return null;
  return [a[0] / L, a[1] / L];
}

/** At least one voxel column on the footprint; scales up to maxH at frac=1. */
function columnLayersShedGable(frac: number, maxH: number): number {
  if (maxH < 1) return 0;
  const f = Math.max(0, Math.min(1, frac));
  const raw = Math.round(f * maxH);
  return Math.max(1, Math.min(maxH, raw < 1 ? 1 : raw));
}

/** 0…H from fractional height 0…1 (allows true zero for composite stacks). */
function columnLayersFromUnit(frac: number, maxH: number): number {
  if (maxH < 1) return 0;
  const f = Math.max(0, Math.min(1, frac));
  return Math.max(0, Math.min(maxH, Math.round(f * maxH)));
}

function placeColumn(
  out: Map<string, Voxel>,
  base: [number, number, number],
  step: [number, number, number],
  layers: number,
  pv: Voxel,
  baseK = 0
): void {
  for (let k = 0; k < layers; k++) {
    const x = base[0] + (baseK + k) * step[0];
    const y = base[1] + (baseK + k) * step[1];
    const z = base[2] + (baseK + k) * step[2];
    out.set(coordKey(x, y, z), pv);
  }
}

function ridgeAlongUFromOrientation(
  go: 0 | 1 | 2,
  wU: number,
  wV: number
): boolean {
  return go === 0 ? wU >= wV : go === 1;
}

function gableFrac(
  uv: [number, number],
  ridgeAlongU: boolean,
  uC: number,
  vC: number,
  maxDist: number
): number {
  const d = ridgeAlongU ? Math.abs(uv[1] - vC) : Math.abs(uv[0] - uC);
  return maxDist < 1e-9 ? 1 : 1 - d / maxDist;
}

function bboxFromFootprintUV(footprintUV: [number, number][]) {
  let minU = Infinity,
    maxU = -Infinity,
    minV = Infinity,
    maxV = -Infinity;
  for (const uv of footprintUV) {
    minU = Math.min(minU, uv[0]);
    maxU = Math.max(maxU, uv[0]);
    minV = Math.min(minV, uv[1]);
    maxV = Math.max(maxV, uv[1]);
  }
  const uC = (minU + maxU) / 2;
  const vC = (minV + maxV) / 2;
  const wU = maxU - minU;
  const wV = maxV - minV;
  const halfU = wU / 2;
  const halfV = wV / 2;
  return { minU, maxU, minV, maxV, uC, vC, wU, wV, halfU, halfV };
}

function shedBasis(
  verts2D: [number, number][],
  footprintUV: [number, number][],
  shedEdgeIndex: number,
  nPts: number
): {
  Vi: [number, number];
  perp: [number, number];
  tMin: number;
  tMax: number;
  span: number;
} | null {
  const centroid2D: [number, number] = [0, 0];
  for (const q of verts2D) {
    centroid2D[0] += q[0];
    centroid2D[1] += q[1];
  }
  centroid2D[0] /= verts2D.length;
  centroid2D[1] /= verts2D.length;

  const ei = ((shedEdgeIndex % nPts) + nPts) % nPts;
  const Vi = verts2D[ei]!;
  const Vip = verts2D[(ei + 1) % nPts]!;
  const edge = sub2(Vip, Vi);
  let perp = norm2([-edge[1], edge[0]]);
  if (!perp) return null;
  if (dot2(sub2(centroid2D, Vi), perp) < 0) {
    perp = [-perp[0], -perp[1]];
  }
  let tMin = Infinity,
    tMax = -Infinity;
  for (const uv of footprintUV) {
    const t = dot2(sub2(uv, Vi), perp);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  const span = tMax - tMin;
  return { Vi, perp, tMin, tMax, span };
}

function dualSlopeFrac(dNorm: number, breakAt: number, knee: number): number {
  const b = Math.max(0.12, Math.min(0.88, breakAt));
  if (dNorm <= b) return (dNorm / b) * knee;
  return knee + ((dNorm - b) / (1 - b)) * (1 - knee);
}

/**
 * Coplanar footprint (4+ vertices), extruded / built upward along `placementNormal` (axis-aligned hint).
 */
export function generateRoofVoxels(
  points: [number, number, number][],
  placementNormal: FaceNormal,
  options: GenerateRoofOptions
): Map<string, Voxel> {
  const out = new Map<string, Voxel>();
  if (points.length < 4) return finalizeRoofMap(out, options.hollow);

  const footprint = getCoplanarPolygonFillPositions(points);
  if (footprint === null || footprint.length === 0) return finalizeRoofMap(out, options.hollow);

  const n = planeUnitNormalFromPoints(points);
  if (!n) return finalizeRoofMap(out, options.hollow);

  const step = integerRoofStep(n.x, n.y, n.z, placementNormal);
  const { uAxis, vAxis } = getDropUVAxes(n);
  const pv = plasticVoxel(options.color);

  const verts2D = points.map((p) => toUV(p, uAxis, vAxis));
  const footprintUV = footprint.map((p) => toUV(p, uAxis, vAxis));

  if (options.style === 'flat') {
    const t = Math.max(1, Math.min(64, Math.floor(options.thickness)));
    for (const p of footprint) {
      placeColumn(out, p, step, t, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'flat_parapet') {
    const tb = Math.max(1, Math.min(32, Math.floor(options.thickness)));
    const ph = Math.max(1, Math.min(12, Math.floor(options.parapetHeight ?? 2)));
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const bd = minDistToPolygonBoundary2D(uv, verts2D);
      placeColumn(out, p, step, tb, pv, 0);
      if (bd < 2.25) {
        placeColumn(out, p, step, ph, pv, tb);
      }
    }
    return finalizeRoofMap(out, options.hollow);
  }

  const H = Math.max(1, Math.min(64, Math.floor(options.height)));

  if (options.style === 'pyramid') {
    let dMax = 0;
    for (const uv of footprintUV) {
      dMax = Math.max(dMax, minDistToPolygonBoundary2D(uv, verts2D));
    }
    if (dMax < 1e-9) dMax = 1;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const d = minDistToPolygonBoundary2D(uv, verts2D);
      const frac = d / dMax;
      const layers = columnLayersShedGable(frac, H);
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'cone') {
    let cu = 0,
      cv = 0;
    for (const q of verts2D) {
      cu += q[0];
      cv += q[1];
    }
    cu /= verts2D.length;
    cv /= verts2D.length;
    let maxR = 0;
    for (const uv of footprintUV) {
      const r = Math.hypot(uv[0] - cu, uv[1] - cv);
      maxR = Math.max(maxR, r);
    }
    if (maxR < 1e-9) maxR = 1;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const r = Math.hypot(uv[0] - cu, uv[1] - cv);
      const frac = 1 - r / maxR;
      const layers = columnLayersShedGable(frac, H);
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'shed') {
    const basis = shedBasis(verts2D, footprintUV, options.shedEdgeIndex, points.length);
    if (!basis) return finalizeRoofMap(out, options.hollow);
    const { Vi, perp, tMin, span } = basis;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const t = dot2(sub2(uv, Vi), perp);
      const frac = span < 1e-9 ? 1 : (t - tMin) / span;
      const layers = columnLayersShedGable(frac, H);
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'saltbox') {
    const basis = shedBasis(verts2D, footprintUV, options.shedEdgeIndex, points.length);
    if (!basis) return finalizeRoofMap(out, options.hollow);
    const { Vi, perp, tMin, span } = basis;
    /**
     * Asymmetric gable in the shed direction: ridge at fraction `r` of span from the
     * low-eave end (u=0). Short leg [0,r] is steep (0→peak); long leg [r,1] is gentle
     * (peak→0) — classic saltbox profile (no flat half).
     */
    const s = Math.max(-0.5, Math.min(0.5, (options.saltSkew ?? 0) / 100));
    const r = Math.max(0.14, Math.min(0.86, 0.33 + s));
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const t = dot2(sub2(uv, Vi), perp);
      const u = span < 1e-9 ? 0.5 : (t - tMin) / span;
      let frac: number;
      if (u <= r) {
        frac = r < 1e-9 ? 1 : u / r;
      } else {
        const den = 1 - r;
        frac = den < 1e-9 ? 1 : (1 - u) / den;
      }
      frac = Math.max(0, Math.min(1, frac));
      const layers = columnLayersShedGable(frac, H);
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  const bb = bboxFromFootprintUV(footprintUV);
  const { minU, maxU, minV, maxV, uC, vC, halfU, halfV } = bb;
  const go = (((Math.floor(options.gableOrientation ?? 0) % 3) + 3) % 3) as 0 | 1 | 2;
  const ridgeAlongU = ridgeAlongUFromOrientation(go, bb.wU, bb.wV);

  if (options.style === 'gable') {
    let maxDist = 0;
    for (const uv of footprintUV) {
      const d = ridgeAlongU ? Math.abs(uv[1] - vC) : Math.abs(uv[0] - uC);
      maxDist = Math.max(maxDist, d);
    }
    if (maxDist < 1e-9) maxDist = 1;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const frac = gableFrac(uv, ridgeAlongU, uC, vC, maxDist);
      const layers = columnLayersShedGable(frac, H);
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'hip') {
    const hu = halfU + 1e-9;
    const hv = halfV + 1e-9;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      let frac: number;
      if (ridgeAlongU) {
        const perp = 1 - Math.abs(uv[1] - vC) / hv;
        const along = Math.min(Math.abs(uv[0] - minU), Math.abs(uv[0] - maxU)) / hu;
        frac = Math.max(0, Math.min(1, perp * along));
      } else {
        const perp = 1 - Math.abs(uv[0] - uC) / hu;
        const along = Math.min(Math.abs(uv[1] - minV), Math.abs(uv[1] - maxV)) / hv;
        frac = Math.max(0, Math.min(1, perp * along));
      }
      const layers = columnLayersShedGable(frac, H);
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'barrel') {
    let maxD = 0;
    for (const uv of footprintUV) {
      const d = ridgeAlongU ? Math.abs(uv[1] - vC) : Math.abs(uv[0] - uC);
      maxD = Math.max(maxD, d);
    }
    if (maxD < 1e-9) maxD = 1;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const d = ridgeAlongU ? Math.abs(uv[1] - vC) : Math.abs(uv[0] - uC);
      const t = d / maxD;
      const arc = Math.sqrt(Math.max(0, 1 - t * t));
      const layers = columnLayersShedGable(arc, H);
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'mansard' || options.style === 'gambrel' || options.style === 'pavilion') {
    let dMax = 0;
    for (const uv of footprintUV) {
      dMax = Math.max(dMax, minDistToPolygonBoundary2D(uv, verts2D));
    }
    if (dMax < 1e-9) dMax = 1;
    const br = Math.max(0.2, Math.min(0.8, options.breakRatio ?? 0.5));
    const knee =
      options.style === 'gambrel' ? 0.68 : options.style === 'pavilion' ? 0.87 : 0.38;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      const d = minDistToPolygonBoundary2D(uv, verts2D);
      const dNorm = d / dMax;
      const fh = dualSlopeFrac(dNorm, br, knee);
      const layers = Math.max(1, Math.min(H, Math.round(fh * H)));
      placeColumn(out, p, step, layers, pv, 0);
    }
    return finalizeRoofMap(out, options.hollow);
  }

  if (options.style === 'dutch_gable') {
    const W = Math.max(0, Math.min(24, Math.floor(options.wallHeight ?? 3)));
    let maxDist = 0;
    for (const uv of footprintUV) {
      const d = ridgeAlongU ? Math.abs(uv[1] - vC) : Math.abs(uv[0] - uC);
      maxDist = Math.max(maxDist, d);
    }
    if (maxDist < 1e-9) maxDist = 1;
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i]!;
      const uv = footprintUV[i]!;
      if (W > 0) {
        placeColumn(out, p, step, W, pv, 0);
      }
      const frac = gableFrac(uv, ridgeAlongU, uC, vC, maxDist);
      const capLayers = columnLayersFromUnit(frac, H);
      if (capLayers > 0) {
        placeColumn(out, p, step, capLayers, pv, W);
      }
    }
    return finalizeRoofMap(out, options.hollow);
  }

  return finalizeRoofMap(out, options.hollow);
}
