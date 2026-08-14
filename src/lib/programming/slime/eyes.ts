import * as THREE from 'three';
import { mulberry32 } from '../marimo/rng';
import { REGION_BOTTOM, type EggMesh } from './eggMesh';

/**
 * The eyes: two small dark lenses that ride the yolk dome.
 *
 * Each is anchored to a coarse physics face — position is the face's centroid
 * pushed out along its normal, orientation is the face's own frame — so they
 * ride every jiggle, dent and carry for free. No UV pipeline, no skinning:
 * three vertex reads and a cross product per eye per frame.
 *
 * They blink on a seeded pseudo-Poisson clock (squashing along the dome's
 * vertical tangent, not the world's, so a tilted slime blinks along its own
 * face), glance toward the pointer by sliding a fraction of a millimetre in
 * the tangent plane, and droop by losing height as mood falls — a sleepy
 * half-blink that never quite closes.
 *
 * A poke pulls harder than a glance: the beads swim across the rest surface
 * to crowd around the poked spot and converge on it, the way anyone looks at
 * a finger pressed to their own nose. The swim is a straight blend in rest
 * space re-projected onto the dome every frame, so however the body has
 * rolled or dented, the eyes travel over its actual surface — and since a
 * poke can only land on a face the camera can see, they always end up
 * somewhere the visitor can watch.
 */

/** Lens radius, metres. Beady, not cartoon. */
const EYE_RADIUS = 0.002;
/**
 * How far off the surface the lens sits — *negative*: the beads hang a
 * couple of millimetres inside the jelly. They are drawn in the interior
 * pass and reach the screen through the volume material's refraction, which
 * is what makes them read as embedded in the body rather than stuck on it.
 */
const EYE_PROUD = -0.0008;
/** Farthest the glance slides in the tangent plane, metres. */
const GAZE_REACH = 0.0007;
/**
 * Farthest the slide goes when fully cross-eyed — looking at a poked spot on
 * the slime's own body. A distant glance is a fraction of a millimetre; a
 * self-look has to be over twice that to read as convergence, because the
 * two eyes are sliding toward each other and each carries half the effect.
 */
const SELF_GAZE_REACH = 0.0016;
/**
 * How the beads crowd a poke: centre-to-centre gap between them when fully
 * arrived, and how far above the poked point they hover — peering down at
 * it. The gap leaves clear water between the 4 mm beads even after the
 * cross-eyed glance drags them a further millimetre and a half together.
 */
const POKE_EYE_GAP = 0.009;
const POKE_EYE_RISE = 0.002;
/** Blink length, seconds; gap bounds, seconds. */
const BLINK_SEC = 0.13;
const BLINK_GAP_MIN = 1.6;
const BLINK_GAP_MAX = 7;

export interface EyesBundle {
  group: THREE.Group;
  /**
   * Reposition from the coarse world positions. `gaze` is a world point to
   * glance toward (the pointer's ray on the slime, or null for straight
   * ahead); `mood` in [0, 1] droops the lids as it falls. `poke`, when
   * present, swims the beads toward the poked coarse face: `ease` in [0, 1]
   * is how far along the trip they are, 1 being fully crowded around the
   * spot and cross-eyed at it. The caller owns the easing so onset, hold
   * and return all live on one clock.
   */
  update(
    worldPositions: Float32Array,
    timeSec: number,
    gaze: readonly number[] | null,
    mood: number,
    poke?: { face: number; ease: number } | null
  ): void;
  dispose(): void;
}

export interface EyeAnchor {
  face: number;
  /** Barycentric weights of the anchor point within the face. */
  bary: [number, number, number];
}

/** Where each eye wants to sit on the rest dome: like the reference photo,
 * two beads on the camera-facing front at just over half height — ±22° off
 * the +z the camera starts on. */
const EYE_AZIMUTH = 0.38;
const EYE_RING_RADIUS = 0.0165;
const EYE_HEIGHT = 0.0135;

/**
 * Pick the two anchors, once, from the rest shape: for each eye, the face
 * nearest its desired point, with the barycentric coordinates of the closest
 * point on that face. Barycentric rather than centroid, deliberately: the
 * dome is 20 radial segments, faces land where they land, and centroid
 * anchoring left one eye visibly higher than the other. The exact projected
 * point is symmetric to the millimetre whatever the mesh does.
 *
 * Every face is a candidate, not just the old yolk region — that restriction
 * was fried-egg logic, and on the gumdrop it silently pinned the eyes to the
 * upper dome however low they were asked to sit. The bottom region is still
 * excluded: an eye on the underside would be an eye in the moss.
 * Deterministic, and exported for the tests.
 */
export function pickEyeAnchors(egg: EggMesh): [EyeAnchor, EyeAnchor] {
  return [
    projectToAnchor(egg, homeWantPoint(-1), { face: 0, bary: [1 / 3, 1 / 3, 1 / 3] }),
    projectToAnchor(egg, homeWantPoint(1), { face: 0, bary: [1 / 3, 1 / 3, 1 / 3] })
  ];
}

/** The rest-space point eye `side` (−1 left, +1 right) calls home. */
function homeWantPoint(side: number): [number, number, number] {
  return [
    Math.sin(side * EYE_AZIMUTH) * EYE_RING_RADIUS,
    EYE_HEIGHT,
    Math.cos(side * EYE_AZIMUTH) * EYE_RING_RADIUS
  ];
}

/**
 * Project a rest-space point onto the rest surface: the nearest non-bottom
 * face, with the barycentric coordinates of the closest point on it. Writes
 * into and returns `out` — this runs per eye per frame while a poke look is
 * in flight, so it must not allocate.
 */
export function projectToAnchor(
  egg: EggMesh,
  point: readonly number[],
  out: EyeAnchor
): EyeAnchor {
  let bestDist = Infinity;
  for (let f = 0; f < egg.faceCount; f++) {
    let anyBottom = false;
    for (let corner = 0; corner < 3; corner++) {
      anyBottom ||= egg.regions[egg.faces[f * 3 + corner]] === REGION_BOTTOM;
    }
    if (anyBottom) continue;
    const distance = closestPointOnFace(egg, f, point);
    if (distance < bestDist) {
      bestDist = distance;
      out.face = f;
      out.bary[0] = baryScratch[0];
      out.bary[1] = baryScratch[1];
      out.bary[2] = baryScratch[2];
    }
  }
  return out;
}

/** Barycentric weights of the last closestPointOnFace call — a scratch, not
 * a result to hold onto. Shared so the per-frame projection never allocates. */
const baryScratch: [number, number, number] = [0, 0, 0];
const ab: number[] = [0, 0, 0];
const ac: number[] = [0, 0, 0];
const ap: number[] = [0, 0, 0];
const bp: number[] = [0, 0, 0];
const cp: number[] = [0, 0, 0];

/** Distance from `point` to the nearest point on a face; the barycentric
 * weights of that nearest point land in `baryScratch`. */
function closestPointOnFace(egg: EggMesh, face: number, point: readonly number[]): number {
  const read = (corner: number, axis: number) =>
    egg.positions[egg.faces[face * 3 + corner] * 3 + axis];
  // Ericson's closest-point-on-triangle, in scalar form.
  for (let axis = 0; axis < 3; axis++) {
    ab[axis] = read(1, axis) - read(0, axis);
    ac[axis] = read(2, axis) - read(0, axis);
    ap[axis] = point[axis] - read(0, axis);
  }
  const dot = (u: number[], v: number[]) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  let v = 0;
  let w = 0;
  if (d1 <= 0 && d2 <= 0) {
    // Corner A.
  } else {
    for (let axis = 0; axis < 3; axis++) {
      bp[axis] = point[axis] - read(1, axis);
      cp[axis] = point[axis] - read(2, axis);
    }
    const d3 = dot(ab, bp);
    const d4 = dot(ac, bp);
    const d5 = dot(ab, cp);
    const d6 = dot(ac, cp);
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) {
      v = 1; // Corner B.
    } else if (d6 >= 0 && d5 <= d6) {
      w = 1; // Corner C.
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      v = d1 / (d1 - d3); // Edge AB.
    } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      w = d2 / (d2 - d6); // Edge AC.
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      v = 1 - (d4 - d3) / (d4 - d3 + (d5 - d6)); // Edge BC.
      w = 1 - v;
    } else {
      const denominator = va + vb + vc;
      v = vb / denominator;
      w = vc / denominator;
    }
  }

  const dx = read(0, 0) + ab[0] * v + ac[0] * w - point[0];
  const dy = read(0, 1) + ab[1] * v + ac[1] * w - point[1];
  const dz = read(0, 2) + ab[2] * v + ac[2] * w - point[2];
  baryScratch[0] = 1 - v - w;
  baryScratch[1] = v;
  baryScratch[2] = w;
  return Math.hypot(dx, dy, dz);
}

export function createEyes(egg: EggMesh, seed: number): EyesBundle {
  const anchors = pickEyeAnchors(egg);
  const group = new THREE.Group();

  // The swim: while a poke look is in flight, each eye's anchor is remade by
  // blending its home rest point toward a spot beside the poked face and
  // projecting the blend back onto the rest surface — the chord becomes an
  // arc over the dome. `travelAnchors` are the mutable outputs; `lastWant`
  // lets the projection scan skip any frame where the blend point hasn't
  // moved, which is most of the hold.
  const homeWant = [homeWantPoint(-1), homeWantPoint(1)];
  const travelAnchors: [EyeAnchor, EyeAnchor] = [
    { face: anchors[0].face, bary: [...anchors[0].bary] },
    { face: anchors[1].face, bary: [...anchors[1].bary] }
  ];
  const wantScratch: [number, number, number] = [0, 0, 0];
  const lastWant = [
    [Infinity, 0, 0],
    [Infinity, 0, 0]
  ];
  let pokeCacheFace = -1;
  const pokeCenter = [0, 0, 0];
  const pokeSide = [1, 0, 0];

  /** Rest centroid of the poked face, and the horizontal rest tangent the
   * two beads spread along — cross(up, rest normal), which is well-defined
   * everywhere but the apex, where +x does fine. */
  function cachePokeFrame(face: number): void {
    pokeCacheFace = face;
    for (let axis = 0; axis < 3; axis++) {
      pokeCenter[axis] =
        (egg.positions[egg.faces[face * 3] * 3 + axis] +
          egg.positions[egg.faces[face * 3 + 1] * 3 + axis] +
          egg.positions[egg.faces[face * 3 + 2] * 3 + axis]) /
        3;
      ab[axis] =
        egg.positions[egg.faces[face * 3 + 1] * 3 + axis] -
        egg.positions[egg.faces[face * 3] * 3 + axis];
      ac[axis] =
        egg.positions[egg.faces[face * 3 + 2] * 3 + axis] -
        egg.positions[egg.faces[face * 3] * 3 + axis];
    }
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const sideLength = Math.hypot(nz, nx);
    if (sideLength < 1e-9) {
      pokeSide[0] = 1;
      pokeSide[1] = 0;
      pokeSide[2] = 0;
    } else {
      pokeSide[0] = nz / sideLength;
      pokeSide[1] = 0;
      pokeSide[2] = -nx / sideLength;
    }
  }

  const geometry = new THREE.SphereGeometry(1, 20, 14);
  // Unlit, near-black: the beads read as silhouettes against the lit jelly
  // interior, the way the reference creature's do. A lit material picked up
  // enough key light to grey them into invisibility.
  const material = new THREE.MeshBasicMaterial({ color: 0x0b0a08 });
  const lenses = anchors.map(() => {
    const lens = new THREE.Mesh(geometry, material);
    lens.matrixAutoUpdate = false;
    group.add(lens);
    return lens;
  });

  // One blink clock for both eyes — creatures blink both at once — advanced
  // by wall time and reseeded never: the pet blinks the same way every visit.
  const rand = mulberry32((seed ^ 0x51f15e) >>> 0);
  let nextBlinkAt = BLINK_GAP_MIN + rand() * (BLINK_GAP_MAX - BLINK_GAP_MIN);
  let blinkStarted = -1;
  let lastTime = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const tangentX = new THREE.Vector3();
  const tangentY = new THREE.Vector3();
  const glance = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();
  const scratch = new THREE.Vector3();

  return {
    group,

    update(worldPositions, timeSec, gaze, mood, poke = null) {
      // The blink clock. Time can jump (tab hidden, loop paused); a jump just
      // means the next blink is soon, which is also what a pet does when you
      // come back to it.
      if (timeSec < lastTime) blinkStarted = -1;
      lastTime = timeSec;
      if (blinkStarted < 0 && timeSec >= nextBlinkAt) blinkStarted = timeSec;
      let blink = 1;
      if (blinkStarted >= 0) {
        const phase = (timeSec - blinkStarted) / BLINK_SEC;
        if (phase >= 1) {
          blinkStarted = -1;
          nextBlinkAt = timeSec + BLINK_GAP_MIN + rand() * (BLINK_GAP_MAX - BLINK_GAP_MIN);
        } else {
          // Down fast, up slower; never fully shut to zero so the lens keeps
          // a glint of thickness.
          blink = 0.08 + 0.92 * Math.abs(1 - phase * 2) ** 1.5;
        }
      }
      // Droop: a low mood carries the lid half-way down all the time.
      const openness = blink * (0.45 + 0.55 * mood);

      const ease = poke && poke.face >= 0 ? Math.min(1, Math.max(0, poke.ease)) : 0;
      for (let eye = 0; eye < 2; eye++) {
        let anchor = anchors[eye];
        if (ease > 0.001 && poke) {
          if (poke.face !== pokeCacheFace) cachePokeFrame(poke.face);
          const spread = (eye === 0 ? -1 : 1) * POKE_EYE_GAP * 0.5;
          for (let axis = 0; axis < 3; axis++) {
            const target =
              pokeCenter[axis] + pokeSide[axis] * spread + (axis === 1 ? POKE_EYE_RISE : 0);
            wantScratch[axis] = homeWant[eye][axis] + (target - homeWant[eye][axis]) * ease;
          }
          const moved =
            Math.abs(wantScratch[0] - lastWant[eye][0]) +
            Math.abs(wantScratch[1] - lastWant[eye][1]) +
            Math.abs(wantScratch[2] - lastWant[eye][2]);
          if (moved > 1e-7) {
            projectToAnchor(egg, wantScratch, travelAnchors[eye]);
            lastWant[eye][0] = wantScratch[0];
            lastWant[eye][1] = wantScratch[1];
            lastWant[eye][2] = wantScratch[2];
          }
          anchor = travelAnchors[eye];
        } else {
          // Home again: force the next swim's first frame to re-project.
          lastWant[eye][0] = Infinity;
        }
        const { face: f, bary } = anchor;
        a.fromArray(worldPositions, egg.faces[f * 3] * 3);
        b.fromArray(worldPositions, egg.faces[f * 3 + 1] * 3);
        c.fromArray(worldPositions, egg.faces[f * 3 + 2] * 3);
        centroid
          .set(0, 0, 0)
          .addScaledVector(a, bary[0])
          .addScaledVector(b, bary[1])
          .addScaledVector(c, bary[2]);
        normal.copy(edge1.copy(b).sub(a)).cross(edge2.copy(c).sub(a)).normalize();

        // A tangent frame with its Y as vertical as the surface allows: the
        // blink squash runs along it.
        tangentX.copy(worldUp).cross(normal);
        if (tangentX.lengthSq() < 1e-8) tangentX.set(1, 0, 0);
        tangentX.normalize();
        tangentY.copy(normal).cross(tangentX).normalize();

        centroid.addScaledVector(normal, EYE_PROUD);

        if (gaze) {
          glance.set(gaze[0], gaze[1], gaze[2]).sub(centroid);
          glance.addScaledVector(normal, -glance.dot(normal));
          const reach = glance.length();
          if (reach > 1e-6) {
            // A distant glance slides 2% of the way, capped short; a
            // cross-eyed self-look pulls half the (tiny) distance with a
            // longer leash, so once the beads arrive beside the poke they
            // each lean a further visible millimetre and a half toward it.
            const cap = GAZE_REACH + (SELF_GAZE_REACH - GAZE_REACH) * ease;
            const pull = 0.02 + 0.48 * ease;
            centroid.addScaledVector(glance, Math.min(cap, reach * pull) / reach);
          }
        }

        basis.makeBasis(
          scratch.copy(tangentX).multiplyScalar(EYE_RADIUS),
          tangentY.multiplyScalar(EYE_RADIUS * openness),
          normal.multiplyScalar(EYE_RADIUS * 0.7)
        );
        basis.setPosition(centroid);
        lenses[eye].matrix.copy(basis);
      }
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
