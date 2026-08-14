import { edgesOf, type EggMesh } from './eggMesh';

/**
 * One pass of Loop subdivision, precomputed as a sparse weight matrix.
 *
 * The physics runs on the coarse egg — 282 vertices is a solver budget — but
 * rendered raw it has visible facets. One Loop pass turns 560 faces into
 * 2240, and because the topology never changes, the whole scheme collapses to
 * a fixed sparse matrix built once here: every subdivided vertex is a small
 * weighted sum of coarse vertices. Applying it per frame is a few thousand
 * multiplies — cheaper than the normals recompute that follows it.
 *
 * The weights are the standard Loop rules. An original vertex of valence n
 * relaxes toward its neighbours with β = (1/n)(5/8 − (3/8 + ¼cos(2π/n))²);
 * an edge vertex is ⅜ each of the edge's ends and ⅛ each of the two opposite
 * corners — the same opposite corners the dihedral bend constraints use, from
 * the same `edgesOf` topology. Rows sum to 1 by construction, and the tests
 * assert it anyway.
 */

export interface Subdivision {
  vertexCount: number;
  faces: Uint16Array;
  faceCount: number;
  /** Children inherit their parent's material group, in order. */
  yolkFaceStart: number;
  /** CSR-shaped weights: row i is entries [offsets[i], offsets[i+1]). */
  offsets: Uint32Array;
  indices: Uint16Array;
  values: Float32Array;
  /** dst[i] = Σ values · src[indices], per coordinate. */
  apply(src: Float32Array, dst: Float32Array): void;
}

export function buildSubdivision(egg: EggMesh): Subdivision {
  const topology = edgesOf(egg);
  const coarseCount = egg.vertexCount;
  const edgeCount = topology.edges.length;
  const vertexCount = coarseCount + edgeCount;

  // --- adjacency for the vertex rule ---------------------------------------
  const neighbours: number[][] = Array.from({ length: coarseCount }, () => []);
  const edgeIndex = new Map<number, number>();
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = topology.edges[e];
    neighbours[a].push(b);
    neighbours[b].push(a);
    edgeIndex.set(a * 65536 + b, e);
  }

  // --- weights --------------------------------------------------------------
  const rows: Array<Array<[number, number]>> = [];

  for (let v = 0; v < coarseCount; v++) {
    const n = neighbours[v].length;
    const inner = 3 / 8 + Math.cos((2 * Math.PI) / n) / 4;
    const beta = (5 / 8 - inner * inner) / n;
    const row: Array<[number, number]> = [[v, 1 - n * beta]];
    for (const u of neighbours[v]) row.push([u, beta]);
    rows.push(row);
  }

  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = topology.edges[e];
    const [c, d] = topology.opposites[e];
    rows.push([
      [a, 3 / 8],
      [b, 3 / 8],
      [c, 1 / 8],
      [d, 1 / 8]
    ]);
  }

  let total = 0;
  for (const row of rows) total += row.length;
  const offsets = new Uint32Array(vertexCount + 1);
  const indices = new Uint16Array(total);
  const values = new Float32Array(total);
  let cursor = 0;
  for (let i = 0; i < vertexCount; i++) {
    offsets[i] = cursor;
    for (const [index, value] of rows[i]) {
      indices[cursor] = index;
      values[cursor] = value;
      cursor += 1;
    }
  }
  offsets[vertexCount] = cursor;

  // --- faces ----------------------------------------------------------------
  const midpoint = (u: number, v: number): number => {
    const lo = Math.min(u, v);
    const hi = Math.max(u, v);
    const e = edgeIndex.get(lo * 65536 + hi);
    if (e === undefined) throw new Error(`no edge ${lo}-${hi}`);
    return coarseCount + e;
  };

  const faces = new Uint16Array(egg.faceCount * 4 * 3);
  let out = 0;
  for (let f = 0; f < egg.faceCount; f++) {
    const a = egg.faces[f * 3];
    const b = egg.faces[f * 3 + 1];
    const c = egg.faces[f * 3 + 2];
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    // Same winding as the parent, so outward stays outward.
    for (const tri of [
      [a, ab, ca],
      [b, bc, ab],
      [c, ca, bc],
      [ab, bc, ca]
    ]) {
      faces[out] = tri[0];
      faces[out + 1] = tri[1];
      faces[out + 2] = tri[2];
      out += 3;
    }
  }

  return {
    vertexCount,
    faces,
    faceCount: egg.faceCount * 4,
    yolkFaceStart: egg.yolkFaceStart * 4,
    offsets,
    indices,
    values,
    apply(src, dst) {
      for (let i = 0; i < vertexCount; i++) {
        let x = 0;
        let y = 0;
        let z = 0;
        for (let k = offsets[i]; k < offsets[i + 1]; k++) {
          const j = indices[k] * 3;
          const w = values[k];
          x += src[j] * w;
          y += src[j + 1] * w;
          z += src[j + 2] * w;
        }
        dst[i * 3] = x;
        dst[i * 3 + 1] = y;
        dst[i * 3 + 2] = z;
      }
    }
  };
}
