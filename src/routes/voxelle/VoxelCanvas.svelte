<script lang="ts">
	import { browser } from '$app/environment';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
	import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
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
		selection,
		lightAngle,
		lightColor,
		backgroundColor,
		focalLength,
		roughness,
		metalness,
		envMapIntensity,
		updateVoxels,
		updateVoxelsInStroke,
		beginStroke,
		history,
		initCanvas,
		loadFromStorage,
		saveToStorage,
		coordKey,
		parseCoordKey,
		hexToInt,
		getSelectionAnchor,
		ensureGridFitsPositions,
		type Tool
	} from './store';

	let container: HTMLDivElement;
	let camera: THREE.PerspectiveCamera;
	let scene: THREE.Scene;
	let renderer: THREE.WebGLRenderer;
	let composer: EffectComposer;
	let ssaoPass: SSAOPass;
	let orbitControls: OrbitControls;
	let flyControls: InstanceType<typeof PointerLockControls> | null = null;
	let lastFrameTime = 0;
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
	let isStampDrag = false;
	let lastStampPos: [number, number, number] | null = null;
	/** During stamp drag: re-raycast each frame so stamp follows cursor across surfaces */
	let dragStartPos: [number, number, number] | null = null;
	let dragFaceNormal: THREE.Vector3 | null = null; // plane stays aligned to initial face
	let dragPointerId: number | null = null;
	let pendingStrokePositions: [number, number, number][] = [];

	// Cuboid two-phase: first drag = plane, then scroll/drag = depth
	let cuboidPhase = $state<'plane' | 'depth' | null>(null);
	let cuboidPlane:
		| { a: [number, number, number]; b: [number, number, number]; normal: THREE.Vector3 }
		| null = null;
	let cuboidDepth = $state(1); // voxel layers; scroll, slider, or touch-drag to adjust
	let depthAdjustPointerId: number | null = null;
	let lastDepthPhaseClientY = 0;
	let depthSliderPointerId: number | null = null;
	let depthSliderStartY = 0;
	let depthSliderStartDepth = 0;

	let previewMesh: THREE.InstancedMesh | null = null;
	let previewMaterial: THREE.MeshBasicMaterial | null = null;
	const PREVIEW_MAX = 4096;

	let selectionGroup: THREE.Group | null = null;
	let selectionMesh: THREE.InstancedMesh | null = null;
	let selectionMaterial: THREE.MeshBasicMaterial | null = null;
	const SELECTION_MAX = 8192;

	let gridGroup: THREE.Group | null = null;
	let gridLineMaterial: THREE.LineBasicMaterial | null = null;
	let envMap: THREE.CubeTexture | null = null;

	let zoomPercent = $state(100);
	let deltaDisplay = $state<{ dx: number; dy: number; dz: number } | null>(null);
	let pointerScreen = $state({ x: 0, y: 0 });
	const ZOOM_FACTOR_IN = 1 / 1.2;
	const ZOOM_FACTOR_OUT = 1.2;
	const MIN_DISTANCE = 5;
	const MAX_DISTANCE = 5000;
	const FLY_MOVE_SPEED = 120;
	const FLY_POINTER_SPEED = 1.2;

	// 35mm equivalent: sensor height 24mm; FOV = 2 * atan(12 / focalLength)
	function focalLengthToFov(mm: number): number {
		return (2 * Math.atan(12 / mm) * 180) / Math.PI;
	}

	const pointerHelper = new THREE.Vector3();
	const fitHelperBox = new THREE.Box3();
	const flyMoveState = {
		forward: 0,
		back: 0,
		left: 0,
		right: 0,
		up: 0,
		down: 0,
		shift: 0
	};
	const fitHelperSphere = new THREE.Sphere();
	const worldQuaternion = new THREE.Quaternion();

	function createEnvMap(): THREE.CubeTexture {
		const size = 32;
		const canvases: HTMLCanvasElement[] = [];
		for (let i = 0; i < 6; i++) {
			const canvas = document.createElement('canvas');
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext('2d')!;
			const gradient = ctx.createRadialGradient(
				size / 2, size / 2, 0, size / 2, size / 2, size / 2
			);
			gradient.addColorStop(0, '#ffffff');
			gradient.addColorStop(1, '#888888');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, size, size);
			canvases.push(canvas);
		}
		const envMap = new THREE.CubeTexture(canvases);
		envMap.colorSpace = THREE.SRGBColorSpace;
		return envMap;
	}

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

		const envMap = scene?.environment ?? null;
		const r = $roughness;
		const m = $metalness;
		const envInt = $envMapIntensity;

		for (const [col, positions] of byColor) {
			const count = positions.length;
			const mat = new THREE.MeshStandardMaterial({
				color: col,
				roughness: r,
				metalness: m,
				envMap: envMap,
				envMapIntensity: envInt
			});
			const mesh = new THREE.InstancedMesh(boxGeometry, mat, count);
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

	function rebuildSelectionOverlay(sel: Map<string, number>) {
		if (!selectionGroup || !scene) return;
		if (selectionMesh) {
			selectionGroup.remove(selectionMesh);
			selectionMaterial?.dispose();
			selectionMesh = null;
			selectionMaterial = null;
		}
		if (sel.size === 0) return;
		const positions: [number, number, number][] = [];
		for (const key of sel.keys()) {
			positions.push(parseCoordKey(key));
		}
		const count = Math.min(positions.length, SELECTION_MAX);
		if (count === 0) return;
		if (!boxGeometry) boxGeometry = new THREE.BoxGeometry(1, 1, 1);
		selectionMaterial = new THREE.MeshBasicMaterial({
			color: 0x3399ff,
			opacity: 0.35,
			transparent: true,
			depthTest: true,
			depthWrite: false
		});
		selectionMesh = new THREE.InstancedMesh(boxGeometry, selectionMaterial, count);
		selectionMesh.raycast = () => {}; // don't block voxel raycasting
		const matrix = new THREE.Matrix4();
		for (let i = 0; i < count; i++) {
			const [x, y, z] = positions[i];
			matrix.setPosition(x, y, z);
			selectionMesh.setMatrixAt(i, matrix);
		}
		selectionMesh.instanceMatrix.needsUpdate = true;
		selectionGroup.add(selectionMesh);
	}

	function getStampPositions(anchor: [number, number, number], placeAt: [number, number, number]): [number, number, number][] {
		const sel = $selection;
		const [ax, ay, az] = anchor;
		const [px, py, pz] = placeAt;
		const dx = px - ax;
		const dy = py - ay;
		const dz = pz - az;
		const out: [number, number, number][] = [];
		for (const key of sel.keys()) {
			const [x, y, z] = parseCoordKey(key);
			out.push([x + dx, y + dy, z + dz]);
		}
		return out;
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
		if (!camera || !orbitControls) return 100;
		return camera.position.distanceTo(orbitControls.target);
	}

	function setCameraDistance(distance: number) {
		if (!camera || !orbitControls) return;
		const d = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance));
		const dir = new THREE.Vector3()
			.subVectors(camera.position, orbitControls.target)
			.normalize();
		camera.position.copy(orbitControls.target).add(dir.multiplyScalar(d));
		updateZoomPercent();
	}

	function updateZoomPercent() {
		if (!camera || !orbitControls) return;
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
		if (!camera || !orbitControls || !container) return;
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
		// Add 0.5 * normal to reach adjacent cell center (hit.point is on face, full normal overshoots)
		pointerHelper.copy(hit.point).addScaledVector(worldNormal, 0.5);
		return snapToGrid(pointerHelper);
	}

	function getVoxelPosition(hit: THREE.Intersection): [number, number, number] | null {
		const mesh = hit.object as THREE.InstancedMesh;
		const positions = mesh.userData.positions as [number, number, number][];
		const idx = hit.instanceId ?? 0;
		return positions[idx] ?? null;
	}

	function applyLineStroke(positions: [number, number, number][]) {
		ensureGridFitsPositions(positions);
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

	function applySelectStroke(positions: [number, number, number][]) {
		const v = $voxels;
		const sz = $gridSize;
		const next = new Map<string, number>();
		for (const [x, y, z] of positions) {
			if (!inBounds(x, y, z, sz)) continue;
			const key = coordKey(x, y, z);
			const col = v.get(key);
			if (col !== undefined) next.set(key, col);
		}
		selection.set(next);
	}

	function placeStamp(placeAt: [number, number, number]) {
		const anchor = getSelectionAnchor($selection);
		if (!anchor) return;
		const sel = $selection;
		const [ax, ay, az] = anchor;
		const [px, py, pz] = placeAt;
		const dx = px - ax;
		const dy = py - ay;
		const dz = pz - az;
		const stampPositions: [number, number, number][] = [];
		for (const [key, col] of sel) {
			const [sx, sy, sz] = parseCoordKey(key);
			stampPositions.push([sx + dx, sy + dy, sz + dz]);
		}
		ensureGridFitsPositions(stampPositions);
		beginStroke();
		updateVoxelsInStroke((v) => {
			for (const [key, col] of sel) {
				const [sx, sy, sz] = parseCoordKey(key);
				const x = sx + dx;
				const y = sy + dy;
				const z = sz + dz;
				if (!inBounds(x, y, z, $gridSize)) continue;
				v.set(coordKey(x, y, z), col);
			}
		});
	}

	function updatePreviewMesh(positions: [number, number, number][]) {
		if (!previewMesh || !previewMaterial) return;
		const count = Math.min(positions.length, PREVIEW_MAX);
		previewMesh.count = count;
		const hex =
			$tool === 'remove' ? 0xff4444 : $tool === 'stamp' ? 0x33aaff : hexToInt($color);
		previewMaterial.color.setHex(hex);
		const matrix = new THREE.Matrix4();
		for (let i = 0; i < count; i++) {
			const [x, y, z] = positions[i];
			matrix.setPosition(x, y, z);
			previewMesh.setMatrixAt(i, matrix);
		}
		previewMesh.instanceMatrix.needsUpdate = true;
		previewMesh.visible = count > 0;
	}

	function updateCuboidFromDepth() {
		if (!cuboidPlane) return;
		const ax = Math.abs(cuboidPlane.normal.x);
		const ay = Math.abs(cuboidPlane.normal.y);
		const az = Math.abs(cuboidPlane.normal.z);
		const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
		const d: [number, number, number] = [0, 0, 0];
		d[axis] = cuboidDepth;
		deltaDisplay = { dx: d[0], dy: d[1], dz: d[2] };
		pendingStrokePositions = getAxisAlignedCuboid(
			cuboidPlane.a,
			cuboidPlane.b,
			cuboidPlane.normal,
			cuboidDepth
		);
		updatePreviewMesh(pendingStrokePositions);
		render();
	}

	function commitCuboid() {
		if (!cuboidPlane) return;
		const positions = getAxisAlignedCuboid(
			cuboidPlane.a,
			cuboidPlane.b,
			cuboidPlane.normal,
			cuboidDepth
		);
		if (positions.length > 0) {
			if ($tool === 'select') {
				applySelectStroke(positions);
			} else {
				beginStroke();
				applyLineStroke(positions);
			}
		}
		deltaDisplay = null;
		cuboidPhase = null;
		cuboidPlane = null;
		pendingStrokePositions = [];
		updatePreviewMesh([]);
		render();
	}

	function cancelDrag() {
		deltaDisplay = null;
		if (cuboidPhase) {
			if (depthAdjustPointerId !== null) {
				try {
					container.releasePointerCapture(depthAdjustPointerId);
				} catch (_) {}
				depthAdjustPointerId = null;
			}
			cuboidPhase = null;
			cuboidPlane = null;
			pendingStrokePositions = [];
			updatePreviewMesh([]);
		}
		if (isStampDrag) {
			isStampDrag = false;
			lastStampPos = null;
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

	function handlePointerDown(event: PointerEvent) {
		if ((event.target as Element)?.closest?.('.cuboid-done-btn, .zoom-controls, .depth-slider-container')) return;
		if ($tool === 'fly') {
			if (event.button === 0 || event.button === 2) {
				if (flyControls?.isLocked) {
					flyControls.unlock();
				} else {
					flyControls?.lock(true); // unadjustedMovement for raw mouse input
				}
				event.preventDefault();
			}
			event.stopPropagation();
			return;
		}
		if (event.button === 2) {
			if (isVoxelDrag || cuboidPhase) {
				event.preventDefault();
				cancelDrag();
				render();
			}
			return;
		}
		if (event.button !== 0) return;

		// Cuboid depth phase: click commits; touch drag adjusts depth (mouse uses scroll wheel)
		if (
			get(strokeMode) === 'cuboid' &&
			cuboidPhase === 'depth' &&
			cuboidPlane
		) {
			event.preventDefault();
			event.stopPropagation();
			if (event.pointerType === 'touch') {
				depthAdjustPointerId = event.pointerId;
				lastDepthPhaseClientY = event.clientY;
				container.setPointerCapture(event.pointerId);
			} else {
				commitCuboid();
			}
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

		// Stamp tool: start drag; stamp will follow cursor by re-raycasting each frame
		if ($tool === 'stamp' && $selection.size > 0) {
			const placePos = getAddPosition(hit);
			if (placePos) {
				isStampDrag = true;
				lastStampPos = placePos;
				const anchor = getSelectionAnchor($selection)!;
				updatePreviewMesh(getStampPositions(anchor, placePos));
			}
			requestAnimationFrame(() => render());
			return;
		}

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

		dragStartPos = startPos;
		hit.object.getWorldQuaternion(worldQuaternion);
		dragFaceNormal = hit.face!.normal.clone().applyQuaternion(worldQuaternion);
		pendingStrokePositions = [startPos];
		updatePreviewMesh(pendingStrokePositions);
		requestAnimationFrame(() => render());
	}

	function handlePointerMove(event?: PointerEvent) {
		if ($tool === 'fly') return; // PointerLockControls handles mouse look
		// Stamp drag: re-raycast so stamp follows cursor onto any surface
		if (isStampDrag && $selection.size > 0) {
			const hit = getIntersection();
			if (hit) {
				const placePos = getAddPosition(hit);
				if (placePos) {
					lastStampPos = placePos;
					const anchor = getSelectionAnchor($selection)!;
					updatePreviewMesh(getStampPositions(anchor, placePos));
				}
			}
			render();
			return;
		}
		// Cuboid depth phase: depth from touch drag on canvas (mouse uses wheel or slider)
		if (cuboidPhase === 'depth' && cuboidPlane && event && depthAdjustPointerId === event.pointerId) {
			const dy = lastDepthPhaseClientY - event.clientY;
			cuboidDepth += Math.round(dy / 5);
			lastDepthPhaseClientY = event.clientY;
			updateCuboidFromDepth();
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
			if (currentPos) {
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
		// Stamp hover preview
		if ($tool === 'stamp' && $selection.size > 0 && !isStampDrag) {
			const hit = getIntersection();
			if (hit) {
				const placePos = getAddPosition(hit);
				if (placePos) {
					const anchor = getSelectionAnchor($selection)!;
					updatePreviewMesh(getStampPositions(anchor, placePos));
					rollOverMesh.visible = false;
				} else {
					updatePreviewMesh([]);
					rollOverMesh.visible = false;
				}
			} else {
				updatePreviewMesh([]);
				rollOverMesh.visible = false;
			}
			render();
			return;
		}
		if ($tool !== 'add') {
			rollOverMesh.visible = false;
			updatePreviewMesh([]);
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
		if (addPos && !$voxels.has(coordKey(addPos[0], addPos[1], addPos[2]))) {
			rollOverMesh.position.set(addPos[0], addPos[1], addPos[2]);
			rollOverMesh.visible = true;
		} else {
			rollOverMesh.visible = false;
		}
		render();
	}

	const TOOLTIP_OFFSET = 12;
	const TOOLTIP_MARGIN = 8;
	const TOOLTIP_ESTIMATE = { w: 100, h: 24 };

	function updatePointerFromEvent(event: PointerEvent) {
		const rect = renderer.domElement.getBoundingClientRect();
		pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		const rawX = event.clientX - rect.left;
		const rawY = event.clientY - rect.top;
		const desiredX = rawX + TOOLTIP_OFFSET;
		const desiredY = rawY + TOOLTIP_OFFSET;
		const maxX = rect.width - TOOLTIP_ESTIMATE.w - TOOLTIP_MARGIN;
		const maxY = rect.height - TOOLTIP_ESTIMATE.h - TOOLTIP_MARGIN;
		pointerScreen = {
			x: Math.max(TOOLTIP_MARGIN, Math.min(maxX, desiredX)),
			y: Math.max(TOOLTIP_MARGIN, Math.min(maxY, desiredY))
		};
	}

	function onPointerMove(event: PointerEvent) {
		updatePointerFromEvent(event);
		handlePointerMove(event);
	}

	function onPointerDown(event: PointerEvent) {
		updatePointerFromEvent(event);
		handlePointerDown(event);
	}

	function onPointerUp(event: PointerEvent) {
		if ($tool === 'fly') {
			event.stopPropagation();
			return;
		}
		if (depthAdjustPointerId === event.pointerId) {
			try {
				container.releasePointerCapture(event.pointerId);
			} catch (_) {}
			depthAdjustPointerId = null;
		}
		if (event.button === 2 && (isVoxelDrag || cuboidPhase)) {
			cancelDrag();
		}
		if (event.button === 0 && isStampDrag) {
			if (lastStampPos) {
				placeStamp(lastStampPos);
			}
			isStampDrag = false;
			lastStampPos = null;
			updatePreviewMesh([]);
		}
		if (event.button === 0 && isVoxelDrag) {
			updatePointerFromEvent(event);
			const mode = get(strokeMode);
			if (mode === 'cuboid' && dragStartPos && dragFaceNormal) {
				// Enter depth phase: drag plane, then scroll for depth
				let cornerB = dragStartPos;
				const hit = getIntersection();
				if (hit) {
					const pos = $tool === 'add' ? getAddPosition(hit) : getVoxelPosition(hit);
					if (pos) cornerB = pos;
				}
				cuboidPhase = 'depth';
				cuboidPlane = {
					a: dragStartPos,
					b: cornerB,
					normal: dragFaceNormal
				};
				cuboidDepth = 1;
				pendingStrokePositions = getAxisAlignedCuboid(
					cuboidPlane.a,
					cuboidPlane.b,
					cuboidPlane.normal,
					cuboidDepth
				);
				updatePreviewMesh(pendingStrokePositions);
			} else {
				// Apply the stroke on release (line/plane)
				if (pendingStrokePositions.length > 0) {
					if ($tool === 'select') {
						applySelectStroke(pendingStrokePositions);
					} else {
						beginStroke();
						applyLineStroke(pendingStrokePositions);
					}
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
		if (depthAdjustPointerId === event.pointerId) {
			depthAdjustPointerId = null;
		}
		if (isVoxelDrag) {
			cancelDrag();
		}
		handlePointerMove();
	}

	function onContextMenu(event: Event) {
		if (isVoxelDrag || $tool === 'fly') event.preventDefault();
	}

	// Block pointer events from reaching FlyControls when in fly mode (we handle them ourselves)
	function onFlyPointerCapture(e: PointerEvent) {
		if ($tool === 'fly') e.stopPropagation();
	}

	// Noclip: WASD + Q/E movement
	function onFlyKeyDown(e: KeyboardEvent) {
		if (e.altKey || !flyControls?.enabled) return;
		switch (e.code) {
			case 'KeyW': flyMoveState.forward = 1; break;
			case 'KeyS': flyMoveState.back = 1; break;
			case 'KeyA': flyMoveState.left = 1; break;
			case 'KeyD': flyMoveState.right = 1; break;
			case 'KeyE': flyMoveState.up = 1; break;
			case 'KeyQ': flyMoveState.down = 1; break;
			case 'ShiftLeft':
			case 'ShiftRight': flyMoveState.shift = 1; break;
			default: return;
		}
		e.preventDefault();
		e.stopImmediatePropagation();
	}
	function onFlyKeyUp(e: KeyboardEvent) {
		if (!flyControls?.enabled) return;
		switch (e.code) {
			case 'KeyW': flyMoveState.forward = 0; break;
			case 'KeyS': flyMoveState.back = 0; break;
			case 'KeyA': flyMoveState.left = 0; break;
			case 'KeyD': flyMoveState.right = 0; break;
			case 'KeyE': flyMoveState.up = 0; break;
			case 'KeyQ': flyMoveState.down = 0; break;
			case 'ShiftLeft':
			case 'ShiftRight': flyMoveState.shift = 0; break;
			default: return;
		}
		e.preventDefault();
		e.stopImmediatePropagation();
	}

	function onWheel(event: WheelEvent) {
		if (cuboidPhase !== 'depth' || !cuboidPlane) return;
		event.preventDefault();
		event.stopPropagation();
		cuboidDepth += Math.sign(-event.deltaY);
		updateCuboidFromDepth();
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
			scene.updateMatrixWorld(true);
			if (ssaoPass?.enabled) {
				ssaoPass.camera.updateMatrixWorld(true);
				ssaoPass.ssaoMaterial.uniforms['cameraProjectionMatrix'].value.copy(
					ssaoPass.camera.projectionMatrix
				);
				ssaoPass.ssaoMaterial.uniforms['cameraInverseProjectionMatrix'].value.copy(
					ssaoPass.camera.projectionMatrixInverse
				);
			}
			composer.render();
		}
	}

	function animate(now?: number) {
		animationFrameId = requestAnimationFrame(animate);
		const t = now ?? performance.now();
		const delta = lastFrameTime ? (t - lastFrameTime) / 1000 : 0;
		lastFrameTime = t;
		if (flyControls?.enabled && camera) {
			const speedMult = flyMoveState.shift ? 1 / 8 : 1;
			const dist = FLY_MOVE_SPEED * delta * speedMult;
			const fwd = flyMoveState.forward - flyMoveState.back;
			const right = flyMoveState.right - flyMoveState.left;
			const up = flyMoveState.up - flyMoveState.down;
			if (fwd !== 0) {
				const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
				camera.position.addScaledVector(look, fwd * dist);
			}
			if (right !== 0) flyControls.moveRight(right * dist);
			if (up !== 0) camera.position.y += up * dist;
		} else {
			orbitControls?.update();
		}
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
		if (orbitControls) {
			orbitControls.enableZoom = cuboidPhase !== 'depth';
		}
	});

	$effect(() => {
		const v = $voxels;
		const sz = $gridSize;
		rebuildVoxelMeshes(v, sz);
		// Force SSAO pass to refresh when geometry changes (depth/normal buffers can be stale)
		if (ssaoPass && container && renderer) {
			const ratio = renderer.getPixelRatio();
			ssaoPass.setSize(container.clientWidth * ratio, container.clientHeight * ratio);
		}
		render();
	});

	$effect(() => {
		const sel = $selection;
		rebuildSelectionOverlay(sel);
		render();
	});

	$effect(() => {
		const r = $roughness;
		const m = $metalness;
		const envInt = $envMapIntensity;
		for (const { mesh } of meshesByColor.values()) {
			const mat = mesh.material as THREE.MeshStandardMaterial;
			mat.roughness = r;
			mat.metalness = m;
			mat.envMapIntensity = envInt;
		}
		render();
	});

	onMount(() => {
		if (!loadFromStorage()) initCanvas(get(gridSize));
		const sz = get(gridSize);

		scene = new THREE.Scene();
		scene.background = new THREE.Color(hexToInt($backgroundColor));
		envMap = createEnvMap();
		scene.environment = envMap;

		camera = new THREE.PerspectiveCamera(
			focalLengthToFov(get(focalLength)),
			1,
			1,
			10000
		);
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

		selectionGroup = new THREE.Group();
		scene.add(selectionGroup);

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

		orbitControls = new OrbitControls(camera, renderer.domElement);
		orbitControls.enableDamping = true;
		orbitControls.dampingFactor = 0.05;
		orbitControls.addEventListener('change', updateZoomPercent);

		flyControls = new PointerLockControls(camera, container);
		flyControls.pointerSpeed = FLY_POINTER_SPEED;
		flyControls.enabled = false;

		window.addEventListener('keydown', onFlyKeyDown, true);
		window.addEventListener('keyup', onFlyKeyUp, true);

		updateZoomPercent();

		raycaster = new THREE.Raycaster();
		pointer = new THREE.Vector2();

		container.addEventListener('pointermove', onPointerMove);
		container.addEventListener('pointerdown', onPointerDown, true);
		container.addEventListener('pointerup', onFlyPointerCapture, true);
		container.addEventListener('pointerup', onPointerUp);
		container.addEventListener('pointercancel', onFlyPointerCapture, true);
		container.addEventListener('pointercancel', onPointerCancel);
		container.addEventListener('contextmenu', onContextMenu);
		container.addEventListener('wheel', onWheel, { passive: false, capture: true });
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

	$effect(() => {
		const fl = $focalLength;
		if (camera) {
			camera.fov = focalLengthToFov(fl);
			camera.updateProjectionMatrix();
			render();
		}
	});

	let prevTool = $state<Tool | null>(null);
	$effect(() => {
		const t = $tool;
		if (!orbitControls || !flyControls) return;
		const isFly = t === 'fly';
		orbitControls.enabled = !isFly;
		flyControls.enabled = isFly;
		if (isFly && cuboidPhase) {
			flyControls.unlock();
			cancelDrag();
		}
		if (!isFly && prevTool === 'fly' && camera) {
			flyControls.unlock();
			flyMoveState.forward = flyMoveState.back = flyMoveState.left = flyMoveState.right =
				flyMoveState.up = flyMoveState.down = flyMoveState.shift = 0;
			// Sync orbit target when exiting fly mode so orbit feels natural
			const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
			orbitControls.target.copy(camera.position).add(dir.multiplyScalar(50));
		}
		prevTool = t;
		render();
	});

	onDestroy(() => {
		if (!browser) return;
		saveToStorage();
		cancelAnimationFrame(animationFrameId);
		container?.removeEventListener('pointermove', onPointerMove);
		container?.removeEventListener('pointerdown', onPointerDown, true);
		container?.removeEventListener('pointerup', onFlyPointerCapture, true);
		container?.removeEventListener('pointerup', onPointerUp);
		container?.removeEventListener('pointercancel', onFlyPointerCapture, true);
		container?.removeEventListener('pointercancel', onPointerCancel);
		container?.removeEventListener?.('contextmenu', onContextMenu);
		container?.removeEventListener('wheel', onWheel, true);
		window.removeEventListener('resize', onWindowResize);
		window.removeEventListener('keydown', onFlyKeyDown, true);
		window.removeEventListener('keyup', onFlyKeyUp, true);
		orbitControls?.removeEventListener?.('change', updateZoomPercent);
		orbitControls?.dispose();
		flyControls?.dispose();
		ssaoPass?.dispose();
		composer?.dispose();
		renderer?.dispose();
		envMap?.dispose();
		for (const { mesh } of meshesByColor.values()) {
			mesh.geometry.dispose();
			(mesh.material as THREE.Material).dispose();
		}
		boxGeometry?.dispose();
		rollOverMaterial?.dispose();
		previewMaterial?.dispose();
		selectionMaterial?.dispose();
		gridGroup?.traverse((obj) => {
			if (obj instanceof THREE.LineSegments && obj.geometry) obj.geometry.dispose();
		});
		gridLineMaterial?.dispose();
	});
</script>

<div class="canvas-container" bind:this={container} role="application" aria-label="Voxel sculpting canvas">
	{#if cuboidPhase === 'depth'}
		<div
			class="depth-slider-container"
			role="slider"
			aria-label="Cuboid depth"
			aria-valuemin="-20"
			aria-valuemax="20"
			aria-valuenow={cuboidDepth}
			tabindex="0"
			onpointerdown={(e) => {
				e.stopPropagation();
				depthSliderPointerId = e.pointerId;
				depthSliderStartY = e.clientY;
				depthSliderStartDepth = cuboidDepth;
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			}}
			onpointermove={(e) => {
				if (depthSliderPointerId !== e.pointerId) return;
				const dy = depthSliderStartY - e.clientY;
				cuboidDepth = depthSliderStartDepth + Math.round(dy / 6);
				updateCuboidFromDepth();
			}}
			onpointerup={(e) => {
				if (depthSliderPointerId === e.pointerId) {
					depthSliderPointerId = null;
				}
			}}
			onpointercancel={(e) => {
				if (depthSliderPointerId === e.pointerId) {
					depthSliderPointerId = null;
				}
			}}
		>
			<div class="depth-slider-track">
				<div class="depth-slider-thumb" style="bottom: {Math.min(100, Math.max(0, 50 + cuboidDepth * 2.5))}%"></div>
			</div>
			<span class="depth-slider-label">Depth: {cuboidDepth}</span>
		</div>
		<button
			type="button"
			class="cuboid-done-btn"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={() => commitCuboid()}
			title="Tap Done to apply"
			aria-label="Apply cuboid selection"
		>
			Done
		</button>
	{/if}
	{#if deltaDisplay}
		<div
			class="delta-display"
			aria-live="polite"
			style="left: {pointerScreen.x}px; top: {pointerScreen.y}px;"
		>
			Δ {deltaDisplay.dx}, {deltaDisplay.dy}, {deltaDisplay.dz}
		</div>
	{/if}
	{#if $tool === 'fly'}
		<div class="fly-hint" role="status" aria-live="polite">
			Click to capture · WASD move · E/Q up/down · Shift 1/8 speed · Move mouse to look
		</div>
	{:else}
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
	{/if}
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

	.cuboid-done-btn {
		position: absolute;
		top: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		min-width: 2.75rem;
		min-height: 2.75rem;
		padding: 0.5rem 1rem;
		background: rgba(0, 0, 0, 0.75);
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 4px;
		color: #fff;
		font-size: 0.9rem;
		cursor: pointer;
		pointer-events: auto;
		z-index: 1;
	}

	.cuboid-done-btn:hover {
		background: rgba(0, 0, 0, 0.85);
	}

	.cuboid-done-btn:active {
		background: rgba(255, 255, 255, 0.2);
	}

	.depth-slider-container {
		position: absolute;
		left: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem;
		background: rgba(0, 0, 0, 0.75);
		border: 1px solid rgba(255, 255, 255, 0.4);
		border-radius: 4px;
		pointer-events: auto;
		z-index: 1;
		touch-action: none;
	}

	.depth-slider-track {
		position: relative;
		width: 1rem;
		height: 6rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}

	.depth-slider-thumb {
		position: absolute;
		left: -2px;
		right: -2px;
		height: 0.75rem;
		background: rgba(255, 255, 255, 0.9);
		border-radius: 2px;
		pointer-events: none;
	}

	.depth-slider-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.9);
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

	.fly-hint {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		padding: 0.25rem 0.5rem;
		background: rgba(0, 0, 0, 0.6);
		border-radius: 4px;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.9);
		pointer-events: none;
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
