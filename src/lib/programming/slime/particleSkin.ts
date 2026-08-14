import * as THREE from 'three';
import { BOX_HALF_X, BOX_HALF_Z, FLOOR_Y } from './constants';

/**
 * The particle body's skin, take two: a fixed-topology icosphere
 * shrink-wrapped onto the particle cloud. Replaces the marching-cubes
 * isosurface (`mpmSurface.ts`, retired).
 *
 * Marching cubes rebuilt the surface from scratch every frame, and the noise
 * was structural: particles read through the skin as pimples, triangles were
 * born anew each frame (speckled highlights, temporal popping), and blurring
 * the density grid harder only traded warts for mush. The fix is to stop
 * re-deriving topology at all. One icosphere whose vertices never change
 * identity slides over the blob; the only per-frame data is a radius per
 * vertex — how far the skin sits from the body's centroid in that vertex's
 * direction. Low-frequency by construction, temporally coherent by
 * construction.
 *
 * Per frame: particles bin into the sphere vertex nearest their direction
 * from the centroid (an octahedral-map lookup, O(1) each), each bin keeping
 * its farthest particle. Empty bins borrow from neighbours by max-dilation
 * with a cosine projection — the support-function inequality
 * r(v) ≥ r(u)·cos θ that any star shape obeys. Two Laplacian passes smooth
 * the radii over the sphere, an exponential moving average smooths them over
 * frames, and a pad puts the skin ~2.5 mm outside the outermost particle
 * centres — the same inflation the B-spline kernel gave the marching-cubes
 * skin, so the pet reads the same size.
 *
 * The price is the star-shape assumption: the skin is a radial heightfield
 * about the centroid, so a true overhang (a grabbed lobe folded back over
 * the body) renders as its smooth envelope. For a pet that is a puddle orb,
 * that trade buys every frame of smoothness and costs a shape it almost
 * never makes.
 *
 * Positions are written in world space and the mesh stays at identity — the
 * volume material goes through `modelMatrix`, so identity is just the easy
 * case, and the back-depth mesh can share the geometry with no transform
 * mirroring.
 */

/** Icosahedron subdivision level: 3 → 642 vertices, 1280 faces. */
const DETAIL = 3;
/** Octahedral lookup resolution: direction → nearest sphere vertex. */
const OCTA_RES = 64;
/** The skin sits this far outside the outermost particle centres. */
const SKIN_PAD = 0.0025;
/** Laplacian smoothing over the sphere: passes and per-pass blend. */
const BLUR_PASSES = 2;
const BLUR_LAMBDA = 0.5;
/** Dilation: always this many passes, more only while bins are still empty. */
const DILATE_PASSES = 2;
const DILATE_CAP = 8;
/** Temporal smoothing per rendered frame (~38 ms time constant at 60 fps). */
const EMA_ALPHA = 0.3;
/** The skin tucks this far under the substrate rather than gapping above it. */
const FLOOR_TUCK = 0.0003;
/** And stays this far inside the glass rather than poking through a pane. */
const WALL_TUCK = 0.0001;

export interface ParticleSkinBundle {
  /** The skin mesh. The scene assigns its material. */
  mesh: THREE.Mesh;
  /**
   * Refit the skin to world-space particle positions (xyz per particle).
   * `wave`, when given, is the emotional ripple: a travelling wave of
   * `amp` metres (radial) at phase `phase` (radians), strongest on the
   * upper dome — an agitated slime visibly quivers, a calm one sits still.
   */
  update(positions: Float32Array, count: number, wave?: { amp: number; phase: number }): void;
  dispose(): void;
}

interface Icosphere {
  /** Unit direction per vertex, xyz-packed. */
  dirs: Float32Array;
  faces: Uint16Array;
  /** Neighbour adjacency, CSR: vertex v's neighbours are [offsets[v], offsets[v+1]). */
  offsets: Uint32Array;
  neighbours: Uint16Array;
  /** cos(angle) between v and each of its neighbours, aligned with `neighbours`. */
  cos: Float32Array;
}

function buildIcosphere(detail: number): Icosphere {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: Array<[number, number, number]> = (
    [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1]
    ] as Array<[number, number, number]>
  ).map(([x, y, z]) => {
    const n = 1 / Math.hypot(x, y, z);
    return [x * n, y * n, z * n];
  });
  // prettier-ignore
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  for (let level = 0; level < detail; level++) {
    const midpoints = new Map<number, number>();
    const mid = (a: number, b: number): number => {
      const key = Math.min(a, b) * 65536 + Math.max(a, b);
      let m = midpoints.get(key);
      if (m === undefined) {
        const [ax, ay, az] = verts[a];
        const [bx, by, bz] = verts[b];
        const x = ax + bx;
        const y = ay + by;
        const z = az + bz;
        const n = 1 / Math.hypot(x, y, z);
        m = verts.length;
        verts.push([x * n, y * n, z * n]);
        midpoints.set(key, m);
      }
      return m;
    };
    const next: number[][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      // Same winding as the parent, so outward stays outward.
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }

  const dirs = new Float32Array(verts.length * 3);
  for (let v = 0; v < verts.length; v++) {
    dirs[v * 3] = verts[v][0];
    dirs[v * 3 + 1] = verts[v][1];
    dirs[v * 3 + 2] = verts[v][2];
  }

  const neighbourSets: Array<Set<number>> = Array.from({ length: verts.length }, () => new Set());
  for (const [a, b, c] of faces) {
    neighbourSets[a].add(b).add(c);
    neighbourSets[b].add(a).add(c);
    neighbourSets[c].add(a).add(b);
  }
  const offsets = new Uint32Array(verts.length + 1);
  let total = 0;
  for (let v = 0; v < verts.length; v++) {
    offsets[v] = total;
    total += neighbourSets[v].size;
  }
  offsets[verts.length] = total;
  const neighbours = new Uint16Array(total);
  const cos = new Float32Array(total);
  let cursor = 0;
  for (let v = 0; v < verts.length; v++) {
    for (const u of neighbourSets[v]) {
      neighbours[cursor] = u;
      cos[cursor] =
        dirs[v * 3] * dirs[u * 3] +
        dirs[v * 3 + 1] * dirs[u * 3 + 1] +
        dirs[v * 3 + 2] * dirs[u * 3 + 2];
      cursor += 1;
    }
  }

  const faceArray = new Uint16Array(faces.length * 3);
  for (let f = 0; f < faces.length; f++) {
    faceArray[f * 3] = faces[f][0];
    faceArray[f * 3 + 1] = faces[f][1];
    faceArray[f * 3 + 2] = faces[f][2];
  }

  return { dirs, faces: faceArray, offsets, neighbours, cos };
}

/** Octahedral cell index for a direction (need not be normalised). */
function octaCell(x: number, y: number, z: number): number {
  const inv = 1 / (Math.abs(x) + Math.abs(y) + Math.abs(z));
  let u = x * inv;
  let v = y * inv;
  if (z < 0) {
    const au = Math.abs(u);
    const av = Math.abs(v);
    u = (1 - av) * (u >= 0 ? 1 : -1);
    v = (1 - au) * (v >= 0 ? 1 : -1);
  }
  const i = Math.min(OCTA_RES - 1, Math.floor((u * 0.5 + 0.5) * OCTA_RES));
  const j = Math.min(OCTA_RES - 1, Math.floor((v * 0.5 + 0.5) * OCTA_RES));
  return j * OCTA_RES + i;
}

/** For every octahedral cell, the sphere vertex nearest its centre direction. */
function buildOctaNearest(dirs: Float32Array): Uint16Array {
  const vertexCount = dirs.length / 3;
  const nearest = new Uint16Array(OCTA_RES * OCTA_RES);
  for (let j = 0; j < OCTA_RES; j++) {
    for (let i = 0; i < OCTA_RES; i++) {
      // Decode the cell centre back to a direction (inverse of octaCell's fold).
      let u = ((i + 0.5) / OCTA_RES) * 2 - 1;
      let v = ((j + 0.5) / OCTA_RES) * 2 - 1;
      const z = 1 - Math.abs(u) - Math.abs(v);
      if (z < 0) {
        const fold = -z;
        u += u >= 0 ? -fold : fold;
        v += v >= 0 ? -fold : fold;
      }
      let best = 0;
      let bestDot = -Infinity;
      for (let w = 0; w < vertexCount; w++) {
        const dot = dirs[w * 3] * u + dirs[w * 3 + 1] * v + dirs[w * 3 + 2] * z;
        if (dot > bestDot) {
          bestDot = dot;
          best = w;
        }
      }
      nearest[j * OCTA_RES + i] = best;
    }
  }
  return nearest;
}

export function createParticleSkin(): ParticleSkinBundle {
  const sphere = buildIcosphere(DETAIL);
  const vertexCount = sphere.dirs.length / 3;
  const octaNearest = buildOctaNearest(sphere.dirs);

  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setIndex(new THREE.BufferAttribute(sphere.faces, 1));
  // The skin never strays far from the box; a generous fixed sphere beats
  // recomputing one per frame.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);

  const placeholder = new THREE.MeshNormalMaterial();
  const mesh = new THREE.Mesh(geometry, placeholder);
  mesh.frustumCulled = false;
  // World-space positions, identity transform, forever.
  mesh.matrixAutoUpdate = false;

  const radiiTarget = new Float32Array(vertexCount);
  const radiiScratch = new Float32Array(vertexCount);
  const radii = new Float32Array(vertexCount);
  let primed = false;

  const { dirs, offsets, neighbours, cos } = sphere;

  /** Per-vertex azimuth about +y, for the travelling emotional ripple. */
  const azimuth = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) {
    azimuth[v] = Math.atan2(dirs[v * 3 + 2], dirs[v * 3]);
  }

  return {
    mesh,

    update(particles, count, wave) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < count; i++) {
        cx += particles[i * 3];
        cy += particles[i * 3 + 1];
        cz += particles[i * 3 + 2];
      }
      cx /= count;
      cy /= count;
      cz /= count;

      // Bin: farthest particle per direction.
      radiiTarget.fill(0);
      for (let i = 0; i < count; i++) {
        const dx = particles[i * 3] - cx;
        const dy = particles[i * 3 + 1] - cy;
        const dz = particles[i * 3 + 2] - cz;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r < 1e-6) continue;
        const v = octaNearest[octaCell(dx, dy, dz)];
        if (r > radiiTarget[v]) radiiTarget[v] = r;
      }

      // Dilate: empty bins borrow the neighbour's particle, projected onto
      // this direction. Runs until every bin has a value (a couple of passes
      // in practice; the cap is a safety net, and the EMA below absorbs the
      // rare under-filled frame).
      let hasEmpty = true;
      for (let pass = 0; pass < DILATE_CAP && (pass < DILATE_PASSES || hasEmpty); pass++) {
        hasEmpty = false;
        for (let v = 0; v < vertexCount; v++) {
          let best = radiiTarget[v];
          for (let k = offsets[v]; k < offsets[v + 1]; k++) {
            const candidate = radiiTarget[neighbours[k]] * cos[k];
            if (candidate > best) best = candidate;
          }
          radiiScratch[v] = best;
          if (best === 0) hasEmpty = true;
        }
        radiiTarget.set(radiiScratch);
      }

      // Smooth over the sphere.
      for (let pass = 0; pass < BLUR_PASSES; pass++) {
        for (let v = 0; v < vertexCount; v++) {
          let sum = 0;
          for (let k = offsets[v]; k < offsets[v + 1]; k++) sum += radiiTarget[neighbours[k]];
          const mean = sum / (offsets[v + 1] - offsets[v]);
          radiiScratch[v] = radiiTarget[v] + BLUR_LAMBDA * (mean - radiiTarget[v]);
        }
        radiiTarget.set(radiiScratch);
      }

      // Smooth over time.
      for (let v = 0; v < vertexCount; v++) {
        const target = radiiTarget[v] + SKIN_PAD;
        radii[v] = primed ? radii[v] + (target - radii[v]) * EMA_ALPHA : target;
      }
      primed = true;

      // Skin the sphere, kept inside the tank: tucked just under the
      // substrate (no gap, no balloon out the bottom) and just inside the
      // panes (a pressed blob flattens against the glass instead of poking
      // through it).
      const out = positions.array as Float32Array;
      const waveAmp = wave ? wave.amp : 0;
      const wavePhase = wave ? wave.phase : 0;
      for (let v = 0; v < vertexCount; v++) {
        let r = radii[v];
        if (waveAmp > 0) {
          // Three lobes travelling around the body, faded toward the
          // underside so the floor contact stays a clean seal. Purely
          // cosmetic — the physics never sees it.
          const upness = 0.35 + 0.65 * Math.max(0, dirs[v * 3 + 1]);
          r += waveAmp * Math.sin(3 * azimuth[v] + wavePhase) * upness;
        }
        let x = cx + dirs[v * 3] * r;
        let y = cy + dirs[v * 3 + 1] * r;
        let z = cz + dirs[v * 3 + 2] * r;
        if (y < FLOOR_Y) y = FLOOR_Y - FLOOR_TUCK;
        const wallX = BOX_HALF_X - WALL_TUCK;
        const wallZ = BOX_HALF_Z - WALL_TUCK;
        if (x > wallX) x = wallX;
        else if (x < -wallX) x = -wallX;
        if (z > wallZ) z = wallZ;
        else if (z < -wallZ) z = -wallZ;
        out[v * 3] = x;
        out[v * 3 + 1] = y;
        out[v * 3 + 2] = z;
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    },

    dispose() {
      geometry.dispose();
      placeholder.dispose();
    }
  };
}

// Render-bridge for the particle physics: same no-hot-swap rule as the
// physics modules — a stale scene holding an old skin renders ghosts.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
