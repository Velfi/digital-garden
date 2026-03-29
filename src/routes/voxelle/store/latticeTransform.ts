import { coordKey, parseCoordKey } from '../coordUtils';

export type LatticeAxis = 0 | 1 | 2;

export type LatticeTransformParams = {
  pivot: [number, number, number];
  axis?: LatticeAxis;
  angleRad?: number;
  /** Uniform scale when `scalePerAxis` is omitted. Default 1. */
  scale?: number;
  /** Per-axis scale after rotation. When set, overrides uniform `scale`. */
  scalePerAxis?: [number, number, number];
  allowMergeOnDuplicate: boolean;
};

export function resolveLatticeScaleVec(params: LatticeTransformParams): [number, number, number] {
  if (params.scalePerAxis) {
    const [sx, sy, sz] = params.scalePerAxis;
    return [sx, sy, sz];
  }
  const s = params.scale ?? 1;
  return [s, s, s];
}

export type LatticeTransformSource<T> = {
  key: string;
  value: T;
};

export type LatticeTransformResult<T> =
  | {
      ok: true;
      tx: number;
      ty: number;
      tz: number;
      merged: boolean;
      entries: Array<{
        sourceKey: string;
        sourcePos: [number, number, number];
        destKey: string;
        destPos: [number, number, number];
        value: T;
      }>;
    }
  | { ok: false };

function rotateAroundAxis(
  [x, y, z]: [number, number, number],
  axis: LatticeAxis,
  angleRad: number
): [number, number, number] {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

function getCenterFromPositions(
  positions: [number, number, number][]
): [number, number, number] | null {
  if (positions.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

function compareLex(
  a: { sourcePos: [number, number, number] },
  b: { sourcePos: [number, number, number] }
): number {
  return (
    a.sourcePos[0] - b.sourcePos[0] ||
    a.sourcePos[1] - b.sourcePos[1] ||
    a.sourcePos[2] - b.sourcePos[2]
  );
}

/** Float world position after pivot → rotate → per-axis scale about pivot (before rounding). */
function transformFloatPos(
  p: [number, number, number],
  pivot: [number, number, number],
  axis: LatticeAxis | null,
  angleRad: number,
  scaleVec: [number, number, number]
): [number, number, number] {
  let rel: [number, number, number] = [
    p[0] - pivot[0],
    p[1] - pivot[1],
    p[2] - pivot[2]
  ];
  if (axis !== null && angleRad !== 0) rel = rotateAroundAxis(rel, axis, angleRad);
  rel = [
    rel[0] * scaleVec[0],
    rel[1] * scaleVec[1],
    rel[2] * scaleVec[2]
  ];
  return [pivot[0] + rel[0], pivot[1] + rel[1], pivot[2] + rel[2]];
}

type FloatSample<T> = {
  sourceKey: string;
  sourcePos: [number, number, number];
  value: T;
  f: [number, number, number];
};

function buildFloatSamples<T>(
  sources: LatticeTransformSource<T>[],
  params: LatticeTransformParams,
  scaleVec: [number, number, number]
): FloatSample<T>[] {
  const axis = params.axis ?? null;
  const angleRad = params.angleRad ?? 0;
  const out: FloatSample<T>[] = [];
  for (const { key, value } of sources) {
    const p = parseCoordKey(key) as [number, number, number];
    const f = transformFloatPos(p, params.pivot, axis, angleRad, scaleVec);
    out.push({ sourceKey: key, sourcePos: p, value, f });
  }
  return out;
}

/** Max of (x-span, y-span, z-span) of transformed float positions. */
function maxFloatSampleExtent(samples: FloatSample<unknown>[]): number {
  if (samples.length === 0) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const s of samples) {
    const [fx, fy, fz] = s.f;
    if (fx < minX) minX = fx;
    if (fx > maxX) maxX = fx;
    if (fy < minY) minY = fy;
    if (fy > maxY) maxY = fy;
    if (fz < minZ) minZ = fz;
    if (fz > maxZ) maxZ = fz;
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
}

/** Max distance² from integer cell to a transformed sample center for rotation hole-fill (not full bbox solid). */
const NN_ROTATION_FILL_RADIUS_SQ = 0.96 * 0.96;

/** Dense triple loop is O(bboxCells × samples); above this use sparse candidate iteration. */
const NN_FILL_VOLUME_WORK_CAP = 120_000_000;
/** Upper bound on distinct integer cells visited in sparse mode (memory + time). */
const NN_SPARSE_MAX_CANDIDATES = 3_500_000;

/**
 * Same nearest-neighbor rule as the dense bbox scan, but O(n × (2r+1)³): for each sample, relax
 * integer cells in a Chebyshev ball of radius `r` around its transformed float position, keeping
 * the closest sample per cell (lex tie-break). Required when bbox × N exceeds
 * `NN_FILL_VOLUME_WORK_CAP`.
 */
function applyLatticeTransformNearestNeighborFillSparse<T>(
  samples: FloatSample<T>[],
  params: LatticeTransformParams,
  scaleVec: [number, number, number],
  limitToSampleNeighborhood: boolean
): LatticeTransformResult<T> {
  const maxS = Math.max(scaleVec[0], scaleVec[1], scaleVec[2]);
  let chebNominal = limitToSampleNeighborhood
    ? 2
    : Math.min(48, Math.max(2, Math.ceil(maxS) + 2));
  const n = samples.length;
  let chebR = chebNominal;
  while (chebR > 1 && n * (2 * chebR + 1) ** 3 > NN_SPARSE_MAX_CANDIDATES) {
    chebR--;
  }
  if (limitToSampleNeighborhood) {
    chebR = Math.max(1, chebR);
  }

  const cellBest = new Map<string, { d: number; s: FloatSample<T> }>();

  for (const s of samples) {
    const [fx, fy, fz] = s.f;
    const x0 = Math.floor(fx - chebR);
    const x1 = Math.ceil(fx + chebR);
    const y0 = Math.floor(fy - chebR);
    const y1 = Math.ceil(fy + chebR);
    const z0 = Math.floor(fz - chebR);
    const z1 = Math.ceil(fz + chebR);
    for (let iz = z0; iz <= z1; iz++) {
      for (let iy = y0; iy <= y1; iy++) {
        for (let ix = x0; ix <= x1; ix++) {
          const dx = ix - fx;
          const dy = iy - fy;
          const dz = iz - fz;
          const d = dx * dx + dy * dy + dz * dz;
          const k = coordKey(ix, iy, iz);
          const cur = cellBest.get(k);
          if (!cur || d < cur.d || (d === cur.d && compareLex(s, cur.s) < 0)) {
            cellBest.set(k, { d, s });
          }
        }
      }
    }
  }

  if (cellBest.size > NN_SPARSE_MAX_CANDIDATES) {
    return { ok: false };
  }

  const winners: Array<{
    sourceKey: string;
    sourcePos: [number, number, number];
    provisionalPos: [number, number, number];
    value: T;
  }> = [];

  for (const [k, { d, s }] of cellBest) {
    if (limitToSampleNeighborhood && d > NN_ROTATION_FILL_RADIUS_SQ) continue;
    const p = parseCoordKey(k) as [number, number, number];
    winners.push({
      sourceKey: s.sourceKey,
      sourcePos: s.sourcePos,
      provisionalPos: p,
      value: s.value
    });
  }

  const provisionalCenter = getCenterFromPositions(winners.map((w) => w.provisionalPos));
  if (!provisionalCenter) return { ok: false };
  const tx = Math.round(params.pivot[0] - provisionalCenter[0]);
  const ty = Math.round(params.pivot[1] - provisionalCenter[1]);
  const tz = Math.round(params.pivot[2] - provisionalCenter[2]);

  const entries = winners.map((w) => {
    const destPos: [number, number, number] = [
      w.provisionalPos[0] + tx,
      w.provisionalPos[1] + ty,
      w.provisionalPos[2] + tz
    ];
    return {
      sourceKey: w.sourceKey,
      sourcePos: w.sourcePos,
      destPos,
      destKey: coordKey(destPos[0], destPos[1], destPos[2]),
      value: w.value
    };
  });
  return { ok: true, tx, ty, tz, merged: false, entries };
}

/**
 * Each integer cell in a bbox around transformed samples gets the nearest sample (Euclidean), lex tie-break.
 * When `limitToSampleNeighborhood` is true (rotation / non-upscale), only cells within `NN_ROTATION_FILL_RADIUS_SQ`
 * of some sample are kept so sparse shapes do not become axis-aligned bricks.
 */
function applyLatticeTransformNearestNeighborFill<T>(
  samples: FloatSample<T>[],
  params: LatticeTransformParams,
  scaleVec: [number, number, number],
  limitToSampleNeighborhood: boolean
): LatticeTransformResult<T> {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const eps = 1e-7;
  for (const s of samples) {
    const [fx, fy, fz] = s.f;
    minX = Math.min(minX, Math.floor(fx + eps));
    maxX = Math.max(maxX, Math.ceil(fx - eps));
    minY = Math.min(minY, Math.floor(fy + eps));
    maxY = Math.max(maxY, Math.ceil(fy - eps));
    minZ = Math.min(minZ, Math.floor(fz + eps));
    maxZ = Math.max(maxZ, Math.ceil(fz - eps));
  }
  if (limitToSampleNeighborhood) {
    const R = Math.sqrt(NN_ROTATION_FILL_RADIUS_SQ) + 1e-6;
    minX = Math.floor(minX - R);
    maxX = Math.ceil(maxX + R);
    minY = Math.floor(minY - R);
    maxY = Math.ceil(maxY + R);
    minZ = Math.floor(minZ - R);
    maxZ = Math.ceil(maxZ + R);
  } else {
    const pad = Math.ceil(Math.max(scaleVec[0], scaleVec[1], scaleVec[2])) + 2;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    minZ -= pad;
    maxZ += pad;
  }

  const vol =
    (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1) * samples.length;
  if (vol > NN_FILL_VOLUME_WORK_CAP) {
    return applyLatticeTransformNearestNeighborFillSparse(
      samples,
      params,
      scaleVec,
      limitToSampleNeighborhood
    );
  }

  const winners: Array<{
    sourceKey: string;
    sourcePos: [number, number, number];
    provisionalPos: [number, number, number];
    value: T;
  }> = [];

  for (let iz = minZ; iz <= maxZ; iz++) {
    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        let bestD = Infinity;
        let best: FloatSample<T> | null = null;
        for (const s of samples) {
          const dx = ix - s.f[0];
          const dy = iy - s.f[1];
          const dz = iz - s.f[2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = s;
          } else if (d === bestD && best !== null && compareLex(s, best) < 0) {
            best = s;
          }
        }
        if (
          best !== null &&
          (!limitToSampleNeighborhood || bestD <= NN_ROTATION_FILL_RADIUS_SQ)
        ) {
          winners.push({
            sourceKey: best.sourceKey,
            sourcePos: best.sourcePos,
            provisionalPos: [ix, iy, iz],
            value: best.value
          });
        }
      }
    }
  }

  const provisionalCenter = getCenterFromPositions(winners.map((w) => w.provisionalPos));
  if (!provisionalCenter) return { ok: false };
  const tx = Math.round(params.pivot[0] - provisionalCenter[0]);
  const ty = Math.round(params.pivot[1] - provisionalCenter[1]);
  const tz = Math.round(params.pivot[2] - provisionalCenter[2]);

  const entries = winners.map((w) => {
    const destPos: [number, number, number] = [
      w.provisionalPos[0] + tx,
      w.provisionalPos[1] + ty,
      w.provisionalPos[2] + tz
    ];
    return {
      sourceKey: w.sourceKey,
      sourcePos: w.sourcePos,
      destPos,
      destKey: coordKey(destPos[0], destPos[1], destPos[2]),
      value: w.value
    };
  });
  return { ok: true, tx, ty, tz, merged: false, entries };
}

export function applyLatticeTransform<T>(
  sources: LatticeTransformSource<T>[],
  params: LatticeTransformParams
): LatticeTransformResult<T> {
  if (sources.length === 0) {
    return { ok: true, tx: 0, ty: 0, tz: 0, merged: false, entries: [] };
  }
  const axis = params.axis ?? null;
  const angleRad = params.angleRad ?? 0;
  const scaleVec = resolveLatticeScaleVec(params);
  const maxS = Math.max(scaleVec[0], scaleVec[1], scaleVec[2]);

  const samples = buildFloatSamples(sources, params, scaleVec);
  const floatExtent = maxFloatSampleExtent(samples);
  const useNearestNeighborFill =
    maxS > 1 ||
    (Math.abs(angleRad) > 1e-9 && floatExtent > 1e-6);

  if (useNearestNeighborFill) {
    return applyLatticeTransformNearestNeighborFill(
      samples,
      params,
      scaleVec,
      maxS <= 1 + 1e-12
    );
  }

  const provisionalByDest = new Map<
    string,
    Array<{
      sourceKey: string;
      sourcePos: [number, number, number];
      provisionalPos: [number, number, number];
      value: T;
    }>
  >();

  for (const s of samples) {
    const { sourceKey: key, sourcePos, value, f } = s;
    const px = Math.round(f[0]);
    const py = Math.round(f[1]);
    const pz = Math.round(f[2]);
    const provisionalKey = coordKey(px, py, pz);
    let arr = provisionalByDest.get(provisionalKey);
    if (!arr) {
      arr = [];
      provisionalByDest.set(provisionalKey, arr);
    }
    arr.push({
      sourceKey: key,
      sourcePos,
      provisionalPos: [px, py, pz],
      value
    });
  }

  let merged = false;
  for (const arr of provisionalByDest.values()) {
    if (arr.length > 1) {
      if (!params.allowMergeOnDuplicate) return { ok: false };
      merged = true;
    }
  }

  const winners: Array<{
    sourceKey: string;
    sourcePos: [number, number, number];
    provisionalPos: [number, number, number];
    value: T;
  }> = [];
  for (const arr of provisionalByDest.values()) {
    arr.sort(compareLex);
    winners.push(arr[0]!);
  }

  const provisionalCenter = getCenterFromPositions(winners.map((w) => w.provisionalPos));
  if (!provisionalCenter) return { ok: false };
  const tx = Math.round(params.pivot[0] - provisionalCenter[0]);
  const ty = Math.round(params.pivot[1] - provisionalCenter[1]);
  const tz = Math.round(params.pivot[2] - provisionalCenter[2]);

  const entries = winners.map((w) => {
    const destPos: [number, number, number] = [
      w.provisionalPos[0] + tx,
      w.provisionalPos[1] + ty,
      w.provisionalPos[2] + tz
    ];
    return {
      sourceKey: w.sourceKey,
      sourcePos: w.sourcePos,
      destPos,
      destKey: coordKey(destPos[0], destPos[1], destPos[2]),
      value: w.value
    };
  });
  return { ok: true, tx, ty, tz, merged, entries };
}
