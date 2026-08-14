import * as THREE from 'three';
import { packScene, type PtScenePayload, type PackSceneOptions } from './ptScene';
import { PT_VERT, PT_FRAG } from './ptShader';
import { buildEnvSampler, type EnvSampler } from './ptEnvMap';

// Host-side orchestrator for the path tracer. Owns the fullscreen quad,
// the ShaderMaterial, and two ping-pong multi-target renderbuffers. Each
// target carries three attachments:
//   0: radiance accumulator (RGBA32F, alpha = sum of L^2 for variance)
//   1: G-buffer normals + view-Z (RGBA32F: normal.xyz, viewZ)
//   2: G-buffer albedo + mask  (RGBA32F: albedo.rgb, mask)
//
// Only the *radiance* target ping-pongs; the G-buffer attachments are
// overwritten each frame with the latest first-hit data and the denoiser
// reads them unconditionally.

export type PtRendererOptions = {
  renderer: THREE.WebGLRenderer;
  envMap: THREE.Texture;
  envIntensity?: number;
  width?: number;
  height?: number;
};

export type RectLight = {
  // World-space corner of the rect. The two edge vectors span the light.
  origin: THREE.Vector3;
  edgeU: THREE.Vector3;
  edgeV: THREE.Vector3;
  // Emitted radiance (linear RGB, unbounded range). Representative values:
  // 30–80 for a bright softbox, 5–15 for a rim fill.
  emission: THREE.Vector3;
};

export type PtRenderer = {
  setScene(group: THREE.Group, opts?: PackSceneOptions): void;
  setCamera(cam: THREE.PerspectiveCamera, viewport: { width: number; height: number }): void;
  resize(width: number, height: number): void;
  reset(): void;
  renderFrame(): void;
  renderPreview(): void;
  samplesSoFar(): number;
  setDepthOfField(lensRadius: number, focusDist: number): void;
  setBackdrop(top: THREE.Color, bottom: THREE.Color): void;
  setRectLights(lights: RectLight[]): void;
  setAdaptiveSampling(active: boolean, threshold?: number): void;
  getAccumTexture(): THREE.Texture;
  getPreviewTexture(): THREE.Texture;
  getGbufferNormalTexture(): THREE.Texture;
  getGbufferAlbedoTexture(): THREE.Texture;
  dispose(): void;
};

const MAX_RECTS = 4;

export function createPathTracer(opts: PtRendererOptions): PtRenderer {
  const { renderer, envMap, envIntensity = 1.0 } = opts;
  let payload: PtScenePayload | null = null;
  let frameIndex = 0;
  let needsClear = false;
  let width = Math.max(1, opts.width ?? renderer.domElement.width);
  let height = Math.max(1, opts.height ?? renderer.domElement.height);

  let envSampler: EnvSampler | null = null;
  try {
    envSampler = buildEnvSampler(envMap);
  } catch (err) {
    console.warn('[pt] env-sampler build failed; MIS will use BRDF-only:', err);
  }

  function makePlaceholder(): THREE.DataTexture {
    const data = new Float32Array([0, 0]);
    const t = new THREE.DataTexture(data, 2, 1, THREE.RedFormat, THREE.FloatType);
    t.internalFormat = 'R32F';
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }
  const placeholderCdf = envSampler ? null : makePlaceholder();

  // Multi-attachment RT. Three's WebGLRenderTarget supports `count` for MRT.
  // All three attachments share the same size but have independent texture
  // handles we can sample from in later passes.
  function makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      internalFormat: 'RGBA32F',
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      count: 3
    });
    // Name the attachments so debug tooling labels them.
    rt.textures[0].name = 'pt.accum';
    rt.textures[1].name = 'pt.gbufferN';
    rt.textures[2].name = 'pt.gbufferA';
    return rt;
  }
  let accumA = makeTarget(width, height);
  let accumB = makeTarget(width, height);

  // Low-res preview target — half-float RT at 1/2 linear resolution of the
  // main accumulator (so 1/4 the pixels). Written by renderPreview() in a
  // cheap 1-bounce direct-light path; composite reads the radiance texture
  // with bilinear upscale. Has three attachments to match the shader's MRT
  // outputs, but we only sample textures[0] downstream — the G-buffer
  // attachments are written to at low cost and discarded.
  function makePreviewTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter
    });
    rt.texture.name = 'pt.preview';
    return rt;
  }
  // 1/2 linear scale = 1/4 pixel count. Empirically this is the sweet spot:
  // 1/3 pixel count (~0.58×) barely moves the needle on draw time, 1/8
  // pixels (0.35×) is visibly chunky on high-DPI displays.
  let previewScale = 0.5;
  let previewTarget = makePreviewTarget(
    Math.max(1, Math.floor(width * previewScale)),
    Math.max(1, Math.floor(height * previewScale))
  );

  const zeroRect = () => {
    const arr: THREE.Vector3[] = [];
    for (let i = 0; i < MAX_RECTS; i++) arr.push(new THREE.Vector3(0, 0, 0));
    return arr;
  };

  const uniforms: Record<string, THREE.IUniform> = {
    uTriPositions: { value: null },
    uTriPositionsSize: { value: new THREE.Vector2(1, 1) },
    uTriNormals: { value: null },
    uTriNormalsSize: { value: new THREE.Vector2(1, 1) },
    uTriMaterialId: { value: null },
    uTriMaterialIdSize: { value: new THREE.Vector2(1, 1) },
    uMaterialTable: { value: null },
    uMaterialTableSize: { value: new THREE.Vector2(1, 1) },
    uTriCount: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uCameraMat: { value: new THREE.Matrix4() },
    uFovTanHalf: { value: Math.tan((40 * Math.PI) / 360) },
    uAspect: { value: 1 },
    uLensRadius: { value: 0 },
    uFocusDist: { value: 10 },
    uEnvMap: { value: envMap },
    uEnvIntensity: { value: envIntensity },
    uSceneCentre: { value: new THREE.Vector3() },
    uSceneRadius: { value: 1 },
    uFrameIndex: { value: 0 },
    uResolution: { value: new THREE.Vector2(width, height) },
    uPrevAccum: { value: accumA.textures[0] },
    uPrevGbufferN: { value: accumA.textures[1] },
    uPrevGbufferA: { value: accumA.textures[2] },
    uBvhNodes: { value: null },
    uBvhNodesSize: { value: new THREE.Vector2(1, 1) },
    uBvhPrimIndices: { value: null },
    uBvhPrimIndicesSize: { value: new THREE.Vector2(1, 1) },
    uBvhNodeCount: { value: 0 },
    uPreviewMode: { value: 0 },
    uEnvMarginalCdf: { value: envSampler?.marginalCdfTex ?? placeholderCdf },
    uEnvConditionalCdf: { value: envSampler?.conditionalCdfTex ?? placeholderCdf },
    uEnvWidth: { value: envSampler?.envWidth ?? 1 },
    uEnvHeight: { value: envSampler?.envHeight ?? 1 },
    uEnvIntegral: { value: envSampler?.totalIntegral ?? 1 },
    // Backdrop (visible background behind the badge).
    uBackdropTop: { value: new THREE.Color(0.93, 0.95, 0.97) },
    uBackdropBottom: { value: new THREE.Color(0.70, 0.72, 0.76) },
    // Area lights — arrays must be fixed-length vec3 arrays.
    uRectLightCount: { value: 0 },
    uRectOrigin: { value: zeroRect() },
    uRectEdgeU: { value: zeroRect() },
    uRectEdgeV: { value: zeroRect() },
    uRectEmission: { value: zeroRect() },
    uRectNormal: { value: zeroRect() },
    // Adaptive sampling.
    uAdaptiveActive: { value: 0 },
    uAdaptiveThreshold: { value: 0.002 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PT_VERT,
    fragmentShader: PT_FRAG,
    depthTest: false,
    depthWrite: false,
    glslVersion: THREE.GLSL3
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function applyPayload(p: PtScenePayload) {
    uniforms.uTriPositions.value = p.triPositionsTex;
    uniforms.uTriPositionsSize.value.set(p.triPositionsWidth, p.triPositionsHeight);
    uniforms.uTriNormals.value = p.triNormalsTex;
    uniforms.uTriNormalsSize.value.set(p.triNormalsWidth, p.triNormalsHeight);
    uniforms.uTriMaterialId.value = p.triMaterialIdTex;
    uniforms.uTriMaterialIdSize.value.set(p.triMaterialIdWidth, p.triMaterialIdHeight);
    uniforms.uMaterialTable.value = p.materialTableTex;
    uniforms.uMaterialTableSize.value.set(p.materialTableWidth, p.materialTableHeight);
    uniforms.uTriCount.value = p.triCount;

    const centre = new THREE.Vector3();
    p.bbox.getCenter(centre);
    uniforms.uSceneCentre.value.copy(centre);
    const size = new THREE.Vector3();
    p.bbox.getSize(size);
    uniforms.uSceneRadius.value = 0.5 * size.length() + 0.5;

    uniforms.uBvhNodes.value = p.bvhNodesTex;
    uniforms.uBvhNodesSize.value.set(p.bvhNodesWidth, p.bvhNodesHeight);
    uniforms.uBvhPrimIndices.value = p.bvhPrimIndicesTex;
    uniforms.uBvhPrimIndicesSize.value.set(p.bvhPrimIndicesWidth, p.bvhPrimIndicesHeight);
    uniforms.uBvhNodeCount.value = p.bvhNodeCount;
  }

  function clearTarget(rt: THREE.WebGLRenderTarget) {
    const prev = renderer.getRenderTarget();
    const prevClear = new THREE.Color();
    renderer.getClearColor(prevClear);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(prevClear, prevAlpha);
  }

  clearTarget(accumA);
  clearTarget(accumB);
  needsClear = false;
  const previewResolution = new THREE.Vector2(width, height);
  const fullResolution = new THREE.Vector2(width, height);

  function invalidateAccum() {
    frameIndex = 0;
    needsClear = true;
  }

  function ensureCleared() {
    if (!needsClear) return;
    clearTarget(accumA);
    clearTarget(accumB);
    needsClear = false;
  }

  return {
    setScene(group, packOpts) {
      if (payload) payload.dispose();
      payload = packScene(group, packOpts);
      applyPayload(payload);
      invalidateAccum();
    },
    setCamera(cam, viewport) {
      cam.updateMatrixWorld();
      uniforms.uCameraPos.value.copy(cam.position);
      uniforms.uCameraMat.value.copy(cam.matrixWorld);
      uniforms.uFovTanHalf.value = Math.tan((cam.fov * Math.PI) / 360);
      uniforms.uAspect.value = viewport.width / Math.max(1, viewport.height);
    },
    setDepthOfField(lensRadius, focusDist) {
      uniforms.uLensRadius.value = Math.max(0, lensRadius);
      uniforms.uFocusDist.value = Math.max(1e-3, focusDist);
    },
    setBackdrop(top, bottom) {
      uniforms.uBackdropTop.value.set(top.r, top.g, top.b);
      uniforms.uBackdropBottom.value.set(bottom.r, bottom.g, bottom.b);
    },
    setRectLights(lights) {
      const n = Math.min(lights.length, MAX_RECTS);
      uniforms.uRectLightCount.value = n;
      const orig = uniforms.uRectOrigin.value as THREE.Vector3[];
      const eU = uniforms.uRectEdgeU.value as THREE.Vector3[];
      const eV = uniforms.uRectEdgeV.value as THREE.Vector3[];
      const em = uniforms.uRectEmission.value as THREE.Vector3[];
      const nm = uniforms.uRectNormal.value as THREE.Vector3[];
      for (let i = 0; i < MAX_RECTS; i++) {
        if (i < n) {
          const L = lights[i];
          orig[i].copy(L.origin);
          eU[i].copy(L.edgeU);
          eV[i].copy(L.edgeV);
          em[i].copy(L.emission);
          // The lit side points along edgeU × edgeV normalised, with sign
          // chosen so the rect shines outward (we don't know "outward"
          // without the scene, so we take the raw cross; callers should
          // choose edgeU/edgeV handedness accordingly).
          const nvec = new THREE.Vector3().crossVectors(L.edgeU, L.edgeV).normalize();
          nm[i].copy(nvec);
        } else {
          orig[i].set(0, 0, 0);
          eU[i].set(0, 0, 0);
          eV[i].set(0, 0, 0);
          em[i].set(0, 0, 0);
          nm[i].set(0, 0, 1);
        }
      }
    },
    setAdaptiveSampling(active, threshold) {
      uniforms.uAdaptiveActive.value = active ? 1 : 0;
      if (typeof threshold === 'number') {
        uniforms.uAdaptiveThreshold.value = Math.max(0, threshold);
      }
    },
    resize(w, h) {
      if (w === width && h === height) return;
      width = Math.max(1, Math.floor(w));
      height = Math.max(1, Math.floor(h));
      accumA.dispose();
      accumB.dispose();
      accumA = makeTarget(width, height);
      accumB = makeTarget(width, height);
      clearTarget(accumA);
      clearTarget(accumB);
      previewTarget.dispose();
      previewTarget = makePreviewTarget(
        Math.max(1, Math.floor(width * previewScale)),
        Math.max(1, Math.floor(height * previewScale))
      );
      uniforms.uResolution.value.set(width, height);
      invalidateAccum();
    },
    reset() {
      invalidateAccum();
    },
    renderFrame() {
      ensureCleared();
      uniforms.uFrameIndex.value = frameIndex;
      uniforms.uPrevAccum.value = accumA.textures[0];
      uniforms.uPrevGbufferN.value = accumA.textures[1];
      uniforms.uPrevGbufferA.value = accumA.textures[2];
      uniforms.uPreviewMode.value = 0;

      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(accumB);
      renderer.render(scene, quadCamera);
      renderer.setRenderTarget(prevTarget);

      const tmp = accumA;
      accumA = accumB;
      accumB = tmp;

      frameIndex++;
    },
    renderPreview() {
      ensureCleared();
      // Preview renders into the *low-res* target so drag is 4× cheaper
      // per frame. Uses a separate single-attachment RT so we never incur
      // the MRT cost (three attachments × three materials-table lookups
      // per pixel) on the hot path, and skips accumulation — the preview
      // is strictly a one-sample snapshot for feedback during camera move.
      const img = previewTarget.texture.image as { width: number; height: number };
      uniforms.uFrameIndex.value = 0;
      uniforms.uPrevAccum.value = accumA.textures[0]; // unused in preview mode
      uniforms.uPreviewMode.value = 1;
      // Shader reads uResolution for ray jitter + RNG seed. Temporarily
      // re-point it at the preview dimensions, restore after.
      fullResolution.copy(uniforms.uResolution.value);
      previewResolution.set(img.width, img.height);
      uniforms.uResolution.value.copy(previewResolution);

      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(previewTarget);
      renderer.render(scene, quadCamera);
      renderer.setRenderTarget(prevTarget);

      uniforms.uResolution.value.copy(fullResolution);
      // Preview does *not* mutate frameIndex — accumulation resumes from
      // wherever it was when the user interacts next. But callers treat
      // preview as "1 sample" semantically, so report that if asked.
      frameIndex = 0;
    },
    samplesSoFar() {
      return frameIndex;
    },
    getAccumTexture() {
      return accumA.textures[0];
    },
    getPreviewTexture() {
      return previewTarget.texture;
    },
    getGbufferNormalTexture() {
      return accumA.textures[1];
    },
    getGbufferAlbedoTexture() {
      return accumA.textures[2];
    },
    dispose() {
      if (payload) payload.dispose();
      material.dispose();
      quad.geometry.dispose();
      accumA.dispose();
      accumB.dispose();
      previewTarget.dispose();
      if (envSampler) envSampler.dispose();
      if (placeholderCdf) placeholderCdf.dispose();
    }
  };
}
