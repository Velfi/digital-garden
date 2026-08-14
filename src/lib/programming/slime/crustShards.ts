import * as THREE from 'three';
import { mulberry32 } from '../marimo/rng';
import { FLOOR_Y } from './constants';
import { SCLEROTIUM_RADIUS } from './sclerotiumMesh';

/**
 * The shatter: crust plates that break loose during the emergence and
 * tumble off the mound.
 *
 * The crust shader retires plates centre-out as the waking body pries them
 * up (sclerotiumMesh.ts); these chips are the other half of that story —
 * as each stretch of crust lets go, a physical chip pops off the dome,
 * tumbles down onto the paper, and soaks away to nothing where it lands.
 * Pure theatre on the render clock, like the dust puff: no engine bodies,
 * just flick-and-fall ballistics, a floor, and a soak timer. The host
 * skips the launches entirely under reduced motion — the shader's quiet
 * plate-by-plate dissolve is the fallback show.
 */

/** How many plates get a physical chip. The shader retires far more —
 * these are the featured few the eye can actually follow. */
const CHIPS = 28;
/** Chip plan radius bounds, metres — crust plates run ~1–2 mm across. */
const CHIP_MIN_R = 0.0009;
const CHIP_MAX_R = 0.0019;
/** Theatrical gravity, m/s² — true g at this scale drops a chip faster
 * than an eye can register (the dust puff set this precedent). */
const GRAVITY = 0.4;
/** Where a chip comes to rest, just proud of the paper. */
const REST_Y = FLOOR_Y + 0.0005;
/** After landing: a beat of stillness, then the soak-away shrink. */
const SOAK_HOLD_SEC = 0.8;
const SOAK_SEC = 1.7;

/** Matches the shader's eaten-front mapping in sclerotiumMesh.ts, so chips
 * pop off in step with the plates vanishing from the crust mesh. */
const EATEN_LO = -0.45;
const EATEN_HI = 1.45;

const PARKED = 0;
const FLYING = 1;
const SOAKING = 2;
const SPENT = 3;

export interface CrustShardsBundle {
  group: THREE.Group;
  /**
   * The shatter front, 0 → 1, same value the crust's setEmergence gets.
   * Chips whose home plate the front has passed break loose. Monotonic
   * within one hatch; call reset() before the next.
   */
  setProgress(gone: number): void;
  update(dt: number): void;
  /** Park every chip again for the next emergence. */
  reset(): void;
  dispose(): void;
}

export function createCrustShards(
  seed: number,
  surfaceY: (x: number, z: number) => number
): CrustShardsBundle {
  const rand = mulberry32((seed ^ 0xc4057a) >>> 0);
  const group = new THREE.Group();

  // Linear-space crust palette (the oat lesson: sRGB constants read as
  // chalk) — each chip a mosaic shade between ochre and umber.
  const ochre = new THREE.Color(0.34, 0.16, 0.042);
  const rust = new THREE.Color(0.16, 0.058, 0.018);
  const umber = new THREE.Color(0.085, 0.038, 0.016);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.4,
    side: THREE.DoubleSide
  });

  const tint = new THREE.Color();
  const rimTint = new THREE.Color();

  /** An irregular flat plate: a fan around a slightly raised centre, so
   * the top catches light like a canted shard rather than a decal. */
  function makeChipGeometry(): THREE.BufferGeometry {
    const corners = 5 + Math.floor(rand() * 3);
    const size = CHIP_MIN_R + rand() * (CHIP_MAX_R - CHIP_MIN_R);
    tint.copy(ochre).lerp(rust, rand()).lerp(umber, rand() * 0.5);
    rimTint.copy(tint).multiplyScalar(0.55);
    const positions: number[] = [0, 0.0003, 0];
    const colors: number[] = [tint.r * 1.15, tint.g * 1.15, tint.b * 1.15];
    for (let c = 0; c < corners; c++) {
      const theta = ((c + rand() * 0.55) / corners) * Math.PI * 2;
      const radius = size * (0.65 + rand() * 0.5);
      positions.push(Math.cos(theta) * radius, 0, Math.sin(theta) * radius);
      colors.push(rimTint.r, rimTint.g, rimTint.b);
    }
    const indices: number[] = [];
    for (let c = 0; c < corners; c++) {
      indices.push(0, 1 + ((c + 1) % corners), 1 + c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  interface Chip {
    mesh: THREE.Mesh;
    geometry: THREE.BufferGeometry;
    homeX: number;
    homeZ: number;
    /** This chip's turn in the centre-out shatter, same jitter shape as
     * the shader's sclEatOrder. */
    order: number;
    phase: number;
    velocity: THREE.Vector3;
    spinAxis: THREE.Vector3;
    spinRate: number;
    soak: number;
  }

  const spinQuat = new THREE.Quaternion();

  const chips: Chip[] = Array.from({ length: CHIPS }, () => {
    // Homes spread over the crust by area, so the shatter is everywhere
    // rather than crowding the rim.
    const angle = rand() * Math.PI * 2;
    const radial = Math.sqrt(rand());
    const homeX = Math.cos(angle) * SCLEROTIUM_RADIUS * 0.92 * radial;
    const homeZ = Math.sin(angle) * SCLEROTIUM_RADIUS * 0.92 * radial;
    const geometry = makeChipGeometry();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    return {
      mesh,
      geometry,
      homeX,
      homeZ,
      order: radial + (rand() - 0.5) * 0.5,
      phase: PARKED,
      velocity: new THREE.Vector3(),
      spinAxis: new THREE.Vector3(),
      spinRate: 0,
      soak: 0
    };
  });

  function launch(chip: Chip): void {
    chip.phase = FLYING;
    chip.mesh.visible = true;
    chip.mesh.scale.setScalar(1);
    chip.mesh.position.set(
      chip.homeX,
      FLOOR_Y + 0.001 + surfaceY(chip.homeX, chip.homeZ),
      chip.homeZ
    );
    chip.mesh.quaternion.identity();
    // Pried up and flicked outward — down the slope, away from the middle
    // the body is welling out of. A chip born at dead centre picks a side.
    const plan = Math.hypot(chip.homeX, chip.homeZ);
    const away = plan > 1e-5 ? rand() * Math.PI * 0.5 - Math.PI * 0.25 : rand() * Math.PI * 2;
    const base = plan > 1e-5 ? Math.atan2(chip.homeZ, chip.homeX) : 0;
    const speed = 0.006 + rand() * 0.014;
    chip.velocity.set(
      Math.cos(base + away) * speed,
      0.012 + rand() * 0.02,
      Math.sin(base + away) * speed
    );
    chip.spinAxis.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    chip.spinRate = 2 + rand() * 6;
    chip.soak = 0;
  }

  return {
    group,

    setProgress(gone) {
      const eaten = EATEN_LO + (EATEN_HI - EATEN_LO) * Math.min(1, Math.max(0, gone));
      for (const chip of chips) {
        if (chip.phase === PARKED && chip.order < eaten - 0.05) launch(chip);
      }
    },

    update(dt) {
      for (const chip of chips) {
        if (chip.phase === FLYING) {
          chip.velocity.y -= GRAVITY * dt;
          chip.mesh.position.addScaledVector(chip.velocity, dt);
          spinQuat.setFromAxisAngle(chip.spinAxis, chip.spinRate * dt);
          chip.mesh.quaternion.premultiply(spinQuat);
          if (chip.mesh.position.y <= REST_Y && chip.velocity.y < 0) {
            chip.mesh.position.y = REST_Y;
            chip.phase = SOAKING;
          }
        } else if (chip.phase === SOAKING) {
          chip.soak += dt;
          const k = Math.min(1, Math.max(0, (chip.soak - SOAK_HOLD_SEC) / SOAK_SEC));
          const shrink = 1 - k * k * (3 - 2 * k);
          chip.mesh.scale.setScalar(Math.max(0.001, shrink));
          // Sinking into the wet paper as it goes.
          chip.mesh.position.y = REST_Y - 0.0004 * (1 - shrink);
          if (k >= 1) {
            chip.phase = SPENT;
            chip.mesh.visible = false;
          }
        }
      }
    },

    reset() {
      for (const chip of chips) {
        chip.phase = PARKED;
        chip.mesh.visible = false;
      }
    },

    dispose() {
      for (const chip of chips) chip.geometry.dispose();
      material.dispose();
    }
  };
}
