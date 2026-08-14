<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
  import { document as docStore, cells, modalRequest } from './store';
  import { assembleBadgeMesh } from './geometry/assembleBadgeMesh';
  import type { BadgeMeshData } from './geometry/buildBadgeMeshData';
  import { BadgeMeshClient } from './geometry/badgeMeshClient';
  import type { BadgeDocument, Cell, MetalFinish } from './store/types';

  let mountAttempts = 0;
  let activeRenderers = 0;

  let viewport: HTMLDivElement;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let badgeGroup: THREE.Group | null = null;
  let disposeCurrent: (() => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let raf = 0;
  let building = $state(false);
  let contextLost = $state(false);
  let initError = $state<string | null>(null);
  let hasRenderableMesh = $state(false);
  let onContextLost: ((e: Event) => void) | null = null;
  let onContextRestored: (() => void) | null = null;
  let pendingToken = 0;
  let hasFitCamera = false;
  const meshClient = new BadgeMeshClient();
  let lastGeomSig = '';
  let lastMatSig = '';
  let lastMeshData: BadgeMeshData | null = null;
  const ORBIT_DAMPING_FACTOR = 0.12;
  const ORBIT_ROTATE_SPEED = 0.9;
  const ORBIT_ZOOM_SPEED = 0.92;

  function finishColor(finish: MetalFinish): number {
    switch (finish) {
      case 'gold':
        return 0xd4a44e;
      case 'silver':
        return 0xf2f4f7;
      case 'black_nickel':
        return 0x2a2b2d;
      case 'copper':
        return 0xb87333;
      case 'iron':
        return 0x52555a;
      case 'rose_gold':
        return 0xd9a295;
      case 'bronze':
        return 0x8c6a3f;
      case 'brass':
        return 0xc9a34a;
    }
  }

  function geomSignature(doc: BadgeDocument, cs: Cell[]): string {
    return JSON.stringify({
      m: doc.metal,
      ca: doc.colorAssignments,
      ma: doc.materialAssignments,
      ef: doc.render.enamelFinish,
      cs
    });
  }
  function matSignature(doc: BadgeDocument): string {
    return `${doc.render.finish}|${doc.render.metalSurface}|${doc.render.background}`;
  }

  function installBadgeGroup(data: BadgeMeshData) {
    if (!scene) return;
    if (badgeGroup) scene.remove(badgeGroup);
    if (disposeCurrent) disposeCurrent();
    const result = assembleBadgeMesh(data);
    badgeGroup = result.group;
    disposeCurrent = result.dispose;
    hasRenderableMesh = !new THREE.Box3().setFromObject(badgeGroup).isEmpty();
    scene.add(badgeGroup);
    const bg = new THREE.Color($docStore.render.background);
    if (renderer) renderer.setClearColor(bg, 1);
    lastMeshData = data;
  }

  function applyMaterialsOnly() {
    if (!scene || !badgeGroup || !lastMeshData) return;
    ++pendingToken;
    const doc = $docStore;
    installBadgeGroup({
      ...lastMeshData,
      finishColor: finishColor(doc.render.finish),
      metalSurface: doc.render.metalSurface,
      enamelFinish: doc.render.enamelFinish
    });
    lastMatSig = matSignature(doc);
  }

  function scheduleRebuild() {
    if (!scene) return;
    const doc = $docStore;
    const cs = $cells;
    const geomSig = geomSignature(doc, cs);
    const matSig = matSignature(doc);
    if (geomSig === lastGeomSig && matSig === lastMatSig && badgeGroup) return;
    if (geomSig === lastGeomSig && badgeGroup) {
      applyMaterialsOnly();
      return;
    }
    building = true;
    const token = ++pendingToken;
    meshClient
      .build(doc, cs, finishColor(doc.render.finish), doc.render.metalSurface, doc.render.enamelFinish)
      .then((data) => {
        if (token !== pendingToken) return;
        if (!scene) return;
        installBadgeGroup(data);
        if (!hasFitCamera) {
          fitCamera();
          hasFitCamera = true;
        }
        lastGeomSig = geomSig;
        lastMatSig = matSig;
        initError = null;
        building = false;
      })
      .catch((err) => {
        if (token !== pendingToken) return;
        building = false;
        initError = err instanceof Error ? err.message : 'Badge build failed.';
        console.error('[badger] pbr mesh build failed', err);
      });
  }

  function fitCamera() {
    if (!badgeGroup || !camera || !controls) return;
    const box = new THREE.Box3().setFromObject(badgeGroup);
    if (box.isEmpty()) {
      camera.position.set(0, 25, 40);
      controls.target.set(0, 0, 0);
      controls.update();
      return;
    }
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const radius = size.length() * 0.8;
    camera.position.set(center.x + radius, center.y + radius * 0.6, center.z + radius);
    controls.target.copy(center);
    controls.update();
  }

  function zoomBy(factor: number) {
    if (!camera || !controls) return;
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const current = offset.length();
    if (current === 0) return;
    const min = controls.minDistance ?? 0;
    const max = controls.maxDistance ?? Infinity;
    const next = Math.min(max, Math.max(min, current * factor));
    offset.multiplyScalar(next / current);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function onResize() {
    if (!renderer || !camera || !viewport) return;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    controls?.update();
    if (!renderer || !scene || !camera) return;
    if (contextLost) return;
    renderer.render(scene, camera);
  }

  export async function exportPng() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = window.document.createElement('a');
    a.href = dataUrl;
    a.download = 'badger.png';
    a.click();
  }

  export async function exportGlb() {
    if (!badgeGroup) return;
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    exporter.parse(
      badgeGroup,
      (result) => {
        const blob =
          result instanceof ArrayBuffer
            ? new Blob([result], { type: 'model/gltf-binary' })
            : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = result instanceof ArrayBuffer ? 'badger.glb' : 'badger.gltf';
        a.click();
        requestAnimationFrame(() => URL.revokeObjectURL(url));
      },
      (err) => console.error('[badger] glb export failed', err),
      { binary: true }
    );
  }

  let mountRaf = 0;

  function tryMount(): boolean {
    const w0 = Math.max(1, viewport.clientWidth);
    const h0 = Math.max(1, viewport.clientHeight);
    const canvas0 = document.createElement('canvas');
    canvas0.width = w0;
    canvas0.height = h0;
    canvas0.style.width = '100%';
    canvas0.style.height = '100%';
    canvas0.style.display = 'block';
    viewport.appendChild(canvas0);
    mountAttempts++;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas0,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
    } catch (err) {
      initError = err instanceof Error ? err.message : 'WebGL unavailable';
      console.error('[badger] WebGLRenderer init failed', err);
      if (viewport.contains(canvas0)) viewport.removeChild(canvas0);
      return false;
    }
    const gl = renderer.getContext();
    if (gl.isContextLost()) {
      initError = 'WebGL context unavailable (possibly too many active contexts).';
      console.error('[badger] WebGL context lost immediately after creation', {
        mountAttempts,
        activeRenderers
      });
      renderer.dispose();
      renderer = null;
      if (viewport.contains(canvas0)) viewport.removeChild(canvas0);
      return false;
    }
    activeRenderers++;
    const canvas = renderer.domElement;
    onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    onContextRestored = () => {
      contextLost = false;
      if (renderer) {
        renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
        onResize();
        animate();
      }
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(new THREE.Color($docStore.render.background), 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);

    scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    new EXRLoader().load('/badger/sunflowers_puresky_4k.exr', (texture) => {
      if (!scene || !renderer) {
        texture.dispose();
        pmrem.dispose();
        return;
      }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const envMap = pmrem.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      texture.dispose();
      pmrem.dispose();
    });

    camera = new THREE.PerspectiveCamera(
      40,
      viewport.clientWidth / Math.max(1, viewport.clientHeight),
      0.1,
      5000
    );
    camera.position.set(0, 25, 40);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = ORBIT_DAMPING_FACTOR;
    controls.rotateSpeed = ORBIT_ROTATE_SPEED;
    controls.zoomSpeed = ORBIT_ZOOM_SPEED;

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(20, 40, 30);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -100;
    keyLight.shadow.camera.right = 100;
    keyLight.shadow.camera.top = 100;
    keyLight.shadow.camera.bottom = -100;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.6);
    fillLight.position.set(-20, 20, -20);
    scene.add(fillLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.08);
    scene.add(ambient);

    scheduleRebuild();
    onResize();
    animate();

    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(viewport);
    return true;
  }

  onMount(() => {
    const attempt = (retriesLeft: number) => {
      if (tryMount()) return;
      if (retriesLeft > 0) {
        initError = null;
        mountRaf = requestAnimationFrame(() => attempt(retriesLeft - 1));
      }
    };
    mountRaf = requestAnimationFrame(() => attempt(1));
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (mountRaf) cancelAnimationFrame(mountRaf);
    if (disposeCurrent) disposeCurrent();
    resizeObserver?.disconnect();
    resizeObserver = null;
    controls?.dispose();
    meshClient.dispose();
    if (renderer) {
      const canvas = renderer.domElement;
      if (onContextLost) canvas.removeEventListener('webglcontextlost', onContextLost);
      if (onContextRestored) canvas.removeEventListener('webglcontextrestored', onContextRestored);
      renderer.forceContextLoss();
      renderer.dispose();
      if (viewport?.contains(canvas)) viewport.removeChild(canvas);
      activeRenderers = Math.max(0, activeRenderers - 1);
    }
    onContextLost = null;
    onContextRestored = null;
    scene = null;
    camera = null;
    controls = null;
    renderer = null;
    badgeGroup = null;
    hasRenderableMesh = false;
  });

  $effect(() => {
    void $docStore;
    void $cells;
    untrack(() => {
      scheduleRebuild();
    });
  });

  $effect(() => {
    const req = $modalRequest;
    if (req === 'exportPng') {
      untrack(() => {
        exportPng();
        modalRequest.set(null);
      });
    } else if (req === 'exportGlb') {
      untrack(() => {
        exportGlb();
        modalRequest.set(null);
      });
    }
  });
</script>

<div class="viewport" bind:this={viewport} role="presentation">
  {#if initError}
    <div class="error-overlay" role="alert">
      <p>3D preview unavailable.</p>
      <p class="detail">{initError}</p>
      <p class="hint">Try closing other tabs that use 3D graphics, then reload.</p>
    </div>
  {:else if contextLost}
    <div class="error-overlay" role="alert">
      <p>3D context lost. Attempting to recover…</p>
    </div>
  {:else if !building && !hasRenderableMesh}
    <div class="empty-overlay" role="status" aria-live="polite">
      <p>Nothing to render yet.</p>
      <p class="hint">Draw a closed shape in Metal mode to preview the badge in 3D.</p>
    </div>
  {/if}
  {#if building}
    <div class="build-spinner" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
    </div>
  {/if}

  <div
    class="zoom-controls"
    role="toolbar"
    aria-label="Zoom controls"
    tabindex="0"
    onpointerdown={(e) => e.stopPropagation()}
  >
    <button type="button" aria-label="Zoom out" onclick={() => zoomBy(1.2)}>−</button>
    <button type="button" aria-label="Zoom in" onclick={() => zoomBy(1 / 1.2)}>+</button>
    <button type="button" onclick={fitCamera}>Fit</button>
  </div>
</div>

<style>
  .viewport {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #111;
    border: 1px solid #a0a0a0;
  }

  .build-spinner {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    z-index: 10;
    pointer-events: none;
  }

  .error-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    z-index: 20;
    text-align: center;
  }

  .empty-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
    background:
      radial-gradient(circle at 50% 38%, rgba(255, 214, 122, 0.12), transparent 32%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0));
    color: rgba(255, 255, 255, 0.92);
    z-index: 15;
    text-align: center;
    pointer-events: none;
  }

  .error-overlay .detail {
    font-size: 0.85rem;
    opacity: 0.8;
    font-family: monospace;
  }

  .error-overlay .hint,
  .empty-overlay .hint {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  .build-spinner .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: badger-render-spin 0.8s linear infinite;
  }

  @keyframes badger-render-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .zoom-controls {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.25rem;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    color: #fff;
    font-size: 0.85rem;
  }

  .zoom-controls button {
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    cursor: pointer;
  }

  .zoom-controls button:hover {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
