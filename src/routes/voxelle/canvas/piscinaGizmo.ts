/**
 * Body: length (red), lateral width (green), dorsoventral thickness (blue) — compact shafts.
 * Fins are offset along the spine and staggered in Y/Z so handles don’t stack; smaller meshes + thinner torii.
 * Picking prefers axis → slide → spine → fin size → fin angle when rays hit overlapping geometry.
 */
import * as THREE from 'three';
import { get } from 'svelte/store';
import type { Tool } from '../store/index';
import type { FishSpeciesId } from '../store/core';
import {
  PISCINA_DV_HALF_MAX,
  PISCINA_DV_HALF_MIN,
  PISCINA_LATERAL_HALF_MAX,
  PISCINA_LATERAL_HALF_MIN,
  piscinaLength,
  piscinaFinDorsal,
  piscinaFinAnal,
  piscinaFinCaudal,
  piscinaFinPectoral,
  piscinaFinPelvic,
  piscinaFinAdipose,
  piscinaShowFinDorsal,
  piscinaShowFinAnal,
  piscinaShowFinCaudal,
  piscinaShowFinPectoral,
  piscinaShowFinPelvic,
  piscinaShowFinAdipose,
  piscinaWidth,
  piscinaThickness,
  piscinaAnchorOffsetU,
  piscinaAnchorOffsetV,
  piscinaSpineBend,
  piscinaSpineSCurve,
  piscinaFinDorsalPitch,
  piscinaFinDorsalSweep,
  piscinaFinAnalPitch,
  piscinaFinCaudalSpread,
  piscinaFinPectoralCant,
  piscinaSpecies
} from '../store/index';
import { getPiscinaFinT } from '../store/generators/piscina/species';
import { previewOccludedTintInto } from './previewMeshUtils';

export type PiscinaGizmoFrame = {
  center: [number, number, number];
  forward: [number, number, number];
  side: [number, number, number];
  up: [number, number, number];
};

export type PiscinaFinGizmoId =
  | 'dorsal'
  | 'adipose'
  | 'anal'
  | 'caudal'
  | 'pectoral'
  | 'pelvic';

const AXIS_DRAG_SENSITIVITY = 0.58;
const TRANSLATE_DRAG_SENSITIVITY = 0.55;
const SPINE_DRAG_SENSITIVITY = 1.85;
const FIN_ROT_RAD_TO_DEG = 180 / Math.PI;

export type PiscinaGizmoDeps = {
  getTool: () => Tool;
  getPointer: () => THREE.Vector2;
  getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
  getRaycaster: () => THREE.Raycaster;
  getContainer: () => HTMLDivElement | null;
  getFrame: () => PiscinaGizmoFrame | null;
  getGizmosAlwaysOnTop: () => boolean;
  render: () => void;
  onPiscinaGizmoDragChange?: (dragging: boolean) => void;
};

const GIZMO_RENDER_ORDER_VISIBLE = 1001;
const GIZMO_RENDER_ORDER_ON_TOP = 9999;

type HandleKind = 'axis' | 'translate' | 'fin' | 'spine' | 'finRot';

type PickedHandle =
  | { kind: 'axis'; axis: 0 | 1 | 2 }
  | { kind: 'translate' }
  | { kind: 'fin'; finId: PiscinaFinGizmoId }
  | { kind: 'spine' }
  | { kind: 'finRot'; finId: PiscinaFinGizmoId };

function createGizmoVisibleMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false
  });
}

function createGizmoOccludedMaterial(baseHex: number, opacity: number): THREE.MeshBasicMaterial {
  const occludedColorScratch = new THREE.Color();
  previewOccludedTintInto(baseHex, occludedColorScratch);
  return new THREE.MeshBasicMaterial({
    color: occludedColorScratch.clone(),
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}

function axisVectorFromWorld(
  axis: 0 | 1 | 2,
  forward: THREE.Vector3,
  side: THREE.Vector3,
  up: THREE.Vector3
): THREE.Vector3 {
  if (axis === 0) return forward;
  if (axis === 1) return side;
  return up;
}

function gizmoPlaneNormalForWorldAxis(
  axis: 0 | 1 | 2,
  camera: THREE.Camera,
  forward: THREE.Vector3,
  side: THREE.Vector3,
  up: THREE.Vector3
): THREE.Vector3 {
  const ax = axisVectorFromWorld(axis, forward, side, up);
  const gizmoCamDir = new THREE.Vector3();
  camera.getWorldDirection(gizmoCamDir);
  const gizmoPlaneNormalScratch = new THREE.Vector3();
  gizmoPlaneNormalScratch.copy(gizmoCamDir).addScaledVector(ax, -gizmoCamDir.dot(ax));
  if (gizmoPlaneNormalScratch.lengthSq() < 1e-8) {
    gizmoPlaneNormalScratch.crossVectors(ax, new THREE.Vector3(0, 1, 0));
    if (gizmoPlaneNormalScratch.lengthSq() < 1e-8) {
      gizmoPlaneNormalScratch.set(0, 1, 0);
    }
  }
  return gizmoPlaneNormalScratch.normalize();
}

function gizmoPlaneNormalForVector(
  dragAxis: THREE.Vector3,
  camera: THREE.Camera
): THREE.Vector3 {
  const gizmoCamDir = new THREE.Vector3();
  camera.getWorldDirection(gizmoCamDir);
  const ax = dragAxis.clone().normalize();
  const out = new THREE.Vector3()
    .copy(gizmoCamDir)
    .addScaledVector(ax, -gizmoCamDir.dot(ax));
  if (out.lengthSq() < 1e-8) {
    out.crossVectors(ax, new THREE.Vector3(0, 1, 0));
    if (out.lengthSq() < 1e-8) out.set(0, 1, 0);
  }
  return out.normalize();
}

function finDragWorldAxis(
  finId: PiscinaFinGizmoId,
  forward: THREE.Vector3,
  side: THREE.Vector3,
  up: THREE.Vector3
): THREE.Vector3 {
  switch (finId) {
    case 'dorsal':
      return up.clone();
    case 'anal':
      return up.clone();
    case 'caudal':
      return forward.clone().multiplyScalar(-1);
    case 'pectoral':
      return side.clone();
    case 'pelvic':
      return up.clone().multiplyScalar(-1);
    case 'adipose':
      return up.clone();
    default:
      return up.clone();
  }
}

function tagFinMesh(m: THREE.Mesh, finId: PiscinaFinGizmoId) {
  m.userData.kind = 'fin' as const;
  m.userData.finId = finId;
}

function tagFinRotMesh(m: THREE.Mesh, finId: PiscinaFinGizmoId) {
  m.userData.kind = 'finRot' as const;
  m.userData.finId = finId;
}

function wrapAngleRad(d: number): number {
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

type AxisArmCompact = { shaftLen?: number; shaftR?: number; coneR?: number; coneH?: number };

function addAxisArm(
  parent: THREE.Group,
  axis: 0 | 1 | 2,
  color: number,
  ordVis: number,
  ordOcc: number,
  compact?: AxisArmCompact
) {
  const shaftR = compact?.shaftR ?? 0.17;
  const shaftLen = compact?.shaftLen ?? 2.05;
  const coneR = compact?.coneR ?? 0.28;
  const coneH = compact?.coneH ?? 0.55;
  const matVis = createGizmoVisibleMaterial(color, 0.96);
  const matOcc = createGizmoOccludedMaterial(color, 0.4);
  const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 14);
  const coneGeo = new THREE.ConeGeometry(coneR, coneH, 12);
  const shaft = new THREE.Mesh(shaftGeo, matVis);
  const cone = new THREE.Mesh(coneGeo, matVis);
  const shaftOcc = new THREE.Mesh(shaftGeo, matOcc);
  const coneOcc = new THREE.Mesh(coneGeo, matOcc);
  shaft.renderOrder = ordVis;
  cone.renderOrder = ordVis;
  shaftOcc.renderOrder = ordOcc;
  coneOcc.renderOrder = ordOcc;
  shaftOcc.userData.voxelleGizmoOccluded = true;
  coneOcc.userData.voxelleGizmoOccluded = true;
  shaftOcc.raycast = () => {};
  coneOcc.raycast = () => {};
  for (const m of [shaft, cone]) {
    m.userData.axis = axis;
    m.userData.kind = 'axis';
  }
  const arm = new THREE.Group();
  arm.userData.axis = axis;
  arm.userData.kind = 'axis';
  if (axis === 0) {
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(shaftLen / 2, 0, 0);
    cone.rotation.z = -Math.PI / 2;
    cone.position.set(shaftLen + coneH / 2, 0, 0);
    shaftOcc.rotation.copy(shaft.rotation);
    shaftOcc.position.copy(shaft.position);
    coneOcc.rotation.copy(cone.rotation);
    coneOcc.position.copy(cone.position);
  } else if (axis === 1) {
    shaft.position.set(0, shaftLen / 2, 0);
    cone.position.set(0, shaftLen + coneH / 2, 0);
    shaftOcc.rotation.copy(shaft.rotation);
    shaftOcc.position.copy(shaft.position);
    coneOcc.rotation.copy(cone.rotation);
    coneOcc.position.copy(cone.position);
  } else {
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.set(0, 0, shaftLen / 2);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0, shaftLen + coneH / 2);
    shaftOcc.rotation.copy(shaft.rotation);
    shaftOcc.position.copy(shaft.position);
    coneOcc.rotation.copy(cone.rotation);
    coneOcc.position.copy(cone.position);
  }
  arm.add(shaftOcc, coneOcc, shaft, cone);
  parent.add(arm);
}

export type PiscinaGizmoLayout = {
  dorsal: THREE.Group;
  adipose: THREE.Group;
  anal: THREE.Group;
  caudal: THREE.Group;
  pectoral: THREE.Group;
  pelvic: THREE.Group;
  spine: THREE.Group;
};

/** Shorter, thinner body axes so they don’t overlap fin clusters as much. */
const PISCINA_AXIS_COMPACT: AxisArmCompact = {
  shaftLen: 1.38,
  shaftR: 0.12,
  coneR: 0.22,
  coneH: 0.42
};

export function createPiscinaGizmoGroup(): THREE.Group {
  const group = new THREE.Group();
  const ordVis = 1001;
  const ordOcc = 1000;

  addAxisArm(group, 0, 0xff4466, ordVis, ordOcc, PISCINA_AXIS_COMPACT);
  addAxisArm(group, 1, 0x44ff66, ordVis, ordOcc, PISCINA_AXIS_COMPACT);
  addAxisArm(group, 2, 0x4488ff, ordVis, ordOcc, PISCINA_AXIS_COMPACT);

  /** Dorsal: sail along +Z (local up); ring offset further on +Z. */
  const dorsalG = new THREE.Group();
  dorsalG.name = 'piscinaFinDorsal';
  {
    const mat = createGizmoVisibleMaterial(0x22ccee, 0.94);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.62, 3), mat);
    sail.rotation.x = -Math.PI / 2;
    sail.position.set(0, 0, 0.32);
    tagFinMesh(sail, 'dorsal');
    dorsalG.add(sail);
    {
      const ringGeo = new THREE.TorusGeometry(0.36, 0.022, 8, 26);
      const ringMat = createGizmoVisibleMaterial(0x88ddff, 0.72);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0, 0.86);
      tagFinRotMesh(ring, 'dorsal');
      dorsalG.add(ring);
    }
  }
  group.add(dorsalG);

  /** Adipose: small ridge dorsally between main dorsal and tail (no angle ring). */
  const adiposeG = new THREE.Group();
  adiposeG.name = 'piscinaFinAdipose';
  {
    const mat = createGizmoVisibleMaterial(0x66ddaa, 0.9);
    const lump = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 4), mat);
    lump.rotation.x = -Math.PI / 2;
    lump.position.set(0, 0, 0.2);
    tagFinMesh(lump, 'adipose');
    adiposeG.add(lump);
  }
  group.add(adiposeG);

  /** Anal: cone along -Z (local down). */
  const analG = new THREE.Group();
  analG.name = 'piscinaFinAnal';
  {
    const mat = createGizmoVisibleMaterial(0x5588dd, 0.92);
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.42, 5), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(0, 0, -0.32);
    tagFinMesh(m, 'anal');
    analG.add(m);
    {
      const ringGeo = new THREE.TorusGeometry(0.32, 0.022, 8, 22);
      const ringMat = createGizmoVisibleMaterial(0x99bbee, 0.72);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0, -0.78);
      tagFinRotMesh(ring, 'anal');
      analG.add(ring);
    }
  }
  group.add(analG);

  /** Caudal: fork lobes along Z (up/down); ring tail-ward (+X). */
  const caudalG = new THREE.Group();
  caudalG.name = 'piscinaFinCaudal';
  {
    const mat = createGizmoVisibleMaterial(0xff8844, 0.93);
    for (const sign of [-1, 1] as const) {
      const lobe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.42), mat);
      lobe.position.set(0.28, sign * 0.13, sign * 0.22);
      lobe.rotation.set(sign * 0.45, 0.38, 0.12);
      tagFinMesh(lobe, 'caudal');
      caudalG.add(lobe);
    }
    {
      const ringGeo = new THREE.TorusGeometry(0.4, 0.022, 8, 26);
      const ringMat = createGizmoVisibleMaterial(0xffbb88, 0.72);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0.56, 0, 0);
      tagFinRotMesh(ring, 'caudal');
      caudalG.add(ring);
    }
  }
  group.add(caudalG);

  /** Pectoral: paddle along +Y (local side); ring follows. */
  const pectoralG = new THREE.Group();
  pectoralG.name = 'piscinaFinPectoral';
  {
    const mat = createGizmoVisibleMaterial(0xee66aa, 0.92);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.28), mat);
    pad.position.set(0, 0.58, -0.04);
    pad.rotation.x = 0.2;
    pad.rotation.z = -0.35;
    tagFinMesh(pad, 'pectoral');
    pectoralG.add(pad);
    {
      const ringGeo = new THREE.TorusGeometry(0.34, 0.022, 8, 26);
      const ringMat = createGizmoVisibleMaterial(0xffaacc, 0.72);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0, 0.82, -0.04);
      tagFinRotMesh(ring, 'pectoral');
      pectoralG.add(ring);
    }
  }
  group.add(pectoralG);

  /** Pelvic: paired ventral fins (size only — no angle ring). */
  const pelvicG = new THREE.Group();
  pelvicG.name = 'piscinaFinPelvic';
  {
    const mat = createGizmoVisibleMaterial(0x8899ee, 0.9);
    for (const sign of [-1, 1] as const) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 4), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(0, sign * 0.22, -0.26);
      m.rotation.z = sign * 0.25;
      tagFinMesh(m, 'pelvic');
      pelvicG.add(m);
    }
  }
  group.add(pelvicG);

  /** Spine bend handle — slightly smaller cube. */
  const spineG = new THREE.Group();
  spineG.name = 'piscinaSpine';
  {
    const mat = createGizmoVisibleMaterial(0xccaa44, 0.92);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat);
    box.userData.kind = 'spine' as const;
    spineG.add(box);
  }
  group.add(spineG);

  group.userData.piscinaLayout = {
    dorsal: dorsalG,
    adipose: adiposeG,
    anal: analG,
    caudal: caudalG,
    pectoral: pectoralG,
    pelvic: pelvicG,
    spine: spineG
  } satisfies PiscinaGizmoLayout;

  const sphereR = 0.26;
  const sphereGeo = new THREE.SphereGeometry(sphereR, 14, 10);
  const matS = createGizmoVisibleMaterial(0xeedd88, 0.95);
  const matSOcc = createGizmoOccludedMaterial(0xeedd88, 0.45);
  const sp = new THREE.Mesh(sphereGeo, matS);
  const spOcc = new THREE.Mesh(sphereGeo, matSOcc);
  sp.userData.kind = 'translate';
  spOcc.userData.kind = 'translate';
  spOcc.userData.voxelleGizmoOccluded = true;
  spOcc.raycast = () => {};
  sp.renderOrder = ordVis;
  spOcc.renderOrder = ordOcc;
  const tr = new THREE.Group();
  tr.userData.kind = 'translate';
  tr.add(spOcc, sp);
  group.add(tr);

  group.visible = false;
  return group;
}

/**
 * Fish pipeline uses t=0 at head, t=1 at tail; spine offset ui increases nose→tail.
 * Gizmo local +X is `forward` from `makeBasis(forward, side, up)` — same direction.
 */
function spineLocalXAlongBody(tBody: number, lengthVox: number): number {
  const tLen = Math.min(1, Math.max(0, (lengthVox - 4) / (72 - 4)));
  const halfLen = 0.36 + tLen * 0.64;
  return (tBody - 0.5) * 2 * halfLen;
}

function setupFinRotPlane(
  finId: PiscinaFinGizmoId,
  forward: THREE.Vector3,
  side: THREE.Vector3,
  up: THREE.Vector3,
  n: THREE.Vector3,
  e1: THREE.Vector3,
  e2: THREE.Vector3
): void {
  if (finId === 'dorsal' || finId === 'anal') {
    n.copy(side);
    e1.copy(forward).addScaledVector(n, -forward.dot(n));
    if (e1.lengthSq() < 1e-6) e1.copy(up).addScaledVector(n, -up.dot(n));
    e1.normalize();
    e2.crossVectors(n, e1).normalize();
  } else {
    n.copy(forward);
    e1.copy(side).addScaledVector(n, -side.dot(n));
    if (e1.lengthSq() < 1e-6) e1.copy(up).addScaledVector(n, -up.dot(n));
    e1.normalize();
    e2.crossVectors(n, e1).normalize();
  }
}

function layoutFinGroups(
  group: THREE.Group,
  lengthVox: number,
  species: FishSpeciesId
): void {
  const layout = group.userData.piscinaLayout as PiscinaGizmoLayout | undefined;
  if (!layout) return;
  const finT = getPiscinaFinT(species);
  const xP = spineLocalXAlongBody(finT.pectoral, lengthVox);
  const xD = spineLocalXAlongBody(finT.dorsal, lengthVox);
  const xAd = spineLocalXAlongBody(finT.adipose, lengthVox);
  const xA = spineLocalXAlongBody(finT.anal, lengthVox);
  const xPv = spineLocalXAlongBody(finT.pelvic, lengthVox);
  const xC = spineLocalXAlongBody(finT.caudal, lengthVox);
  const xS = spineLocalXAlongBody(finT.spine, lengthVox);
  /** Spread handles in local Y/Z so body axes, fins, and spine don’t stack on one point. */
  layout.pectoral.position.set(xP, 0.18, -0.22);
  layout.dorsal.position.set(xD, 0.12, 0);
  layout.adipose.position.set(xAd, 0.06, 0.1);
  layout.anal.position.set(xA, -0.12, 0);
  layout.pelvic.position.set(xPv, 0.02, -0.2);
  layout.caudal.position.set(xC, 0, 0);
  layout.spine.position.set(xS, 0.1, 0.24);
  for (const ch of group.children) {
    if (ch instanceof THREE.Group && ch.userData.kind === 'translate') {
      ch.position.set(0.12, 0.4, 0);
    }
  }
}

export function createPiscinaGizmoController(deps: PiscinaGizmoDeps) {
  let isDrag = false;
  let pointerId: number | null = null;
  let dragKind: HandleKind | null = null;
  let dragAxis: 0 | 1 | 2 | null = null;
  let dragFinId: PiscinaFinGizmoId | null = null;
  const gizmoWorldStart = new THREE.Vector3();
  const gizmoDragPlane = new THREE.Plane();
  const gizmoHitScratch = new THREE.Vector3();
  const gizmoDeltaScratch = new THREE.Vector3();
  const planePointScratch = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const finAxisScratch = new THREE.Vector3();
  const finRotPivot = new THREE.Vector3();
  const finRotNormal = new THREE.Vector3();
  const finRotE1 = new THREE.Vector3();
  const finRotE2 = new THREE.Vector3();
  const finRotDeltaScratch = new THREE.Vector3();
  let finRotAngleStart = 0;
  let baseFinRotValue = 0;
  let baseSpineBend = 0;
  let baseSpineSCurve = 0;
  let baseLength = 0;
  let baseWidth = 0;
  let baseThickness = 0;
  let baseDorsal = 0;
  let baseAnal = 0;
  let baseCaudal = 0;
  let basePectoral = 0;
  let basePelvic = 0;
  let baseAdipose = 0;
  let baseOffU = 0;
  let baseOffV = 0;
  let appliedGizmosAlwaysOnTop: boolean | undefined;

  function syncGizmoAlwaysOnTopStyle(group: THREE.Group) {
    const onTop = deps.getGizmosAlwaysOnTop();
    if (appliedGizmosAlwaysOnTop === onTop) return;
    appliedGizmosAlwaysOnTop = onTop;
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData.voxelleGizmoOccluded === true) {
        obj.visible = !onTop;
        return;
      }
      const mat = obj.material;
      if (!(mat instanceof THREE.MeshBasicMaterial)) return;
      if (onTop) {
        mat.depthTest = false;
        mat.depthFunc = THREE.LessEqualDepth;
        obj.renderOrder = GIZMO_RENDER_ORDER_ON_TOP;
      } else {
        mat.depthTest = true;
        mat.depthFunc = THREE.LessEqualDepth;
        obj.renderOrder = GIZMO_RENDER_ORDER_VISIBLE;
      }
    });
  }

  function hitToPicked(obj: THREE.Object3D, root: THREE.Group): PickedHandle | null {
    let o: THREE.Object3D | null = obj;
    while (o && o !== root) {
      const kind = o.userData.kind as HandleKind | undefined;
      if (kind === 'translate') return { kind: 'translate' };
      if (
        kind === 'axis' &&
        (o.userData.axis === 0 || o.userData.axis === 1 || o.userData.axis === 2)
      ) {
        return { kind: 'axis', axis: o.userData.axis as 0 | 1 | 2 };
      }
      if (kind === 'finRot' && o.userData.finId) {
        return { kind: 'finRot', finId: o.userData.finId as PiscinaFinGizmoId };
      }
      if (kind === 'fin' && o.userData.finId) {
        return { kind: 'fin', finId: o.userData.finId as PiscinaFinGizmoId };
      }
      if (kind === 'spine') return { kind: 'spine' };
      o = o.parent;
    }
    return null;
  }

  function pickHandle(group: THREE.Group): PickedHandle | null {
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    const pointer = deps.getPointer();
    if (!group.visible || deps.getTool() !== 'piscina' || !camera) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(group.children, true);
    if (hits.length === 0) return null;
    const d0 = hits[0]!.distance;
    const band = Math.max(0.18, d0 * 0.12);
    const near = hits.filter((h) => h.distance <= d0 + band);
    const order: HandleKind[] = ['axis', 'translate', 'spine', 'fin', 'finRot'];
    for (const kind of order) {
      for (const h of near) {
        const picked = hitToPicked(h.object, group);
        if (picked?.kind === kind) return picked;
      }
    }
    return null;
  }

  function updatePiscinaGizmoTransform(group: THREE.Group) {
    syncGizmoAlwaysOnTopStyle(group);
    const camera = deps.getCamera();
    const frame = deps.getFrame();
    if (!camera || !frame) {
      group.visible = false;
      return;
    }
    const [cx, cy, cz] = frame.center;
    forward.set(...frame.forward);
    side.set(...frame.side);
    up.set(...frame.up);
    const basis = new THREE.Matrix4();
    basis.makeBasis(forward, side, up);
    group.setRotationFromMatrix(basis);
    group.position.set(cx, cy, cz);
    const dist = Math.hypot(camera.position.x - cx, camera.position.y - cy, camera.position.z - cz);
    const sc = Math.max(0.44, Math.min(3.49, dist * 0.059));
    group.scale.setScalar(sc);
    layoutFinGroups(group, get(piscinaLength), get(piscinaSpecies));
    const layout = group.userData.piscinaLayout as PiscinaGizmoLayout | undefined;
    if (layout) {
      layout.dorsal.visible = get(piscinaShowFinDorsal);
      layout.adipose.visible = get(piscinaShowFinAdipose);
      layout.anal.visible = get(piscinaShowFinAnal);
      layout.caudal.visible = get(piscinaShowFinCaudal);
      layout.pectoral.visible = get(piscinaShowFinPectoral);
      layout.pelvic.visible = get(piscinaShowFinPelvic);
    }
    group.visible = true;
  }

  function tryPointerDown(event: PointerEvent, group: THREE.Group): boolean {
    if (event.button !== 0 || deps.getTool() !== 'piscina') return false;
    const frame = deps.getFrame();
    const container = deps.getContainer();
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    if (!frame || !container || !camera) return false;

    updatePiscinaGizmoTransform(group);
    const picked = pickHandle(group);
    if (!picked) return false;

    event.preventDefault();
    event.stopPropagation();
    deps.onPiscinaGizmoDragChange?.(true);
    container.setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    isDrag = true;
    dragKind = picked.kind;
    dragAxis = picked.kind === 'axis' ? picked.axis : null;
    dragFinId =
      picked.kind === 'fin' || picked.kind === 'finRot' ? picked.finId : null;

    forward.set(...frame.forward);
    side.set(...frame.side);
    up.set(...frame.up);

    baseLength = get(piscinaLength);
    baseWidth = get(piscinaThickness);
    baseThickness = get(piscinaWidth);
    baseDorsal = get(piscinaFinDorsal);
    baseAnal = get(piscinaFinAnal);
    baseCaudal = get(piscinaFinCaudal);
    basePectoral = get(piscinaFinPectoral);
    basePelvic = get(piscinaFinPelvic);
    baseAdipose = get(piscinaFinAdipose);
    baseOffU = get(piscinaAnchorOffsetU);
    baseOffV = get(piscinaAnchorOffsetV);
    baseSpineBend = get(piscinaSpineBend);
    baseSpineSCurve = get(piscinaSpineSCurve);

    const [cx, cy, cz] = frame.center;
    planePointScratch.set(cx, cy, cz);

    if (picked.kind === 'axis') {
      const pn = gizmoPlaneNormalForWorldAxis(picked.axis, camera, forward, side, up);
      gizmoDragPlane.setFromNormalAndCoplanarPoint(pn, planePointScratch);
    } else if (picked.kind === 'fin') {
      finAxisScratch.copy(finDragWorldAxis(picked.finId, forward, side, up));
      const pn = gizmoPlaneNormalForVector(finAxisScratch, camera);
      gizmoDragPlane.setFromNormalAndCoplanarPoint(pn, planePointScratch);
    } else if (picked.kind === 'finRot') {
      const layout = group.userData.piscinaLayout as PiscinaGizmoLayout | undefined;
      const finGrp =
        picked.finId === 'dorsal'
          ? layout?.dorsal
          : picked.finId === 'adipose'
            ? layout?.adipose
            : picked.finId === 'anal'
              ? layout?.anal
              : picked.finId === 'caudal'
                ? layout?.caudal
                : picked.finId === 'pelvic'
                  ? layout?.pelvic
                  : layout?.pectoral;
      if (finGrp) finGrp.getWorldPosition(finRotPivot);
      else finRotPivot.set(cx, cy, cz);
      setupFinRotPlane(picked.finId, forward, side, up, finRotNormal, finRotE1, finRotE2);
      gizmoDragPlane.setFromNormalAndCoplanarPoint(finRotNormal, finRotPivot);
      if (picked.finId === 'dorsal') baseFinRotValue = get(piscinaFinDorsalPitch);
      else if (picked.finId === 'anal') baseFinRotValue = get(piscinaFinAnalPitch);
      else if (picked.finId === 'caudal') baseFinRotValue = get(piscinaFinCaudalSpread);
      else baseFinRotValue = get(piscinaFinPectoralCant);
    } else if (picked.kind === 'spine') {
      gizmoDragPlane.setFromNormalAndCoplanarPoint(forward, planePointScratch);
    } else {
      const pn = new THREE.Vector3(...frame.up);
      gizmoDragPlane.setFromNormalAndCoplanarPoint(pn, planePointScratch);
    }

    raycaster.setFromCamera(deps.getPointer(), camera);
    if (!raycaster.ray.intersectPlane(gizmoDragPlane, gizmoWorldStart)) {
      gizmoWorldStart.copy(planePointScratch);
    }

    if (picked.kind === 'finRot') {
      finRotDeltaScratch.copy(gizmoWorldStart).sub(finRotPivot);
      finRotDeltaScratch.addScaledVector(finRotNormal, -finRotDeltaScratch.dot(finRotNormal));
      finRotAngleStart = Math.atan2(
        finRotDeltaScratch.dot(finRotE2),
        finRotDeltaScratch.dot(finRotE1)
      );
    }

    requestAnimationFrame(() => deps.render());
    return true;
  }

  function handlePointerMove(_event: PointerEvent | undefined): boolean {
    if (!isDrag || !dragKind) return false;
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    const frame = deps.getFrame();
    if (!camera || !frame) return true;
    forward.set(...frame.forward);
    side.set(...frame.side);
    up.set(...frame.up);

    raycaster.setFromCamera(deps.getPointer(), camera);
    if (!raycaster.ray.intersectPlane(gizmoDragPlane, gizmoHitScratch)) {
      deps.render();
      return true;
    }

    if (dragKind === 'axis' && dragAxis !== null) {
      const ax = axisVectorFromWorld(dragAxis, forward, side, up);
      const along = gizmoDeltaScratch.copy(gizmoHitScratch).sub(gizmoWorldStart).dot(ax);
      const steps = Math.round(along * AXIS_DRAG_SENSITIVITY);
      if (dragAxis === 0) {
        piscinaLength.set(Math.max(4, Math.min(72, baseLength + steps)));
      } else if (dragAxis === 1) {
        piscinaThickness.set(
          Math.max(PISCINA_LATERAL_HALF_MIN, Math.min(PISCINA_LATERAL_HALF_MAX, baseWidth + steps))
        );
      } else {
        piscinaWidth.set(
          Math.max(PISCINA_DV_HALF_MIN, Math.min(PISCINA_DV_HALF_MAX, baseThickness + steps))
        );
      }
    } else if (dragKind === 'fin' && dragFinId) {
      finAxisScratch.copy(finDragWorldAxis(dragFinId, forward, side, up));
      let along = gizmoDeltaScratch.copy(gizmoHitScratch).sub(gizmoWorldStart).dot(finAxisScratch);
      if (dragFinId === 'anal' || dragFinId === 'pelvic') along = -along;
      const steps = Math.round(along * AXIS_DRAG_SENSITIVITY);
      const apply = (base: number, setter: (n: number) => void) => {
        setter(Math.max(1, Math.min(8, base + steps)));
      };
      if (dragFinId === 'dorsal') apply(baseDorsal, (n) => piscinaFinDorsal.set(n));
      else if (dragFinId === 'adipose') apply(baseAdipose, (n) => piscinaFinAdipose.set(n));
      else if (dragFinId === 'anal') apply(baseAnal, (n) => piscinaFinAnal.set(n));
      else if (dragFinId === 'caudal') apply(baseCaudal, (n) => piscinaFinCaudal.set(n));
      else if (dragFinId === 'pelvic') apply(basePelvic, (n) => piscinaFinPelvic.set(n));
      else apply(basePectoral, (n) => piscinaFinPectoral.set(n));
    } else if (dragKind === 'finRot' && dragFinId) {
      setupFinRotPlane(dragFinId, forward, side, up, finRotNormal, finRotE1, finRotE2);
      finRotDeltaScratch.copy(gizmoHitScratch).sub(finRotPivot);
      finRotDeltaScratch.addScaledVector(finRotNormal, -finRotDeltaScratch.dot(finRotNormal));
      const a1 = Math.atan2(
        finRotDeltaScratch.dot(finRotE2),
        finRotDeltaScratch.dot(finRotE1)
      );
      const deltaDeg = wrapAngleRad(a1 - finRotAngleStart) * FIN_ROT_RAD_TO_DEG;
      if (dragFinId === 'dorsal') {
        piscinaFinDorsalPitch.set(Math.max(-45, Math.min(45, baseFinRotValue + deltaDeg)));
      } else if (dragFinId === 'anal') {
        piscinaFinAnalPitch.set(Math.max(-45, Math.min(45, baseFinRotValue + deltaDeg)));
      } else if (dragFinId === 'caudal') {
        piscinaFinCaudalSpread.set(Math.max(0, Math.min(45, baseFinRotValue + deltaDeg)));
      } else {
        piscinaFinPectoralCant.set(Math.max(-45, Math.min(45, baseFinRotValue + deltaDeg)));
      }
    } else if (dragKind === 'spine') {
      const delta = gizmoDeltaScratch.copy(gizmoHitScratch).sub(gizmoWorldStart);
      const dBend = delta.dot(side) * SPINE_DRAG_SENSITIVITY * 0.012;
      const dS = delta.dot(up) * SPINE_DRAG_SENSITIVITY * 0.012;
      piscinaSpineBend.set(Math.max(-1, Math.min(1, baseSpineBend + dBend)));
      piscinaSpineSCurve.set(Math.max(-1, Math.min(1, baseSpineSCurve + dS)));
    } else if (dragKind === 'translate') {
      const delta = gizmoDeltaScratch.copy(gizmoHitScratch).sub(gizmoWorldStart);
      const duI = Math.round(delta.dot(forward) * TRANSLATE_DRAG_SENSITIVITY);
      const dvI = Math.round(delta.dot(side) * TRANSLATE_DRAG_SENSITIVITY);
      piscinaAnchorOffsetU.set(Math.max(-24, Math.min(24, baseOffU + duI)));
      piscinaAnchorOffsetV.set(Math.max(-24, Math.min(24, baseOffV + dvI)));
    }

    deps.render();
    return true;
  }

  function tryPrimaryPointerUp(event: PointerEvent): boolean {
    if (event.button !== 0 || !isDrag || pointerId !== event.pointerId) return false;
    const container = deps.getContainer();
    if (container) {
      try {
        container.releasePointerCapture(event.pointerId);
      } catch (_) {}
    }
    pointerId = null;
    isDrag = false;
    dragKind = null;
    dragAxis = null;
    dragFinId = null;
    deps.onPiscinaGizmoDragChange?.(false);
    return true;
  }

  function cancelDrag() {
    if (!isDrag) return;
    const container = deps.getContainer();
    if (pointerId !== null && container) {
      try {
        container.releasePointerCapture(pointerId);
      } catch (_) {}
    }
    pointerId = null;
    isDrag = false;
    dragKind = null;
    dragAxis = null;
    dragFinId = null;
    deps.onPiscinaGizmoDragChange?.(false);
  }

  function clearHoverCursor() {
    const container = deps.getContainer();
    if (container) container.style.cursor = '';
  }

  function syncHoverCursor(group: THREE.Group) {
    const container = deps.getContainer();
    if (!container || deps.getTool() !== 'piscina') {
      clearHoverCursor();
      return;
    }
    if (isDrag) {
      container.style.cursor = 'grabbing';
      return;
    }
    updatePiscinaGizmoTransform(group);
    const picked = pickHandle(group);
    if (picked) container.style.cursor = picked.kind === 'translate' ? 'move' : 'grab';
    else clearHoverCursor();
  }

  return {
    updatePiscinaGizmoTransform,
    tryPointerDown,
    handlePointerMove,
    tryPrimaryPointerUp,
    cancelDrag,
    syncHoverCursor,
    clearHoverCursor,
    pickHandle,
    get isGizmoDrag() {
      return isDrag;
    }
  };
}
