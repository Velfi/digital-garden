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
    color: 0x24272a,
    roughness: 0.9,
    transparent: true
  });
  const steelMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4dad8,
    roughness: 0.28,
    metalness: 0.85,
    transparent: true
  });
  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8a03e,
    roughness: 0.5,
    transparent: true
  });
  const materials = [rubberMaterial, steelMaterial, handleMaterial];
  disposables.push(...materials);

  // The blade assembly leans into the box at a working angle, the way a
  // squeegee is actually held, with only the rubber's edge kissing the glass.
  const bladeAssembly = new THREE.Group();
  bladeAssembly.rotation.x = -0.55;
  bladeAssembly.position.set(0, 0.0015, 0.002);

  // Rubber strip, longer than its channel so the working edge shows.
  const rubberGeometry = new THREE.BoxGeometry(0.036, 0.008, 0.002);
  const rubber = new THREE.Mesh(rubberGeometry, rubberMaterial);
  rubber.position.set(0, 0.003, 0);
  disposables.push(rubberGeometry);

  // Steel channel gripping the rubber's upper half.
  const channelGeometry = new THREE.BoxGeometry(0.032, 0.005, 0.0055);
  const channel = new THREE.Mesh(channelGeometry, steelMaterial);
  channel.position.set(0, 0.0075, 0.001);
  disposables.push(channelGeometry);

  // Plastic caps closing off the channel's ends.
  const capGeometry = new THREE.BoxGeometry(0.003, 0.0056, 0.006);
  const capLeft = new THREE.Mesh(capGeometry, handleMaterial);
  capLeft.position.set(-0.0165, 0.0075, 0.001);
  const capRight = new THREE.Mesh(capGeometry, handleMaterial);
  capRight.position.set(0.0165, 0.0075, 0.001);
  disposables.push(capGeometry);

  bladeAssembly.add(rubber, channel, capLeft, capRight);

  // Neck joining the channel to the grip, along the handle's lean.
  const neckGeometry = new THREE.CylinderGeometry(0.002, 0.0026, 0.009, 10);
  const neck = new THREE.Mesh(neckGeometry, steelMaterial);
  neck.rotation.x = -0.85;
  neck.position.set(0, 0.0095, 0.0065);
  disposables.push(neckGeometry);

  // Collar where the grip swallows the neck.
  const collarGeometry = new THREE.CylinderGeometry(0.0042, 0.0046, 0.004, 12);
  const collar = new THREE.Mesh(collarGeometry, handleMaterial);
  collar.rotation.x = -0.85;
  collar.position.set(0, 0.0125, 0.0095);
  disposables.push(collarGeometry);

  // Rounded grip, leaning up and into the box like a hand over the rim.
  const handleGeometry = new THREE.CapsuleGeometry(0.004, 0.024, 4, 12);
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.rotation.x = -0.85;
  handle.position.set(0, 0.021, 0.018);
  disposables.push(handleGeometry);

  group.add(bladeAssembly, neck, collar, handle);

  // --- the squish -----------------------------------------------------------
  // The same trick as the slime's eyes: pressing doesn't swap geometry, it
  // scales the rubber non-uniformly against the surface. Flattened into the
  // glass, shortened in height, bulged along the blade — with the working
  // edge pinned to the pane and the whole assembly leaning harder, the way
  // rubber loads up under a real stroke.
  const RUBBER_HALF_HEIGHT = 0.004;
  const RUBBER_EDGE_Y = 0.003 - RUBBER_HALF_HEIGHT;
  let squish = 0;
  let squishTarget = 0;

  function applySquish(s: number): void {
    rubber.scale.set(1 + 0.1 * s, 1 - 0.35 * s, 1 - 0.45 * s);
    // Keep the working edge on the glass as the strip shortens.
    rubber.position.y = RUBBER_EDGE_Y + RUBBER_HALF_HEIGHT * (1 - 0.35 * s);
    bladeAssembly.rotation.x = -0.55 - 0.18 * s;
  }

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
      squishTarget = 1;
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
      squishTarget = 0;
      group.visible = false;
    },

    step(dt) {
      if (blade) world.moveKinematic(blade, bladeTarget, dt);
      if (Math.abs(squishTarget - squish) > 1e-4) {
        // Quick load-up, same-speed relax: ~50ms to settle either way.
        squish += (squishTarget - squish) * (1 - Math.exp(-dt * 22));
        applySquish(squish);
      }
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
