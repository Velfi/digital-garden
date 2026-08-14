import * as THREE from 'three';

// SAH-binned BVH builder + stackless (miss-link / skip-index) GPU layout.
//
// Node layout in the flat `nodes` texture — 2 RGBA32F texels per node:
//   texel 0: (aabbMin.x, aabbMin.y, aabbMin.z, leafPrimStartOrInnerLeftIsImplicit)
//   texel 1: (aabbMax.x, aabbMax.y, aabbMax.z, leafPrimCountOrMissLink)
// Encoding:
//   - Interior node: texel0.w = 0 (sentinel), texel1.w = missLink (uint bits
//     reinterpreted from float via intBitsToFloat on CPU / floatBitsToInt on GPU).
//     Left child is always nodeIdx+1 (depth-first layout).
//   - Leaf node: texel0.w > 0 is unreliable (could be 0 for an empty leaf);
//     we instead detect leafness by storing primCount in texel1.w with a flag
//     bit. Simpler: encode as two separate fields.
//
// Simpler scheme (what we actually use):
//   texel 0: (min.x, min.y, min.z, asFloat(primStart))  — primStart = 0xFFFFFFFF for interior
//   texel 1: (max.x, max.y, max.z, asFloat(primCountOrMiss))
//     - Leaf: primCountOrMiss = primCount (>= 1)
//     - Interior: primCountOrMiss packs miss link (we steal primStart=0xFFFFFFFF as the "interior" marker)
// On the GPU we read texel0.w as uint bits; if it == 0xFFFFFFFFu it's interior, and
// texel1.w (as uint) is the miss link. Otherwise it's a leaf with primStart=texel0.w,
// primCount=texel1.w.

export type BvhBuild = {
  // RGBA32F, 2 texels per node.
  nodeCount: number;
  nodesTex: THREE.DataTexture;
  nodesWidth: number;
  nodesHeight: number;
  // R32UI, flat triangle index list (leaf primStart ranges point into this).
  primIndicesTex: THREE.DataTexture;
  primIndicesWidth: number;
  primIndicesHeight: number;
  dispose(): void;
};

// Target leaf size. Smaller = deeper tree, more AABB tests; larger = more
// triangle tests per leaf. 4 is a reasonable default for this scene scale.
const LEAF_TARGET = 4;
const SAH_BINS = 12;
const INTERIOR_MARKER = 0xffffffff;

type Aabb = { min: [number, number, number]; max: [number, number, number] };
type BuildNode = {
  aabb: Aabb;
  // For leaves:
  primStart: number;
  primCount: number;
  // For interiors (primCount === 0):
  left: BuildNode | null;
  right: BuildNode | null;
};

function emptyAabb(): Aabb {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function expandAabb(a: Aabb, p: [number, number, number]) {
  if (p[0] < a.min[0]) a.min[0] = p[0];
  if (p[1] < a.min[1]) a.min[1] = p[1];
  if (p[2] < a.min[2]) a.min[2] = p[2];
  if (p[0] > a.max[0]) a.max[0] = p[0];
  if (p[1] > a.max[1]) a.max[1] = p[1];
  if (p[2] > a.max[2]) a.max[2] = p[2];
}

function mergeAabb(into: Aabb, other: Aabb) {
  if (other.min[0] < into.min[0]) into.min[0] = other.min[0];
  if (other.min[1] < into.min[1]) into.min[1] = other.min[1];
  if (other.min[2] < into.min[2]) into.min[2] = other.min[2];
  if (other.max[0] > into.max[0]) into.max[0] = other.max[0];
  if (other.max[1] > into.max[1]) into.max[1] = other.max[1];
  if (other.max[2] > into.max[2]) into.max[2] = other.max[2];
}

function aabbSurfaceArea(a: Aabb): number {
  const dx = Math.max(0, a.max[0] - a.min[0]);
  const dy = Math.max(0, a.max[1] - a.min[1]);
  const dz = Math.max(0, a.max[2] - a.min[2]);
  return 2 * (dx * dy + dy * dz + dz * dx);
}

// `positions` is the same flat Float32Array layout as ptScene.ts: 3 vertices
// per tri, 4 floats per vertex (xyz + pad).
export function buildBvh(positions: number[] | Float32Array, triCount: number): BvhBuild {
  // Per-triangle aabb + centroid.
  const triAabb: Aabb[] = new Array(triCount);
  const triCentroid = new Float32Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const o = t * 3 * 4;
    const ax = positions[o + 0],
      ay = positions[o + 1],
      az = positions[o + 2];
    const bx = positions[o + 4],
      by = positions[o + 5],
      bz = positions[o + 6];
    const cx = positions[o + 8],
      cy = positions[o + 9],
      cz = positions[o + 10];
    const a: Aabb = {
      min: [Math.min(ax, bx, cx), Math.min(ay, by, cy), Math.min(az, bz, cz)],
      max: [Math.max(ax, bx, cx), Math.max(ay, by, cy), Math.max(az, bz, cz)]
    };
    triAabb[t] = a;
    triCentroid[t * 3 + 0] = (a.min[0] + a.max[0]) * 0.5;
    triCentroid[t * 3 + 1] = (a.min[1] + a.max[1]) * 0.5;
    triCentroid[t * 3 + 2] = (a.min[2] + a.max[2]) * 0.5;
  }

  // Prim index array that we'll partition in place.
  const primIndices = new Uint32Array(triCount);
  for (let i = 0; i < triCount; i++) primIndices[i] = i;

  function computeBounds(start: number, count: number): { bbox: Aabb; cbox: Aabb } {
    const bbox = emptyAabb();
    const cbox = emptyAabb();
    for (let i = 0; i < count; i++) {
      const ti = primIndices[start + i];
      mergeAabb(bbox, triAabb[ti]);
      const c: [number, number, number] = [
        triCentroid[ti * 3 + 0],
        triCentroid[ti * 3 + 1],
        triCentroid[ti * 3 + 2]
      ];
      expandAabb(cbox, c);
    }
    return { bbox, cbox };
  }

  function build(start: number, count: number): BuildNode {
    const { bbox, cbox } = computeBounds(start, count);

    if (count <= LEAF_TARGET) {
      return { aabb: bbox, primStart: start, primCount: count, left: null, right: null };
    }

    // Pick the axis with the largest centroid extent.
    const ext: [number, number, number] = [
      cbox.max[0] - cbox.min[0],
      cbox.max[1] - cbox.min[1],
      cbox.max[2] - cbox.min[2]
    ];
    let axis = 0;
    if (ext[1] > ext[axis]) axis = 1;
    if (ext[2] > ext[axis]) axis = 2;
    const extent = ext[axis];
    if (extent <= 0) {
      // All centroids coincide — can't split meaningfully. Emit as leaf.
      return { aabb: bbox, primStart: start, primCount: count, left: null, right: null };
    }

    // Bin centroids along the chosen axis.
    type Bin = { count: number; bbox: Aabb };
    const bins: Bin[] = [];
    for (let i = 0; i < SAH_BINS; i++) bins.push({ count: 0, bbox: emptyAabb() });
    const cmin = cbox.min[axis];
    const scale = SAH_BINS / extent;
    for (let i = 0; i < count; i++) {
      const ti = primIndices[start + i];
      const c = triCentroid[ti * 3 + axis];
      let b = Math.floor((c - cmin) * scale);
      if (b < 0) b = 0;
      if (b >= SAH_BINS) b = SAH_BINS - 1;
      bins[b].count++;
      mergeAabb(bins[b].bbox, triAabb[ti]);
    }

    // Sweep prefixes left-to-right and right-to-left to evaluate SAH cost
    // at each bin boundary.
    const leftCount = new Int32Array(SAH_BINS - 1);
    const leftArea = new Float64Array(SAH_BINS - 1);
    const rightCount = new Int32Array(SAH_BINS - 1);
    const rightArea = new Float64Array(SAH_BINS - 1);
    {
      let accCount = 0;
      const accBox = emptyAabb();
      for (let i = 0; i < SAH_BINS - 1; i++) {
        accCount += bins[i].count;
        mergeAabb(accBox, bins[i].bbox);
        leftCount[i] = accCount;
        leftArea[i] = aabbSurfaceArea(accBox);
      }
    }
    {
      let accCount = 0;
      const accBox = emptyAabb();
      for (let i = SAH_BINS - 1; i > 0; i--) {
        accCount += bins[i].count;
        mergeAabb(accBox, bins[i].bbox);
        rightCount[i - 1] = accCount;
        rightArea[i - 1] = aabbSurfaceArea(accBox);
      }
    }

    const parentArea = aabbSurfaceArea(bbox);
    const invParentArea = parentArea > 0 ? 1.0 / parentArea : 0;
    const leafCost = count; // cost of making this a leaf (1 per prim, Ct=1)
    let bestCost = leafCost;
    let bestSplit = -1;
    const travCost = 0.5; // interior traversal constant relative to prim cost
    for (let i = 0; i < SAH_BINS - 1; i++) {
      if (leftCount[i] === 0 || rightCount[i] === 0) continue;
      const cost =
        travCost +
        invParentArea * (leftArea[i] * leftCount[i] + rightArea[i] * rightCount[i]);
      if (cost < bestCost) {
        bestCost = cost;
        bestSplit = i;
      }
    }

    if (bestSplit < 0) {
      return { aabb: bbox, primStart: start, primCount: count, left: null, right: null };
    }

    // Partition primIndices[start..start+count) in place so that all
    // centroids with bin <= bestSplit go to the left half.
    const pivot = cmin + (extent * (bestSplit + 1)) / SAH_BINS;
    let lo = start;
    let hi = start + count - 1;
    while (lo <= hi) {
      const ti = primIndices[lo];
      if (triCentroid[ti * 3 + axis] < pivot) {
        lo++;
      } else {
        const tmp = primIndices[lo];
        primIndices[lo] = primIndices[hi];
        primIndices[hi] = tmp;
        hi--;
      }
    }
    const leftCountFinal = lo - start;
    const rightCountFinal = count - leftCountFinal;
    if (leftCountFinal === 0 || rightCountFinal === 0) {
      // Degenerate partition (can happen when many centroids tie at the
      // pivot). Fall back to a median split on the same axis to guarantee
      // progress.
      const mid = start + (count >> 1);
      // Nth-element-style partition via Hoare-ish selection is overkill;
      // a full sort of this slice is fine for our tri counts.
      const slice = Array.from(primIndices.subarray(start, start + count));
      slice.sort((a, b) => triCentroid[a * 3 + axis] - triCentroid[b * 3 + axis]);
      for (let i = 0; i < count; i++) primIndices[start + i] = slice[i];
      const left = build(start, mid - start);
      const right = build(mid, start + count - mid);
      return { aabb: bbox, primStart: -1, primCount: 0, left, right };
    }

    const left = build(start, leftCountFinal);
    const right = build(lo, rightCountFinal);
    return { aabb: bbox, primStart: -1, primCount: 0, left, right };
  }

  const root = build(0, triCount);

  // Flatten depth-first (left child is always at nodeIdx+1). Assign miss
  // links: the miss link of a node is the index of the first node reached
  // by "skipping" this subtree — i.e., the sibling of the deepest ancestor
  // we came from as a left child, or sentinel (== nodeCount) for the root's
  // right spine.
  const flat: {
    aabb: Aabb;
    primStart: number;
    primCount: number;
    miss: number;
  }[] = [];

  function flatten(node: BuildNode, miss: number): number {
    const idx = flat.length;
    flat.push({ aabb: node.aabb, primStart: node.primStart, primCount: node.primCount, miss });
    if (node.primCount > 0) {
      // Leaf.
      return idx;
    }
    // Left child: when we miss its subtree (or finish it), we fall through
    // to the right child, which is at... well, we don't know its index yet.
    // Reserve: flatten left with miss = (right's index, computed after),
    // but since we don't have that, do a two-pass. Easier: compute right's
    // index by flattening left first then right, using a placeholder.
    //
    // Trick: flatten left with miss = -1, patch after we know right's idx.
    const leftIdx = flatten(node.left!, -1);
    const rightIdx = flatten(node.right!, miss);
    // Patch left subtree's "escape to sibling" links: every node in the
    // left subtree whose miss was -1 should point to rightIdx.
    for (let k = leftIdx; k < rightIdx; k++) {
      if (flat[k].miss === -1) flat[k].miss = rightIdx;
    }
    return idx;
  }

  flatten(root, flat.length /* sentinel = nodeCount */);
  // Any remaining miss = -1 is the root's right spine → sentinel.
  const sentinel = flat.length;
  for (let k = 0; k < flat.length; k++) if (flat[k].miss === -1) flat[k].miss = sentinel;

  // Pack into textures.
  const nodeCount = flat.length;
  const nodeTexels = nodeCount * 2;
  const nodesW = nextPow2(Math.max(64, Math.ceil(Math.sqrt(nodeTexels))));
  const nodesH = Math.max(1, Math.ceil(nodeTexels / nodesW));
  const nodeData = new Float32Array(nodesW * nodesH * 4);
  const nodeBits = new Uint32Array(nodeData.buffer);
  for (let i = 0; i < nodeCount; i++) {
    const n = flat[i];
    const o = i * 2 * 4;
    nodeData[o + 0] = n.aabb.min[0];
    nodeData[o + 1] = n.aabb.min[1];
    nodeData[o + 2] = n.aabb.min[2];
    // texel0.w: primStart for leaf, 0xFFFFFFFF marker for interior.
    nodeBits[o + 3] = n.primCount > 0 ? n.primStart : INTERIOR_MARKER;
    nodeData[o + 4] = n.aabb.max[0];
    nodeData[o + 5] = n.aabb.max[1];
    nodeData[o + 6] = n.aabb.max[2];
    // texel1.w: primCount for leaf, miss link for interior.
    nodeBits[o + 7] = n.primCount > 0 ? n.primCount : n.miss;
  }

  const primIdxW = nextPow2(Math.max(64, Math.ceil(Math.sqrt(Math.max(1, triCount)))));
  const primIdxH = Math.max(1, Math.ceil(triCount / primIdxW));
  const primIdxPad = new Uint32Array(primIdxW * primIdxH);
  primIdxPad.set(primIndices);

  const nodesTex = makeFloatTex(nodeData, nodesW, nodesH);
  const primIndicesTex = makeU32Tex(primIdxPad, primIdxW, primIdxH);

  return {
    nodeCount,
    nodesTex,
    nodesWidth: nodesW,
    nodesHeight: nodesH,
    primIndicesTex,
    primIndicesWidth: primIdxW,
    primIndicesHeight: primIdxH,
    dispose() {
      nodesTex.dispose();
      primIndicesTex.dispose();
    }
  };
}

function makeFloatTex(data: Float32Array, w: number, h: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.internalFormat = 'RGBA32F';
  tex.needsUpdate = true;
  return tex;
}

function makeU32Tex(data: Uint32Array, w: number, h: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    data,
    w,
    h,
    THREE.RedIntegerFormat,
    THREE.UnsignedIntType
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.internalFormat = 'R32UI';
  tex.needsUpdate = true;
  return tex;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
