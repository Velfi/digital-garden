import * as THREE from 'three';
import {
  SQUEEGEE_BLADE_HALF_EXTENTS,
  SQUEEGEE_WIPE_HALF_WIDTH,
  SQUEEGEE_WIPE_STRENGTH
} from './constants';
import {
  PANE_COUNT,
  PANE_XN,
  PANE_XP,
  PANE_ZN,
  paneUv,
  paneWorld,
  type GrimeBundle
} from './grimeMap';
import type { CondensationBundle } from './condensation';
import type { PointerRay } from './interaction';
import type { TerrariumBody, TerrariumWorld } from './joltWorld';

/**
 * The squeegee: the first thing in the tool drawer.
 *
 * Cleaning is three layers that share one stroke. The *stroke* is pointer
 * rays cast against the panes (`castSqueegee`, pure maths, tested); the
 * *wipe* is that stroke handed to the grime field, which is where the glass
 * actually gets clean; and the *blade* is a kinematic box gliding along the
 * inside of the pane, so a slime squatting on the glass is shoved off it by
 * ordinary contact — the same trick as the finger, in a different costume.
 * The 3D squeegee itself is theatre glued to the stroke.
 */

export interface PaneHit {
  pane: number;
  /** Pane coordinates of the hit, clamped to the glass. */
  u: number;
  v: number;
  /** World point on the pane's inner surface. */
  point: [number, number, number];
}

/**
 * The first pane surface along the ray whose crossing lands on the glass.
 * From the camera's side of the box that is the pane the player is looking
 * through, which is the pane a squeegee should clean.
 */
export function castSqueegee(
  origin: readonly [number, number, number],
  dir: readonly [number, number, number]
): PaneHit | null {
  let best: PaneHit | null = null;
  let bestT = Infinity;
  for (let pane = 0; pane < PANE_COUNT; pane++) {
    // Plane through the pane: use two pane points to recover its axis.
    const p0 = paneWorld(pane, 0.5, 0.5);
    const axis = pane === PANE_XN || pane === PANE_XP ? 0 : 2;
    const denom = dir[axis];
    if (Math.abs(denom) < 1e-9) continue;
    const t = (p0[axis] - origin[axis]) / denom;
    if (t <= 0 || t >= bestT) continue;
    const x = origin[0] + dir[0] * t;
    const y = origin[1] + dir[1] * t;
    const z = origin[2] + dir[2] * t;
    const [u, v] = paneUv(pane, x, y, z);
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    bestT = t;
    best = { pane, u, v, point: paneWorld(pane, u, v) };
  }
  return best;
}

/** Yaw that turns the tool's local +z into the pane's inward normal. */
function paneYaw(pane: number): number {
  switch (pane) {
    case PANE_XP:
      return -Math.PI / 2;
    case PANE_XN:
      return Math.PI / 2;
    case PANE_ZN:
      return 0;
    default:
      return Math.PI;
  }
}

export interface SqueegeeBundle {
  group: THREE.Group;
  /** Ghost the tool where this ray meets the glass (tool armed, not pressed). */
  hover(ray: PointerRay): void;
  /** Begin a stroke. True if the ray found glass. */
  press(ray: PointerRay): boolean;
  /** Continue a stroke: wipe from the last point and glide the blade on. */
  drag(ray: PointerRay): void;
  release(): void;
  /** Advance the blade's kinematic body. Call once per fixed step. */
  step(dt: number): void;
  wiping(): boolean;
  dispose(): void;
}

export function createSqueegee(
  world: TerrariumWorld,
  grime: GrimeBundle,
  condensation: CondensationBundle
): SqueegeeBundle {
  /** One stroke, both films: the dried smears and the fog are different
   * dirt on the same glass, and the blade does not know the difference. */
  function wipeBoth(
    pane: number,
    u0: number,
    v0: number,
    u1: number,
    v1: number
  ): void {
    grime.wipe(pane, u0, v0, u1, v1, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
    condensation.wipe(pane, u0, v0, u1, v1, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
  }

  const group = new THREE.Group();
  group.visible = false;

  // --- the prop -------------------------------------------------------------
  // Local axes: x along the blade, y up the pane, +z pointing into the box.
  const disposables: Array<{ dispose(): void }> = [];
  const rubberMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2f31,
    roughness: 0.65,
    transparent: true
  });
  const barMaterial = new THREE.MeshStandardMaterial({
    color: 0xcfd6d2,
    roughness: 0.35,
    metalness: 0.6,
    transparent: true
  });
  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8a03e,
    roughness: 0.55,
    transparent: true
  });
  const materials = [rubberMaterial, barMaterial, handleMaterial];
  disposables.push(...materials);

  const rubberGeometry = new THREE.BoxGeometry(0.03, 0.007, 0.003);
  const rubber = new THREE.Mesh(rubberGeometry, rubberMaterial);
  rubber.position.set(0, 0, 0.0022);
  disposables.push(rubberGeometry);

  const barGeometry = new THREE.BoxGeometry(0.032, 0.0045, 0.005);
  const bar = new THREE.Mesh(barGeometry, barMaterial);
  bar.position.set(0, 0.004, 0.004);
  disposables.push(barGeometry);

  const handleGeometry = new THREE.CylinderGeometry(0.0032, 0.0042, 0.034, 10);
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  // Leaning up and into the box, like a hand reaching over the rim.
  handle.rotation.x = -0.85;
  handle.position.set(0, 0.017, 0.015);
  disposables.push(handleGeometry);

  group.add(rubber, bar, handle);

  function setGhost(alpha: number): void {
    for (const material of materials) material.opacity = alpha;
  }

  const targetQuat = new THREE.Quaternion();

  /**
   * Pose the prop flat against the pane: local +z into the glass, blade
   * (local x) horizontal, handle (local +y) up. The tool stays level no
   * matter which way the stroke runs — only the pane it faces can turn it,
   * and that turn is pure yaw. `blend` eases the swing between panes
   * (1 snaps — a fresh press, a new pane; 0 keeps the pose and just moves).
   */
  function placeProp(hit: PaneHit, blend: number): void {
    group.position.set(hit.point[0], hit.point[1], hit.point[2]);
    group.visible = true;
    if (blend <= 0) return;
    const yaw = paneYaw(hit.pane);
    targetQuat.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
    if (blend >= 1) group.quaternion.copy(targetQuat);
    else group.quaternion.slerp(targetQuat, blend);
  }

  // --- the stroke -----------------------------------------------------------
  let blade: TerrariumBody | null = null;
  let last: PaneHit | null = null;
  /** Where the kinematic blade is being sent, refreshed by every drag. */
  const bladeTarget: [number, number, number] = [0, 0, 0];

  function bladePose(hit: PaneHit): [number, number, number] {
    // The box's centre floats its half-thickness off the glass.
    const inward = SQUEEGEE_BLADE_HALF_EXTENTS[2];
    const yaw = paneYaw(hit.pane);
    return [
      hit.point[0] + Math.sin(yaw) * inward,
      hit.point[1],
      hit.point[2] + Math.cos(yaw) * inward
    ];
  }

  return {
    group,

    hover(ray) {
      if (last) return;
      const hit = castSqueegee(ray.origin, ray.dir);
      if (!hit) {
        group.visible = false;
        return;
      }
      setGhost(0.4);
      placeProp(hit, 0.35);
    },

    press(ray) {
      const hit = castSqueegee(ray.origin, ray.dir);
      if (!hit) return false;
      last = hit;
      setGhost(1);
      placeProp(hit, 1);
      // A press is already a wipe the size of the blade's rest.
      wipeBoth(hit.pane, hit.u, hit.v, hit.u, hit.v);
      const at = bladePose(hit);
      bladeTarget[0] = at[0];
      bladeTarget[1] = at[1];
      bladeTarget[2] = at[2];
      const yaw = paneYaw(hit.pane);
      // The kinematic blade shares the prop's locked pose: horizontal, yawed
      // to face the pane. MoveKinematic holds that rotation for the stroke.
      blade = world.addPaddle(SQUEEGEE_BLADE_HALF_EXTENTS, at, [
        0,
        Math.sin(yaw / 2),
        0,
        Math.cos(yaw / 2)
      ]);
      return true;
    },

    drag(ray) {
      if (!last) return;
      const hit = castSqueegee(ray.origin, ray.dir);
      if (!hit) return;
      if (hit.pane === last.pane) {
        wipeBoth(hit.pane, last.u, last.v, hit.u, hit.v);
      } else if (blade) {
        // Crossed onto another pane mid-stroke: lift and re-plant, so the
        // blade never sweeps through the box's interior corner-to-corner.
        world.remove(blade);
        blade = null;
      }
      const startingFresh = hit.pane !== last.pane;
      last = hit;
      placeProp(hit, startingFresh ? 1 : 0);
      const at = bladePose(hit);
      bladeTarget[0] = at[0];
      bladeTarget[1] = at[1];
      bladeTarget[2] = at[2];
      if (startingFresh) {
        const yaw = paneYaw(hit.pane);
        blade = world.addPaddle(SQUEEGEE_BLADE_HALF_EXTENTS, at, [
          0,
          Math.sin(yaw / 2),
          0,
          Math.cos(yaw / 2)
        ]);
      }
    },

    release() {
      if (blade) {
        world.remove(blade);
        blade = null;
      }
      last = null;
      group.visible = false;
    },

    step(dt) {
      if (blade) world.moveKinematic(blade, bladeTarget, dt);
    },

    wiping() {
      return last !== null;
    },

    dispose() {
      this.release();
      for (const d of disposables) d.dispose();
    }
  };
}
