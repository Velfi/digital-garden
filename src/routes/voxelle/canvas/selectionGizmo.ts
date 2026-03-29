/**
 * Move / rotate / scale handles for selection or Add-shape placement. Raycast, drag preview, placement store updates.
 */
import * as THREE from 'three';
import { get } from 'svelte/store';
import {
  getSelectionCenter,
  VOXELLE_SELECTION_BBOX_WIREFRAME_KEY,
  VOXELLE_SELECTION_PIVOT_CHILD_KEY
} from '../coordUtils';
import { addPanelStore, selectionGizmoMode, type Tool, type Voxel } from '../store/index';
import { previewOccludedTintInto } from './previewMeshUtils';

export type SelectionGizmoDeps = {
  getTool: () => Tool;
  getIsDrawing: () => boolean;
  getSelection: () => Map<string, Voxel>;
  getPointer: () => THREE.Vector2;
  getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
  getRaycaster: () => THREE.Raycaster;
  getMoveGroup: () => THREE.Group | null;
  getRotateGroup: () => THREE.Group | null;
  getScaleGroup: () => THREE.Group | null;
  getSelectionGroup: () => THREE.Group | null;
  getVoxelGroup: () => THREE.Group | null;
  getMoveDragLine: () => THREE.LineSegments | null;
  getShowDragDeltaHint: () => boolean;
  getContainer: () => HTMLDivElement | null;
  render: () => void;
};

export type GizmoPointerUpCommit = {
  wasPlacement: boolean;
  axis: 0 | 1 | 2 | null;
  steps: number;
  angleRad: number;
  /** When `kind === 'scale'`, per-axis factors; otherwise `[1,1,1]`. */
  scaleAxes: [number, number, number];
  kind: 'move' | 'rotate' | 'scale' | null;
};

function axisVector(axis: 0 | 1 | 2): THREE.Vector3 {
  const v = new THREE.Vector3(0, 0, 0);
  v.setComponent(axis, 1);
  return v;
}

/** Visible gizmo surfaces that participate in depth (overlay pass starts with cleared depth). */
const GIZMO_DEPTH_SURFACES_ORDER = 9998;
/** GreaterDepth tint pass after visible surfaces so handles dim where occluded by other handles. */
const GIZMO_SELF_OCCLUDED_ORDER = 9999;

export function createSelectionGizmoController(deps: SelectionGizmoDeps) {
  let isGizmoDrag = false;
  let isPlacementGizmoDrag = false;
  let placementGizmoBasePos: [number, number, number] | null = null;
  let placementGizmoBaseRot: [number, number, number] | null = null;
  let gizmoPointerId: number | null = null;
  let gizmoDragAxis: 0 | 1 | 2 | null = null;
  let gizmoAppliedSteps = 0;
  let gizmoScaleAxes: [number, number, number] = [1, 1, 1];
  let gizmoScaleBaseAlong = 1;
  let gizmoScaleHandleSign: 1 | -1 = 1;
  let gizmoDragKind: 'move' | 'rotate' | 'scale' | null = null;
  let gizmoRotatePrevAngle = 0;
  let gizmoRotateAccum = 0;
  const gizmoRotatePivotScratch = new THREE.Vector3();
  const gizmoRotateE1 = new THREE.Vector3();
  const gizmoRotateE2 = new THREE.Vector3();
  const gizmoSavedGroupPos = new THREE.Vector3();
  const gizmoRotatePivotSavedPositions = new Map<string, THREE.Vector3>();
  const gizmoDragLineFrom = new THREE.Vector3();
  const gizmoDragLineTo = new THREE.Vector3();
  let gizmoRotatePreviewActive = false;
  const gizmoWorldStart = new THREE.Vector3();
  const gizmoDragPlane = new THREE.Plane();
  const gizmoCamDir = new THREE.Vector3();
  const gizmoPlaneNormalScratch = new THREE.Vector3();
  const gizmoHitScratch = new THREE.Vector3();
  const gizmoDeltaScratch = new THREE.Vector3();
  const gizmoOffsetScratch = new THREE.Vector3();
  const planePointScratch = new THREE.Vector3();
  const occludedColorScratch = new THREE.Color();

  /** Move/scale solid pass: writes depth so other axes + occluded tint can resolve overlap. */
  function createMoveScaleGizmoVisibleMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.LessEqualDepth
    });
  }

  function createRotateGizmoRingMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.LessEqualDepth
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

  function createMoveGizmo(): THREE.Group {
    const group = new THREE.Group();
    const colors = [0xff4466, 0x44ff66, 0x4466ff];
    const shaftR = 0.14;
    const shaftLen = 1.75;
    const coneR = 0.24;
    const coneH = 0.52;

    for (let axis = 0; axis < 3; axis++) {
      const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 14);
      const coneGeo = new THREE.ConeGeometry(coneR, coneH, 12);
      const matVis = createMoveScaleGizmoVisibleMaterial(colors[axis], 0.96);
      const matOcc = createGizmoOccludedMaterial(colors[axis], 0.4);
      const shaft = new THREE.Mesh(shaftGeo, matVis);
      const cone = new THREE.Mesh(coneGeo, matVis);
      const shaftOcc = new THREE.Mesh(shaftGeo, matOcc);
      const coneOcc = new THREE.Mesh(coneGeo, matOcc);
      shaft.renderOrder = GIZMO_DEPTH_SURFACES_ORDER;
      cone.renderOrder = GIZMO_DEPTH_SURFACES_ORDER;
      shaftOcc.renderOrder = GIZMO_SELF_OCCLUDED_ORDER;
      coneOcc.renderOrder = GIZMO_SELF_OCCLUDED_ORDER;
      shaftOcc.raycast = () => {};
      coneOcc.raycast = () => {};

      const arm = new THREE.Group();
      arm.userData.axis = axis as 0 | 1 | 2;
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
        shaft.rotation.x = Math.PI / 2;
        shaft.position.set(0, 0, shaftLen / 2);
        cone.rotation.x = Math.PI / 2;
        cone.position.set(0, 0, shaftLen + coneH / 2);
        shaftOcc.rotation.copy(shaft.rotation);
        shaftOcc.position.copy(shaft.position);
        coneOcc.rotation.copy(cone.rotation);
        coneOcc.position.copy(cone.position);
      }
      arm.add(shaftOcc, coneOcc, shaft, cone);
      group.add(arm);
    }
    group.visible = false;
    return group;
  }

  function createRotateGizmo(): THREE.Group {
    const group = new THREE.Group();
    const colors = [0xff4466, 0x44ff66, 0x4466ff];
    const major = 2.24;
    const tube = 0.1;
    for (let axis = 0; axis < 3; axis++) {
      const geo = new THREE.TorusGeometry(major, tube, 12, 40);
      const matVis = createRotateGizmoRingMaterial(colors[axis], 0.9);
      const matOcc = createGizmoOccludedMaterial(colors[axis], 0.4);
      const mesh = new THREE.Mesh(geo, matVis);
      const meshOcc = new THREE.Mesh(geo, matOcc);
      mesh.renderOrder = GIZMO_DEPTH_SURFACES_ORDER;
      meshOcc.visible = false;
      meshOcc.raycast = () => {};
      const arm = new THREE.Group();
      arm.userData.axis = axis as 0 | 1 | 2;
      if (axis === 0) arm.rotation.y = Math.PI / 2;
      else if (axis === 1) arm.rotation.x = Math.PI / 2;
      arm.add(meshOcc, mesh);
      group.add(arm);
    }
    group.visible = false;
    return group;
  }

  function createScaleGizmo(): THREE.Group {
    const group = new THREE.Group();
    const colors = [0xff4466, 0x44ff66, 0x4466ff];
    const shaftR = 0.14;
    const shaftLen = 1.75;
    const boxS = 0.42;

    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [1, -1] as const) {
        const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 14);
        const boxGeo = new THREE.BoxGeometry(boxS, boxS, boxS);
        const matVis = createMoveScaleGizmoVisibleMaterial(colors[axis]!, 0.96);
        const matOcc = createGizmoOccludedMaterial(colors[axis]!, 0.4);
        const shaft = new THREE.Mesh(shaftGeo, matVis);
        const box = new THREE.Mesh(boxGeo, matVis);
        const shaftOcc = new THREE.Mesh(shaftGeo, matOcc);
        const boxOcc = new THREE.Mesh(boxGeo, matOcc);
        shaft.renderOrder = GIZMO_DEPTH_SURFACES_ORDER;
        box.renderOrder = GIZMO_DEPTH_SURFACES_ORDER;
        shaftOcc.renderOrder = GIZMO_SELF_OCCLUDED_ORDER;
        boxOcc.renderOrder = GIZMO_SELF_OCCLUDED_ORDER;
        shaftOcc.raycast = () => {};
        boxOcc.raycast = () => {};

        const arm = new THREE.Group();
        arm.userData.axis = axis as 0 | 1 | 2;
        arm.userData.scaleSign = sign;

        if (axis === 0) {
          shaft.rotation.z = Math.PI / 2;
          shaft.position.set((sign * shaftLen) / 2, 0, 0);
          box.rotation.z = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
          box.position.set(sign * (shaftLen + boxS / 2), 0, 0);
          shaftOcc.rotation.copy(shaft.rotation);
          shaftOcc.position.copy(shaft.position);
          boxOcc.rotation.copy(box.rotation);
          boxOcc.position.copy(box.position);
        } else if (axis === 1) {
          shaft.position.set(0, (sign * shaftLen) / 2, 0);
          box.position.set(0, sign * (shaftLen + boxS / 2), 0);
          shaftOcc.rotation.copy(shaft.rotation);
          shaftOcc.position.copy(shaft.position);
          boxOcc.rotation.copy(box.rotation);
          boxOcc.position.copy(box.position);
        } else {
          shaft.rotation.x = Math.PI / 2;
          shaft.position.set(0, 0, (sign * shaftLen) / 2);
          box.rotation.x = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
          box.position.set(0, 0, sign * (shaftLen + boxS / 2));
          shaftOcc.rotation.copy(shaft.rotation);
          shaftOcc.position.copy(shaft.position);
          boxOcc.rotation.copy(box.rotation);
          boxOcc.position.copy(box.position);
        }

        arm.add(shaftOcc, boxOcc, shaft, box);
        group.add(arm);
      }
    }
    group.visible = false;
    return group;
  }

  function updateMoveGizmoTransform() {
    const moveGizmoGroup = deps.getMoveGroup();
    const rotateGizmoGroup = deps.getRotateGroup();
    const scaleGizmoGroup = deps.getScaleGroup();
    const camera = deps.getCamera();
    if (!moveGizmoGroup || !rotateGizmoGroup || !scaleGizmoGroup || !camera) return;
    const mode = get(selectionGizmoMode);
    const tool = deps.getTool();
    const isDrawing = deps.getIsDrawing();
    const addOpen = get(addPanelStore).open;
    const sel = deps.getSelection();
    let gx = 0;
    let gy = 0;
    let gz = 0;
    let show = false;

    if (isDrawing) {
      moveGizmoGroup.visible = false;
      rotateGizmoGroup.visible = false;
      scaleGizmoGroup.visible = false;
      return;
    }

    const selectionGizmoAllowed =
      sel.size > 0 &&
      tool !== 'fly' &&
      tool !== 'hand' &&
      tool !== 'stamp' &&
      tool !== 'punch' &&
      tool !== 'piscina' &&
      tool !== 'insecta';

    /** Selection transform wins over add-shape placement when both exist (otherwise pointer-up skips commit). */
    if (selectionGizmoAllowed) {
      const center = getSelectionCenter(sel);
      if (!center) {
        moveGizmoGroup.visible = false;
        rotateGizmoGroup.visible = false;
        scaleGizmoGroup.visible = false;
        return;
      }
      gizmoOffsetScratch.set(0, 0, 0);
      if (
        isGizmoDrag &&
        gizmoDragKind === 'move' &&
        gizmoDragAxis !== null &&
        gizmoAppliedSteps !== 0
      ) {
        gizmoOffsetScratch.setComponent(gizmoDragAxis, gizmoAppliedSteps);
      }
      gx = center[0] + gizmoOffsetScratch.x;
      gy = center[1] + gizmoOffsetScratch.y;
      gz = center[2] + gizmoOffsetScratch.z;
      show = true;
    } else if (addOpen && tool !== 'fly' && tool !== 'hand') {
      const s = get(addPanelStore);
      gx = s.posX;
      gy = s.posY;
      gz = s.posZ;
      show = true;
    } else {
      moveGizmoGroup.visible = false;
      rotateGizmoGroup.visible = false;
      scaleGizmoGroup.visible = false;
      return;
    }

    const dist = Math.hypot(camera.position.x - gx, camera.position.y - gy, camera.position.z - gz);
    const sc = Math.max(0.44, Math.min(3.49, dist * 0.059));
    moveGizmoGroup.position.set(gx, gy, gz);
    rotateGizmoGroup.position.set(gx, gy, gz);
    scaleGizmoGroup.position.set(gx, gy, gz);
    moveGizmoGroup.scale.setScalar(sc);
    rotateGizmoGroup.scale.setScalar(sc);
    scaleGizmoGroup.scale.setScalar(sc);
    moveGizmoGroup.visible = show && mode === 'move';
    rotateGizmoGroup.visible = show && mode === 'rotate';
    scaleGizmoGroup.visible =
      show && mode === 'scale' && !(addOpen && sel.size === 0);
  }

  function updateGizmoPreviewOffset() {
    deps.getVoxelGroup()?.position.set(0, 0, 0);
    const selectionGroup = deps.getSelectionGroup();
    if (
      gizmoRotatePreviewActive &&
      (gizmoDragKind === 'rotate' || gizmoDragKind === 'scale') &&
      selectionGroup &&
      (gizmoDragKind !== 'rotate' || gizmoDragAxis !== null)
    ) {
      selectionGroup.position.copy(gizmoRotatePivotScratch);
      if (gizmoDragKind === 'rotate' && gizmoDragAxis !== null) {
        selectionGroup.setRotationFromAxisAngle(axisVector(gizmoDragAxis), gizmoRotateAccum);
      } else {
        selectionGroup.rotation.set(0, 0, 0);
      }
      if (gizmoDragKind === 'scale') {
        selectionGroup.scale.set(gizmoScaleAxes[0], gizmoScaleAxes[1], gizmoScaleAxes[2]);
      } else {
        selectionGroup.scale.setScalar(1);
      }
      const dl = deps.getMoveDragLine();
      if (dl) dl.visible = false;
      return;
    }
    gizmoOffsetScratch.set(0, 0, 0);
    if (
      isGizmoDrag &&
      !isPlacementGizmoDrag &&
      gizmoDragKind === 'move' &&
      gizmoDragAxis !== null &&
      gizmoAppliedSteps !== 0
    ) {
      gizmoOffsetScratch.setComponent(gizmoDragAxis, gizmoAppliedSteps);
    }
    selectionGroup?.position.copy(gizmoOffsetScratch);
    selectionGroup?.rotation.set(0, 0, 0);
    selectionGroup?.scale.setScalar(1);

    if (selectionGroup) {
      for (const child of selectionGroup.children) {
        if (!child.userData[VOXELLE_SELECTION_BBOX_WIREFRAME_KEY]) continue;
        const holdBboxAtSource =
          isGizmoDrag &&
          !isPlacementGizmoDrag &&
          gizmoDragKind === 'move' &&
          gizmoDragAxis !== null &&
          gizmoAppliedSteps !== 0;
        if (holdBboxAtSource) {
          child.position.set(-gizmoOffsetScratch.x, -gizmoOffsetScratch.y, -gizmoOffsetScratch.z);
        } else {
          child.position.set(0, 0, 0);
        }
      }
    }

    const dragLine = deps.getMoveDragLine();
    if (dragLine) {
      if (
        deps.getShowDragDeltaHint() &&
        isGizmoDrag &&
        !isPlacementGizmoDrag &&
        gizmoDragKind === 'move' &&
        gizmoDragAxis !== null &&
        gizmoAppliedSteps !== 0
      ) {
        const c = getSelectionCenter(deps.getSelection());
        if (c) {
          gizmoDragLineFrom.set(c[0], c[1], c[2]);
          gizmoDragLineTo.copy(gizmoDragLineFrom);
          gizmoDragLineTo.setComponent(
            gizmoDragAxis,
            gizmoDragLineTo.getComponent(gizmoDragAxis) + gizmoAppliedSteps
          );
          dragLine.geometry.setFromPoints([gizmoDragLineFrom, gizmoDragLineTo]);
          dragLine.visible = true;
        } else {
          dragLine.visible = false;
        }
      } else {
        dragLine.visible = false;
      }
    }
  }

  function pickMoveGizmoAxis(): 0 | 1 | 2 | null {
    const moveGizmoGroup = deps.getMoveGroup();
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    const pointer = deps.getPointer();
    if (!moveGizmoGroup?.visible || deps.getTool() === 'fly' || !camera) return null;
    const addOpen = get(addPanelStore).open;
    if (!addOpen && deps.getSelection().size === 0) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(moveGizmoGroup.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o !== moveGizmoGroup) {
        const ax = o.userData.axis;
        if (typeof ax === 'number' && ax >= 0 && ax <= 2) return ax as 0 | 1 | 2;
        o = o.parent;
      }
    }
    return null;
  }

  function pickRotateGizmoAxis(): 0 | 1 | 2 | null {
    const rotateGizmoGroup = deps.getRotateGroup();
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    const pointer = deps.getPointer();
    if (!rotateGizmoGroup?.visible || deps.getTool() === 'fly' || !camera) return null;
    const addOpen = get(addPanelStore).open;
    if (!addOpen && deps.getSelection().size === 0) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(rotateGizmoGroup.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o !== rotateGizmoGroup) {
        const ax = o.userData.axis;
        if (typeof ax === 'number' && ax >= 0 && ax <= 2) return ax as 0 | 1 | 2;
        o = o.parent;
      }
    }
    return null;
  }

  function pickScaleGizmo(): { axis: 0 | 1 | 2; scaleSign: 1 | -1 } | null {
    const scaleGizmoGroup = deps.getScaleGroup();
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    const pointer = deps.getPointer();
    if (!scaleGizmoGroup?.visible || deps.getTool() === 'fly' || !camera) return null;
    if (deps.getSelection().size === 0) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scaleGizmoGroup.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o !== scaleGizmoGroup) {
        const ax = o.userData.axis;
        const sg = o.userData.scaleSign;
        if (typeof ax === 'number' && ax >= 0 && ax <= 2 && (sg === 1 || sg === -1)) {
          return { axis: ax as 0 | 1 | 2, scaleSign: sg as 1 | -1 };
        }
        o = o.parent;
      }
    }
    return null;
  }

  function clearGizmoHoverCursor() {
    const container = deps.getContainer();
    if (container) container.style.cursor = '';
  }

  function syncGizmoHoverCursor() {
    const container = deps.getContainer();
    if (!container || deps.getTool() === 'fly') {
      clearGizmoHoverCursor();
      return;
    }
    if (isGizmoDrag) {
      container.style.cursor = 'grabbing';
      return;
    }
    const addOpen = get(addPanelStore).open;
    if (!addOpen && deps.getSelection().size === 0) {
      clearGizmoHoverCursor();
      return;
    }
    const camera = deps.getCamera();
    if (!camera || !deps.getMoveGroup() || !deps.getRotateGroup() || !deps.getScaleGroup()) {
      clearGizmoHoverCursor();
      return;
    }
    updateMoveGizmoTransform();
    const mode = get(selectionGizmoMode);
    const hasHandle =
      mode === 'move'
        ? pickMoveGizmoAxis() !== null
        : mode === 'rotate'
          ? pickRotateGizmoAxis() !== null
          : pickScaleGizmo() !== null;
    if (!hasHandle) {
      clearGizmoHoverCursor();
      return;
    }
    if (mode === 'rotate') {
      container.style.cursor = 'grab';
      return;
    }
    if (mode === 'scale') {
      container.style.cursor = 'grab';
      return;
    }
    container.style.cursor = 'move';
  }

  function setGizmoRotatePlaneBasis(axis: 0 | 1 | 2, outU: THREE.Vector3, outV: THREE.Vector3) {
    if (axis === 0) {
      outU.set(0, 1, 0);
      outV.set(0, 0, 1);
    } else if (axis === 1) {
      outU.set(1, 0, 0);
      outV.set(0, 0, 1);
    } else {
      outU.set(1, 0, 0);
      outV.set(0, 1, 0);
    }
  }

  function gizmoRotateAngleFromPointOnPlane(
    hit: THREE.Vector3,
    pivot: THREE.Vector3,
    axis: 0 | 1 | 2
  ): number {
    setGizmoRotatePlaneBasis(axis, gizmoRotateE1, gizmoRotateE2);
    gizmoDeltaScratch.subVectors(hit, pivot);
    const u = gizmoDeltaScratch.dot(gizmoRotateE1);
    const v = gizmoDeltaScratch.dot(gizmoRotateE2);
    return Math.atan2(v, u);
  }

  function gizmoPlaneNormalForAxis(axis: 0 | 1 | 2): THREE.Vector3 {
    const camera = deps.getCamera()!;
    const ax = axisVector(axis);
    camera.getWorldDirection(gizmoCamDir);
    gizmoPlaneNormalScratch.copy(gizmoCamDir).addScaledVector(ax, -gizmoCamDir.dot(ax));
    if (gizmoPlaneNormalScratch.lengthSq() < 1e-8) {
      if (axis === 0) gizmoPlaneNormalScratch.set(0, 1, 0);
      else if (axis === 1) gizmoPlaneNormalScratch.set(1, 0, 0);
      else gizmoPlaneNormalScratch.set(0, 1, 0);
    }
    return gizmoPlaneNormalScratch.normalize();
  }

  function restoreGizmoRotateSelectionPreview() {
    const selectionGroup = deps.getSelectionGroup();
    if (!gizmoRotatePreviewActive || !selectionGroup) return;
    for (const child of selectionGroup.children) {
      if (!child.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY]) continue;
      const saved = gizmoRotatePivotSavedPositions.get(child.uuid);
      if (saved) child.position.copy(saved);
      child.rotation.set(0, 0, 0);
    }
    gizmoRotatePivotSavedPositions.clear();
    selectionGroup.position.copy(gizmoSavedGroupPos);
    selectionGroup.rotation.set(0, 0, 0);
    selectionGroup.scale.setScalar(1);
    gizmoRotatePreviewActive = false;
  }

  function endGizmoDrag() {
    const container = deps.getContainer();
    if (gizmoPointerId !== null && container) {
      try {
        container.releasePointerCapture(gizmoPointerId);
      } catch {
        /* ignore */
      }
    }
    restoreGizmoRotateSelectionPreview();
    isGizmoDrag = false;
    isPlacementGizmoDrag = false;
    placementGizmoBasePos = null;
    placementGizmoBaseRot = null;
    gizmoPointerId = null;
    gizmoDragAxis = null;
    gizmoAppliedSteps = 0;
    gizmoScaleAxes = [1, 1, 1];
    gizmoDragKind = null;
    gizmoRotateAccum = 0;
    gizmoScaleHandleSign = 1;
  }

  /** RMB / escape: restore placement anchor if dragging add-shape gizmo. */
  function cancelWithPlacementRestore() {
    if (!isGizmoDrag) return;
    if (isPlacementGizmoDrag && placementGizmoBasePos) {
      const [bx, by, bz] = placementGizmoBasePos;
      addPanelStore.update((s) => ({ ...s, posX: bx, posY: by, posZ: bz }));
    }
    if (isPlacementGizmoDrag && placementGizmoBaseRot) {
      const [rx, ry, rz] = placementGizmoBaseRot;
      addPanelStore.update((s) => ({ ...s, rotX: rx, rotY: ry, rotZ: rz }));
    }
    endGizmoDrag();
  }

  function tryPointerDown(event: PointerEvent): boolean {
    const tool = deps.getTool();
    const addOpen = get(addPanelStore).open;
    const sel = deps.getSelection();
    if (!(addOpen || sel.size > 0) || tool === 'fly' || tool === 'hand') return false;
    const container = deps.getContainer();
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    if (!container || !camera) return false;

    updateMoveGizmoTransform();
    const mode = get(selectionGizmoMode);
    let gAxis: 0 | 1 | 2 | null = null;
    if (mode === 'move') gAxis = pickMoveGizmoAxis();
    else if (mode === 'rotate') gAxis = pickRotateGizmoAxis();
    else {
      const sp = pickScaleGizmo();
      if (!sp) return false;
      gAxis = sp.axis;
      gizmoScaleHandleSign = sp.scaleSign;
    }
    if (gAxis === null) return false;

    event.preventDefault();
    event.stopPropagation();
    container.setPointerCapture(event.pointerId);
    gizmoPointerId = event.pointerId;
    isGizmoDrag = true;
    isPlacementGizmoDrag = addOpen && sel.size === 0;
    gizmoDragAxis = gAxis;
    gizmoAppliedSteps = 0;
    gizmoScaleAxes = [1, 1, 1];
    gizmoDragKind = mode;
    gizmoRotateAccum = 0;
    const ap = get(addPanelStore);
    const center: [number, number, number] | null = isPlacementGizmoDrag
      ? [ap.posX, ap.posY, ap.posZ]
      : getSelectionCenter(sel);
    if (isPlacementGizmoDrag) {
      placementGizmoBasePos = [ap.posX, ap.posY, ap.posZ];
      placementGizmoBaseRot = [ap.rotX, ap.rotY, ap.rotZ];
    } else {
      placementGizmoBasePos = null;
      placementGizmoBaseRot = null;
    }
    if (center && camera) {
      const planePoint = planePointScratch.set(center[0], center[1], center[2]);
      const pn =
        mode === 'rotate' && gAxis !== null
          ? axisVector(gAxis)
          : mode === 'move' && gAxis !== null
            ? gizmoPlaneNormalForAxis(gAxis)
            : mode === 'scale' && gAxis !== null
              ? gizmoPlaneNormalForAxis(gAxis)
              : camera.getWorldDirection(gizmoCamDir).multiplyScalar(-1);
      gizmoDragPlane.setFromNormalAndCoplanarPoint(pn, planePoint);
      raycaster.setFromCamera(deps.getPointer(), camera);
      if (!raycaster.ray.intersectPlane(gizmoDragPlane, gizmoWorldStart)) {
        gizmoWorldStart.copy(planePoint);
      }
      if (mode === 'rotate') {
        const rotateAxis = gAxis as 0 | 1 | 2;
        gizmoRotatePivotScratch.set(center[0], center[1], center[2]);
        gizmoRotatePrevAngle = gizmoRotateAngleFromPointOnPlane(
          gizmoWorldStart,
          gizmoRotatePivotScratch,
          rotateAxis
        );
        const selectionGroup = deps.getSelectionGroup();
        if (!isPlacementGizmoDrag && selectionGroup) {
          let anyPivot = false;
          gizmoRotatePivotSavedPositions.clear();
          gizmoSavedGroupPos.copy(selectionGroup.position);
          for (const child of selectionGroup.children) {
            if (!child.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY]) continue;
            anyPivot = true;
            gizmoRotatePivotSavedPositions.set(child.uuid, child.position.clone());
            child.position.set(-center[0], -center[1], -center[2]);
          }
          if (anyPivot) {
            selectionGroup.position.set(center[0], center[1], center[2]);
            selectionGroup.rotation.set(0, 0, 0);
            gizmoRotatePreviewActive = true;
          }
        }
      } else if (mode === 'scale' && gAxis !== null) {
        gizmoRotatePivotScratch.set(center[0], center[1], center[2]);
        const u = axisVector(gAxis).multiplyScalar(gizmoScaleHandleSign);
        gizmoDeltaScratch.copy(gizmoWorldStart).sub(gizmoRotatePivotScratch);
        let t0 = gizmoDeltaScratch.dot(u);
        if (Math.abs(t0) < 0.12) t0 = 0.12 * Math.sign(t0 || gizmoScaleHandleSign);
        gizmoScaleBaseAlong = t0;
        const selectionGroup = deps.getSelectionGroup();
        if (!isPlacementGizmoDrag && selectionGroup) {
          let anyPivot = false;
          gizmoRotatePivotSavedPositions.clear();
          gizmoSavedGroupPos.copy(selectionGroup.position);
          for (const child of selectionGroup.children) {
            if (!child.userData[VOXELLE_SELECTION_PIVOT_CHILD_KEY]) continue;
            anyPivot = true;
            gizmoRotatePivotSavedPositions.set(child.uuid, child.position.clone());
            child.position.set(-center[0], -center[1], -center[2]);
          }
          if (anyPivot) {
            selectionGroup.position.set(center[0], center[1], center[2]);
            selectionGroup.rotation.set(0, 0, 0);
            selectionGroup.scale.setScalar(1);
            gizmoRotatePreviewActive = true;
          }
        }
      }
    }
    requestAnimationFrame(() => deps.render());
    return true;
  }

  function handlePointerMove(event: PointerEvent | undefined): boolean {
    void event;
    if (!isGizmoDrag) return false;
    if (gizmoDragAxis === null) return false;
    const dragAxis = gizmoDragAxis;
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    if (!camera) return true;
    raycaster.setFromCamera(deps.getPointer(), camera);
    if (raycaster.ray.intersectPlane(gizmoDragPlane, gizmoHitScratch)) {
      if (gizmoDragKind === 'rotate') {
        if (dragAxis === null) return false;
        const ang = gizmoRotateAngleFromPointOnPlane(
          gizmoHitScratch,
          gizmoRotatePivotScratch,
          dragAxis
        );
        let delta = ang - gizmoRotatePrevAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        gizmoRotateAccum += delta;
        gizmoRotatePrevAngle = ang;
        gizmoAppliedSteps = Math.round(gizmoRotateAccum / (Math.PI / 2));
        if (isPlacementGizmoDrag && placementGizmoBaseRot) {
          const [brx, bry, brz] = placementGizmoBaseRot;
          const ax = dragAxis;
          const d = (gizmoRotateAccum * 180) / Math.PI;
          addPanelStore.update((s) => ({
            ...s,
            rotX: brx + (ax === 0 ? d : 0),
            rotY: bry + (ax === 1 ? d : 0),
            rotZ: brz + (ax === 2 ? d : 0)
          }));
        }
      } else if (gizmoDragKind === 'scale') {
        const u = axisVector(dragAxis).multiplyScalar(gizmoScaleHandleSign);
        const t1 = gizmoDeltaScratch.copy(gizmoHitScratch).sub(gizmoRotatePivotScratch).dot(u);
        const t0 = gizmoScaleBaseAlong;
        const denom = Math.abs(t0) < 1e-6 ? 1e-6 * Math.sign(t0 || 1) : t0;
        let ratio = t1 / denom;
        ratio = Math.max(0.05, Math.min(20, ratio));
        gizmoScaleAxes[0] = 1;
        gizmoScaleAxes[1] = 1;
        gizmoScaleAxes[2] = 1;
        gizmoScaleAxes[dragAxis] = ratio;
      } else {
        if (dragAxis === null) return false;
        const along = gizmoDeltaScratch
          .copy(gizmoHitScratch)
          .sub(gizmoWorldStart)
          .dot(axisVector(dragAxis));
        const desired = Math.round(along);
        gizmoAppliedSteps = desired;
        if (isPlacementGizmoDrag && placementGizmoBasePos) {
          const [bx, by, bz] = placementGizmoBasePos;
          addPanelStore.update((s) => ({
            ...s,
            posX: bx + (dragAxis === 0 ? desired : 0),
            posY: by + (dragAxis === 1 ? desired : 0),
            posZ: bz + (dragAxis === 2 ? desired : 0)
          }));
        }
      }
    }
    deps.render();
    return true;
  }

  /** Integer Δx,Δy,Δz during move gizmo drag (one axis may be non-zero); null when not showing. */
  function getMoveDragDeltaLabel(): { dx: number; dy: number; dz: number } | null {
    if (
      !isGizmoDrag ||
      isPlacementGizmoDrag ||
      gizmoDragKind !== 'move' ||
      gizmoDragAxis === null
    ) {
      return null;
    }
    const dx = gizmoDragAxis === 0 ? gizmoAppliedSteps : 0;
    const dy = gizmoDragAxis === 1 ? gizmoAppliedSteps : 0;
    const dz = gizmoDragAxis === 2 ? gizmoAppliedSteps : 0;
    return { dx, dy, dz };
  }

  function tryPrimaryPointerUp(event: PointerEvent): GizmoPointerUpCommit | null {
    if (!isGizmoDrag || gizmoPointerId !== event.pointerId) return null;
    const endViaCapture =
      event.type === 'lostpointercapture' || event.type === 'pointercancel';
    if (!endViaCapture && (event.type !== 'pointerup' || event.button !== 0)) return null;
    const wasPlacement = isPlacementGizmoDrag;
    const axis = gizmoDragKind === 'scale' ? null : gizmoDragAxis;
    const steps = gizmoAppliedSteps;
    const angleRad = gizmoRotateAccum;
    const scaleAxes: [number, number, number] =
      gizmoDragKind === 'scale'
        ? [gizmoScaleAxes[0], gizmoScaleAxes[1], gizmoScaleAxes[2]]
        : [1, 1, 1];
    const kind = gizmoDragKind;
    endGizmoDrag();
    return { wasPlacement, axis, steps, angleRad, scaleAxes, kind };
  }

  return {
    createMoveGizmo,
    createRotateGizmo,
    createScaleGizmo,
    updateMoveGizmoTransform,
    updateGizmoPreviewOffset,
    syncGizmoHoverCursor,
    clearGizmoHoverCursor,
    tryPointerDown,
    handlePointerMove,
    tryPrimaryPointerUp,
    cancelWithPlacementRestore,
    endGizmoDrag,
    getMoveDragDeltaLabel,
    get isGizmoDrag() {
      return isGizmoDrag;
    }
  };
}
