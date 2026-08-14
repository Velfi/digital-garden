import * as THREE from 'three';
import { BOX_HEIGHT, FLOOR_Y, BOX_HALF_X, BOX_HALF_Z } from './constants';
import { PANE_COUNT, paneSpan, wipeRect } from './grimeMap';

/**
 * Condensation on the glass: the tank's humidity, made visible.
 *
 * The care sim's `moisture` is a scalar with no coordinates; until now the
 * only place it showed was the pet's own skin. A real closed terrarium tells
 * you its humidity from across the room — the panes fog with a film of
 * micro-droplets, and every so often one droplet grows past the size surface
 * tension can hold, darts down the glass and leaves a cleared streak through
 * the fog.
 *
 * Same architecture as the grime map, and deliberately the same *shape*: a
 * per-pane texel field (directly unit-tested, injected rng) under a thin
 * Three wrapper of four quads hugging the inside of the glass. The field is
 * spatial rather than a single scalar because everything that clears fog is
 * local — a runnel carves its own wavering streak, and the squeegee's blade
 * clears exactly the rectangle it sweeps, through the very `wipeRect` the
 * grime map uses. One stroke of the tool cleans both films; a wiped patch
 * then re-fogs from its edges on the humidity's clock, which is what wiped
 * glass in a damp tank really does.
 *
 * Asymmetry is the point of the fog clock: misting fogs the glass in
 * seconds (droplets condense fast onto cool glass), but a fogged pane
 * clears over minutes as the tank dries — so the player sees the mist
 * land, and sees the dry-out coming long before the pet is in trouble.
 */

/** Field resolution per pane. Fog is low-frequency (the beads are shader
 * noise); half the grime map's density is plenty. */
export const COND_WIDTH = 64;
export const COND_HEIGHT = 48;

/** Fog appears above this moisture and saturates at the ceiling. One mist
 * from bone dry (+0.4) reaches the toe visibly; two fog the pane properly. */
export const FOG_MOISTURE_TOE = 0.35;
export const FOG_MOISTURE_CEIL = 0.85;
/** Seconds for the tank's fog supply to rise after misting / fall while drying. */
export const FOG_TAU_ON_SEC = 6;
export const FOG_TAU_OFF_SEC = 150;
/** Seconds for a locally cleared patch (streak, squeegee pass) to re-fog
 * toward the tank's level — wiped glass in a humid tank hazes back over
 * about a minute, which is also what retires a runnel's trail. */
export const FOG_REGROW_TAU_SEC = 40;
/** Spawns per second across the whole tank at full fog. */
export const RUNNEL_RATE_PER_SEC = 0.09;
/** No runnels below this fog level — a barely-hazed pane has nothing to shed. */
export const RUNNEL_FOG_FLOOR = 0.35;
/** Active runnels a single pane's shader can draw. */
export const RUNNELS_PER_PANE = 3;
/** Seconds a landed droplet's bead lingers before soaking into the soil line. */
export const BEAD_LINGER_SEC = 5;
/** Streak half-width, metres — what the head clears as it passes. */
export const RUNNEL_CLEAR_HALF_M = 0.0012;

export interface Runnel {
  pane: number;
  /** Nominal horizontal position, 0..1 in pane u. The head wanders around
   * this; `headU()` is where it actually is. */
  u: number;
  /** The head's height, pane v (1 top, 0 floor). Descends while running. */
  head: number;
  /** Downward speed in v/sec — grows as the droplet gathers water. */
  speed: number;
  /** Seconds since spawn — the stall/dart phase. */
  age: number;
  /** Bead opacity 0..1; holds 1 while running, fades once landed. */
  fade: number;
  /** Per-runnel random phase for stall/dart and wander. */
  seed: number;
  running: boolean;
}

/** The head's wandering u at height v: the same path the streak was carved
 * along, so the bead always sits at the bottom of its own clearing. */
export function runnelU(r: Pick<Runnel, 'u' | 'seed'>, v: number): number {
  return (
    r.u + 0.018 * (Math.sin(v * 26 + r.seed * 1.7) * 0.6 + Math.sin(v * 61 + r.seed * 3.9) * 0.4)
  );
}

export interface CondensationField {
  /** The tank-wide fog supply, 0..1 — humidity has no coordinates. */
  readonly fog: number;
  /** One field per pane, `COND_WIDTH × COND_HEIGHT` local fog, row-major. */
  readonly data: Float32Array[];
  readonly runnels: readonly Runnel[];
  step(dt: number, moisture: number, motionScale: number): void;
  /** The squeegee's stroke, same contract as the grime field's wipe. Also
   * fells any runnel whose head the blade runs over. */
  wipe(
    pane: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    halfWidthM: number,
    strength: number
  ): void;
  /** Mean fog on a pane, 0..1 — for tests. */
  meanOn(pane: number): number;
}

const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

export function createCondensationField(random: () => number = Math.random): CondensationField {
  let fog = 0;
  const data = Array.from({ length: PANE_COUNT }, () => new Float32Array(COND_WIDTH * COND_HEIGHT));
  const runnels: Runnel[] = [];

  /** Carve the streak: a soft-edged clear disc at pane (u, v). */
  function clearAt(pane: number, u: number, v: number): void {
    const field = data[pane];
    const radiusU = Math.max(1, (RUNNEL_CLEAR_HALF_M / paneSpan(pane)) * COND_WIDTH);
    const radiusV = Math.max(1, (RUNNEL_CLEAR_HALF_M / BOX_HEIGHT) * COND_HEIGHT);
    const cu = u * COND_WIDTH;
    const cv = v * COND_HEIGHT;
    const u0 = Math.max(0, Math.floor(cu - radiusU));
    const u1 = Math.min(COND_WIDTH - 1, Math.ceil(cu + radiusU));
    const v0 = Math.max(0, Math.floor(cv - radiusV));
    const v1 = Math.min(COND_HEIGHT - 1, Math.ceil(cv + radiusV));
    for (let tv = v0; tv <= v1; tv++) {
      for (let tu = u0; tu <= u1; tu++) {
        const du = (tu - cu) / radiusU;
        const dv = (tv - cv) / radiusV;
        const falloff = 1 - (du * du + dv * dv);
        if (falloff <= 0) continue;
        const i = tv * COND_WIDTH + tu;
        field[i] *= 1 - 0.92 * falloff;
      }
    }
  }

  return {
    get fog() {
      return fog;
    },
    data,
    runnels,
    step(dt, moisture, motionScale) {
      const target = smoothstep(FOG_MOISTURE_TOE, FOG_MOISTURE_CEIL, moisture);
      const tau = target > fog ? FOG_TAU_ON_SEC : FOG_TAU_OFF_SEC;
      fog += (target - fog) * (1 - Math.exp(-dt / tau));
      if (fog < 1e-4 && target === 0) fog = 0;

      // Texels chase the supply: up on the regrow clock (a cleared streak
      // hazes back over), and clamped down instantly when the tank dries —
      // local fog can never exceed the humidity that sustains it.
      const regrow = 1 - Math.exp(-dt / FOG_REGROW_TAU_SEC);
      for (let pane = 0; pane < PANE_COUNT; pane++) {
        const field = data[pane];
        for (let i = 0; i < field.length; i++) {
          const local = Math.min(field[i], fog);
          field[i] = local + (fog - local) * regrow;
        }
      }

      // Spawn: a Poisson trickle, gated on fog and on room in the shader's
      // per-pane uniform array. Reduced motion spawns (and runs) slower —
      // the tank still tells its humidity, just more quietly.
      if (fog > RUNNEL_FOG_FLOOR && random() < RUNNEL_RATE_PER_SEC * fog * dt * motionScale) {
        const pane = Math.floor(random() * PANE_COUNT);
        const onPane = runnels.filter((r) => r.pane === pane).length;
        if (onPane < RUNNELS_PER_PANE) {
          runnels.push({
            pane,
            u: 0.08 + random() * 0.84,
            // Runnels start high — that is where the droplet grew.
            head: 0.72 + random() * 0.24,
            speed: 0.06 + random() * 0.05,
            age: 0,
            fade: 1,
            seed: random() * 100,
            running: true
          });
        }
      }

      for (let i = runnels.length - 1; i >= 0; i--) {
        const r = runnels[i];
        r.age += dt;
        if (r.running) {
          // A running droplet gathers water and accelerates, but stalls and
          // darts on the way down — the sine against the seed is the stick-
          // slip of a real runnel crossing drier and wetter glass.
          r.speed += 0.22 * dt;
          const stall = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(r.age * 3.1 + r.seed * 1.7));
          const from = r.head;
          r.head = Math.max(0, r.head - r.speed * stall * dt * motionScale);
          // Carve the streak along the path actually travelled this frame,
          // in half-texel steps so a darting head leaves no gaps.
          const stepV = 0.5 / COND_HEIGHT;
          for (let v = from; v > r.head; v -= stepV) {
            clearAt(r.pane, runnelU(r, v), v);
          }
          if (r.head <= 0) r.running = false;
        } else {
          r.fade -= dt / BEAD_LINGER_SEC;
        }
        // A dried tank takes its beads with it.
        if (fog < 0.05) r.fade -= dt / 2;
        if (r.fade <= 0) runnels.splice(i, 1);
      }
    },
    wipe(pane, u0, v0, u1, v1, halfWidthM, strength) {
      wipeRect(data[pane], COND_WIDTH, COND_HEIGHT, paneSpan(pane), u0, v0, u1, v1, halfWidthM, strength);
      // The blade fells the droplets it runs over: any head inside the
      // stroke's swept rectangle (with the blade's own reach as margin) is
      // wiped off the glass — its streak stays, as cleared field, and
      // re-fogs like everything else.
      const spanU = paneSpan(pane);
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
        dirX = 0;
        dirY = -1;
      }
      for (let i = runnels.length - 1; i >= 0; i--) {
        const r = runnels[i];
        if (r.pane !== pane) continue;
        const px = runnelU(r, r.head) * spanU - ax;
        const py = r.head * BOX_HEIGHT - ay;
        const along = px * dirX + py * dirY;
        const across = Math.abs(py * dirX - px * dirY);
        if (across < halfWidthM && along > -halfWidthM && along < strokeLen + halfWidthM) {
          runnels.splice(i, 1);
        }
      }
    },
    meanOn(pane) {
      const field = data[pane];
      let sum = 0;
      for (let i = 0; i < field.length; i++) sum += field[i];
      return sum / field.length;
    }
  };
}

const CONDENSATION_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CONDENSATION_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uFogTex;
uniform float uAspect; // pane width / height, to keep beads round
uniform vec4 uBeads[${RUNNELS_PER_PANE}]; // wandered u, head v, fade, unused
uniform int uBeadCount;

varying vec2 vUv;

float condHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float condNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(condHash(i), condHash(i + vec2(1, 0)), f.x),
    mix(condHash(i + vec2(0, 1)), condHash(i + vec2(1, 1)), f.x),
    f.y
  );
}

void main() {
  float fog = texture2D(uFogTex, vUv).r;

  // The film: two octaves of mottle so the fog condenses in patches, and a
  // height gradient — condensation forms densest up the pane, where the
  // warm damp air meets glass, and thins toward the soil line.
  float mottle =
    condNoise(vUv * vec2(9.0, 7.0)) * 0.6 +
    condNoise(vUv * vec2(23.0, 19.0)) * 0.4;
  float band = 0.35 + 0.65 * smoothstep(0.08, 0.6, vUv.y);
  float film = fog * band * (0.45 + 0.55 * mottle);

  // Micro-droplets: a high-frequency sparkle thresholded out of noise, so a
  // heavy fog reads as beads of water, not frosted acrylic.
  float beadNoise = condNoise(vUv * vec2(150.0, 110.0));
  float beads = smoothstep(0.78, 0.95, beadNoise) * film;

  // The runnels' heads: bright droplets, kept round against the pane's
  // aspect. Their streaks are already in the field — cleared texels.
  float head = 0.0;
  for (int i = 0; i < ${RUNNELS_PER_PANE}; i++) {
    if (i >= uBeadCount) break;
    vec4 r = uBeads[i];
    vec2 d = (vUv - r.xy) * vec2(uAspect, 1.0);
    head = max(head, smoothstep(0.014, 0.005, length(d)) * r.z);
  }

  float alpha = film * 0.28 + beads * 0.35 + head * 0.7;
  if (alpha < 0.004) discard;

  // Cool white haze; the head droplet leans brighter and bluer, a bead of
  // real water catching the room.
  vec3 hazeTint = vec3(0.82, 0.87, 0.9);
  vec3 dropTint = vec3(0.88, 0.95, 1.0);
  vec3 color = mix(hazeTint, dropTint, clamp(head, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha);
}
`;

export interface CondensationBundle {
  field: CondensationField;
  group: THREE.Group;
  /** Advance the field and repaint the panes. */
  update(dt: number, moisture: number, motionScale: number): void;
  /** A squeegee pass, in pane coords — call alongside the grime wipe. */
  wipe(
    pane: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    halfWidthM: number,
    strength: number
  ): void;
  dispose(): void;
}

export function createCondensation(random: () => number = Math.random): CondensationBundle {
  const field = createCondensationField(random);
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const materials: THREE.ShaderMaterial[] = [];
  const pixels: Uint8Array[] = [];
  const textures: THREE.DataTexture[] = [];
  /** Whether the last upload for a pane was all zeroes — lets a dry pane sleep. */
  const wasClear: boolean[] = [];

  const midY = FLOOR_Y + BOX_HEIGHT / 2;
  for (let pane = 0; pane < PANE_COUNT; pane++) {
    const span = paneSpan(pane);
    const px = new Uint8Array(COND_WIDTH * COND_HEIGHT);
    const texture = new THREE.DataTexture(
      px,
      COND_WIDTH,
      COND_HEIGHT,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    pixels.push(px);
    textures.push(texture);
    wasClear.push(true);
    disposables.push(texture);

    const geometry = new THREE.PlaneGeometry(span, BOX_HEIGHT);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uFogTex: { value: texture },
        uAspect: { value: span / BOX_HEIGHT },
        uBeads: {
          value: Array.from({ length: RUNNELS_PER_PANE }, () => new THREE.Vector4())
        },
        uBeadCount: { value: 0 }
      },
      vertexShader: CONDENSATION_VERTEX,
      fragmentShader: CONDENSATION_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    materials.push(material);
    disposables.push(geometry, material);

    const mesh = new THREE.Mesh(geometry, material);
    // A hair inside the grime quads (which sit 0.6 mm in): condensation is
    // the innermost film, and drawing it after grime keeps the streaks over
    // the smears. Placement mirrors `grimeMap`'s pane rotations so +u reads
    // the same direction as `paneUv`.
    const inset = 0.0004;
    switch (pane) {
      case 0: // PANE_XP
        mesh.position.set(BOX_HALF_X - inset, midY, 0);
        mesh.rotation.y = Math.PI / 2;
        break;
      case 1: // PANE_XN
        mesh.position.set(-BOX_HALF_X + inset, midY, 0);
        mesh.rotation.y = -Math.PI / 2;
        break;
      case 2: // PANE_ZP
        mesh.position.set(0, midY, BOX_HALF_Z - inset);
        break;
      default: // PANE_ZN
        mesh.position.set(0, midY, -BOX_HALF_Z + inset);
        mesh.rotation.y = Math.PI;
        break;
    }
    mesh.renderOrder = 2.5; // after grime (2), before the near glass sheen (3)
    group.add(mesh);
  }

  return {
    field,
    group,
    update(dt, moisture, motionScale) {
      field.step(dt, moisture, motionScale);
      for (let pane = 0; pane < PANE_COUNT; pane++) {
        const source = field.data[pane];
        const px = pixels[pane];
        let any = false;
        for (let i = 0; i < source.length; i++) {
          const fog = Math.min(255, source[i] * 255) | 0;
          px[i] = fog;
          if (fog > 0) any = true;
        }
        if (any || !wasClear[pane]) textures[pane].needsUpdate = true;
        wasClear[pane] = !any;

        const uniforms = materials[pane].uniforms;
        let count = 0;
        for (const r of field.runnels) {
          if (r.pane !== pane || count >= RUNNELS_PER_PANE) continue;
          uniforms.uBeads.value[count].set(
            runnelU(r, r.head),
            r.head,
            Math.min(1, r.fade),
            0
          );
          count += 1;
        }
        uniforms.uBeadCount.value = count;
      }
      group.visible = field.fog >= 0.005 || field.runnels.length > 0 || !wasClear.every(Boolean);
    },
    wipe(pane, u0, v0, u1, v1, halfWidthM, strength) {
      field.wipe(pane, u0, v0, u1, v1, halfWidthM, strength);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    }
  };
}
