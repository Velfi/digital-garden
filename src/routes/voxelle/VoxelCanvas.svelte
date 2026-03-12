<script lang="ts">
	import { browser } from '$app/environment';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
	import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
	import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
	import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import {
		voxels,
		gridSize,
		showGrid,
		showSSAO,
		tool,
		color,
		strokeMode,
		lightAngle,
		lightColor,
		backgroundColor,
		updateVoxels,
		updateVoxelsInStroke,
		beginStroke,
		history,
		initCanvas,
		loadFromStorage,
		saveToStorage,
		coordKey,
		parseCoordKey,
		hexToInt
	} from './store';

	let container: HTMLDivElement;
	let camera: THREE.PerspectiveCamera;
	let scene: THREE.Scene;
	let renderer: THREE.WebGLRenderer;
	let composer: EffectComposer;
	let ssaoPass: SSAOPass;
	let controls: OrbitControls;
	let raycaster: THREE.Raycaster;
	let pointer: THREE.Vector2;
	let voxelGroup: THREE.Group;
	let rollOverMesh: THREE.Mesh;
	let rollOverMaterial: THREE.MeshBasicMaterial;
	let dirLight: THREE.DirectionalLight;
	let boxGeometry: THREE.BoxGeometry;
	let meshesByColor: Map<number, { mesh: THREE.InstancedMesh; positions: [number, number, number][] }> =
		new Map();
	let animationFrameId: number;
	let isVoxelDrag = false;
	let dragStartPos: [number, number, number] | null = null;
	let dragFaceNormal: THREE.Vector3 | null = null; // plane stays aligned to initial face
	let dragPointerId: number | null = null;
	let pendingStrokePositions: [number, number, number][] = [];

	// Cuboid two-phase: first drag = plane, second click = depth
	let cuboidPhase: 'plane' | 'depth' | null = null;
	let cuboidPlane:
		| { a: [number, number, number]; b: [number, number, number]; normal: THREE.Vector3 }
		| null = null;
	let cuboidDepth = 0; // voxel layers, set during depth phase from pointer move

	let previewMesh: THREE.InstancedMesh | null = null;
	let previewMaterial: THREE.MeshBasicMaterial | null = null;
	const PREVIEW_MAX = 4096;

	let gridGroup: THREE.Group | null = null;
	let gridLineMaterial: THREE.LineBasicMaterial | null = null;

	let zoomPercent = $state(100);
	let deltaDisplay = $state<{ dx: number; dy: number; dz: number } | null>(null);
	let pointerScreen = $state({ x: 0, y: 0 });
	const ZOOM_FACTOR_IN = 1 / 1.2;
	const ZOOM_FACTOR_OUT = 1.2;
	const MIN_DISTANCE = 5;
	const MAX_DISTANCE = 5000;

	const pointerHelper = new THREE.Vector3();
	const fitHelperBox = new THREE.Box3();
	const fitHelperSphere = new THREE.Sphere();
	const worldQuaternion = new THREE.Quaternion();

	function getHalf(size: number) {
		return size / 2;
	}

	function inBounds(x: number, y: number, z: number, size: number): boolean {
		const h = getHalf(size);
		return x >= -h && x < h && y >= -h && y < h && z >= -h && z < h;
	}

	function rebuildVoxelMeshes(v: Map<string, number>, size: number) {
		if (!voxelGroup) return;
		// Group voxels by color
		const byColor = new Map<number, [number, number, number][]>();
		for (const [key, col] of v) {
			const pos = parseCoordKey(key);
			if (!byColor.has(col)) byColor.set(col, []);
			byColor.get(col)!.push(pos);
		}

		// Remove old meshes (geometry is shared, don't dispose)
		for (const { mesh } of meshesByColor.values()) {
			voxelGroup.remove(mesh);
			(mesh.material as THREE.Material).dispose();
		}
		meshesByColor.clear();

		if (!boxGeometry) boxGeometry = new THREE.BoxGeometry(1, 1, 1);

		for (const [col, positions] of byColor) {
			const count = positions.length;
			const mesh = new THREE.InstancedMesh(
				boxGeometry,
				new THREE.MeshLambertMaterial({ color: col }),
				count
			);
			mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

			const matrix = new THREE.Matrix4();
			for (let i = 0; i < count; i++) {
				const [x, y, z] = positions[i];
				matrix.setPosition(x, y, z);
				mesh.setMatrixAt(i, matrix);
			}
			mesh.instanceMatrix.needsUpdate = true;
			mesh.userData.positions = positions;
			voxelGroup.add(mesh);
			meshesByColor.set(col, { mesh, positions });
		}
	}

	function getRaycastTargets(): THREE.Object3D[] {
		const targets: THREE.Object3D[] = [];
		for (const { mesh } of meshesByColor.values()) {
			targets.push(mesh);
		}
		return targets;
	}

	function getIntersection(): THREE.Intersection | null {
		raycaster.setFromCamera(pointer, camera);
		const targets = getRaycastTargets();
		const intersects = raycaster.intersectObjects(targets, false);
		return intersects.length > 0 ? intersects[0] : null;
	}

	function snapToGrid(point: THREE.Vector3): [number, number, number] {
		return [Math.round(point.x), Math.round(point.y), Math.round(point.z)];
	}

	/** Returns voxel positions along axis-aligned line from a to b (dominant axis). */
	function getAxisAlignedLine(
		a: [number, number, number],
		b: [number, number, number]
	): [number, number, number][] {
		const dx = Math.abs(b[0] - a[0]);
		const dy = Math.abs(b[1] - a[1]);
		const dz = Math.abs(b[2] - a[2]);
		const positions: [number, number, number][] = [];
		if (dx >= dy && dx >= dz) {
			const x0 = Math.min(a[0], b[0]);
			const x1 = Math.max(a[0], b[0]);
			for (let x = x0; x <= x1; x++) positions.push([x, a[1], a[2]]);
		} else if (dy >= dx && dy >= dz) {
			const y0 = Math.min(a[1], b[1]);
			const y1 = Math.max(a[1], b[1]);
			for (let y = y0; y <= y1; y++) positions.push([a[0], y, a[2]]);
		} else {
			const z0 = Math.min(a[2], b[2]);
			const z1 = Math.max(a[2], b[2]);
			for (let z = z0; z <= z1; z++) positions.push([a[0], a[1], z]);
		}
		return positions;
	}

	/** Returns all voxel positions in the axis-aligned plane. Plane normal = face normal (fixed axis from start). */
	function getAxisAlignedPlaneFromNormal(
		a: [number, number, number],
		b: [number, number, number],
		faceNormal: THREE.Vector3
	): [number, number, number][] {
		// Fixed axis = axis of plane normal (largest |component|)
		const ax = Math.abs(faceNormal.x);
		const ay = Math.abs(faceNormal.y);
		const az = Math.abs(faceNormal.z);
		const fixedAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
		const positions: [number, number, number][] = [];
		if (fixedAxis === 0) {
			const x = a[0];
			const y0 = Math.min(a[1], b[1]);
			const y1 = Math.max(a[1], b[1]);
			const z0 = Math.min(a[2], b[2]);
			const z1 = Math.max(a[2], b[2]);
			for (let py = y0; py <= y1; py++)
				for (let pz = z0; pz <= z1; pz++) positions.push([x, py, pz]);
		} else if (fixedAxis === 1) {
			const y = a[1];
			const x0 = Math.min(a[0], b[0]);
			const x1 = Math.max(a[0], b[0]);
			const z0 = Math.min(a[2], b[2]);
			const z1 = Math.max(a[2], b[2]);
			for (let px = x0; px <= x1; px++)
				for (let pz = z0; pz <= z1; pz++) positions.push([px, y, pz]);
		} else {
			const z = a[2];
			const x0 = Math.min(a[0], b[0]);
			const x1 = Math.max(a[0], b[0]);
			const y0 = Math.min(a[1], b[1]);
			const y1 = Math.max(a[1], b[1]);
			for (let px = x0; px <= x1; px++)
				for (let py = y0; py <= y1; py++) positions.push([px, py, z]);
		}
		return positions;
	}

	/** Returns all voxel positions in axis-aligned cuboid. Plane from a to b, extruded along faceNormal by depth voxels. */
	function getAxisAlignedCuboid(
		a: [number, number, number],
		b: [number, number, number],
		faceNormal: THREE.Vector3,
		depth: number
	): [number, number, number][] {
		const planePositions = getAxisAlignedPlaneFromNormal(a, b, faceNormal);
		if (depth === 0) return planePositions;
		const positions: [number, number, number][] = [...planePositions];
		const ax = Math.abs(faceNormal.x);
		const ay = Math.abs(faceNormal.y);
		const az = Math.abs(faceNormal.z);
		const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
		const step = faceNormal.getComponent(axis) > 0 ? 1 : -1;
		const layers = Math.abs(depth);
		const dir = depth > 0 ? step : -step;
		for (let k = 1; k <= layers; k++) {
			const dk = dir * k;
			for (const [px, py, pz] of planePositions) {
				const pos: [number, number, number] = [px, py, pz];
				pos[axis] += dk;
				positions.push(pos);
			}
		}
		return positions;
	}

	const CUBE_EDGES: number[][] = [
		[-0.5, -0.5, -0.5, 0.5, -0.5, -0.5],
		[-0.5, -0.5, -0.5, -0.5, 0.5, -0.5],
		[-0.5, -0.5, -0.5, -0.5, -0.5, 0.5],
		[0.5, -0.5, -0.5, 0.5, 0.5, -0.5],
		[0.5, -0.5, -0.5, 0.5, -0.5, 0.5],
		[-0.5, 0.5, -0.5, 0.5, 0.5, -0.5],
		[-0.5, 0.5, -0.5, -0.5, 0.5, 0.5],
		[-0.5, -0.5, 0.5, 0.5, -0.5, 0.5],
		[-0.5, -0.5, 0.5, -0.5, 0.5, 0.5],
		[0.5, 0.5, -0.5, 0.5, 0.5, 0.5],
		[0.5, -0.5, 0.5, 0.5, 0.5, 0.5],
		[-0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
	];
	// For each edge: the 2 neighbor offsets; edge is visible if either neighbor is empty
	const EDGE_NEIGHBORS: [number, number, number][][] = [
		[[0, -1, 0], [0, 0, -1]],
		[[-1, 0, 0], [0, 0, -1]],
		[[-1, 0, 0], [0, -1, 0]],
		[[1, 0, 0], [0, 0, -1]],
		[[1, 0, 0], [0, -1, 0]],
		[[0, 1, 0], [0, 0, -1]],
		[[-1, 0, 0], [0, 1, 0]],
		[[0, -1, 0], [0, 0, 1]],
		[[-1, 0, 0], [0, 0, 1]],
		[[1, 0, 0], [0, 1, 0]],
		[[1, 0, 0], [0, 0, 1]],
		[[0, 1, 0], [0, 0, 1]]
	];

	function buildGrid(_size: number, v: Map<string, number>) {
		if (!gridGroup || !gridLineMaterial || !scene) return;
		// Remove existing grid lines
		while (gridGroup.children.length > 0) {
			const child = gridGroup.children[0];
			gridGroup.remove(child);
			if (child instanceof THREE.LineSegments && child.geometry) {
				child.geometry.dispose();
			}
		}
		if (v.size === 0) return;
		const positions: number[] = [];
		const has = (x: number, y: number, z: number) => v.has(coordKey(x, y, z));
		for (const key of v.keys()) {
			const [x, y, z] = parseCoordKey(key);
			for (let i = 0; i < CUBE_EDGES.length; i++) {
				const [[dx1, dy1, dz1], [dx2, dy2, dz2]] = EDGE_NEIGHBORS[i];
				const n1 = has(x + dx1, y + dy1, z + dz1);
				const n2 = has(x + dx2, y + dy2, z + dz2);
				if (n1 && n2) continue; // both neighbors exist, edge is interior
				const edge = CUBE_EDGES[i];
				positions.push(
					x + edge[0], y + edge[1], z + edge[2],
					x + edge[3], y + edge[4], z + edge[5]
				);
			}
		}
		if (positions.length === 0) return;
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geom.computeBoundingSphere();
		const lines = new THREE.LineSegments(geom, gridLineMaterial);
		gridGroup.add(lines);
	}

	function getCameraDistance(): number {
		if (!camera || !controls) return 100;
		return camera.position.distanceTo(controls.target);
	}

	function setCameraDistance(distance: number) {
		if (!camera || !controls) return;
		const d = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
		const dir = new THREE.Vector3()
			.subVectors(camera.position, controls.target)
			.normalize();
		camera.position.copy(controls.target).add(dir.multiplyScalar(d));
		updateZoomPercent();
	}

	function updateZoomPercent() {
		if (!camera || !controls) return;
		const dist = getCameraDistance();
		const baseDist = $gridSize * 2.5;
		zoomPercent = Math.round((baseDist / dist) * 100);
	}

	function zoomIn() {
		setCameraDistance(getCameraDistance() * ZOOM_FACTOR_IN);
		render();
	}

	function zoomOut() {
		setCameraDistance(getCameraDistance() * ZOOM_FACTOR_OUT);
		render();
	}

	function fitToView() {
		if (!camera || !controls || !container) return;
		const v = $voxels;
		const sz = $gridSize;
		const half = sz / 2;
		if (v.size === 0) {
			fitHelperBox.setFromCenterAndSize(
				new THREE.Vector3(0, 0, 0),
				new THREE.Vector3(sz, sz, sz)
			);
		} else {
			fitHelperBox.makeEmpty();
			for (const key of v.keys()) {
				const [x, y, z] = parseCoordKey(key);
				fitHelperBox.expandByPoint(new THREE.Vector3(x, y, z));
			}
			fitHelperBox.expandByScalar(1);
		}
		fitHelperBox.getBoundingSphere(fitHelperSphere);
		const fov = (camera.fov * Math.PI) / 180;
		const h = container.clientHeight;
		const w = container.clientWidth;
		const aspect = w / h;
		const vFov = fov;
		const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
		const halfFov = Math.min(vFov, hFov) / 2;
		const fitDist = (fitHelperSphere.radius * 1.5) / Math.tan(halfFov);
		setCameraDistance(fitDist);
		render();
	}

	function updateDirLightPosition(deg: number) {
		if (!dirLight) return;
		const rad = (deg * Math.PI) / 180;
		const elev = 0.65;
		const h = Math.cos(elev);
		dirLight.position.set(Math.cos(rad) * h, Math.sin(elev), Math.sin(rad) * h).normalize();
	}

	function getAddPosition(hit: THREE.Intersection): [number, number, number] | null {
		if (!hit.face) return null;
		hit.object.getWorldQuaternion(worldQuaternion);
		const worldNormal = hit.face.normal.clone().applyQuaternion(worldQuaternion);
		pointerHelper.copy(hit.point).add(worldNormal);
		return snapToGrid(pointerHelper);
	}

	function getVoxelPosition(hit: THREE.Intersection): [number, number, number] | null {
		const mesh = hit.object as THREE.InstancedMesh;
		const positions = mesh.userData.positions as [number, number, number][];
		const idx = hit.instanceId ?? 0;
		return positions[idx] ?? null;
	}

	function applyLineStroke(positions: [number, number, number][]) {
		const sz = $gridSize;
		const col = hexToInt($color);
		updateVoxelsInStroke((v) => {
			for (const [x, y, z] of positions) {
				if (!inBounds(x, y, z, sz)) continue;
				const key = coordKey(x, y, z);
				if ($tool === 'remove') {
					v.delete(key);
				} else if ($tool === 'add') {
					if (!v.has(key)) v.set(key, col);
				} else if ($tool === 'paint') {
					if (v.has(key)) v.set(key, col);
				}
			}
		});
	}

	function updatePreviewMesh(positions: [number, number, number][]) {
		if (!previewMesh || !previewMaterial) return;
		const count = Math.min(positions.length, PREVIEW_MAX);
		previewMesh.count = count;
		previewMaterial.color.setHex($tool === 'remove' ? 0xff4444 : hexToInt($color));
		const matrix = new THREE.Matrix4();
		for (let i = 0; i < count; i++) {
			const [x, y, z] = positions[i];
			matrix.setPosition(x, y, z);
			previewMesh.setMatrixAt(i, matrix);
		}
		previewMesh.instanceMatrix.needsUpdate = true;
		previewMesh.visible = count > 0;
	}

	function cancelDrag() {
		deltaDisplay = null;
		if (cuboidPhase) {
			cuboidPhase = null;
			cuboidPlane = null;
			pendingStrokePositions = [];
			updatePreviewMesh([]);
		}
		if (isVoxelDrag) {
			if (dragPointerId !== null) {
				try {
					container.releasePointerCapture(dragPointerId);
				} catch (_) {}
				dragPointerId = null;
			}
			isVoxelDrag = false;
			dragStartPos = null;
			dragFaceNormal = null;
			pendingStrokePositions = [];
			updatePreviewMesh([]);
			// No undo - we never applied changes
		}
	}

	function computeCuboidDepthFromPoint(point: [number, number, number]): number {
		if (!cuboidPlane) return 0;
		const { a, normal } = cuboidPlane;
		const ax = Math.abs(normal.x);
		const ay = Math.abs(normal.y);
		const az = Math.abs(normal.z);
		const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
		const sign = normal.getComponent(axis) > 0 ? 1 : -1;
		return (point[axis] - a[axis]) * sign;
	}

	function handlePointerDown(event: PointerEvent) {
		if (event.button === 2) {
			if (isVoxelDrag || cuboidPhase) {
				event.preventDefault();
				cancelDrag();
				render();
			}
			return;
		}
		if (event.button !== 0) return;

		// Cuboid depth phase: second click commits the cuboid
		if (
			get(strokeMode) === 'cuboid' &&
			cuboidPhase === 'depth' &&
			cuboidPlane
		) {
			event.preventDefault();
			event.stopPropagation();
			const positions = getAxisAlignedCuboid(
				cuboidPlane.a,
				cuboidPlane.b,
				cuboidPlane.normal,
				cuboidDepth
			);
			if (positions.length > 0) {
				beginStroke();
				applyLineStroke(positions);
			}
			deltaDisplay = null;
			cuboidPhase = null;
			cuboidPlane = null;
			pendingStrokePositions = [];
			updatePreviewMesh([]);
			render();
			return;
		}

		const hit = getIntersection();
		if (!hit) {
			// Background click: let OrbitControls handle orbit
			return;
		}
		// Voxel click: prevent OrbitControls from receiving this and subsequent events
		event.preventDefault();
		event.stopPropagation();
		container.setPointerCapture(event.pointerId);
		dragPointerId = event.pointerId;
		isVoxelDrag = true;

		let startPos: [number, number, number] | null = null;
		if ($tool === 'add') {
			startPos = getAddPosition(hit);
		} else {
			startPos = getVoxelPosition(hit);
		}
		if (!startPos) {
			isVoxelDrag = false;
			dragPointerId = null;
			container.releasePointerCapture(event.pointerId);
			return;
		}
		if (!inBounds(startPos[0], startPos[1], startPos[2], $gridSize)) {
			isVoxelDrag = false;
			dragPointerId = null;
			container.releasePointerCapture(event.pointerId);
			return;
		}

		dragStartPos = startPos;
		hit.object.getWorldQuaternion(worldQuaternion);
		dragFaceNormal = hit.face!.normal.clone().applyQuaternion(worldQuaternion);
		pendingStrokePositions = [startPos];
		updatePreviewMesh(pendingStrokePositions);
		requestAnimationFrame(() => render());
	}

	function handlePointerMove() {
		// Cuboid depth phase: update depth from pointer, show full cuboid preview
		if (cuboidPhase === 'depth' && cuboidPlane) {
			const hit = getIntersection();
			if (hit) {
				const pos =
					$tool === 'add' ? getAddPosition(hit) : getVoxelPosition(hit);
				if (pos && inBounds(pos[0], pos[1], pos[2], $gridSize)) {
					cuboidDepth = computeCuboidDepthFromPoint(pos);
				}
			}
			const ax = Math.abs(cuboidPlane.normal.x);
			const ay = Math.abs(cuboidPlane.normal.y);
			const az = Math.abs(cuboidPlane.normal.z);
			const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
			const delta: [number, number, number] = [0, 0, 0];
			delta[axis] = cuboidDepth;
			deltaDisplay = { dx: delta[0], dy: delta[1], dz: delta[2] };
			pendingStrokePositions = getAxisAlignedCuboid(
				cuboidPlane.a,
				cuboidPlane.b,
				cuboidPlane.normal,
				cuboidDepth
			);
			updatePreviewMesh(pendingStrokePositions);
			render();
			return;
		}
		if (isVoxelDrag && dragStartPos) {
			// Update preview
			const hit = getIntersection();
			let currentPos: [number, number, number] | null = null;
			if (hit) {
				currentPos =
					$tool === 'add' ? getAddPosition(hit) : getVoxelPosition(hit);
			}
			if (currentPos && inBounds(currentPos[0], currentPos[1], currentPos[2], $gridSize)) {
				const mode = get(strokeMode);
				pendingStrokePositions =
					(mode === 'plane' || mode === 'cuboid') && dragFaceNormal
						? getAxisAlignedPlaneFromNormal(dragStartPos, currentPos, dragFaceNormal)
						: getAxisAlignedLine(dragStartPos, currentPos);
				deltaDisplay = {
					dx: currentPos[0] - dragStartPos[0],
					dy: currentPos[1] - dragStartPos[1],
					dz: currentPos[2] - dragStartPos[2]
				};
			} else {
				deltaDisplay = null;
			}
			updatePreviewMesh(pendingStrokePositions);
			render();
			return;
		}
		deltaDisplay = null;
		if ($tool !== 'add') {
			rollOverMesh.visible = false;
			render();
			return;
		}
		const hit = getIntersection();
		if (!hit || !hit.face) {
			rollOverMesh.visible = false;
			render();
			return;
		}
		const addPos = getAddPosition(hit);
		if (addPos && inBounds(addPos[0], addPos[1], addPos[2], $gridSize) && !$voxels.has(coordKey(addPos[0], addPos[1], addPos[2]))) {
			rollOverMesh.position.set(addPos[0], addPos[1], addPos[2]);
			rollOverMesh.visible = true;
		} else {
			rollOverMesh.visible = false;
		}
		render();
	}

	function updatePointerFromEvent(event: PointerEvent) {
		const rect = renderer.domElement.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		pointerScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
	}

	function onPointerMove(event: PointerEvent) {
		updatePointerFromEvent(event);
		handlePointerMove();
	}

	function onPointerDown(event: PointerEvent) {
		updatePointerFromEvent(event);
		handlePointerDown(event);
	}

	function onPointerUp(event: PointerEvent) {
		if (event.button === 2 && (isVoxelDrag || cuboidPhase)) {
			cancelDrag();
		}
		if (event.button === 0 && isVoxelDrag) {
			updatePointerFromEvent(event);
			const mode = get(strokeMode);
			if (mode === 'cuboid' && dragStartPos && dragFaceNormal) {
				// Enter depth phase instead of committing
				let cornerB = dragStartPos;
				const hit = getIntersection();
				if (hit) {
					const pos = $tool === 'add' ? getAddPosition(hit) : getVoxelPosition(hit);
					if (pos && inBounds(pos[0], pos[1], pos[2], $gridSize)) cornerB = pos;
				}
				cuboidPhase = 'depth';
				cuboidPlane = {
					a: dragStartPos,
					b: cornerB,
					normal: dragFaceNormal
				};
				cuboidDepth = 0;
				pendingStrokePositions = getAxisAlignedPlaneFromNormal(
					cuboidPlane.a,
					cuboidPlane.b,
					cuboidPlane.normal
				);
				updatePreviewMesh(pendingStrokePositions);
			} else {
				// Apply the stroke on release (line/plane)
				if (pendingStrokePositions.length > 0) {
					beginStroke();
					applyLineStroke(pendingStrokePositions);
				}
				pendingStrokePositions = [];
				updatePreviewMesh([]);
			}
			isVoxelDrag = false;
			dragStartPos = null;
			dragFaceNormal = null;
			dragPointerId = null;
		}
		updatePointerFromEvent(event);
		handlePointerMove();
	}

	function onPointerCancel(event: PointerEvent) {
		if (isVoxelDrag) {
			cancelDrag();
		}
		handlePointerMove();
	}

	function onContextMenu(event: Event) {
		if (isVoxelDrag) event.preventDefault();
	}

	function onWindowResize() {
		if (!container || !camera || !renderer || !composer) return;
		const w = container.clientWidth;
		const h = container.clientHeight;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h);
		composer.setPixelRatio(renderer.getPixelRatio());
		composer.setSize(w, h);
		render();
	}

	function render() {
		if (composer && scene && camera) {
			composer.render();
		}
	}

	function animate() {
		animationFrameId = requestAnimationFrame(animate);
		controls?.update();
		render();
	}

	$effect(() => {
		const mode = $strokeMode;
		if (mode !== 'cuboid' && cuboidPhase) {
			cuboidPhase = null;
			cuboidPlane = null;
			pendingStrokePositions = [];
			updatePreviewMesh([]);
		}
	});

	$effect(() => {
		const v = $voxels;
		const sz = $gridSize;
		rebuildVoxelMeshes(v, sz);
		render();
	});

	onMount(() => {
		if (!loadFromStorage()) initCanvas(get(gridSize));
		const sz = get(gridSize);

		scene = new THREE.Scene();
		scene.background = new THREE.Color(hexToInt($backgroundColor));

		camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
		const dist = sz * 2.5;
		camera.position.set(dist * 0.6, dist * 0.8, dist);
		camera.lookAt(0, 0, 0);

		rollOverMaterial = new THREE.MeshBasicMaterial({
			color: hexToInt($color),
			opacity: 0.5,
			transparent: true
		});
		boxGeometry = new THREE.BoxGeometry(1, 1, 1);
		rollOverMesh = new THREE.Mesh(boxGeometry, rollOverMaterial);
		rollOverMesh.visible = false;
		scene.add(rollOverMesh);

		voxelGroup = new THREE.Group();
		scene.add(voxelGroup);

		previewMaterial = new THREE.MeshBasicMaterial({
			color: 0xff4444,
			opacity: 0.5,
			transparent: true,
			depthTest: false,
			depthWrite: false
		});
		previewMesh = new THREE.InstancedMesh(boxGeometry, previewMaterial, PREVIEW_MAX);
		previewMesh.visible = false;
		previewMesh.count = 0;
		scene.add(previewMesh);

		const ambient = new THREE.AmbientLight(0x606060, 3);
		scene.add(ambient);
		dirLight = new THREE.DirectionalLight(hexToInt($lightColor), 3);
		updateDirLightPosition($lightAngle);
		scene.add(dirLight);

		gridLineMaterial = new THREE.LineBasicMaterial({
			color: 0x333333,
			opacity: 0.5,
			transparent: true,
			depthTest: true,
			depthWrite: false
		});
		gridGroup = new THREE.Group();
		gridGroup.renderOrder = 1;
		buildGrid(sz, $voxels);
		gridGroup.visible = $showGrid;
		scene.add(gridGroup);

		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(window.devicePixelRatio);
		container.appendChild(renderer.domElement);

		composer = new EffectComposer(renderer);
		composer.addPass(new RenderPass(scene, camera));
		ssaoPass = new SSAOPass(scene, camera);
		ssaoPass.kernelRadius = 16;
		ssaoPass.minDistance = 0.001;
		ssaoPass.maxDistance = 0.05;
		composer.addPass(ssaoPass);
		composer.addPass(new OutputPass());

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.addEventListener('change', updateZoomPercent);

		updateZoomPercent();

		raycaster = new THREE.Raycaster();
		pointer = new THREE.Vector2();

		container.addEventListener('pointermove', onPointerMove);
		container.addEventListener('pointerdown', onPointerDown, true);
		container.addEventListener('pointerup', onPointerUp);
		container.addEventListener('pointercancel', onPointerCancel);
		container.addEventListener('contextmenu', onContextMenu);
		window.addEventListener('resize', onWindowResize);

		rebuildVoxelMeshes($voxels, sz);
		onWindowResize();
		animate();
	});

	$effect(() => {
		rollOverMaterial.color.setHex(hexToInt($color));
		render();
	});

	$effect(() => {
		updateDirLightPosition($lightAngle);
		if (dirLight) dirLight.color.setHex(hexToInt($lightColor));
		if (scene) scene.background = new THREE.Color(hexToInt($backgroundColor));
		if (ssaoPass) ssaoPass.enabled = $showSSAO;
		render();
	});

	$effect(() => {
		const sz = $gridSize;
		const v = $voxels;
		if (gridGroup) {
			buildGrid(sz, v);
			gridGroup.visible = $showGrid;
		}
		updateZoomPercent();
		render();
	});

	onDestroy(() => {
		if (!browser) return;
		saveToStorage();
		cancelAnimationFrame(animationFrameId);
		container?.removeEventListener('pointermove', onPointerMove);
		container?.removeEventListener('pointerdown', onPointerDown, true);
		container?.removeEventListener('pointerup', onPointerUp);
		container?.removeEventListener('pointercancel', onPointerCancel);
		container?.removeEventListener?.('contextmenu', onContextMenu);
		window.removeEventListener('resize', onWindowResize);
		controls?.removeEventListener?.('change', updateZoomPercent);
		controls?.dispose();
		ssaoPass?.dispose();
		composer?.dispose();
		renderer?.dispose();
		for (const { mesh } of meshesByColor.values()) {
			mesh.geometry.dispose();
			(mesh.material as THREE.Material).dispose();
		}
		boxGeometry?.dispose();
		rollOverMaterial?.dispose();
		previewMaterial?.dispose();
		gridGroup?.traverse((obj) => {
			if (obj instanceof THREE.LineSegments && obj.geometry) obj.geometry.dispose();
		});
		gridLineMaterial?.dispose();
	});
</script>

<div class="canvas-container" bind:this={container} role="application" aria-label="Voxel sculpting canvas">
	{#if deltaDisplay}
		<div
			class="delta-display"
			aria-live="polite"
			style="left: {pointerScreen.x + 12}px; top: {pointerScreen.y + 12}px;"
		>
			Δ {deltaDisplay.dx}, {deltaDisplay.dy}, {deltaDisplay.dz}
		</div>
	{/if}
	<div
		class="zoom-controls"
		role="toolbar"
		aria-label="Zoom controls"
		tabindex="0"
		onpointerdown={(e) => e.stopPropagation()}
	>
		<button type="button" onclick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
		<span class="zoom-percent">{zoomPercent}%</span>
		<button type="button" onclick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
		<button type="button" class="fit-btn" onclick={fitToView} title="Fit to view" aria-label="Fit sculpture to view">Fit</button>
	</div>
</div>

<style>
	.canvas-container {
		flex: 1;
		min-width: 0;
		min-height: 200px;
		position: relative;
	}
	.canvas-container :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}

	.zoom-controls {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 4px;
		pointer-events: auto;
		z-index: 1;
	}

	.zoom-controls button {
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
	}

	.zoom-controls button:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.zoom-controls .fit-btn {
		width: auto;
		padding: 0 0.5rem;
	}

	.zoom-percent {
		min-width: 3ch;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.9);
	}

	.delta-display {
		position: absolute;
		padding: 0.25rem 0.5rem;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 4px;
		font-size: 0.85rem;
		font-family: monospace;
		color: rgba(255, 255, 255, 0.9);
		pointer-events: none;
		z-index: 1;
	}
</style>
