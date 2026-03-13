<script lang="ts">
  import * as THREE from 'three';
  import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { onMount } from 'svelte';

  interface Props {
    camera: THREE.Camera;
    controls: OrbitControls;
    onRender: () => void;
  }
  let { camera, controls, onRender }: Props = $props();

  let canvasEl: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  const SIZE = 120;
  const RADIUS = 40;
  const DPR = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const LABEL_HIT_RADIUS = 14;
  const SNAP_DURATION = 300;

  type AxisDef = {
    label: string;
    dir: THREE.Vector3;
    color: string;
    dimColor: string;
    neg: boolean;
  };

  const axes: AxisDef[] = [
    {
      label: 'X',
      dir: new THREE.Vector3(1, 0, 0),
      color: '#E05555',
      dimColor: '#8B3535',
      neg: false
    },
    {
      label: 'Y',
      dir: new THREE.Vector3(0, 1, 0),
      color: '#55B855',
      dimColor: '#357035',
      neg: false
    },
    {
      label: 'Z',
      dir: new THREE.Vector3(0, 0, 1),
      color: '#5580E0',
      dimColor: '#354F8B',
      neg: false
    },
    {
      label: '',
      dir: new THREE.Vector3(-1, 0, 0),
      color: '#E05555',
      dimColor: '#8B3535',
      neg: true
    },
    {
      label: '',
      dir: new THREE.Vector3(0, -1, 0),
      color: '#55B855',
      dimColor: '#357035',
      neg: true
    },
    {
      label: '',
      dir: new THREE.Vector3(0, 0, -1),
      color: '#5580E0',
      dimColor: '#354F8B',
      neg: true
    }
  ];

  const EDGE_BAND = 10;

  let hoveredIndex = -1;
  let hoverEdge = false;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragConstraint: 'free' | 'theta' = 'free';
  let snapAnimId = 0;

  const rotMatrix = new THREE.Matrix3();
  const projected = new THREE.Vector3();

  type Projected = { sx: number; sy: number; depth: number; idx: number };

  function projectAxes(): Projected[] {
    if (!camera) return [];
    rotMatrix.setFromMatrix4(camera.matrixWorldInverse);
    const result: Projected[] = [];
    for (let i = 0; i < axes.length; i++) {
      projected.copy(axes[i].dir).applyMatrix3(rotMatrix);
      result.push({
        sx: projected.x * RADIUS,
        sy: -projected.y * RADIUS,
        depth: projected.z,
        idx: i
      });
    }
    return result;
  }

  export function draw() {
    if (!ctx) return;
    const w = SIZE * DPR;
    ctx.clearRect(0, 0, w, w);
    const cx = w / 2;
    const cy = w / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, RADIUS * DPR + 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 40, 40, 0.55)';
    ctx.fill();
    ctx.strokeStyle = hoverEdge ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = hoverEdge ? 2.5 * DPR : 1;
    ctx.stroke();
    ctx.restore();

    const items = projectAxes();
    items.sort((a, b) => a.depth - b.depth);

    for (const item of items) {
      const ax = axes[item.idx];
      const front = item.depth <= 0;
      const sx = item.sx * DPR;
      const sy = item.sy * DPR;
      const hovered = hoveredIndex === item.idx;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + sx, cy + sy);
      ctx.strokeStyle = front ? ax.color : ax.dimColor;
      ctx.lineWidth = (hovered ? 2.5 : 1.5) * DPR;
      ctx.globalAlpha = front ? 0.9 : 0.4;
      ctx.stroke();
      ctx.restore();

      const dotRadius = ax.neg ? (hovered ? 6 : 4.5) : hovered ? 8 : 6.5;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx + sx, cy + sy, dotRadius * DPR, 0, Math.PI * 2);
      ctx.fillStyle = front ? ax.color : ax.dimColor;
      ctx.globalAlpha = hovered ? 1 : front ? 0.95 : 0.5;
      ctx.fill();
      ctx.restore();

      if (!ax.neg) {
        ctx.save();
        const fontSize = (hovered ? 12 : 10) * DPR;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = front ? 1 : 0.45;
        ctx.fillText(ax.label, cx + sx, cy + sy + 0.5 * DPR);
        ctx.restore();
      }
    }
  }

  function edgeTest(ex: number, ey: number): boolean {
    const rect = canvasEl.getBoundingClientRect();
    const mx = ex - rect.left - SIZE / 2;
    const my = ey - rect.top - SIZE / 2;
    const dist = Math.sqrt(mx * mx + my * my);
    return dist >= RADIUS - EDGE_BAND && dist <= RADIUS + EDGE_BAND;
  }

  function hitTest(ex: number, ey: number): number {
    const rect = canvasEl.getBoundingClientRect();
    const mx = ex - rect.left - SIZE / 2;
    const my = ey - rect.top - SIZE / 2;
    const items = projectAxes();
    items.sort((a, b) => b.depth - a.depth);
    for (const item of items) {
      const dx = mx - item.sx;
      const dy = my - item.sy;
      if (dx * dx + dy * dy <= LABEL_HIT_RADIUS * LABEL_HIT_RADIUS) {
        return item.idx;
      }
    }
    return -1;
  }

  function snapToAxis(idx: number) {
    if (!camera || !controls) return;
    const ax = axes[idx];
    const target = controls.target.clone();
    const dist = camera.position.distanceTo(target);
    const originalUp = camera.up.clone();

    let endDir = ax.dir.clone();
    // For top/bottom views, nudge slightly off the pole so lookAt with Y-up doesn't degenerate
    if (Math.abs(endDir.y) > 0.9) {
      endDir.x += 0.0001;
      endDir.normalize();
    }
    const endPos = endDir.multiplyScalar(dist).add(target);

    const startPos = camera.position.clone();
    const startQuat = camera.quaternion.clone();
    const endCamera = new THREE.PerspectiveCamera();
    endCamera.position.copy(endPos);
    endCamera.up.copy(originalUp);
    endCamera.lookAt(target);
    const endQuat = endCamera.quaternion.clone();

    const startTime = performance.now();
    snapAnimId++;
    const thisId = snapAnimId;

    function step(now: number) {
      if (thisId !== snapAnimId) return;
      let t = Math.min(1, (now - startTime) / SNAP_DURATION);
      t = 1 - (1 - t) * (1 - t);

      camera.position.lerpVectors(startPos, endPos, t);
      camera.quaternion.slerpQuaternions(startQuat, endQuat, t);
      camera.up.copy(originalUp);
      controls.target.copy(target);
      controls.update();
      onRender();
      draw();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function onPointerDown(e: PointerEvent) {
    e.stopPropagation();
    const idx = hitTest(e.clientX, e.clientY);
    if (idx >= 0) {
      snapToAxis(idx);
      return;
    }
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    dragConstraint = edgeTest(e.clientX, e.clientY) ? 'theta' : 'free';
    canvasEl.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (isDragging && controls) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      dragStart = { x: e.clientX, y: e.clientY };

      const spherical = new THREE.Spherical().setFromVector3(
        new THREE.Vector3().subVectors(camera.position, controls.target)
      );
      spherical.theta -= dx * 0.008;
      if (dragConstraint === 'free') spherical.phi -= dy * 0.008;
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));

      const offset = new THREE.Vector3().setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      controls.update();
      onRender();
      draw();
      return;
    }
    const idx = hitTest(e.clientX, e.clientY);
    const nowEdge = idx < 0 && edgeTest(e.clientX, e.clientY);
    if (idx !== hoveredIndex || nowEdge !== hoverEdge) {
      hoveredIndex = idx;
      hoverEdge = nowEdge;
      canvasEl.style.cursor = idx >= 0 ? 'pointer' : nowEdge ? 'ew-resize' : 'grab';
      draw();
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (isDragging) {
      isDragging = false;
      dragConstraint = 'free';
      canvasEl.releasePointerCapture(e.pointerId);
    }
  }

  function onPointerLeave() {
    if (hoveredIndex !== -1 || hoverEdge) {
      hoveredIndex = -1;
      hoverEdge = false;
      draw();
    }
  }

  onMount(() => {
    ctx = canvasEl.getContext('2d')!;
    canvasEl.width = SIZE * DPR;
    canvasEl.height = SIZE * DPR;
    draw();
  });
</script>

<canvas
  bind:this={canvasEl}
  class="orbit-gizmo"
  width={SIZE * DPR}
  height={SIZE * DPR}
  style="width:{SIZE}px;height:{SIZE}px"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointerleave={onPointerLeave}
  role="toolbar"
  aria-label="Orbit gizmo"
></canvas>

<style>
  .orbit-gizmo {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    pointer-events: auto;
    z-index: 1;
    cursor: grab;
    touch-action: none;
  }
</style>
