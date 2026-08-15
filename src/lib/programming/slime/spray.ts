import * as THREE from 'three';
import { BOX_HALF_X, BOX_HALF_Z, BOX_HEIGHT, FLOOR_Y } from './constants';

/**
 * The mister: a hand-held spray bottle over the front rim, and the burst it
 * fires. Pure theatre — the moisture change is `applyMist` in the care sim;
 * this is the part you watch.
 *
 * The bottle is the squeegee trick in a different costume: a ghosted prop
 * while the tool is armed, solid for the squeeze. The burst is two clouds
 * that share one trigger pull — coarse droplets that fly ballistically and
 * arc down, and a fine mist that stalls in the air almost immediately and
 * drifts, which is what separates a mister from a squirt gun.
 */

const DROPLETS = 64;
const MIST = 110;
const DROPLET_LIFE_SEC = 0.9;
const MIST_LIFE_SEC = 1.6;
/** Air drag per second: droplets keep most of their speed, mist loses it. */
const DROPLET_DRAG = 1.6;
const MIST_DRAG = 5.5;
const SQUEEZE_SEC = 0.22;
/** How long after a squeeze the bottle stays solid before re-ghosting. */
const HOLD_SEC = 0.6;
const GHOST_ALPHA = 0.4;

interface Cloud {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  ages: Float32Array;
  material: THREE.PointsMaterial;
  count: number;
  lifeSec: number;
  drag: number;
  gravity: number;
  baseOpacity: number;
}

/** A soft round droplet sprite; hard default squares read as confetti. */
let dropletSprite: THREE.CanvasTexture | null = null;
function dropletTexture(): THREE.CanvasTexture | null {
  if (dropletSprite) return dropletSprite;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  dropletSprite = new THREE.CanvasTexture(canvas);
  return dropletSprite;
}

function createCloud(
  count: number,
  size: number,
  opacity: number,
  lifeSec: number,
  drag: number,
  gravity: number
): Cloud {
  const positions = new Float32Array(count * 3);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
  const material = new THREE.PointsMaterial({
    color: 0xbfdde8,
    size,
    map: dropletTexture(),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;
  return {
    points,
    positions,
    velocities: new Float32Array(count * 3),
    ages: new Float32Array(count).fill(Infinity),
    material,
    count,
    lifeSec,
    drag,
    gravity,
    baseOpacity: opacity
  };
}

/** Fill a cloud with a cone burst from `from` toward `dir` (unit). */
function burst(
  cloud: Cloud,
  from: THREE.Vector3,
  dir: THREE.Vector3,
  spread: number,
  speedLo: number,
  speedHi: number
): void {
  // Any two axes perpendicular to the aim, for the cone's disc.
  const side = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(dir, side).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u);
  for (let i = 0; i < cloud.count; i++) {
    cloud.positions[i * 3] = from.x;
    cloud.positions[i * 3 + 1] = from.y;
    cloud.positions[i * 3 + 2] = from.z;
    // Uniform over the cone's disc: sqrt for area, angle for direction.
    const r = Math.sqrt(Math.random()) * spread;
    const theta = Math.random() * Math.PI * 2;
    const speed = speedLo + Math.random() * (speedHi - speedLo);
    const dx = dir.x + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * r;
    const dy = dir.y + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * r;
    const dz = dir.z + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * r;
    const length = Math.hypot(dx, dy, dz) || 1;
    cloud.velocities[i * 3] = (dx / length) * speed;
    cloud.velocities[i * 3 + 1] = (dy / length) * speed;
    cloud.velocities[i * 3 + 2] = (dz / length) * speed;
    cloud.ages[i] = Math.random() * 0.12; // staggered starts inside the burst
  }
  cloud.points.visible = true;
}

function updateCloud(cloud: Cloud, dt: number): void {
  if (!cloud.points.visible) return;
  const decay = Math.exp(-cloud.drag * dt);
  let alive = 0;
  for (let i = 0; i < cloud.count; i++) {
    if (cloud.ages[i] >= cloud.lifeSec) continue;
    cloud.ages[i] += dt;
    cloud.velocities[i * 3] *= decay;
    cloud.velocities[i * 3 + 1] = cloud.velocities[i * 3 + 1] * decay - cloud.gravity * dt;
    cloud.velocities[i * 3 + 2] *= decay;
    cloud.positions[i * 3] += cloud.velocities[i * 3] * dt;
    cloud.positions[i * 3 + 1] += cloud.velocities[i * 3 + 1] * dt;
    cloud.positions[i * 3 + 2] += cloud.velocities[i * 3 + 2] * dt;
    // Landed: droplets don't sink through the soil.
    if (cloud.positions[i * 3 + 1] < FLOOR_Y + 0.001) {
      cloud.ages[i] = Infinity;
      continue;
    }
    alive += 1;
  }
  (cloud.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  cloud.material.opacity = cloud.baseOpacity * Math.max(0, alive / cloud.count);
  if (alive === 0) cloud.points.visible = false;
}

export interface SprayBundle {
  /** Both droplet clouds; foreground, toggled together by the render passes. */
  points: THREE.Object3D;
  /** The bottle prop. */
  group: THREE.Group;
  /** Ghost the bottle aimed at `target` (tool armed, not squeezing). */
  aim(target: readonly [number, number, number]): void;
  /** Hide the bottle (tool put away). */
  hide(): void;
  /**
   * Fire a burst toward `target` (world). Returns the estimated seconds until
   * the droplets land there, so the caller can hold the care effect until the
   * mist visibly arrives.
   */
  spray(target: readonly [number, number, number]): number;
  update(dt: number): void;
  dispose(): void;
}

export function createSpray(): SprayBundle {
  const droplets = createCloud(DROPLETS, 0.002, 0.65, DROPLET_LIFE_SEC, DROPLET_DRAG, 0.14);
  // The fine mist: smaller, dimmer, stalls fast and settles slowly.
  const mist = createCloud(MIST, 0.0012, 0.4, MIST_LIFE_SEC, MIST_DRAG, 0.03);
  const points = new THREE.Group();
  points.add(droplets.points, mist.points);

  // --- the prop -------------------------------------------------------------
  // Local axes: +z out of the nozzle, +y up the bottle.
  const group = new THREE.Group();
  group.visible = false;
  const disposables: Array<{ dispose(): void }> = [];

  const plasticMaterial = new THREE.MeshStandardMaterial({
    color: 0xa8cfdd,
    roughness: 0.3,
    transparent: true,
    opacity: GHOST_ALPHA
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8eef0,
    roughness: 0.5,
    transparent: true,
    opacity: GHOST_ALPHA
  });
  const materials = [plasticMaterial, headMaterial];
  disposables.push(...materials);

  const bodyGeometry = new THREE.CylinderGeometry(0.0075, 0.0085, 0.026, 14);
  const body = new THREE.Mesh(bodyGeometry, plasticMaterial);
  body.position.set(0, -0.022, 0);
  disposables.push(bodyGeometry);

  const shoulderGeometry = new THREE.CylinderGeometry(0.0032, 0.0075, 0.007, 14);
  const shoulder = new THREE.Mesh(shoulderGeometry, plasticMaterial);
  shoulder.position.set(0, -0.0055, 0);
  disposables.push(shoulderGeometry);

  const headGeometry = new THREE.BoxGeometry(0.0075, 0.0105, 0.017);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.set(0, 0.0015, 0.001);
  disposables.push(headGeometry);

  const nozzleGeometry = new THREE.CylinderGeometry(0.0022, 0.0028, 0.005, 10);
  const nozzle = new THREE.Mesh(nozzleGeometry, headMaterial);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.002, 0.011);
  disposables.push(nozzleGeometry);

  const triggerGeometry = new THREE.BoxGeometry(0.004, 0.011, 0.0022);
  const trigger = new THREE.Mesh(triggerGeometry, headMaterial);
  trigger.position.set(0, -0.006, 0.0075);
  trigger.rotation.x = 0.25;
  disposables.push(triggerGeometry);

  group.add(body, shoulder, head, nozzle, trigger);

  // The hand reaches in through the open top and hovers the bottle a little
  // above and in front of wherever it is aiming, so the prop stays in view
  // however close the camera sits.
  const anchor = new THREE.Vector3(0.018, FLOOR_Y + 0.045, BOX_HALF_Z - 0.01);
  group.position.copy(anchor);

  function setGhost(alpha: number): void {
    for (const material of materials) material.opacity = alpha;
  }

  const aimDir = new THREE.Vector3(0, -0.3, -1).normalize();
  const targetQuat = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const scratch = new THREE.Vector3();
  const nozzleTip = new THREE.Vector3();

  /** Float above-and-behind the aim and point the nozzle at it. */
  function pointAt(target: readonly [number, number, number], blend: number): void {
    const ease = Math.min(1, blend * 2);
    const wantX = Math.max(-BOX_HALF_X + 0.012, Math.min(BOX_HALF_X - 0.012, target[0]));
    const wantY = Math.min(FLOOR_Y + BOX_HEIGHT - 0.006, target[1] + 0.035);
    const wantZ = Math.min(BOX_HALF_Z - 0.008, target[2] + 0.022);
    anchor.x += (wantX - anchor.x) * ease;
    anchor.y += (wantY - anchor.y) * ease;
    anchor.z += (wantZ - anchor.z) * ease;
    group.position.copy(anchor);
    scratch.set(target[0] - anchor.x, target[1] - anchor.y, target[2] - anchor.z);
    if (scratch.lengthSq() < 1e-10) return;
    scratch.normalize();
    aimDir.lerp(scratch, blend).normalize();
    // The prop tips forward only so far — a hand keeps the bottle roughly
    // upright and lets the spray cone do the aiming.
    scratch.copy(aimDir);
    scratch.y = Math.max(-0.5, Math.min(0.1, scratch.y));
    scratch.normalize();
    targetQuat.setFromUnitVectors(zAxis, scratch);
    group.quaternion.copy(targetQuat);
  }

  /** Squeeze animation clock: counts down from SQUEEZE_SEC + HOLD_SEC. */
  let squeezeSec = 0;
  const triggerRest = trigger.rotation.x;

  return {
    points,
    group,

    aim(target) {
      if (squeezeSec <= 0) setGhost(GHOST_ALPHA);
      group.visible = true;
      pointAt(target, 0.4);
    },

    hide() {
      group.visible = false;
      squeezeSec = 0;
      trigger.rotation.x = triggerRest;
    },

    spray(target) {
      group.visible = true;
      setGhost(1);
      pointAt(target, 1);
      squeezeSec = SQUEEZE_SEC + HOLD_SEC;

      group.updateMatrixWorld(true);
      nozzleTip.set(0, 0.002, 0.0135).applyMatrix4(group.matrixWorld);
      // Mean droplet speed, plus half the stagger window: when the middle of
      // the burst reaches the target, the misting has visibly happened.
      const flightDistance = Math.hypot(
        target[0] - nozzleTip.x,
        target[1] - nozzleTip.y,
        target[2] - nozzleTip.z
      );
      const travelSec = Math.min(DROPLET_LIFE_SEC, flightDistance / 0.13 + 0.06);
      burst(droplets, nozzleTip, aimDir, 0.18, 0.1, 0.19);
      burst(mist, nozzleTip, aimDir, 0.32, 0.14, 0.26);
      return travelSec;
    },

    update(dt) {
      updateCloud(droplets, dt);
      updateCloud(mist, dt);
      if (squeezeSec > 0) {
        squeezeSec = Math.max(0, squeezeSec - dt);
        // The trigger pulls in over the squeeze and eases back over the hold,
        // with a slight nod of the whole bottle at full pull.
        const sinceFire = SQUEEZE_SEC + HOLD_SEC - squeezeSec;
        const pull =
          sinceFire < SQUEEZE_SEC
            ? Math.sin((Math.PI * sinceFire) / SQUEEZE_SEC)
            : Math.max(0, 1 - (sinceFire - SQUEEZE_SEC) / 0.15);
        trigger.rotation.x = triggerRest + 0.5 * pull;
        group.rotation.x += 0.05 * pull * (Math.PI / 180);
        if (squeezeSec === 0) setGhost(GHOST_ALPHA);
      }
    },

    dispose() {
      droplets.points.geometry.dispose();
      mist.points.geometry.dispose();
      droplets.material.dispose();
      mist.material.dispose();
      for (const d of disposables) d.dispose();
    }
  };
}
