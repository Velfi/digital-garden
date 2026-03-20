/**
 * Move / rotate handles for selection or Add-shape placement. Raycast, drag preview, placement store updates.
 */
import * as THREE from 'three';
import { get } from 'svelte/store';
import { getSelectionCenter } from '../coordUtils';
import { clampQuarterTurn } from '../store/shapes';
import { addPanelStore, selectionGizmoMode, type Tool } from '../store/index';
import { previewOccludedTintInto } from './previewMeshUtils';

export type SelectionGizmoDeps = {
  getTool: () => Tool;
  getSelection: () => Map<string, number>;
  getPointer: () => THREE.Vector2;
  getCamera: () => THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
  getRaycaster: () => THREE.Raycaster;
  getMoveGroup: () => THREE.Group | null;
  getRotateGroup: () => THREE.Group | null;
  getSelectionGroup: () => THREE.Group | null;
  getVoxelGroup: () => THREE.Group | null;
  getContainer: () => HTMLDivElement | null;
  render: () => void;
};

export type GizmoPointerUpCommit = {
  wasPlacement: boolean;
  axis: 0 | 1 | 2 | null;
  steps: number;
  kind: 'move' | 'rotate' | null;
};

function axisVector(axis: 0 | 1 | 2): THREE.Vector3 {
  const v = new THREE.Vector3(0, 0, 0);
  v.setComponent(axis, 1);
  return v;
}

export function createSelectionGizmoController(deps: SelectionGizmoDeps) {
  let isGizmoDrag = false;
  let isPlacementGizmoDrag = false;
  let placementGizmoBasePos: [number, number, number] | null = null;
  let placementGizmoBaseRot: [number, number, number] | null = null;
  let gizmoPointerId: number | null = null;
  let gizmoDragAxis: 0 | 1 | 2 | null = null;
  let gizmoAppliedSteps = 0;
  let gizmoDragKind: 'move' | 'rotate' | null = null;
  let gizmoRotatePrevAngle = 0;
  let gizmoRotateAccum = 0;
  const gizmoRotatePivotScratch = new THREE.Vector3();
  const gizmoRotateE1 = new THREE.Vector3();
  const gizmoRotateE2 = new THREE.Vector3();
  const gizmoSavedMeshPos = new THREE.Vector3();
  const gizmoSavedGroupPos = new THREE.Vector3();
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
    const ordVis = 1001;
    const ordOcc = 1000;

    for (let axis = 0; axis < 3; axis++) {
      const shaftGeo = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 14);
      const coneGeo = new THREE.ConeGeometry(coneR, coneH, 12);
      const matVis = createGizmoVisibleMaterial(colors[axis], 0.96);
      const matOcc = createGizmoOccludedMaterial(colors[axis], 0.4);
      const shaft = new THREE.Mesh(shaftGeo, matVis);
      const cone = new THREE.Mesh(coneGeo, matVis);
      const shaftOcc = new THREE.Mesh(shaftGeo, matOcc);
      const coneOcc = new THREE.Mesh(coneGeo, matOcc);
      shaft.renderOrder = ordVis;
      cone.renderOrder = ordVis;
      shaftOcc.renderOrder = ordOcc;
      coneOcc.renderOrder = ordOcc;
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
    const ordVis = 1001;
    const ordOcc = 1000;
    const major = 1.12;
    const tube = 0.1;
    for (let axis = 0; axis < 3; axis++) {
      const geo = new THREE.TorusGeometry(major, tube, 12, 40);
      const matVis = createGizmoVisibleMaterial(colors[axis], 0.9);
      const matOcc = createGizmoOccludedMaterial(colors[axis], 0.4);
      const mesh = new THREE.Mesh(geo, matVis);
      const meshOcc = new THREE.Mesh(geo, matOcc);
      mesh.renderOrder = ordVis;
      meshOcc.renderOrder = ordOcc;
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

  function updateMoveGizmoTransform() {
    const moveGizmoGroup = deps.getMoveGroup();
    const rotateGizmoGroup = deps.getRotateGroup();
    const camera = deps.getCamera();
    if (!moveGizmoGroup || !rotateGizmoGroup || !camera) return;
    const mode = get(selectionGizmoMode);
    const tool = deps.getTool();
    const addOpen = get(addPanelStore).open;
    const sel = deps.getSelection();
    let gx = 0;
    let gy = 0;
    let gz = 0;
    let show = false;

    if (addOpen && tool !== 'fly') {
      const s = get(addPanelStore);
      gx = s.posX;
      gy = s.posY;
      gz = s.posZ;
      show = true;
    } else if (sel.size > 0 && tool !== 'fly') {
      const center = getSelectionCenter(sel);
      if (!center) {
        moveGizmoGroup.visible = false;
        rotateGizmoGroup.visible = false;
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
    } else {
      moveGizmoGroup.visible = false;
      rotateGizmoGroup.visible = false;
      return;
    }

    const dist = Math.hypot(camera.position.x - gx, camera.position.y - gy, camera.position.z - gz);
    const sc = Math.max(0.44, Math.min(3.49, dist * 0.059));
    moveGizmoGroup.position.set(gx, gy, gz);
    rotateGizmoGroup.position.set(gx, gy, gz);
    moveGizmoGroup.scale.setScalar(sc);
    rotateGizmoGroup.scale.setScalar(sc);
    moveGizmoGroup.visible = show && mode === 'move';
    rotateGizmoGroup.visible = show && mode === 'rotate';
  }

  function updateGizmoPreviewOffset() {
    deps.getVoxelGroup()?.position.set(0, 0, 0);
    const selectionGroup = deps.getSelectionGroup();
    if (
      gizmoRotatePreviewActive &&
      gizmoDragKind === 'rotate' &&
      selectionGroup &&
      gizmoDragAxis !== null
    ) {
      selectionGroup.position.copy(gizmoRotatePivotScratch);
      selectionGroup.setRotationFromAxisAngle(
        axisVector(gizmoDragAxis),
        gizmoAppliedSteps * (Math.PI / 2)
      );
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
    if (!camera || !deps.getMoveGroup() || !deps.getRotateGroup()) {
      clearGizmoHoverCursor();
      return;
    }
    updateMoveGizmoTransform();
    const mode = get(selectionGizmoMode);
    const axis = mode === 'move' ? pickMoveGizmoAxis() : pickRotateGizmoAxis();
    if (axis === null) {
      clearGizmoHoverCursor();
      return;
    }
    if (mode === 'rotate') {
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
    const mesh = selectionGroup.children[0];
    if (mesh) {
      mesh.position.copy(gizmoSavedMeshPos);
      mesh.rotation.set(0, 0, 0);
    }
    selectionGroup.position.copy(gizmoSavedGroupPos);
    selectionGroup.rotation.set(0, 0, 0);
    gizmoRotatePreviewActive = false;
  }

  function endGizmoDrag() {
    const container = deps.getContainer();
    if (gizmoPointerId !== null && container) {
      try {
        container.releasePointerCapture(gizmoPointerId);
      } catch (_) {}
    }
    restoreGizmoRotateSelectionPreview();
    isGizmoDrag = false;
    isPlacementGizmoDrag = false;
    placementGizmoBasePos = null;
    placementGizmoBaseRot = null;
    gizmoPointerId = null;
    gizmoDragAxis = null;
    gizmoAppliedSteps = 0;
    gizmoDragKind = null;
    gizmoRotateAccum = 0;
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
    if (!(addOpen || sel.size > 0) || tool === 'fly') return false;
    const container = deps.getContainer();
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    if (!container || !camera) return false;

    updateMoveGizmoTransform();
    const mode = get(selectionGizmoMode);
    const gAxis = mode === 'move' ? pickMoveGizmoAxis() : pickRotateGizmoAxis();
    if (gAxis === null) return false;

    event.preventDefault();
    event.stopPropagation();
    container.setPointerCapture(event.pointerId);
    gizmoPointerId = event.pointerId;
    isGizmoDrag = true;
    isPlacementGizmoDrag = addOpen;
    gizmoDragAxis = gAxis;
    gizmoAppliedSteps = 0;
    gizmoDragKind = mode;
    gizmoRotateAccum = 0;
    const ap = get(addPanelStore);
    const center: [number, number, number] | null = isPlacementGizmoDrag
      ? [ap.posX, ap.posY, ap.posZ]
      : getSelectionCenter(sel);
    if (isPlacementGizmoDrag) {
      placementGizmoBasePos = [ap.posX, ap.posY, ap.posZ];
      placementGizmoBaseRot = [
        clampQuarterTurn(ap.rotX),
        clampQuarterTurn(ap.rotY),
        clampQuarterTurn(ap.rotZ)
      ];
    } else {
      placementGizmoBasePos = null;
      placementGizmoBaseRot = null;
    }
    if (center && camera) {
      const planePoint = planePointScratch.set(center[0], center[1], center[2]);
      const pn = mode === 'move' ? gizmoPlaneNormalForAxis(gAxis) : axisVector(gAxis);
      gizmoDragPlane.setFromNormalAndCoplanarPoint(pn, planePoint);
      raycaster.setFromCamera(deps.getPointer(), camera);
      if (!raycaster.ray.intersectPlane(gizmoDragPlane, gizmoWorldStart)) {
        gizmoWorldStart.copy(planePoint);
      }
      if (mode === 'rotate') {
        gizmoRotatePivotScratch.set(center[0], center[1], center[2]);
        gizmoRotatePrevAngle = gizmoRotateAngleFromPointOnPlane(
          gizmoWorldStart,
          gizmoRotatePivotScratch,
          gAxis
        );
        const selectionGroup = deps.getSelectionGroup();
        if (!isPlacementGizmoDrag && selectionGroup) {
          const mesh = selectionGroup.children[0];
          if (mesh) {
            gizmoSavedMeshPos.copy(mesh.position);
            gizmoSavedGroupPos.copy(selectionGroup.position);
            mesh.position.set(-center[0], -center[1], -center[2]);
            selectionGroup.position.set(center[0], center[1], center[2]);
            selectionGroup.rotation.set(0, 0, 0);
            gizmoRotatePreviewActive = true;
          }
        }
      }
    }
    requestAnimationFrame(() => deps.render());
    return true;
  }

  function handlePointerMove(_event: PointerEvent | undefined): boolean {
    if (!isGizmoDrag || gizmoDragAxis === null) return false;
    const camera = deps.getCamera();
    const raycaster = deps.getRaycaster();
    if (!camera) return true;
    raycaster.setFromCamera(deps.getPointer(), camera);
    if (raycaster.ray.intersectPlane(gizmoDragPlane, gizmoHitScratch)) {
      if (gizmoDragKind === 'rotate') {
        const ang = gizmoRotateAngleFromPointOnPlane(
          gizmoHitScratch,
          gizmoRotatePivotScratch,
          gizmoDragAxis
        );
        let delta = ang - gizmoRotatePrevAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        gizmoRotateAccum += delta;
        gizmoRotatePrevAngle = ang;
        gizmoAppliedSteps = Math.round(gizmoRotateAccum / (Math.PI / 2));
        if (isPlacementGizmoDrag && placementGizmoBaseRot) {
          const [brx, bry, brz] = placementGizmoBaseRot;
          const ax = gizmoDragAxis;
          const sx = ax === 0 ? gizmoAppliedSteps : 0;
          const sy = ax === 1 ? gizmoAppliedSteps : 0;
          const sz = ax === 2 ? gizmoAppliedSteps : 0;
          addPanelStore.update((s) => ({
            ...s,
            rotX: ((((brx + sx) % 4) + 4) % 4) & 3,
            rotY: ((((bry + sy) % 4) + 4) % 4) & 3,
            rotZ: ((((brz + sz) % 4) + 4) % 4) & 3
          }));
        }
      } else {
        const along = gizmoDeltaScratch
          .copy(gizmoHitScratch)
          .sub(gizmoWorldStart)
          .dot(axisVector(gizmoDragAxis));
        const desired = Math.round(along);
        gizmoAppliedSteps = desired;
        if (isPlacementGizmoDrag && placementGizmoBasePos && gizmoDragAxis !== null) {
          const [bx, by, bz] = placementGizmoBasePos;
          addPanelStore.update((s) => ({
            ...s,
            posX: bx + (gizmoDragAxis === 0 ? desired : 0),
            posY: by + (gizmoDragAxis === 1 ? desired : 0),
            posZ: bz + (gizmoDragAxis === 2 ? desired : 0)
          }));
        }
      }
    }
    deps.render();
    return true;
  }

  function tryPrimaryPointerUp(event: PointerEvent): GizmoPointerUpCommit | null {
    if (event.button !== 0 || !isGizmoDrag || gizmoPointerId !== event.pointerId) return null;
    const wasPlacement = isPlacementGizmoDrag;
    const axis = gizmoDragAxis;
    const steps = gizmoAppliedSteps;
    const kind = gizmoDragKind;
    endGizmoDrag();
    return { wasPlacement, axis, steps, kind };
  }

  return {
    createMoveGizmo,
    createRotateGizmo,
    updateMoveGizmoTransform,
    updateGizmoPreviewOffset,
    syncGizmoHoverCursor,
    clearGizmoHoverCursor,
    tryPointerDown,
    handlePointerMove,
    tryPrimaryPointerUp,
    cancelWithPlacementRestore,
    endGizmoDrag,
    get isGizmoDrag() {
      return isGizmoDrag;
    }
  };
}
