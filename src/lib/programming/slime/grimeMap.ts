import * as THREE from 'three';
import {
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  FLOOR_Y,
  GRIME_HEIGHT,
  GRIME_LAY_PER_SEC,
  GRIME_MOTION_GAIN,
  GRIME_SPLAT_RADIUS,
  GRIME_TAU_SEC,
  GRIME_WIDTH,
  SQUEEGEE_CONTACT_HALF_M
} from './constants';

/**
 * Grime on the glass: what a slime that climbs leaves behind.
 *
 * The floor has the trail map — splat and fast exponential decay, a wet smear
 * that time dissolves. Glass is different in exactly one way that matters:
 * a smear on a pane *dries there*. The decay tau is minutes-long, so within
 * any visit the squeegee is the only genuine remedy, and the dirt is the
 * reason the squeegee exists. Same architecture otherwise: one CPU field per
 * pane, directly unit-tested, uploaded as DataTextures and drawn by thin
 * quads hugging the inside of the glass.
 *
 * Pane coordinates: `u` runs along the pane's horizontal axis (the direction
 * a viewer walking around the box would read left-to-right from outside),
 * `v` runs up the pane from floor to rim, both 0..1.
 */

export const PANE_XP = 0; // x = +BOX_HALF_X, stage right
export const PANE_XN = 1; // x = -BOX_HALF_X, stage left
export const PANE_ZP = 2; // z = +BOX_HALF_Z, the front, where the camera lives
export const PANE_ZN = 3; // z = -BOX_HALF_Z, the back
export const PANE_COUNT = 4;

/** Horizontal world extent of a pane, metres. X panes span z and vice versa. */
export function paneSpan(pane: number): number {
  return pane === PANE_XP || pane === PANE_XN ? BOX_HALF_Z * 2 : BOX_HALF_X * 2;
}

/**
 * Signed distance from a world point to the pane's inner surface — positive
 * inside the box, zero on the glass.
 */
export function paneDistance(pane: number, x: number, _y: number, z: number): number {
  switch (pane) {
    case PANE_XP:
      return BOX_HALF_X - x;
    case PANE_XN:
      return x + BOX_HALF_X;
    case PANE_ZP:
      return BOX_HALF_Z - z;
    default:
      return z + BOX_HALF_Z;
  }
}

/** World point → pane (u, v), both unclamped 0..1 on the pane itself. */
export function paneUv(pane: number, x: number, y: number, z: number): [number, number] {
  const v = (y - FLOOR_Y) / BOX_HEIGHT;
  switch (pane) {
    case PANE_XP:
      // Seen from outside +X looking in (-x), world +z runs to the left, so
      // u descends with z. The mirror pane reads the other way. Nothing
      // downstream depends on the handedness; it is fixed here so the quads
      // and the field always agree.
      return [(BOX_HALF_Z - z) / (BOX_HALF_Z * 2), v];
    case PANE_XN:
      return [(z + BOX_HALF_Z) / (BOX_HALF_Z * 2), v];
    case PANE_ZP:
      return [(x + BOX_HALF_X) / (BOX_HALF_X * 2), v];
    default:
      return [(BOX_HALF_X - x) / (BOX_HALF_X * 2), v];
  }
}

/** Pane (u, v) → world point on the pane's inner surface. */
export function paneWorld(pane: number, u: number, v: number): [number, number, number] {
  const y = FLOOR_Y + v * BOX_HEIGHT;
  switch (pane) {
    case PANE_XP:
      return [BOX_HALF_X, y, BOX_HALF_Z - u * BOX_HALF_Z * 2];
    case PANE_XN:
      return [-BOX_HALF_X, y, u * BOX_HALF_Z * 2 - BOX_HALF_Z];
    case PANE_ZP:
      return [u * BOX_HALF_X * 2 - BOX_HALF_X, y, BOX_HALF_Z];
    default:
      return [BOX_HALF_X - u * BOX_HALF_X * 2, y, -BOX_HALF_Z];
  }
}

/**
 * The blade's mark on any pane-shaped field: clear the rectangle a straight
 * blade sweeps along the stroke from (u0, v0) to (u1, v1) — the blade lies
 * *across* the stroke, `halfWidthM` metres to either side, and the ends are
 * the flat lines where the rubber was planted and lifted, not round brush
 * caps. A zero-length stroke stamps the resting blade's own thin horizontal
 * contact line. `strength` is how much of the field one pass removes.
 *
 * Shared by the grime map and the condensation film: one stroke of the
 * squeegee clears both, and this is the single place the blade's geometry
 * lives. `field` is `width × height` texels over `spanU × BOX_HEIGHT`
 * metres, row-major from (0,0).
 */
export function wipeRect(
  field: Float32Array,
  width: number,
  height: number,
  spanU: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  halfWidthM: number,
  strength: number
): void {
  // Work in metres on the pane so the blade is straight in the world even
  // though the texels are not square.
  const ax = u0 * spanU;
  const ay = v0 * BOX_HEIGHT;
  const bx = u1 * spanU;
  const by = v1 * BOX_HEIGHT;
  let dirX = bx - ax;
  let dirY = by - ay;
  const strokeLen = Math.hypot(dirX, dirY);
  if (strokeLen > 1e-9) {
    dirX /= strokeLen;
    dirY /= strokeLen;
  } else {
    // No travel yet: the tool rests horizontal, so a bare press stamps the
    // blade's own contact line — wide across, millimetres tall.
    dirX = 0;
    dirY = -1;
  }

  // The ends are pushed out by the contact strip's own half-thickness.
  // Feathers are a texel or two — enough not to alias, too little to read
  // as spray.
  const capM = SQUEEGEE_CONTACT_HALF_M;
  const tipFeatherM = halfWidthM * 0.12;
  const endFeatherM = 0.0012;

  const pad = halfWidthM + capM;
  const loU = Math.max(0, Math.floor(((Math.min(ax, bx) - pad) / spanU) * width));
  const hiU = Math.min(width - 1, Math.ceil(((Math.max(ax, bx) + pad) / spanU) * width));
  const loV = Math.max(0, Math.floor(((Math.min(ay, by) - pad) / BOX_HEIGHT) * height));
  const hiV = Math.min(height - 1, Math.ceil(((Math.max(ay, by) + pad) / BOX_HEIGHT) * height));

  for (let tv = loV; tv <= hiV; tv++) {
    for (let tu = loU; tu <= hiU; tu++) {
      const px = ((tu + 0.5) / width) * spanU - ax;
      const py = ((tv + 0.5) / height) * BOX_HEIGHT - ay;
      const along = px * dirX + py * dirY;
      const across = Math.abs(py * dirX - px * dirY);
      if (across >= halfWidthM) continue;
      if (along <= -capM || along >= strokeLen + capM) continue;
      // The blade's tips press lightest (rubber lifts at its corners); the
      // planted and lifted ends stay crisp.
      const tip = Math.min(1, (halfWidthM - across) / tipFeatherM);
      const end = Math.min(1, Math.min(along + capM, strokeLen + capM - along) / endFeatherM);
      const edge = Math.min(tip, end);
      const i = tv * width + tu;
      field[i] *= 1 - strength * edge;
    }
  }
}

/** The fields, separated from the Three wrapper so the tests need no GPU. */
export interface GrimeField {
  /** One field per pane, `GRIME_WIDTH × GRIME_HEIGHT`, row-major from (0,0). */
  data: Float32Array[];
  /** Fade every pane. `tauSec` defaults to the live (wet) tau; the away
   * simulation passes the much longer dried-film tau. */
  decay(dt: number, tauSec?: number): void;
  /**
   * Stamp a soft disc at pane (u, v). `slide` is the contact's tangential
   * speed, m/s — a moving slime smears far harder than a resting one.
   * Strength saturates at 1.
   */
  splat(pane: number, u: number, v: number, dt: number, slide: number): void;
  /**
   * The squeegee: clear the rectangle a straight blade sweeps along the
   * stroke from (u0, v0) to (u1, v1) — the blade lies *across* the stroke,
   * `halfWidthM` metres to either side, and the ends are the flat lines
   * where the rubber was planted and lifted, not round brush caps. A
   * zero-length stroke stamps the resting blade's own thin horizontal
   * contact line. `strength` is how much of the field one pass removes.
   */
  wipe(
    pane: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    halfWidthM: number,
    strength: number
  ): void;
  /** Mean grime on a pane, 0..1 — for tests and the drawer's nudge. */
  meanOn(pane: number): number;
}

export function createGrimeField(): GrimeField {
  const data = Array.from(
    { length: PANE_COUNT },
    () => new Float32Array(GRIME_WIDTH * GRIME_HEIGHT)
  );
  /** Texels per metre for a pane, horizontally and vertically. */
  const texelsU = (pane: number) => GRIME_WIDTH / paneSpan(pane);
  const texelsV = GRIME_HEIGHT / BOX_HEIGHT;

  return {
    data,
    decay(dt, tauSec = GRIME_TAU_SEC) {
      const keep = Math.exp(-dt / tauSec);
      for (let pane = 0; pane < PANE_COUNT; pane++) {
        const field = data[pane];
        for (let i = 0; i < field.length; i++) {
          field[i] *= keep;
        }
      }
    },
    splat(pane, u, v, dt, slide) {
      const field = data[pane];
      const amount = GRIME_LAY_PER_SEC * dt * (0.25 + Math.min(3, GRIME_MOTION_GAIN * slide));
      const radiusU = Math.max(1, GRIME_SPLAT_RADIUS * texelsU(pane));
      const radiusV = Math.max(1, GRIME_SPLAT_RADIUS * texelsV);
      const cu = u * GRIME_WIDTH;
      const cv = v * GRIME_HEIGHT;
      const u0 = Math.max(0, Math.floor(cu - radiusU));
      const u1 = Math.min(GRIME_WIDTH - 1, Math.ceil(cu + radiusU));
      const v0 = Math.max(0, Math.floor(cv - radiusV));
      const v1 = Math.min(GRIME_HEIGHT - 1, Math.ceil(cv + radiusV));
      for (let tv = v0; tv <= v1; tv++) {
        for (let tu = u0; tu <= u1; tu++) {
          const du = (tu - cu) / radiusU;
          const dv = (tv - cv) / radiusV;
          const falloff = 1 - (du * du + dv * dv);
          if (falloff <= 0) continue;
          const i = tv * GRIME_WIDTH + tu;
          field[i] = Math.min(1, field[i] + amount * falloff);
        }
      }
    },
    wipe(pane, u0, v0, u1, v1, halfWidthM, strength) {
      wipeRect(
        data[pane],
        GRIME_WIDTH,
        GRIME_HEIGHT,
        paneSpan(pane),
        u0,
        v0,
        u1,
        v1,
        halfWidthM,
        strength
      );
    },
    meanOn(pane) {
      const field = data[pane];
      let sum = 0;
      for (let i = 0; i < field.length; i++) sum += field[i];
      return sum / field.length;
    }
  };
}

const GRIME_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GRIME_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uGrime;
varying vec2 vUv;

// Streaky value noise: stretched tall, because the traffic on a pane is
// mostly vertical — a climb up, a slither down.
float grimeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float grimeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(grimeHash(i), grimeHash(i + vec2(1, 0)), f.x),
    mix(grimeHash(i + vec2(0, 1)), grimeHash(i + vec2(1, 1)), f.x),
    f.y
  );
}

void main() {
  float grime = texture2D(uGrime, vUv).r;
  if (grime < 0.003) discard;
  float streaks =
    grimeNoise(vec2(vUv.x * 90.0, vUv.y * 14.0)) * 0.65 +
    grimeNoise(vec2(vUv.x * 260.0, vUv.y * 40.0)) * 0.35;
  // Dried slime: a milky film with a faint mossy cast, denser where the
  // streak noise clumps it. It brightens the pane the way haze does rather
  // than darkening it like soot.
  float film = grime * (0.45 + 0.55 * streaks);
  vec3 tint = mix(vec3(0.62, 0.68, 0.62), vec3(0.86, 0.9, 0.84), streaks);
  gl_FragColor = vec4(tint, film * 0.5);
}
`;

export interface GrimeBundle {
  field: GrimeField;
  group: THREE.Group;
  /** One single-channel texture per pane — R is grime. */
  paneTextures: THREE.DataTexture[];
  /**
   * Advance the field and repaint any pane that needs it. `contacts` holds
   * (pane, u, v, slide) quadruples of vertices pressed against glass this
   * frame; `slide` is tangential speed, m/s. `dampScale` multiplies the
   * decay clock: condensation re-wets a dried smear, so a fogged pane
   * dissolves its grime several times faster than a dry one.
   */
  update(
    dt: number,
    contacts: ArrayLike<number>,
    contactCount: number,
    motionScale: number,
    dampScale?: number
  ): void;
  /** A squeegee pass, in pane coords. Repaints on the next update. */
  wipe(
    pane: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    halfWidthM: number,
    strength: number
  ): void;
  /** Mean grime on a pane as of the last update — free to call per frame. */
  mean(pane: number): number;
  dispose(): void;
}

export function createGrimeMap(): GrimeBundle {
  const field = createGrimeField();
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  const pixels: Uint8Array[] = [];
  const textures: THREE.DataTexture[] = [];
  /** Whether the last upload for a pane was all zeroes — lets a clean pane sleep. */
  const wasClean: boolean[] = [];
  /** Per-pane means, gathered while the upload loop is walking anyway. */
  const means = new Float32Array(PANE_COUNT);

  for (let pane = 0; pane < PANE_COUNT; pane++) {
    const px = new Uint8Array(GRIME_WIDTH * GRIME_HEIGHT);
    const texture = new THREE.DataTexture(
      px,
      GRIME_WIDTH,
      GRIME_HEIGHT,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    pixels.push(px);
    textures.push(texture);
    wasClean.push(true);
    disposables.push(texture);

    const geometry = new THREE.PlaneGeometry(paneSpan(pane), BOX_HEIGHT);
    const material = new THREE.ShaderMaterial({
      uniforms: { uGrime: { value: texture } },
      vertexShader: GRIME_VERTEX,
      fragmentShader: GRIME_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    disposables.push(geometry, material);

    const mesh = new THREE.Mesh(geometry, material);
    // A hair inside the glass, so the film never z-fights the pane. The
    // quad's +u must match `paneUv`'s reading direction, which is what the
    // rotations encode: each pane is yawed so its local +x runs along
    // ascending u (for the X panes that means +x → −z and +x → +z
    // respectively; the first draft had them swapped and the side panes
    // drew their smears mirrored).
    const inset = 0.0006;
    const midY = FLOOR_Y + BOX_HEIGHT / 2;
    switch (pane) {
      case PANE_XP:
        mesh.position.set(BOX_HALF_X - inset, midY, 0);
        mesh.rotation.y = Math.PI / 2;
        break;
      case PANE_XN:
        mesh.position.set(-BOX_HALF_X + inset, midY, 0);
        mesh.rotation.y = -Math.PI / 2;
        break;
      case PANE_ZP:
        mesh.position.set(0, midY, BOX_HALF_Z - inset);
        break;
      default:
        mesh.position.set(0, midY, -BOX_HALF_Z + inset);
        mesh.rotation.y = Math.PI;
        break;
    }
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  return {
    field,
    group,
    paneTextures: textures,
    update(dt, contacts, contactCount, motionScale, dampScale = 1) {
      field.decay(dt * dampScale);
      for (let i = 0; i < contactCount; i++) {
        field.splat(
          contacts[i * 4],
          contacts[i * 4 + 1],
          contacts[i * 4 + 2],
          dt * motionScale,
          contacts[i * 4 + 3]
        );
      }
      for (let pane = 0; pane < PANE_COUNT; pane++) {
        const source = field.data[pane];
        const px = pixels[pane];
        let any = false;
        let sum = 0;
        for (let i = 0; i < source.length; i++) {
          sum += source[i];
          const grime = Math.min(255, source[i] * 255) | 0;
          px[i] = grime;
          if (grime > 0) any = true;
        }
        means[pane] = sum / source.length;
        if (any || !wasClean[pane]) textures[pane].needsUpdate = true;
        wasClean[pane] = !any;
      }
    },
    wipe(pane, u0, v0, u1, v1, halfWidthM, strength) {
      field.wipe(pane, u0, v0, u1, v1, halfWidthM, strength);
    },
    mean(pane) {
      return means[pane];
    },
    dispose() {
      for (const d of disposables) d.dispose();
    }
  };
}
