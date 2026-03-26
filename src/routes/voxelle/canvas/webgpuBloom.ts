/**
 * WebGPU TSL bloom without PassNode: full scene → HalfFloat beauty RT (correct
 * `viewportOpaqueMipTexture` for transmission), glow-only pass → second HalfFloat RT + depth (same as WebGL
 * stash), then `RenderPipeline` composites `beauty + bloom(glow)`.
 */
import { Color, Matrix4, Vector3, type Camera, type ColorSpace, type Scene } from 'three';
import { atmospherePlaneSoftness } from '../atmosphereMath';

/** Glow-only RT → TSL bloom; strength ~ WebGL `UnrealBloomPass` × mix shader factor. */
export const WEBGPU_BLOOM_STRENGTH = 0.88;
export const WEBGPU_BLOOM_RADIUS = 0.42;
export const WEBGPU_BLOOM_THRESHOLD = 0.15;

type WebGPURendererLike = {
  getRenderTarget: () => unknown;
  setRenderTarget: (t: unknown, ...rest: unknown[]) => void;
  getMRT: () => unknown;
  setMRT: (m: unknown) => void;
  render: (s: Scene, c: Camera) => void;
  clear: (color?: boolean, depth?: boolean, stencil?: boolean) => void;
  toneMapping: number;
  outputColorSpace: string;
  getPixelRatio: () => number;
};

export type WebGPUBloomPipeline = {
  renderPipeline: { render(): void; dispose(): void; needsUpdate: boolean };
  bloomPass: { dispose(): void };
  /** HalfFloat beauty pass (transmission + depth). */
  sceneRenderTarget: { setSize: (w: number, h: number, d?: number) => void; dispose: () => void };
  /** HalfFloat glow-only pass (same size; depth test matches beauty pass so sort is not view-dependent). */
  bloomSourceRenderTarget: {
    setSize: (w: number, h: number, d?: number) => void;
    dispose: () => void;
  };
  /** Full scene → beauty RT. */
  renderSceneToTarget(renderer: WebGPURendererLike, scene: Scene, camera: Camera): void;
  /** After non-glow materials are blacked out → bloom source RT (cleared each call). */
  renderBloomSourceToTarget(renderer: WebGPURendererLike, scene: Scene, camera: Camera): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
  /** Planar atmosphere (greedy / marchingCubes; not ray). */
  setPlanarAtmosphereEnabled: (on: boolean) => void;
  updatePlanarAtmosphereUniforms: (opts: {
    camera: Camera;
    fogColorHex: string;
    fogDensity: number;
    fogThickness: number;
    mode: 'slab' | 'positiveSide';
    spatialMode: 'plane' | 'aerial';
    plane: { nx: number; ny: number; nz: number; c: number };
  }) => void;
};

export async function createWebGPUBloomPipeline(
  renderer: unknown,
  _scene: Scene,
  _camera: Camera,
  width: number,
  height: number,
  pixelRatio: number
): Promise<WebGPUBloomPipeline> {
  const [webgpuMod, tslMod, bloomMod] = await Promise.all([
    import('three/webgpu'),
    import('three/tsl'),
    import('three/addons/tsl/display/BloomNode.js')
  ]);
  const {
    RenderPipeline,
    RenderTarget,
    HalfFloatType,
    DepthTexture,
    RGBAFormat,
    LinearFilter,
    NoToneMapping,
    ColorManagement
  } = webgpuMod;
  const {
    texture,
    Fn,
    screenUV,
    uniform,
    mix,
    float,
    vec3,
    vec4,
    dot,
    mul,
    max,
    abs: tslAbs,
    clamp,
    select,
    step,
    exp,
    smoothstep,
    greaterThan
  } = tslMod;
  const { bloom } = bloomMod;

  const w = Math.max(1, Math.floor(width * pixelRatio));
  const h = Math.max(1, Math.floor(height * pixelRatio));

  const depthTexture = new DepthTexture(w, h);
  depthTexture.isRenderTargetTexture = true;
  depthTexture.name = 'voxelleSceneDepth';

  const sceneRenderTarget = new RenderTarget(w, h, {
    type: HalfFloatType,
    depthBuffer: true,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    colorSpace: ColorManagement.workingColorSpace as ColorSpace,
    generateMipmaps: false
  });
  sceneRenderTarget.texture.name = 'voxelleSceneColor';
  sceneRenderTarget.depthTexture = depthTexture;

  const bloomSourceDepthTexture = new DepthTexture(w, h);
  bloomSourceDepthTexture.isRenderTargetTexture = true;
  bloomSourceDepthTexture.name = 'voxelleBloomSourceDepth';

  const bloomSourceRenderTarget = new RenderTarget(w, h, {
    type: HalfFloatType,
    depthBuffer: true,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    colorSpace: ColorManagement.workingColorSpace as ColorSpace,
    generateMipmaps: false
  });
  bloomSourceRenderTarget.texture.name = 'voxelleBloomSource';
  bloomSourceRenderTarget.depthTexture = bloomSourceDepthTexture;

  const beautyColor = texture(sceneRenderTarget.texture);
  const bloomSourceColor = texture(bloomSourceRenderTarget.texture);
  const bloomPass = bloom(
    bloomSourceColor,
    WEBGPU_BLOOM_STRENGTH,
    WEBGPU_BLOOM_RADIUS,
    WEBGPU_BLOOM_THRESHOLD
  );
  const combined = beautyColor.add(bloomPass);

  const uFogColor = uniform(new Vector3(0.78, 0.83, 0.88));
  const uFogDensity = uniform(0.85);
  const uFogThickness = uniform(28);
  const uFogMode = uniform(1);
  const uPlaneN = uniform(new Vector3(0, 1, 0));
  const uPlaneC = uniform(0);
  const uInvProj = uniform(new Matrix4());
  const uCamWorld = uniform(new Matrix4());
  const uFogSpatial = uniform(0);
  const uPlaneSoft = uniform(atmospherePlaneSoftness(28));

  const depthTexNode = texture(sceneRenderTarget.depthTexture);

  const outputWithAtmosphere = Fn(() => {
    const suv = screenUV;
    const base = combined.context({ getUV: () => suv });
    const depth = depthTexNode.sample(suv).x;
    const ndcx = suv.x.mul(2).sub(1);
    const ndcy = suv.y.mul(2).sub(1);
    const clipZ = depth.mul(2).sub(1);
    const clipVec = vec4(ndcx, ndcy, clipZ, float(1));
    const viewPosH = mul(uInvProj, clipVec);
    const viewPosN = viewPosH.xyz.div(viewPosH.w.max(1e-5));
    const t = uFogThickness.max(1e-4);

    const vz = max(float(0), viewPosN.z.negate());
    const aerialShape = float(1).sub(exp(vz.div(t).negate()));
    const aerialAmt = clamp(aerialShape.mul(uFogDensity), float(0), float(1));

    const worldPos4 = mul(uCamWorld, vec4(viewPosN, float(1)));
    const p = worldPos4.xyz;
    const sd = dot(uPlaneN, p).add(uPlaneC);
    const distAbs = tslAbs(sd);
    const useSlab = uFogMode.lessThan(float(0.5));
    const u = distAbs.div(t);
    const slabShape = exp(u.mul(u).negate());
    const planeMask = smoothstep(uPlaneSoft.negate(), float(0), sd);
    const h = max(float(0), sd);
    const posShape = planeMask.mul(exp(h.div(t).negate()));
    const planarShape = select(useSlab, slabShape, posShape);
    const planarAmt = clamp(planarShape.mul(uFogDensity), float(0), float(1));

    const useAerial = uFogSpatial.greaterThan(float(0.5));
    const fogAmt = select(useAerial, aerialAmt, planarAmt);

    const fogged = vec4(mix(base.xyz, uFogColor, fogAmt), base.w);
    const skyMask = step(float(0.99999), depth);
    return mix(fogged, base, skyMask);
  })();

  const renderPipeline = new RenderPipeline(
    renderer as ConstructorParameters<typeof RenderPipeline>[0]
  );
  renderPipeline.outputNode = combined;
  renderPipeline.needsUpdate = true;

  function setPlanarAtmosphereEnabled(on: boolean): void {
    renderPipeline.outputNode = on ? outputWithAtmosphere : combined;
    renderPipeline.needsUpdate = true;
  }

  function updatePlanarAtmosphereUniforms(opts: {
    camera: Camera;
    fogColorHex: string;
    fogDensity: number;
    fogThickness: number;
    mode: 'slab' | 'positiveSide';
    spatialMode: 'plane' | 'aerial';
    plane: { nx: number; ny: number; nz: number; c: number };
  }): void {
    uInvProj.value.copy(opts.camera.projectionMatrixInverse);
    uCamWorld.value.copy(opts.camera.matrixWorld);
    const fc = new Color(opts.fogColorHex);
    uFogColor.value.set(fc.r, fc.g, fc.b);
    uFogDensity.value = opts.fogDensity;
    uFogThickness.value = opts.fogThickness;
    uFogMode.value = opts.mode === 'slab' ? 0 : 1;
    uPlaneN.value.set(opts.plane.nx, opts.plane.ny, opts.plane.nz);
    uPlaneC.value = opts.plane.c;
    uFogSpatial.value = opts.spatialMode === 'aerial' ? 1 : 0;
    uPlaneSoft.value = atmospherePlaneSoftness(opts.fogThickness);
  }

  function renderSceneToTarget(r: WebGPURendererLike, scene: Scene, camera: Camera) {
    const prevTarget = r.getRenderTarget();
    const prevMrt = r.getMRT();
    const prevTm = r.toneMapping;
    const prevCs = r.outputColorSpace;
    r.setMRT(null);
    r.setRenderTarget(sceneRenderTarget);
    r.toneMapping = NoToneMapping;
    r.outputColorSpace = ColorManagement.workingColorSpace;
    r.render(scene, camera);
    r.setRenderTarget(prevTarget);
    r.setMRT(prevMrt);
    r.toneMapping = prevTm;
    r.outputColorSpace = prevCs;
  }

  function renderBloomSourceToTarget(r: WebGPURendererLike, scene: Scene, camera: Camera) {
    const prevTarget = r.getRenderTarget();
    const prevMrt = r.getMRT();
    const prevTm = r.toneMapping;
    const prevCs = r.outputColorSpace;
    r.setMRT(null);
    r.setRenderTarget(bloomSourceRenderTarget);
    r.toneMapping = NoToneMapping;
    r.outputColorSpace = ColorManagement.workingColorSpace;
    r.clear(true, true, false);
    r.render(scene, camera);
    r.setRenderTarget(prevTarget);
    r.setMRT(prevMrt);
    r.toneMapping = prevTm;
    r.outputColorSpace = prevCs;
  }

  return {
    renderPipeline,
    bloomPass,
    sceneRenderTarget,
    bloomSourceRenderTarget,
    renderSceneToTarget,
    renderBloomSourceToTarget,
    setPlanarAtmosphereEnabled,
    updatePlanarAtmosphereUniforms,
    setSize(nw: number, nh: number, pr: number) {
      const cw = Math.max(1, Math.floor(nw * pr));
      const ch = Math.max(1, Math.floor(nh * pr));
      sceneRenderTarget.setSize(cw, ch, 1);
      bloomSourceRenderTarget.setSize(cw, ch, 1);
      renderPipeline.needsUpdate = true;
    },
    dispose() {
      sceneRenderTarget.dispose();
      bloomSourceRenderTarget.dispose();
      bloomPass.dispose();
      renderPipeline.dispose();
    }
  };
}
