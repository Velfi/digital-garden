import * as THREE from 'three';
import { mulberry32 } from '../marimo/rng';
import { BOX_HALF_X, BOX_HALF_Z, BOX_HEIGHT, FLOOR_Y } from './constants';
import type { Emotion } from './emotion';

/**
 * The eyes, for the particle body: a pair of buoyant orbs.
 *
 * User mandate (2026-08-13): "instead of internal eyespots, a pair of orbs
 * that change size for blinks" and "the eyes should float up to the
 * surface, even when the slime is turned upside down". So each orb is a
 * little bubble in the goo: its preferred pose sits half-embedded in the
 * *upper* dome of the body (front-facing, ±22° apart, high on the ball,
 * orb centre on the surface so half the bead sits proud of the goo), and its
 * vertical travel is rate-limited to a bubble's rise — flip the pet and
 * you can watch the eyes float up through the body and surface on the new
 * top. Blinks are a size change: the orb shrinks to a bead and swells
 * back, no lids anywhere.
 *
 * Blink clock, mood droop, pointer glance and the cross-eyed poke look are
 * carried over, same constants, same feel.
 *
 * Birth: eyes are not furniture that was always there — while concealed
 * (sclerotium, most of the hatch) the pair is unformed, and when the stage
 * finally wants them they condense as beads low in the body and buoyantly
 * float up to their perch, swelling from nothing on the way. The same
 * bubble machinery as the flip-surfacing, pointed at the emergence.
 */

/** Orb radius, metres. */
const EYE_RADIUS = 0.0022;
/** User mandate (2026-08-14): the beads sit half-embedded — orb centre on
 * the jelly surface, half the bead proud of the goo. Positive sinks the
 * centre inward (the old buried look), negative would float it clear. */
const EYE_SINK = 0;
/** The pair's azimuth off the camera-facing +z, radians. */
const EYE_AZIMUTH = 0.38;
/** Where on the body's height the orbs float. Surfaced by default (user
 * mandate 2026-08-14): a neutral pet's bubbles ride high on the dome, and
 * only genuine misery drags them down toward half-mast. */
const EYE_HEIGHT_LOW = 0.72;
const EYE_HEIGHT_HIGH = 0.88;
/** A bubble's rise (and settle) speed through the goo, m/s — slow enough
 * that surfacing after a flip reads as floating, not teleporting. */
const BUOYANT_RISE = 0.02;
/** A blink shrinks the orb to this fraction of its size at the trough. */
const BLINK_MIN_SIZE = 0.15;
/** Farthest a distant glance slides, metres; and a cross-eyed self-look.
 * Sized to be *seen*: ~0.7 of a bead radius of travel (the old 0.7mm read
 * as a fixed stare — user report 2026-08-14). */
const GAZE_REACH = 0.0016;
const SELF_GAZE_REACH = 0.0024;
/** How much of the way toward a glance target the bead slides before the
 * reach cap takes over — the response to *near* targets; far ones saturate
 * the cap either way. */
const GAZE_PULL = 0.25;
/** The poke crowd: bead gap and hover height over the poked spot. */
const POKE_EYE_GAP = 0.009;
const POKE_EYE_RISE = 0.002;
/** How quickly the eyes swim to a new preferred pose, seconds. */
const SEEK_SEC = 0.16;
/** The turret's slew: how quickly a lens swivels onto a new gaze target,
 * seconds — quick enough to track a rolling ball, slow enough to read as
 * aiming rather than snapping. */
const AIM_SEC = 0.22;
/** Blink length and gap bounds, seconds. */
const BLINK_SEC = 0.13;
const BLINK_GAP_MIN = 1.6;
const BLINK_GAP_MAX = 7;
/** A full squint flattens the orb to this fraction of its height — a
 * contented crescent, well short of shut so it never reads as a blink. */
const SQUINT_SQUASH = 0.35;
/** …and widens it a touch, the way a smiling eye spreads sideways. */
const SQUINT_SPREAD = 0.14;
/** How long a newborn orb takes to swell from nothing to full size. */
const BIRTH_SEC = 1.0;
/** Where in the body's height a newborn orb condenses — low in the goo,
 * so the birth is a visible float up to the perch. */
const BIRTH_HEIGHT = 0.22;

export interface ParticleEyesBundle {
  group: THREE.Group;
  /**
   * Reposition from the particle cloud. `gaze` is a world point to glance
   * toward or null; `emotion` (see emotion.ts) sets orb size, float height
   * and blink cadence — valence droops and lowers, arousal widens and
   * snaps the blinks; `poke` swims the beads to crowd a poked world point,
   * `ease` 0..1 owned by the caller. `squint` 0..1 squashes the orbs into
   * contented crescents — the being-petted face — eased by the caller.
   */
  update(
    positions: Float32Array,
    count: number,
    timeSec: number,
    gaze: readonly number[] | null,
    emotion: Emotion,
    poke?: { point: readonly number[]; ease: number } | null,
    squint?: number
  ): void;
  /**
   * No eyes right now: unform the pair. The next update births them —
   * beads condensing low in the body that float up to their perch. Called
   * every frame the stage doesn't want eyes; cheap and idempotent.
   */
  conceal(): void;
  dispose(): void;
}

export function createParticleEyes(
  seed: number,
  keyDirWorld: THREE.Vector3
): ParticleEyesBundle {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 20, 14);
  // Unlit near-black silhouettes against the lit jelly — see eyes.ts — with a
  // light fresnel rim: a pale ring where the bead turns away from the camera.
  // Seen through the volume pass the bare silhouette dissolved into the dark
  // interior; the grazing ring is the "wet bead" cue that keeps the eyes
  // legible without lighting them (a lit bead reads as plastic, not slime).
  // Colours are linear — the interior target has no colourspace transform.
  const material = new THREE.ShaderMaterial({
    uniforms: {
      // The blink squash turns the whole lens into grazing angle — without
      // this gate the eye flashes rim-bright at the exact moment it closes.
      uOpenness: { value: 1 },
      uKeyDirWorld: { value: keyDirWorld.clone().normalize() }
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vView;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocal;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalMatrix * normal;
        vView = -mv.xyz;
        // Near-uniform scale on the lens matrix (the squint squashes one
        // axis) — the plain model matrix is close enough for the glint's
        // world normal; the rim uses the proper normalMatrix above.
        vWorldNormal = mat3(modelMatrix) * normal;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vLocal = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpenness;
      uniform vec3 uKeyDirWorld;
      varying vec3 vNormalView;
      varying vec3 vView;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying vec3 vLocal;
      void main() {
        float facing = clamp(dot(normalize(vNormalView), normalize(vView)), 0.0, 1.0);
        float rim = pow(1.0 - facing, 2.5) * uOpenness;
        // The turret's muzzle: the lens's local +z aims at the gaze target
        // (see the aim slew in update), and the pupil is a deep-black disc
        // at that pole on a just-lighter dark-olive sclera — enough
        // contrast that WHERE the eye looks is legible, not enough to stop
        // reading as a dark wet bead.
        float pole = normalize(vLocal).z;
        float pupil = smoothstep(0.72, 0.84, pole);
        vec3 color = mix(vec3(0.016, 0.018, 0.012), vec3(0.0012, 0.0012, 0.0010), pupil)
          + vec3(0.30, 0.40, 0.35) * rim * 0.9;
        // The clearcoat: a wet lacquer over the dark lens. Schlick fresnel
        // (F0 0.04, the water/lacquer constant) lifts the grazing shell a
        // touch, and the key light lands as one tight glint — the catchlight
        // that makes a bead read wet rather than painted. Gated by the
        // blink with the rim, for the same reason.
        vec3 n = normalize(vWorldNormal);
        vec3 v = normalize(cameraPosition - vWorldPos);
        float f = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
        vec3 h = normalize(uKeyDirWorld + v);
        float glint = pow(clamp(dot(n, h), 0.0, 1.0), 180.0);
        color += (vec3(1.0, 0.98, 0.92) * glint * 0.85 + vec3(0.10, 0.12, 0.11) * f * 0.5)
          * uOpenness;
        gl_FragColor = vec4(color, 1.0);
      }
    `
  });
  const lenses = [0, 1].map(() => {
    const lens = new THREE.Mesh(geometry, material);
    lens.matrixAutoUpdate = false;
    group.add(lens);
    return lens;
  });

  // One blink clock for both eyes, seeded like the mesh eyes were.
  const rand = mulberry32((seed ^ 0x51f15e) >>> 0);
  let nextBlinkAt = BLINK_GAP_MIN + rand() * (BLINK_GAP_MAX - BLINK_GAP_MIN);
  let blinkStarted = -1;
  /** This blink's length, fixed at its start from the arousal of the moment. */
  let blinkSec = BLINK_SEC;
  let lastTime = -1;

  /** Smoothed eye offsets from the body centroid — the leash: the body
   * carries the bubbles, only motion through the goo is smoothed. NaN
   * marks "unformed, birth on next frame". */
  const eyeX = [NaN, NaN];
  const eyeY = [0, 0];
  const eyeZ = [0, 0];
  /** The birth swell, 0 unformed → 1 grown; scales the orbs. */
  let birth = 0;
  /** Each lens's smoothed aim — the turret barrel. Starts on the dome's
   * outward slope, slews onto whatever the gaze offers. */
  const aims = [-1, 1].map((side) =>
    new THREE.Vector3(
      Math.sin(side * EYE_AZIMUTH),
      0.4,
      Math.cos(side * EYE_AZIMUTH)
    ).normalize()
  );

  const normal = new THREE.Vector3();
  const tangentX = new THREE.Vector3();
  const tangentY = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  const glance = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4();
  const scratch = new THREE.Vector3();
  const wantAim = new THREE.Vector3();

  return {
    group,

    update(positions, count, timeSec, gaze, emotion, poke = null, squint = 0) {
      const { valence, arousal } = emotion;
      const dt = lastTime < 0 ? 1 : Math.max(0, timeSec - lastTime);
      if (timeSec < lastTime) blinkStarted = -1;
      lastTime = timeSec;
      if (blinkStarted < 0 && timeSec >= nextBlinkAt) {
        blinkStarted = timeSec;
        // Sleepy blinks are long and heavy; an aroused blink is a snap.
        blinkSec = Math.max(0.08, BLINK_SEC * (1.9 - 1.3 * arousal));
      }
      let blink = 1;
      if (blinkStarted >= 0) {
        const phase = (timeSec - blinkStarted) / blinkSec;
        if (phase >= 1) {
          blinkStarted = -1;
          // An aroused slime stares — blinks come further apart; a calm or
          // sleepy one lets its eyes fall shut more often.
          const gapScale = 0.65 + 0.85 * arousal;
          nextBlinkAt =
            timeSec + (BLINK_GAP_MIN + rand() * (BLINK_GAP_MAX - BLINK_GAP_MIN)) * gapScale;
        } else {
          blink = 0.08 + 0.92 * Math.abs(1 - phase * 2) ** 1.5;
        }
      }
      // The birth swell: an unformed pair grows in from nothing over its
      // first second. Advanced here rather than on the NaN frame so the
      // freshly seeded beads start the frame at true zero size.
      if (Number.isNaN(eyeX[0])) birth = 0;
      else birth = Math.min(1, birth + dt / BIRTH_SEC);
      const formed = birth * birth * (3 - 2 * birth);

      // Blink = size: the orb shrinks to a bead at the blink's trough and
      // swells back. Low valence keeps it smaller overall (the droop);
      // arousal widens it — the saucer eyes of a startle or a treat.
      // The birth swell rides the same channel: a newborn orb is a speck.
      const orbSize =
        formed *
        (BLINK_MIN_SIZE + (1 - BLINK_MIN_SIZE) * blink) *
        (0.7 + 0.3 * valence) *
        (0.92 + 0.16 * arousal);
      material.uniforms.uOpenness.value = orbSize;

      // ---- body statistics: centroid and height range --------------------
      let cx = 0;
      let cy = 0;
      let cz = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < count; i++) {
        const y = positions[i * 3 + 1];
        cx += positions[i * 3];
        cy += y;
        cz += positions[i * 3 + 2];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      cx /= count;
      cy /= count;
      cz /= count;
      // Content eyes ride high on the dome; a miserable pet's sink toward
      // half-mast, with a small lift when something has its attention.
      const heightFraction = Math.min(
        EYE_HEIGHT_HIGH,
        EYE_HEIGHT_LOW + 0.12 * valence + 0.05 * arousal
      );
      const eyeLevel = minY + Math.max(0.004, (maxY - minY) * heightFraction);

      const ease = poke && poke.point ? Math.min(1, Math.max(0, poke.ease)) : 0;

      for (let eye = 0; eye < 2; eye++) {
        const side = eye === 0 ? -1 : 1;
        const dirX = Math.sin(side * EYE_AZIMUTH);
        const dirZ = Math.cos(side * EYE_AZIMUTH);

        // Radial extent of the body along this eye's direction, in a slab
        // around eye level — the surface the bead should sit just inside.
        let reach = 0;
        let fallback = 0;
        for (let i = 0; i < count; i++) {
          const rx = positions[i * 3] - cx;
          const rz = positions[i * 3 + 2] - cz;
          const along = rx * dirX + rz * dirZ;
          if (along > fallback) fallback = along;
          if (Math.abs(positions[i * 3 + 1] - eyeLevel) > 0.005) continue;
          if (along > reach) reach = along;
        }
        if (reach <= 0) reach = fallback * 0.8;

        let wantX = cx + dirX * Math.max(0.002, reach - EYE_SINK);
        let wantY = eyeLevel;
        let wantZ = cz + dirZ * Math.max(0.002, reach - EYE_SINK);

        if (ease > 0.001 && poke) {
          // Crowd the poked spot: side by side above it, easing in.
          const px = poke.point[0];
          const py = poke.point[1] + POKE_EYE_RISE;
          const pz = poke.point[2];
          // Spread along the horizontal direction perpendicular to the view
          // of the poke from the body centre.
          let sx = pz - cz;
          let sz = -(px - cx);
          const sLen = Math.hypot(sx, sz);
          if (sLen > 1e-6) {
            sx /= sLen;
            sz /= sLen;
          } else {
            sx = 1;
            sz = 0;
          }
          const spread = side * POKE_EYE_GAP * 0.5;
          wantX += (px + sx * spread - wantX) * ease;
          wantY += (py - wantY) * ease;
          wantZ += (pz + sz * spread - wantZ) * ease;
        }

        // Ease toward the preferred pose — in the *body's* frame. The
        // smoothed state is an offset from the centroid, so the body's own
        // travel carries the bubbles with it instantly (a sprinting slime
        // can't outrun its eyes); only motion *through* the goo is eased.
        // Horizontal is the quick swim; vertical is capped at a bubble's
        // rise, so a flipped body's eyes visibly float up to the new top.
        const wantOffX = wantX - cx;
        const wantOffY = wantY - cy;
        const wantOffZ = wantZ - cz;
        const seek = Math.min(1, dt / SEEK_SEC);
        if (Number.isNaN(eyeX[eye])) {
          // Birth: condense low in the goo, under the eventual perch. The
          // buoyant cap below then plays the rise — the newborn beads
          // visibly float up through the body to their spots.
          eyeX[eye] = wantOffX;
          eyeY[eye] = minY + Math.max(0.002, (maxY - minY) * BIRTH_HEIGHT) - cy;
          eyeZ[eye] = wantOffZ;
        } else {
          eyeX[eye] += (wantOffX - eyeX[eye]) * seek;
          eyeZ[eye] += (wantOffZ - eyeZ[eye]) * seek;
          const dy = (wantOffY - eyeY[eye]) * seek;
          const cap = BUOYANT_RISE * (dt || 1 / 60);
          eyeY[eye] += Math.max(-cap, Math.min(cap, dy));
        }

        centroid.set(cx + eyeX[eye], cy + eyeY[eye], cz + eyeZ[eye]);
        // Outward, tipped a little skyward — the dome's slope.
        normal.set(dirX, 0.4, dirZ).normalize();
        tangentX.copy(worldUp).cross(normal);
        if (tangentX.lengthSq() < 1e-8) tangentX.set(1, 0, 0);
        tangentX.normalize();
        tangentY.copy(normal).cross(tangentX).normalize();

        if (gaze) {
          glance.set(gaze[0], gaze[1], gaze[2]).sub(centroid);
          glance.addScaledVector(normal, -glance.dot(normal));
          const reachLen = glance.length();
          if (reachLen > 1e-6) {
            // A dispirited slime avoids eye contact: the glance's reach
            // shrinks with valence (the poke's cross-eyed look keeps its
            // full travel — a finger on the nose beats a bad day).
            const glanceReach = GAZE_REACH * (0.35 + 0.65 * valence);
            const cap = glanceReach + (SELF_GAZE_REACH - glanceReach) * ease;
            const pull = GAZE_PULL + (0.5 - GAZE_PULL) * ease;
            centroid.addScaledVector(glance, Math.min(cap, reachLen * pull) / reachLen);
          }
        }

        // A true orb: uniform scale, blink carried entirely by size.
        const s = EYE_RADIUS * orbSize;

        // The panes are solid: a body climbing the glass squashes against
        // it, and the bead is clamped inside the tank by its own radius —
        // pressed flat to the pane rather than poking through it.
        centroid.x = THREE.MathUtils.clamp(centroid.x, -BOX_HALF_X + s, BOX_HALF_X - s);
        centroid.z = THREE.MathUtils.clamp(centroid.z, -BOX_HALF_Z + s, BOX_HALF_Z - s);
        centroid.y = THREE.MathUtils.clamp(centroid.y, FLOOR_Y + s, FLOOR_Y + BOX_HEIGHT - s);

        // The turret: the lens swivels its pupil onto the gaze target,
        // independent of where the bead sits on the dome — rate-limited so
        // a shift of attention reads as tracking, not snapping. With
        // nothing offered it parks back on the dome's outward slope.
        if (gaze) {
          wantAim.set(gaze[0], gaze[1], gaze[2]).sub(centroid);
          if (wantAim.lengthSq() > 1e-10) wantAim.normalize();
          else wantAim.copy(normal);
        } else {
          wantAim.copy(normal);
        }
        const aim = aims[eye];
        aim.lerp(wantAim, Math.min(1, dt / AIM_SEC));
        if (aim.lengthSq() < 1e-8) aim.copy(wantAim);
        aim.normalize();

        tangentX.copy(worldUp).cross(aim);
        if (tangentX.lengthSq() < 1e-8) tangentX.set(1, 0, 0);
        tangentX.normalize();
        tangentY.copy(aim).cross(tangentX).normalize();

        // The squint: squash the bead toward a crescent along its own up
        // and spread it a little sideways — a smiling eye, carried by the
        // same basis the blink and aim already own. The shader's rim/glint
        // shrug off the non-uniform scale (a squashed normal still grazes).
        const pinch = Math.min(1, Math.max(0, squint));
        basis.makeBasis(
          tangentX.multiplyScalar(s * (1 + SQUINT_SPREAD * pinch)),
          tangentY.multiplyScalar(s * (1 - (1 - SQUINT_SQUASH) * pinch)),
          scratch.copy(aim).multiplyScalar(s)
        );
        basis.setPosition(centroid);
        lenses[eye].matrix.copy(basis);
      }
    },

    conceal() {
      eyeX[0] = NaN;
      eyeX[1] = NaN;
      birth = 0;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}

// Rides the physics: same no-hot-swap rule as the other creature modules.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
