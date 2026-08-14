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
  import { createPathTracer, type PtRenderer, type RectLight } from './render/ptRenderer';
  import { createComposite, type PtComposite } from './render/ptComposite';
  import { createDenoiser, type PtDenoise } from './render/ptDenoise';

  // Module-level diagnostics for tracking GL context exhaustion. These
  // accumulate across all mounts within a single page load (so HMR cycles
  // and mode-switch flapping show up in the counters). Logged whenever a
  // mount fails to get a healthy context, which is the main symptom of
  // hitting the browser's per-page context cap (Safari ~8, Chrome ~16).
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
  // Monotonic token used to drop stale responses when the inputs change
  // during a build. Mirrors the worker client's own filtering but covers the
  // short window between the worker reply and the main-thread assemble step.
  let pendingToken = 0;
  let hasFitCamera = false;
  const meshClient = new BadgeMeshClient();
  // Signatures of the last successful build's inputs, used to skip work when
  // a reactive tick fires without a meaningful change. `geomSig` covers
  // everything that affects mesh geometry (paths, texts, dimensions, cells,
  // enamelFinish — the inputs the worker reads). `matSig` covers material-
  // only render settings (finish, metalSurface, background) that can be
  // applied without re-running the worker. A hash of stringified inputs is
  // O(n) in path count, the same order as the build itself, so the cost is
  // negligible relative to skipping a full rebuild.
  let lastGeomSig = '';
  let lastMatSig = '';
  // Cached worker output from the most recent geometry build. Material-only
  // updates re-assemble from this without re-running the worker — same
  // triangles, fresh materials. Held by reference; the worker's result is
  // structurally cloned by postMessage so we own this copy.
  let lastMeshData: BadgeMeshData | null = null;

  // Path tracer. Construction is deferred until the EXR environment map
  // has loaded so we can pass the envmap into the shader uniforms once.
  // `ptReady` gates the animation loop so we don't try to render before
  // the triangle textures + environment are both in place.
  let pt: PtRenderer | null = null;
  let composite: PtComposite | null = null;
  let denoiser: PtDenoise | null = null;
  // Holds the raw equirect EXR while it's the envmap source for the PT.
  // Disposed on destroy so we don't leak the HDRI blob on route changes.
  let rawEnv: THREE.Texture | null = null;
  let ptReady = $state(false);
  let ptSamples = $state(0);
  let ptProgressLabel = $state('Loading tracer');
  let ptProgressPct = $state(0);
  let lastDenoisedSampleCount = 0;
  // Idle tracking for raster → path-trace fade-in.
  let lastInteractionAt = 0;
  // Start accumulating almost immediately after interaction stops —
  // progressive refinement is the whole point, so a long "wait then
  // snap" feels worse than "start noisy, refine in place".
  const PT_IDLE_MS = 80;
  const PT_FADE_MS = 250;
  // Sample cap is user-configurable via $docStore.render.maxSamples; read
  // through this helper at the callsites that need it so raising the cap
  // mid-session immediately unblocks the accumulator without a restart.
  function ptMaxSamples(): number {
    return $docStore.render.maxSamples;
  }
  // Kick in adaptive sampling once we have enough samples for a meaningful
  // variance estimate. Below this, every pixel runs every frame.
  const PT_ADAPTIVE_START = 16;
  const PT_ADAPTIVE_THRESHOLD = 0.003;
  // High-DPI panels can silently push the tracer back toward full-res even
  // with PT_RES_SCALE < 1. Clamping the PT's effective DPR keeps sample time
  // predictable while the final composite still lands on the native canvas.
  const PT_RES_SCALE = 0.5;
  const PT_MAX_DPR = 1.25;
  const PT_BLOOM_STRENGTH = 0.22;
  const PT_BLOOM_THRESHOLD = 1.1;
  const ORBIT_ROTATE_SPEED = 0.9;
  const ORBIT_ZOOM_SPEED = 0.92;

  // Three softbox rects sized relative to the scene bbox. Positioned like a
  // classic product-photo three-point setup: key above/right, fill below/left
  // (softer, cooler), rim behind/above (warm, strong, gives edge highlights).
  // Emission values are tuned so that the HDRI + rects together match the
  // raster's apparent brightness — the HDRI alone was too diffuse, especially
  // on polished metal where highlight direction is what sells the surface.
  function buildRectLights(bbox: THREE.Box3): RectLight[] {
    if (bbox.isEmpty()) return [];
    const size = new THREE.Vector3();
    const centre = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(centre);
    const r = Math.max(size.length(), 1) * 0.6;
    // Rect dimensions scale with scene radius so larger badges get
    // proportionally larger softboxes.
    const boxW = r * 1.15;
    const boxH = r * 0.72;
    const mk = (pos: THREE.Vector3, target: THREE.Vector3, emission: THREE.Vector3): RectLight => {
      // Build an orthonormal frame with +Z pointing from the rect toward
      // the target. edgeU × edgeV determines the lit normal: we choose the
      // handedness so the normal points *from the rect toward* the target
      // (badge), matching the shader's convention of uRectNormal being the
      // outward-facing side.
      const forward = new THREE.Vector3().subVectors(target, pos).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      const up = new THREE.Vector3().crossVectors(forward, right).normalize();
      // Origin = pos - (edgeU + edgeV) / 2 so (origin, edgeU, edgeV) describes
      // a rect centred on `pos`.
      const edgeU = right.clone().multiplyScalar(boxW);
      const edgeV = up.clone().multiplyScalar(boxH);
      const origin = pos
        .clone()
        .sub(edgeU.clone().multiplyScalar(0.5))
        .sub(edgeV.clone().multiplyScalar(0.5));
      return { origin, edgeU, edgeV, emission };
    };
    const keyPos = centre.clone().add(new THREE.Vector3(r * 1.8, r * 2.0, r * 1.5));
    const fillPos = centre.clone().add(new THREE.Vector3(-r * 1.6, r * 0.6, r * 1.2));
    const rimPos = centre.clone().add(new THREE.Vector3(-r * 0.4, r * 1.5, -r * 2.2));
    return [
      mk(keyPos, centre, new THREE.Vector3(40, 34, 28)),
      mk(fillPos, centre, new THREE.Vector3(7, 8, 9)),
      mk(rimPos, centre, new THREE.Vector3(34, 24, 16))
    ];
  }

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

  // Stringify the subset of inputs that influence mesh geometry. Any change
  // here requires a worker round-trip + re-pack of the PT scene.
  function geomSignature(doc: BadgeDocument, cs: Cell[]): string {
    return JSON.stringify({
      m: doc.metal,
      ca: doc.colorAssignments,
      ma: doc.materialAssignments,
      ef: doc.render.enamelFinish,
      cs
    });
  }
  // Material-only render settings. Changing one of these means we can skip
  // the worker but still need to rebuild materials and reset accumulation.
  function matSignature(doc: BadgeDocument): string {
    return `${doc.render.finish}|${doc.render.metalSurface}|${doc.render.background}`;
  }

  // Swap the current badge group for a freshly-assembled one, push it into
  // the path tracer, and update background/lights. Shared by both the
  // worker-rebuild and material-only paths.
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
    if (pt && badgeGroup) {
      badgeGroup.updateMatrixWorld(true);
      pt.setScene(badgeGroup);
      const bbox = new THREE.Box3().setFromObject(badgeGroup);
      pt.setRectLights(buildRectLights(bbox));
      const top = bg.clone().lerp(new THREE.Color(0xf7f1e8), 0.78);
      const bottom = bg.clone().lerp(new THREE.Color(0xe4d8c9), 0.58);
      pt.setBackdrop(top, bottom);
    }
    lastMeshData = data;
  }

  // Apply material-only render settings to the existing badge group without
  // touching geometry or going through the worker. Used when only finish /
  // metalSurface / background changed — the worker would produce the exact
  // same triangle data, so we re-use the cached mesh data and only reswap
  // the metal/enamel materials. Synchronous — no spinner, no raster flash.
  function applyMaterialsOnly() {
    if (!scene || !badgeGroup || !lastMeshData) return;
    // Bump the token so any in-flight worker reply is treated as stale and
    // dropped. Without this, a slow worker build could land after our
    // synchronous swap and overwrite the fresh group with the older one.
    ++pendingToken;
    const doc = $docStore;
    // Patch the material-affecting fields on the cached mesh data, then
    // re-assemble. assembleBadgeMesh only reads finishColor/metalSurface/
    // enamelFinish for material construction — the triangle arrays in
    // `pieces` are identical to the previous build.
    installBadgeGroup({
      ...lastMeshData,
      finishColor: finishColor(doc.render.finish),
      metalSurface: doc.render.metalSurface,
      enamelFinish: doc.render.enamelFinish
    });
    // Materials changed → accumulated radiance is stale. Reset, but don't
    // bump lastInteractionAt — that would flash the raster preview, which
    // is jarring for what visually looks like a small recolor.
    pt?.reset();
    ptSamples = 0;
    ptProgressPct = 0;
    ptProgressLabel = 'Refining materials';
    lastDenoisedSampleCount = 0;
    lastMatSig = matSignature(doc);
  }

  // Dispatch a worker build for the current store values, then assemble the
  // returned geometry data into a new THREE.Group on the main thread. The
  // worker and the client both coalesce in-flight jobs, so only the most
  // recent inputs ever land in the scene — the token check here covers the
  // additional gap between the worker reply and this function's body.
  function scheduleRebuild() {
    if (!scene) return;
    const doc = $docStore;
    const cs = $cells;
    const geomSig = geomSignature(doc, cs);
    const matSig = matSignature(doc);
    // Skip entirely when nothing relevant changed. This swallows reactive
    // ticks from unrelated stores (fontLoadTick on font load with no text,
    // theme/UI state propagating through derived chains, etc.) that would
    // otherwise repack the PT scene and reset the accumulator from sample 0.
    if (geomSig === lastGeomSig && matSig === lastMatSig && badgeGroup) {
      return;
    }
    // Pure material-only path: triangles are unchanged, we just need fresh
    // materials and a PT re-pack. Skip the worker round-trip entirely (it
    // would produce identical geometry), but the rest of the pipeline is
    // shared with the geometry path.
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
        // Geometry actually changed — bump idle so the raster shows briefly
        // while the PT spins up, matching pre-existing UX. installBadgeGroup
        // already called pt.setScene(), which clears the accumulator.
        if (pt) lastInteractionAt = performance.now();
        ptSamples = 0;
        ptProgressPct = 0;
        ptProgressLabel = 'Rebuilding trace';
        lastDenoisedSampleCount = 0;
        lastGeomSig = geomSig;
        lastMatSig = matSig;
        initError = null;
        building = false;
      })
      .catch((err) => {
        if (token !== pendingToken) return;
        building = false;
        initError = err instanceof Error ? err.message : 'Badge build failed.';
        console.error('[badger] rt mesh build failed', err);
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
    if (pt) {
      const { width: ptW, height: ptH } = pathTraceResolution(w, h);
      pt.resize(ptW, ptH);
      denoiser?.resize(ptW, ptH);
    }
    // Any resize invalidates in-flight accumulation; reset the idle clock
    // so the fade restarts once the user stops resizing.
    lastInteractionAt = performance.now();
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    controls?.update();
    if (!renderer || !scene || !camera) return;
    if (contextLost) return;
    const idleMs = performance.now() - lastInteractionAt;
    const ptAvailable =
      ptReady && pt !== null && composite !== null && denoiser !== null && !building;
    const converged = ptAvailable && pt!.samplesSoFar() >= ptMaxSamples();
    const canTrace = ptAvailable && idleMs >= PT_IDLE_MS && !converged;
    const canPreview = ptAvailable && idleMs < PT_IDLE_MS;
    updateTraceProgress(ptAvailable ? pt : null, idleMs, building);
    if (canTrace && pt && composite && denoiser) {
      // 1. Path-trace one sample into the accumulator + G-buffer.
      pt.setCamera(camera, { width: viewport.clientWidth, height: viewport.clientHeight });
      const samples = pt.samplesSoFar();
      pt.setAdaptiveSampling(samples >= PT_ADAPTIVE_START, PT_ADAPTIVE_THRESHOLD);
      pt.renderFrame();
      // 2. Denoise on a widening cadence. Early samples change the image a
      //    lot per frame, so we filter every sample; once we're past ~16
      //    samples the delta per frame is tiny and re-filtering at full
      //    4-iter cost is mostly wasted GPU. The composite keeps showing
      //    the previous filtered output between refreshes.
      const nextSamples = pt.samplesSoFar();
      const shouldDenoise = denoiseCadence(nextSamples);
      if (shouldDenoise) {
        // Keep more filter footprint late in the trace; highly polished
        // cloisonne leaves mostly low-frequency residual speckle rather than
        // crisp detail, so backing off to a single pass too early leaves the
        // image visibly grainier than it needs to be.
        const iter = nextSamples < 32 ? 4 : nextSamples < 128 ? 3 : 2;
        denoiser.run(
          pt.getAccumTexture(),
          pt.getGbufferNormalTexture(),
          pt.getGbufferAlbedoTexture(),
          nextSamples,
          iter
        );
        lastDenoisedSampleCount = nextSamples;
      }
      // 3. Composite the (possibly cached) denoised HDR straight to the
      //    canvas. No raster backplate: the composite's backdrop path
      //    (triggered by albedo-mask == 0 / ground-plane pixels) already
      //    produces the gradient and any shadow-catching is baked into the
      //    PT ground plane. Clear then draw is one fewer scene walk.
      const fadeT = Math.min(1, Math.max(0, (idleMs - PT_IDLE_MS) / PT_FADE_MS));
      const fade = fadeT * fadeT * (3.0 - 2.0 * fadeT);
      composite.setInputs(
        denoiser.getOutputTexture(),
        pt.getGbufferAlbedoTexture(),
        nextSamples,
        fade,
        true
      );
      composite.setBloom(PT_BLOOM_STRENGTH, PT_BLOOM_THRESHOLD);
      renderer.setClearColor(new THREE.Color($docStore.render.background), 1);
      renderer.clear();
      renderer.autoClear = false;
      renderer.render(composite.scene, composite.quadCamera);
      renderer.autoClear = true;
      return;
    }
    if (converged && !canPreview && pt && composite && denoiser) {
      // Sample cap reached. Run one last stronger denoise pass at the cap so
      // the final image isn't stuck with the lighter "interactive" filter
      // settings from a previous cadence hit, then keep blitting it.
      if (lastDenoisedSampleCount !== pt.samplesSoFar()) {
        denoiser.run(
          pt.getAccumTexture(),
          pt.getGbufferNormalTexture(),
          pt.getGbufferAlbedoTexture(),
          pt.samplesSoFar(),
          5
        );
        lastDenoisedSampleCount = pt.samplesSoFar();
      }
      composite.setInputs(
        denoiser.getOutputTexture(),
        pt.getGbufferAlbedoTexture(),
        pt.samplesSoFar(),
        1,
        true
      );
      composite.setBloom(PT_BLOOM_STRENGTH, PT_BLOOM_THRESHOLD);
      renderer.setClearColor(new THREE.Color($docStore.render.background), 1);
      renderer.clear();
      renderer.autoClear = false;
      renderer.render(composite.scene, composite.quadCamera);
      renderer.autoClear = true;
      return;
    }
    if (canPreview && pt && composite) {
      // During camera drag we run the integrator at 1 bounce into a 1/4-pixel
      // preview target. The composite reads that texture directly (bilinear
      // upscales for free) and skips remodulation — the preview is meant to
      // be fast, not physically-correct.
      pt.setCamera(camera, { width: viewport.clientWidth, height: viewport.clientHeight });
      pt.setAdaptiveSampling(false);
      pt.renderPreview();
      composite.setInputs(
        pt.getPreviewTexture(),
        pt.getGbufferAlbedoTexture(),
        1,
        1,
        false
      );
      composite.setBloom(0, PT_BLOOM_THRESHOLD);
      renderer.setClearColor(new THREE.Color($docStore.render.background), 1);
      renderer.clear();
      renderer.autoClear = false;
      renderer.render(composite.scene, composite.quadCamera);
      renderer.autoClear = true;
      return;
    }
    renderer.render(scene, camera);
  }

  // Adaptive denoise cadence: filter every frame up to 4 samples (the image
  // is still changing rapidly), then every 2nd, every 4th, every 8th, and so
  // on up to every 16th frame once the accumulation is nearly converged.
  // Perceptually indistinguishable from filtering every frame past ~32
  // samples, but saves 4 filter passes on most frames.
  function denoiseCadence(samples: number): boolean {
    if (samples <= 4) return true;
    if (samples <= 16) return samples % 2 === 0;
    if (samples <= 64) return samples % 4 === 0;
    return samples % 8 === 0;
  }

  function updateTraceProgress(activePt: PtRenderer | null, idleMs: number, isBuilding: boolean) {
    if (isBuilding) {
      ptSamples = 0;
      ptProgressPct = 0;
      ptProgressLabel = 'Building badge';
      return;
    }
    if (!ptReady || !activePt) {
      ptSamples = 0;
      ptProgressPct = 0;
      ptProgressLabel = 'Loading tracer';
      return;
    }
    const samples = activePt.samplesSoFar();
    ptSamples = samples;
    const maxSamples = ptMaxSamples();
    const pct = Math.min(100, Math.round((samples / maxSamples) * 100));
    ptProgressPct = pct;
    if (idleMs < PT_IDLE_MS) {
      ptProgressLabel = samples > 0 ? `Interactive preview (${samples} samples cached)` : 'Interactive preview';
      return;
    }
    if (samples >= maxSamples) {
      ptProgressPct = 100;
      ptProgressLabel = `Reached sample cap at ${samples} samples`;
      return;
    }
    if (samples === 0) {
      ptProgressLabel = 'Starting path trace';
      return;
    }
    ptProgressLabel = `Refining ${samples} / ${maxSamples} samples`;
  }

  function pathTraceResolution(viewW: number, viewH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, PT_MAX_DPR);
    return {
      width: Math.max(1, Math.floor(viewW * dpr * PT_RES_SCALE)),
      height: Math.max(1, Math.floor(viewH * dpr * PT_RES_SCALE))
    };
  }

  // OrbitControls 'change' fires on drag AND on the damping tail; both
  // count as "not idle yet". We always reset the idle clock on change,
  // which naturally defers path-trace accumulation until damping settles.
  function onControlsChange() {
    lastInteractionAt = performance.now();
    if (pt) {
      pt.reset();
      ptSamples = 0;
      ptProgressPct = 0;
      ptProgressLabel = 'Interactive preview';
      lastDenoisedSampleCount = 0;
    }
  }

  export async function exportPng() {
    if (!renderer || !scene || !camera) return;
    // If the path tracer is ready, accumulate a deep sample budget before
    // capturing — the idle-path render is capped at PT_MAX_SAMPLES and the
    // denoiser is good enough that 128 samples exports as clean as the old
    // 512-sample undenoised path. Runs synchronously so the returned canvas
    // is guaranteed converged.
    if (pt && composite && denoiser) {
      const EXPORT_SAMPLES = 128;
      pt.reset();
      pt.setAdaptiveSampling(false);
      pt.setCamera(camera, { width: viewport.clientWidth, height: viewport.clientHeight });
      for (let i = 0; i < EXPORT_SAMPLES; i++) pt.renderFrame();
      denoiser.run(
        pt.getAccumTexture(),
        pt.getGbufferNormalTexture(),
        pt.getGbufferAlbedoTexture(),
        pt.samplesSoFar(),
        5 // one extra iteration for export — slower but slightly cleaner
      );
      renderer.render(scene, camera);
      composite.setInputs(
        denoiser.getOutputTexture(),
        pt.getGbufferAlbedoTexture(),
        pt.samplesSoFar(),
        1,
        true
      );
      renderer.autoClear = false;
      renderer.render(composite.scene, composite.quadCamera);
      renderer.autoClear = true;
      lastInteractionAt = performance.now();
    } else {
      renderer.render(scene, camera);
    }
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

  // Tracks whether mount has run to completion so onDestroy knows what to
  // tear down. Mount is deferred via requestAnimationFrame to give the
  // viewport a real layout pass (Safari + a 0×0 canvas can hand back a
  // dead context even when the canvas is attached). Cancelled by onDestroy.
  let mountRaf = 0;

  function tryMount(): boolean {
    // Returns true if the renderer ended up initialized, false if every
    // bail-out path was hit. The caller may retry on a subsequent RAF;
    // initError is set on every failure so if no retry comes, the overlay
    // shows the latest reason.
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
        antialias: false,
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
    if (!renderer.capabilities.isWebGL2) {
      initError = 'Badger requires WebGL2, but this browser only provided WebGL1.';
      console.error('[badger] WebGL2 unavailable', {
        mountAttempts,
        activeRenderers
      });
      renderer.dispose();
      renderer = null;
      if (viewport.contains(canvas0)) viewport.removeChild(canvas0);
      return false;
    }
    activeRenderers++;
    // Halt the RAF loop on context loss; the browser fires this when it
    // reclaims the context (GPU reset, too many contexts, tab backgrounded
    // on some platforms). Without preventDefault + a restore handler the
    // canvas stays black even once the context is recoverable.
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
        lastInteractionAt = performance.now();
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
    renderer.toneMappingExposure = 0.7;
    renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
    // Canvas is already attached to viewport (above, before getContext) —
    // calling appendChild again would be a no-op since the node is already
    // a child, but skip it to make the intent obvious.

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
      pmrem.dispose();

      // Keep the raw equirect around for the path tracer — it samples
      // the environment directly without PMREM's prefilter chain (the
      // PMREM cubemap is convolved for specular lobes, which the tracer
      // handles itself via BRDF sampling). The PMREM envMap remains on
      // scene.environment for the raster fallback's PBR lookups.
      rawEnv = texture;
      // Render at a reduced internal resolution so the first sample
      // lands quickly and per-sample cost stays modest. The composite
      // pass upscales smoothly with bilinear filtering on the accum
      // texture. We can bump this back toward 1.0 later once we've
      // added a BVH or move to WebGPU compute.
      const { width: ptW, height: ptH } = pathTraceResolution(
        viewport.clientWidth,
        viewport.clientHeight
      );
      pt = createPathTracer({
        renderer,
        envMap: texture,
        width: ptW,
        height: ptH,
        envIntensity: 1.5
      });
      composite = createComposite();
      composite.setBloom(PT_BLOOM_STRENGTH, PT_BLOOM_THRESHOLD);
      denoiser = createDenoiser({ renderer, width: ptW, height: ptH });
      ptReady = true;
      ptProgressLabel = 'Starting path trace';
      if (badgeGroup) {
        badgeGroup.updateMatrixWorld(true);
        pt.setScene(badgeGroup);
        const bbox = new THREE.Box3().setFromObject(badgeGroup);
        pt.setRectLights(buildRectLights(bbox));
        const bg = new THREE.Color($docStore.render.background);
        pt.setBackdrop(bg.clone().multiplyScalar(1.08), bg.clone().multiplyScalar(0.88));
      }
      lastInteractionAt = performance.now();
    });

    camera = new THREE.PerspectiveCamera(
      40,
      viewport.clientWidth / Math.max(1, viewport.clientHeight),
      0.1,
      5000
    );
    camera.position.set(0, 25, 40);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.rotateSpeed = ORBIT_ROTATE_SPEED;
    controls.zoomSpeed = ORBIT_ZOOM_SPEED;
    controls.addEventListener('change', onControlsChange);

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

    // Raster no longer needs a shadow catcher — the path tracer packs its
    // own ground plane into the scene (see ptScene.ts) and the raster is
    // only used as a brief drag-preview backdrop.

    // First build is deferred like the rest so the viewport (and its spinner)
    // paints before the synchronous mesh build blocks the main thread.
    scheduleRebuild();
    onResize();
    animate();

    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(viewport);
    return true;
  }

  onMount(() => {
    // Defer the first context-creation attempt until after the next paint.
    // Safari sometimes hands back a dead context when the canvas/viewport
    // hasn't gone through a full layout pass yet, even when the canvas is
    // attached and sized — letting the browser paint once first dramatically
    // improves the success rate. If the first attempt still fails (initError
    // got set), retry once more on the following frame; some Safari versions
    // recover after a single frame of GPU pressure clearing. Beyond two
    // attempts we trust initError and stop retrying so the user sees the
    // overlay rather than an infinite spin.
    const attempt = (retriesLeft: number) => {
      if (tryMount()) return;
      if (retriesLeft > 0) {
        // Clear the initError that tryMount set so the overlay doesn't
        // flash before the retry; if the retry also fails, tryMount sets
        // it again.
        initError = null;
        mountRaf = requestAnimationFrame(() => attempt(retriesLeft - 1));
      }
    };
    mountRaf = requestAnimationFrame(() => attempt(1));
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    // Cancel any pending mount attempt — onDestroy can fire before the
    // deferred RAF callback if the user toggles modes faster than a frame.
    if (mountRaf) cancelAnimationFrame(mountRaf);
    if (disposeCurrent) disposeCurrent();
    resizeObserver?.disconnect();
    resizeObserver = null;
    pt?.dispose();
    pt = null;
    composite?.dispose();
    composite = null;
    denoiser?.dispose();
    denoiser = null;
    ptReady = false;
    rawEnv?.dispose();
    rawEnv = null;
    controls?.dispose();
    // Worker process for the mesh build pipeline. Long-lived per component
    // instance; without explicit termination it survives until the page
    // navigates away, leaking a worker per mount/unmount cycle (which adds
    // up under HMR and across mode switches in this app).
    meshClient.dispose();
    if (renderer) {
      const canvas = renderer.domElement;
      if (onContextLost) canvas.removeEventListener('webglcontextlost', onContextLost);
      if (onContextRestored) canvas.removeEventListener('webglcontextrestored', onContextRestored);
      // Actively release the GL context. Browsers cap concurrent contexts
      // (Safari ~8, Chrome ~16); relying on GC means rapid tab switches
      // can exhaust the pool and the next mount gets a broken context
      // where getShaderPrecisionFormat returns null.
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

  // Reactively rebuild when doc or cells change. Both deps are needed:
  // $docStore covers normal edits; $cells covers async-only changes like a
  // font finishing its load (which bumps fontLoadTick → re-derives cells
  // without ever updating $docStore). Without the signature check this used
  // to fire twice per edit (docStore + the derived chain settling) and pay
  // a worker rebuild + PT scene re-pack + accumulator reset each time —
  // scheduleRebuild now early-outs when neither geometry nor materials
  // changed, so a duplicate fire is a cheap signature compare instead of a
  // full rebuild.
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
      <p class="hint">Draw a closed shape in Metal mode to preview the badge in RT.</p>
    </div>
  {/if}
  {#if building}
    <div class="build-spinner" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
    </div>
  {/if}

  {#if ptReady && !initError && !contextLost}
    <div class="pt-progress" aria-live="polite">
      <div class="pt-progress-label">{ptProgressLabel}</div>
      <div class="pt-progress-meta">{ptProgressPct}% · {ptSamples} samples</div>
      <div class="pt-progress-track" aria-hidden="true">
        <div class="pt-progress-fill" style={`width: ${ptProgressPct}%`}></div>
      </div>
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

  .pt-progress {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    min-width: 13rem;
    max-width: min(18rem, calc(100% - 8rem));
    padding: 0.55rem 0.7rem;
    background: rgba(0, 0, 0, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.45rem;
    color: #fff;
    z-index: 12;
    pointer-events: none;
    backdrop-filter: blur(8px);
  }

  .pt-progress-label {
    font-size: 0.82rem;
    font-weight: 600;
  }

  .pt-progress-meta {
    margin-top: 0.12rem;
    font-size: 0.74rem;
    opacity: 0.8;
  }

  .pt-progress-track {
    margin-top: 0.45rem;
    width: 100%;
    height: 0.32rem;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    overflow: hidden;
  }

  .pt-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #f4cf7a, #f6f1d1);
    transition: width 120ms linear;
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
