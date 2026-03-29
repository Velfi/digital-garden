import * as THREE from 'three';
import { previewOccludedTintInto } from '../previewMeshUtils';

export type SquishyGizmoSelected = {
  x: number;
  y: number;
  z: number;
  radius: number;
};

type SquishyHandleKind = 'moveX' | 'moveY' | 'moveZ' | 'scale';

export type SquishyGizmoDeps = {
  getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
  getPointer: () => THREE.Vector2;
  getRaycaster: () => THREE.Raycaster;
  getContainer: () => HTMLDivElement | null;
  getSelected: () => SquishyGizmoSelected | null;
  /** When true (e.g. hold P for voxel-only preview), hide handles so metaball chrome stays off-screen. */
  getHideMetaballChrome?: () => boolean;
  onUpdate: (next: SquishyGizmoSelected) => void;
  render: () => void;
};

/** Larger than selection gizmo so squishy handles stay readable on big metaballs / zoomed views. */
const HANDLE_BASE_SCALE = 0.4;
const SCALE_HANDLE_COLOR = 0xffd166;
const AXIS_COLORS = [0xff5c66, 0x57d66d, 0x5da0ff] as const;

/** Match selection move gizmo proportions (selectionGizmo.ts createMoveGizmo). */
const SHAFT_R = 0.14;
const SHAFT_LEN = 1.75;
const CONE_R = 0.24;
const CONE_H = 0.52;
const ARROW_LEN = SHAFT_LEN + CONE_H;
/** Compact bidirectional scale handle (<->), shorter than axis move arrows. */
const SCALE_SHAFT_LEN = 0.4;
const SCALE_SHAFT_R = 0.12;
const SCALE_CONE_R = 0.19;
const SCALE_CONE_H = 0.34;
/** World scale for XYZ move arrows vs scale handle (user-requested readability). */
const AXIS_ARROW_SIZE_MULT = 5;

const GIZMO_RENDER_ORDER_ON_TOP = 9999;

const DIAG_ALIGN = new THREE.Vector3(1, 1, 1).normalize();

function buildAxisArrowArm(
  axis: 0 | 1 | 2,
  color: number,
  kind: 'moveX' | 'moveY' | 'moveZ',
  shaftGeom: THREE.CylinderGeometry,
  coneGeom: THREE.ConeGeometry,
  createVis: (c: number, o: number) => THREE.MeshBasicMaterial,
  createOcc: (c: number, o: number) => THREE.MeshBasicMaterial,
  pickMeshesOut: THREE.Mesh[],
  handleKindByUuid: Map<string, SquishyHandleKind>
): THREE.Group {
  const arm = new THREE.Group();
  const matVis = createVis(color, 0.96);
  const matOcc = createOcc(color, 0.4);
  const shaft = new THREE.Mesh(shaftGeom, matVis);
  const cone = new THREE.Mesh(coneGeom, matVis);
  const shaftOcc = new THREE.Mesh(shaftGeom, matOcc);
  const coneOcc = new THREE.Mesh(coneGeom, matOcc);
  shaft.renderOrder = GIZMO_RENDER_ORDER_ON_TOP;
  cone.renderOrder = GIZMO_RENDER_ORDER_ON_TOP;
  shaftOcc.visible = false;
  coneOcc.visible = false;
  shaftOcc.raycast = () => {};
  coneOcc.raycast = () => {};

  if (axis === 0) {
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(SHAFT_LEN / 2, 0, 0);
    cone.rotation.z = -Math.PI / 2;
    cone.position.set(SHAFT_LEN + CONE_H / 2, 0, 0);
    shaftOcc.rotation.copy(shaft.rotation);
    shaftOcc.position.copy(shaft.position);
    coneOcc.rotation.copy(cone.rotation);
    coneOcc.position.copy(cone.position);
  } else if (axis === 1) {
    shaft.position.set(0, SHAFT_LEN / 2, 0);
    cone.position.set(0, SHAFT_LEN + CONE_H / 2, 0);
    shaftOcc.rotation.copy(shaft.rotation);
    shaftOcc.position.copy(shaft.position);
    coneOcc.rotation.copy(cone.rotation);
    coneOcc.position.copy(cone.position);
  } else {
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0, SHAFT_LEN / 2);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 0, SHAFT_LEN + CONE_H / 2);
    shaftOcc.rotation.copy(shaft.rotation);
    shaftOcc.position.copy(shaft.position);
    coneOcc.rotation.copy(cone.rotation);
    coneOcc.position.copy(cone.position);
  }

  arm.add(shaftOcc, coneOcc, shaft, cone);
  for (const m of [shaft, cone]) {
    handleKindByUuid.set(m.uuid, kind);
    pickMeshesOut.push(m);
  }
  return arm;
}

/** Two cones + shafts along local ±Z (group is rotated to world diagonal for scale). */
function buildScaleDoubleArrow(
  shaftLen: number,
  coneH: number,
  shaftGeom: THREE.CylinderGeometry,
  coneGeom: THREE.ConeGeometry,
  createVis: (c: number, o: number) => THREE.MeshBasicMaterial,
  createOcc: (c: number, o: number) => THREE.MeshBasicMaterial,
  color: number,
  pickMeshesOut: THREE.Mesh[],
  handleKindByUuid: Map<string, SquishyHandleKind>
): THREE.Group {
  const arm = new THREE.Group();
  const matVis = createVis(color, 0.96);
  const matOcc = createOcc(color, 0.4);

  function addHalf(towardPlusZ: boolean) {
    const s = towardPlusZ ? 1 : -1;
    const shaft = new THREE.Mesh(shaftGeom, matVis);
    const cone = new THREE.Mesh(coneGeom, matVis);
    const shaftOcc = new THREE.Mesh(shaftGeom, matOcc);
    const coneOcc = new THREE.Mesh(coneGeom, matOcc);
    shaft.renderOrder = GIZMO_RENDER_ORDER_ON_TOP;
    cone.renderOrder = GIZMO_RENDER_ORDER_ON_TOP;
    shaftOcc.visible = false;
    coneOcc.visible = false;
    shaftOcc.raycast = () => {};
    coneOcc.raycast = () => {};

    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0, s * (shaftLen / 2));
    if (towardPlusZ) {
      cone.rotation.x = Math.PI / 2;
      cone.position.set(0, 0, shaftLen + coneH / 2);
    } else {
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(0, 0, -shaftLen - coneH / 2);
    }
    shaftOcc.rotation.copy(shaft.rotation);
    shaftOcc.position.copy(shaft.position);
    coneOcc.rotation.copy(cone.rotation);
    coneOcc.position.copy(cone.position);

    arm.add(shaftOcc, coneOcc, shaft, cone);
    handleKindByUuid.set(shaft.uuid, 'scale');
    handleKindByUuid.set(cone.uuid, 'scale');
    pickMeshesOut.push(shaft, cone);
  }

  addHalf(true);
  addHalf(false);
  return arm;
}

export function createSquishyGizmoController(deps: SquishyGizmoDeps) {
  const group = new THREE.Group();
  group.name = 'squishy-gizmo';
  group.visible = false;

  const occludedColorScratch = new THREE.Color();

  function createGizmoVisibleMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false
    });
  }

  function createGizmoOccludedMaterial(baseHex: number, opacity: number): THREE.MeshBasicMaterial {
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

  const shaftGeom = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, SHAFT_LEN, 14);
  const coneGeom = new THREE.ConeGeometry(CONE_R, CONE_H, 12);
  const scaleShaftGeom = new THREE.CylinderGeometry(
    SCALE_SHAFT_R,
    SCALE_SHAFT_R,
    SCALE_SHAFT_LEN,
    14
  );
  const scaleConeGeom = new THREE.ConeGeometry(SCALE_CONE_R, SCALE_CONE_H, 12);
  const handleKindByUuid = new Map<string, SquishyHandleKind>();
  const axisPickMeshes: THREE.Mesh[] = [];
  const scalePickMeshes: THREE.Mesh[] = [];

  const axisArms: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const arm = buildAxisArrowArm(
      i as 0 | 1 | 2,
      AXIS_COLORS[i]!,
      (['moveX', 'moveY', 'moveZ'] as const)[i]!,
      shaftGeom,
      coneGeom,
      createGizmoVisibleMaterial,
      createGizmoOccludedMaterial,
      axisPickMeshes,
      handleKindByUuid
    );
    axisArms.push(arm);
    group.add(arm);
  }

  const scaleArm = buildScaleDoubleArrow(
    SCALE_SHAFT_LEN,
    SCALE_CONE_H,
    scaleShaftGeom,
    scaleConeGeom,
    createGizmoVisibleMaterial,
    createGizmoOccludedMaterial,
    SCALE_HANDLE_COLOR,
    scalePickMeshes,
    handleKindByUuid
  );
  const scaleAlignQuat = new THREE.Quaternion();
  scaleAlignQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), DIAG_ALIGN);
  scaleArm.quaternion.copy(scaleAlignQuat);
  group.add(scaleArm);

  const dragPlane = new THREE.Plane();
  const dragStartPoint = new THREE.Vector3();
  const dragPointScratch = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const pointerHits: THREE.Intersection[] = [];

  let draggingKind: SquishyHandleKind | null = null;
  let dragStartState: SquishyGizmoSelected | null = null;
  let hoverKind: SquishyHandleKind | null = null;

  function sync() {
    const selected = deps.getSelected();
    const camera = deps.getCamera();
    if (!selected || !camera || deps.getHideMetaballChrome?.()) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const center = new THREE.Vector3(selected.x + 0.5, selected.y + 0.5, selected.z + 0.5);
    group.position.copy(center);
    const distance = center.distanceTo(camera.position);
    const handleScale = Math.max(0.22, Math.min(0.58, distance * 0.028));
    const radiusOffset = Math.max(1.2, selected.radius + 0.9);
    const s = HANDLE_BASE_SCALE * handleScale;
    const arrowS = s * AXIS_ARROW_SIZE_MULT;
    const arrowWorldLen = ARROW_LEN * arrowS;
    const armBase = Math.max(0.12, radiusOffset - arrowWorldLen);

    for (let i = 0; i < 3; i++) {
      const arm = axisArms[i]!;
      arm.scale.setScalar(arrowS);
      if (i === 0) arm.position.set(armBase, 0, 0);
      else if (i === 1) arm.position.set(0, armBase, 0);
      else arm.position.set(0, 0, armBase);
    }

    const scalePos = new THREE.Vector3(
      radiusOffset * 0.82,
      radiusOffset * 0.82,
      radiusOffset * 0.82
    );
    scaleArm.position.copy(scalePos);
    scaleArm.scale.setScalar(arrowS);
  }

  function updateHoverCursor() {
    const container = deps.getContainer();
    if (!container) return;
    if (draggingKind || hoverKind) {
      container.style.cursor = 'pointer';
    } else {
      container.style.cursor = '';
    }
  }

  function intersectHandles(): SquishyHandleKind | null {
    const camera = deps.getCamera();
    if (!camera || !group.visible) return null;
    const raycaster = deps.getRaycaster();
    raycaster.setFromCamera(deps.getPointer(), camera);
    pointerHits.length = 0;
    raycaster.intersectObjects([...axisPickMeshes, ...scalePickMeshes], false, pointerHits);
    if (pointerHits.length === 0) return null;
    return handleKindByUuid.get(pointerHits[0]!.object.uuid) ?? null;
  }

  function tryPointerDown(): boolean {
    const kind = intersectHandles();
    if (!kind) return false;
    const selected = deps.getSelected();
    const camera = deps.getCamera();
    if (!selected || !camera) return false;
    deps.getRaycaster().setFromCamera(deps.getPointer(), camera);
    camera.getWorldDirection(cameraForward);
    dragPlane.setFromNormalAndCoplanarPoint(cameraForward, group.position);
    if (!deps.getRaycaster().ray.intersectPlane(dragPlane, dragStartPoint)) return false;
    draggingKind = kind;
    dragStartState = { ...selected };
    updateHoverCursor();
    return true;
  }

  function handlePointerMove(): boolean {
    if (!group.visible) return false;
    const camera = deps.getCamera();
    if (!camera) return false;
    if (!draggingKind || !dragStartState) {
      hoverKind = intersectHandles();
      updateHoverCursor();
      return false;
    }
    const raycaster = deps.getRaycaster();
    raycaster.setFromCamera(deps.getPointer(), camera);
    if (!raycaster.ray.intersectPlane(dragPlane, dragPointScratch)) return true;
    const delta = dragPointScratch.clone().sub(dragStartPoint);
    const next = { ...dragStartState };

    if (draggingKind === 'moveX') next.x = Math.round(dragStartState.x + delta.x);
    else if (draggingKind === 'moveY') next.y = Math.round(dragStartState.y + delta.y);
    else if (draggingKind === 'moveZ') next.z = Math.round(dragStartState.z + delta.z);
    else {
      cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      const signed = delta.dot(cameraRight);
      next.radius = Math.max(0.5, Math.min(64, dragStartState.radius + signed));
    }
    deps.onUpdate(next);
    sync();
    deps.render();
    return true;
  }

  function tryPointerUp(): boolean {
    if (!draggingKind) return false;
    draggingKind = null;
    dragStartState = null;
    hoverKind = null;
    updateHoverCursor();
    return true;
  }

  function clearHoverCursor() {
    hoverKind = null;
    if (!draggingKind) updateHoverCursor();
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      }
    });
    shaftGeom.dispose();
    coneGeom.dispose();
    scaleShaftGeom.dispose();
    scaleConeGeom.dispose();
  }

  return {
    group,
    sync,
    tryPointerDown,
    handlePointerMove,
    tryPointerUp,
    clearHoverCursor,
    dispose,
    get isDragging() {
      return draggingKind !== null;
    }
  };
}
