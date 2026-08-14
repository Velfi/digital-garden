/**
 * The slime's rest shape: a fried egg, as a closed triangle mesh.
 *
 * Pure geometry, no Jolt and no Three — this file is the single source of the
 * shape for both. `joltWorld.ts` turns it into a soft body (vertices, faces,
 * edge and bend constraints); `slimeMesh.ts` turns it into a BufferGeometry
 * and re-skins it from the physics every frame. Keeping one authority is what
 * guarantees physics vertex `i` and render vertex `i` are the same point.
 *
 * The shape is a surface of revolution: a hand-authored profile from the yolk
 * apex, down the dome, through the crease where yolk meets white, out across
 * the white's low mound, round the rim, and back under a nearly-flat bottom to
 * a pole at the centre. Revolving a polyline is watertight by construction —
 * every edge is shared by exactly two faces, which the tests assert, and which
 * pressure needs: Jolt's pressure model integrates over a closed surface, and
 * a single boundary edge would let the balloon leak.
 *
 * Local coordinates: metres, origin on the resting plane under the centre,
 * +y up. The bottom pole is the lowest vertex, so a body spawned with its
 * position at floor height is standing, not buried.
 */

/** Vertex regions. The physics reads these for stiffness, the render for colour. */
export const REGION_WHITE = 0;
export const REGION_YOLK = 1;
export const REGION_BOTTOM = 2;

/**
 * The profile, apex to bottom pole, as (radius, height) in metres with a
 * region tag. Millimetre judgements, recorded as numbers rather than derived:
 * a creature is a shape you draw, not a formula.
 *
 * The first draft was a fried egg — flat translucent skirt, domed yolk — and
 * it read as breakfast. What replaced it is the reference photo's gumdrop: a
 * single tall droplet of jelly, 40 mm across and 24 mm high, widest just
 * above its base, resting slightly proud in the middle of its underside. The
 * regions survive the reshape with their old names: `yolk` is now simply the
 * upper dome (a touch stiffer, and where the eyes anchor), `white` the lower
 * flank.
 */
const PROFILE: ReadonlyArray<readonly [number, number, number]> = [
  // A *slumped* droplet, not a gumdrop: gravity is baked into the rest
  // shape. The widest ring sits just above the floor (goo bulges where its
  // weight lands), the under-curve is low and long (a broad contact disc,
  // not a tucked-in base), and the whole body is squatter than tall. The
  // constraints pull toward this, so the resting pose *is* the slump.
  [0.005, 0.0205, REGION_YOLK],
  [0.0095, 0.019, REGION_YOLK],
  [0.013, 0.0166, REGION_YOLK],
  [0.0158, 0.0138, REGION_YOLK],
  [0.0178, 0.0108, REGION_WHITE],
  [0.0192, 0.0079, REGION_WHITE],
  [0.0202, 0.0052, REGION_WHITE],
  [0.0208, 0.0029, REGION_WHITE],
  [0.021, 0.0012, REGION_WHITE],
  [0.02, 0.00035, REGION_BOTTOM],
  [0.0165, 0.00012, REGION_BOTTOM],
  [0.011, 0.00006, REGION_BOTTOM],
  [0.0055, 0.00002, REGION_BOTTOM]
];

/** Apex of the dome, metres above the resting plane. */
const APEX_Y = 0.021;

/** Radial segments. With the 13 profile rows: 262 vertices, 520 faces. */
export const RADIAL_SEGMENTS = 20;

export interface EggMesh {
  /** xyz per vertex, local metres. */
  positions: Float32Array;
  /** Triangle indices, outward winding. Yolk faces come last — see groups. */
  faces: Uint16Array;
  /** REGION_* per vertex. */
  regions: Uint8Array;
  vertexCount: number;
  faceCount: number;
  /**
   * Face-index split for render groups: faces `[0, yolkFaceStart)` are white
   * (and bottom), faces `[yolkFaceStart, faceCount)` are yolk. A face is yolk
   * only if all three corners are, which lands the material boundary exactly
   * in the crease.
   */
  yolkFaceStart: number;
}

/**
 * Build the egg, optionally scaled — growth is the same shape, larger. The
 * scale is read once at scene start from the persisted radius; a session's
 * worth of growth (half a millimetre at best) waits for the next visit rather
 * than rebuilding a live soft body under the pet.
 */
export function buildEggMesh(scale = 1): EggMesh {
  const rows = PROFILE.length;
  const vertexCount = rows * RADIAL_SEGMENTS + 2;
  const positions = new Float32Array(vertexCount * 3);
  const regions = new Uint8Array(vertexCount);

  // Vertex 0 is the apex, vertex `vertexCount - 1` the bottom pole; ring `k`
  // vertex `s` is `1 + k * RADIAL_SEGMENTS + s`.
  positions[0] = 0;
  positions[1] = APEX_Y * scale;
  positions[2] = 0;
  regions[0] = REGION_YOLK;

  for (let k = 0; k < rows; k++) {
    const [radius, height, region] = PROFILE[k];
    for (let s = 0; s < RADIAL_SEGMENTS; s++) {
      const angle = (s / RADIAL_SEGMENTS) * Math.PI * 2;
      const i = 1 + k * RADIAL_SEGMENTS + s;
      positions[i * 3] = radius * scale * Math.cos(angle);
      positions[i * 3 + 1] = height * scale;
      positions[i * 3 + 2] = radius * scale * Math.sin(angle);
      regions[i] = region;
    }
  }

  const bottomPole = vertexCount - 1;
  positions[bottomPole * 3] = 0;
  positions[bottomPole * 3 + 1] = 0;
  positions[bottomPole * 3 + 2] = 0;
  regions[bottomPole] = REGION_BOTTOM;

  // --- faces ----------------------------------------------------------------
  // Wound so every normal points out of the solid: +y is out on top, so the
  // top fan and the top-side quads run counter-clockwise seen from above, and
  // the bottom fan the other way.
  const ring = (k: number, s: number) => 1 + k * RADIAL_SEGMENTS + (s % RADIAL_SEGMENTS);
  const white: number[] = [];
  const yolk: number[] = [];

  function emit(a: number, b: number, c: number) {
    const allYolk =
      regions[a] === REGION_YOLK && regions[b] === REGION_YOLK && regions[c] === REGION_YOLK;
    (allYolk ? yolk : white).push(a, b, c);
  }

  for (let s = 0; s < RADIAL_SEGMENTS; s++) {
    emit(0, ring(0, s + 1), ring(0, s));
  }
  for (let k = 0; k < rows - 1; k++) {
    for (let s = 0; s < RADIAL_SEGMENTS; s++) {
      const a = ring(k, s);
      const b = ring(k, s + 1);
      const c = ring(k + 1, s);
      const d = ring(k + 1, s + 1);
      emit(a, b, c);
      emit(b, d, c);
    }
  }
  for (let s = 0; s < RADIAL_SEGMENTS; s++) {
    emit(bottomPole, ring(rows - 1, s), ring(rows - 1, s + 1));
  }

  const faces = new Uint16Array(white.length + yolk.length);
  faces.set(white, 0);
  faces.set(yolk, white.length);

  return {
    positions,
    faces,
    regions,
    vertexCount,
    faceCount: faces.length / 3,
    yolkFaceStart: white.length / 3
  };
}

// ---------------------------------------------------------------- topology

export interface EdgeTopology {
  /** Unique undirected edges, as vertex index pairs. */
  edges: Array<[number, number]>;
  /**
   * For each edge, the two vertices opposite it — one from each adjacent
   * face. These four corners are what a dihedral bend constraint wants.
   * Present for every edge, because the mesh is closed; `edgesOf` throws on
   * an edge with anything other than two faces rather than guessing.
   */
  opposites: Array<[number, number]>;
}

/**
 * The unique edges of a triangle mesh, with their opposite corners.
 *
 * Shared by the constraint builder in `joltWorld.ts` and by the tests, which
 * is the point: the closedness assertion in here *is* the watertightness
 * check, and it runs in production, not just under vitest — a leaky balloon
 * fails loudly at build time instead of deflating quietly at run time.
 */
export function edgesOf(mesh: Pick<EggMesh, 'faces' | 'faceCount'>): EdgeTopology {
  /** Edge key → [a, b, oppositeOfFirstFace, oppositeOfSecondFace?]. */
  const byKey = new Map<number, number[]>();

  for (let f = 0; f < mesh.faceCount; f++) {
    const a = mesh.faces[f * 3];
    const b = mesh.faces[f * 3 + 1];
    const c = mesh.faces[f * 3 + 2];
    for (const [u, v, w] of [
      [a, b, c],
      [b, c, a],
      [c, a, b]
    ]) {
      const lo = Math.min(u, v);
      const hi = Math.max(u, v);
      const key = lo * 65536 + hi;
      const entry = byKey.get(key);
      if (entry) entry.push(w);
      else byKey.set(key, [lo, hi, w]);
    }
  }

  const edges: Array<[number, number]> = [];
  const opposites: Array<[number, number]> = [];
  for (const entry of byKey.values()) {
    if (entry.length !== 4) {
      throw new Error(
        `egg mesh is not closed: edge ${entry[0]}-${entry[1]} has ${entry.length - 2} face(s)`
      );
    }
    edges.push([entry[0], entry[1]]);
    opposites.push([entry[2], entry[3]]);
  }
  return { edges, opposites };
}

/**
 * Signed volume of the closed mesh, metres cubed, by summing signed
 * tetrahedra against the origin. Positive for outward winding — the tests pin
 * that, and the pressure maths in `constants.ts` is calibrated against it.
 */
export function volumeOf(mesh: Pick<EggMesh, 'positions' | 'faces' | 'faceCount'>): number {
  const p = mesh.positions;
  let six = 0;
  for (let f = 0; f < mesh.faceCount; f++) {
    const a = mesh.faces[f * 3] * 3;
    const b = mesh.faces[f * 3 + 1] * 3;
    const c = mesh.faces[f * 3 + 2] * 3;
    six +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return six / 6;
}

// Physics modules must never hot-swap: a scene holding closures over an old
// world while new modules load beside it renders ghosts of retired physics
// (a stale tab once showed the long-dead elastic gumdrop over the beanbag
// build). Any edit here forces a clean reload; the pet persists via storage.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
