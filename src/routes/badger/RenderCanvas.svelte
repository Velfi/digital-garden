<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
  import { document as docStore, cells, modalRequest } from './store';
  import { assembleBadgeMesh } from './geometry/assembleBadgeMesh';
  import { BadgeMeshClient } from './geometry/badgeMeshClient';
  import type { MetalFinish } from './store/types';

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
  // Monotonic token used to drop stale responses when the inputs change
  // during a build. Mirrors the worker client's own filtering but covers the
  // short window between the worker reply and the main-thread assemble step.
  let pendingToken = 0;
  let hasFitCamera = false;
  const meshClient = new BadgeMeshClient();

  function finishColor(finish: MetalFinish): number {
    switch (finish) {
      case 'gold':
        return 0xd4a44e;
      case 'silver':
        return 0xc8ccd1;
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

  // Dispatch a worker build for the current store values, then assemble the
  // returned geometry data into a new THREE.Group on the main thread. The
  // worker and the client both coalesce in-flight jobs, so only the most
  // recent inputs ever land in the scene — the token check here covers the
  // additional gap between the worker reply and this function's body.
  function scheduleRebuild() {
    if (!scene) return;
    building = true;
    const token = ++pendingToken;
    const doc = $docStore;
    const cs = $cells;
    meshClient
      .build(doc, cs, finishColor(doc.render.finish), doc.render.metalSurface, doc.render.enamelFinish)
      .then((data) => {
        if (token !== pendingToken) return;
        if (!scene) return;
        if (badgeGroup) scene.remove(badgeGroup);
        if (disposeCurrent) disposeCurrent();
        const result = assembleBadgeMesh(data);
        badgeGroup = result.group;
        disposeCurrent = result.dispose;
        scene.add(badgeGroup);
        if (renderer) renderer.setClearColor(new THREE.Color(doc.render.background), 1);
        if (!hasFitCamera) {
          fitCamera();
          hasFitCamera = true;
        }
        building = false;
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

  // Dolly the perspective camera along its current view direction. factor < 1
  // moves the camera closer to the target (zoom in); factor > 1 pulls away.
  // Clamped to controls.minDistance/maxDistance to match drag-zoom behavior.
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
    if (renderer && scene && camera) renderer.render(scene, camera);
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

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(new THREE.Color($docStore.render.background), 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.7;
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    viewport.appendChild(renderer.domElement);

    scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    new EXRLoader().load('/badger/citrus_orchard_road_puresky_4k.exr', (texture) => {
      if (!scene) {
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
    controls.dampingFactor = 0.08;

    // Key light
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

    // Ground plane catcher for shadows
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const groundGeom = new THREE.PlaneGeometry(1000, 1000);
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // First build is deferred like the rest so the viewport (and its spinner)
    // paints before the synchronous mesh build blocks the main thread.
    scheduleRebuild();
    onResize();
    animate();

    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(viewport);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (disposeCurrent) disposeCurrent();
    resizeObserver?.disconnect();
    resizeObserver = null;
    controls?.dispose();
    renderer?.dispose();
    if (renderer && viewport?.contains(renderer.domElement)) viewport.removeChild(renderer.domElement);
    scene = null;
    camera = null;
    controls = null;
    renderer = null;
    badgeGroup = null;
  });

  // Reactively rebuild when doc or cells change. Using untrack in side-effect
  // prevents cycling. Deferred so the spinner overlay paints before the
  // synchronous mesh build blocks the main thread.
  $effect(() => {
    void $docStore;
    void $cells;
    untrack(() => {
      scheduleRebuild();
    });
  });

  // Handle export requests from the menu
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
