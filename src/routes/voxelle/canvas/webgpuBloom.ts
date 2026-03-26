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
    fogEnabled: boolean;
    fogThickness: number;
    mode: 'slab' | 'positiveSide';
    spatialMode: 'plane' | 'aerial';
    plane: { nx: number; ny: number; nz: number; c: number };
    fogHeightBias: number;
    fogHeightFalloff: number;
    fogDriftEnabled: boolean;
    fogDriftAmount: number;
    fogDriftScale: number;
    fogDriftSpeed: number;
    timeSeconds: number;
    distanceTintEnabled: boolean;
    distanceTintNearColorHex: string;
    distanceTintMidColorHex: string;
    distanceTintFarColorHex: string;
    distanceTintNearDist: number;
    distanceTintFarDist: number;
    distanceTintStrength: number;
    grainEnabled: boolean;
    grainStrength: number;
    grainAnimated: boolean;
    grainSpeed: number;
    sunShaftsEnabled: boolean;
    sunScreenUv: { x: number; y: number };
    sunShaftsStrength: number;
    sunShaftsDecay: number;
    sunShaftsDensity: number;
    sunShaftsWeight: number;
    sunShaftsSamples: number;
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
  const uFogEnabled = uniform(1);
  const uFogThickness = uniform(28);
  const uFogMode = uniform(1);
  const uPlaneN = uniform(new Vector3(0, 1, 0));
  const uPlaneC = uniform(0);
  const uInvProj = uniform(new Matrix4());
  const uCamWorld = uniform(new Matrix4());
  const uFogSpatial = uniform(0);
  const uPlaneSoft = uniform(atmospherePlaneSoftness(28));
  const uFogHeightBias = uniform(0);
  const uFogHeightFalloff = uniform(120);
  const uFogDriftEnabled = uniform(0);
  const uFogDriftAmount = uniform(0.2);
  const uFogDriftScale = uniform(0.02);
  const uFogDriftSpeed = uniform(0.2);
  const uTimeSeconds = uniform(0);
  const uDistanceTintEnabled = uniform(0);
  const uDistanceTintNear = uniform(new Vector3(1, 1, 1));
  const uDistanceTintMid = uniform(new Vector3(0.78, 0.83, 0.88));
  const uDistanceTintFar = uniform(new Vector3(0.56, 0.64, 0.75));
  const uDistanceTintNearDist = uniform(16);
  const uDistanceTintFarDist = uniform(140);
  const uDistanceTintStrength = uniform(0.35);
  const uGrainEnabled = uniform(0);
  const uGrainStrength = uniform(0.06);
  const uGrainAnimated = uniform(1);
  const uGrainSpeed = uniform(1);
  const uSunShaftsEnabled = uniform(0);
  const uSunScreenUv = uniform(new Vector3(0.5, 0.2, 0));
  const uSunShaftsStrength = uniform(0.35);
  const uSunShaftsDecay = uniform(0.92);
  const uSunShaftsDensity = uniform(0.8);
  const uSunShaftsWeight = uniform(0.6);
  const uSunShaftsSamples = uniform(18);

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
    const fogAmtBase = select(useAerial, aerialAmt, planarAmt);

    const hBand = exp(tslAbs(p.y.sub(uFogHeightBias)).negate().div(uFogHeightFalloff.max(1)));
    const fogAmtHeight = fogAmtBase.mul(float(0.65).add(hBand.mul(0.35)));
    const driftNoise = p.x.add(p.z).mul(uFogDriftScale).add(uTimeSeconds.mul(uFogDriftSpeed)).sin();
    const fogAmt = select(
      uFogDriftEnabled.greaterThan(float(0.5)),
      clamp(
        fogAmtHeight.add(driftNoise.mul(uFogDriftAmount).mul(uFogDensity).mul(0.35)),
        float(0),
        float(1)
      ),
      fogAmtHeight
    );
    const fogAmtFinal = select(uFogEnabled.greaterThan(float(0.5)), fogAmt, float(0));
    const foggedRgb = mix(base.xyz, uFogColor, fogAmtFinal);
    const nearT = clamp(vz.div(uDistanceTintNearDist.max(0.001)), float(0), float(1));
    const farT = clamp(
      vz.sub(uDistanceTintNearDist).div(uDistanceTintFarDist.sub(uDistanceTintNearDist).max(1)),
      float(0),
      float(1)
    );
    const tintA = mix(uDistanceTintNear, uDistanceTintMid, nearT);
    const tintB = mix(uDistanceTintMid, uDistanceTintFar, farT);
    const tintRgb = mix(tintA, tintB, farT);
    const tintAppliedRgb = mix(
      foggedRgb,
      tintRgb,
      clamp(uDistanceTintStrength, float(0), float(1))
    );
    const withTintRgb = select(uDistanceTintEnabled.greaterThan(float(0.5)), tintAppliedRgb, foggedRgb);
    const sunDelta = uSunScreenUv.xy.sub(suv);
    const sunRadial = exp(sunDelta.length().mul(-2.4));
    const shafts = sunRadial
      .pow(float(2))
      .mul(uSunShaftsStrength)
      .mul(uSunShaftsDecay)
      .mul(uSunShaftsDensity)
      .mul(uSunShaftsWeight);
    const shaftsRgb = withTintRgb.add(uFogColor.mul(shafts));
    const withShaftsRgb = select(uSunShaftsEnabled.greaterThan(float(0.5)), shaftsRgb, withTintRgb);
    const fogged = vec4(withShaftsRgb, base.w);
    const grainTime = uTimeSeconds.mul(uGrainSpeed).mul(uGrainAnimated);
    const grainSeedR = dot(suv, vec3(127.1, 311.7, 0).xy)
      .add(grainTime.mul(53.7))
      .sin()
      .mul(43758.5453)
      .fract()
      .sub(0.5);
    const grainSeedG = dot(suv, vec3(269.5, 183.3, 0).xy)
      .add(grainTime.mul(71.3))
      .sin()
      .mul(31337.1337)
      .fract()
      .sub(0.5);
    const grainSeedB = dot(suv, vec3(419.2, 371.9, 0).xy)
      .add(grainTime.mul(91.9))
      .sin()
      .mul(951.1357)
      .fract()
      .sub(0.5);
    const grainApplied = vec4(
      fogged.xyz.add(vec3(grainSeedR, grainSeedG, grainSeedB).mul(uGrainStrength)),
      fogged.w
    );
    const withGrain = select(uGrainEnabled.greaterThan(float(0.5)), grainApplied, fogged);
    const skyMask = step(float(0.99999), depth);
    return mix(withGrain, base, skyMask);
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
    fogEnabled: boolean;
    fogThickness: number;
    mode: 'slab' | 'positiveSide';
    spatialMode: 'plane' | 'aerial';
    plane: { nx: number; ny: number; nz: number; c: number };
    fogHeightBias: number;
    fogHeightFalloff: number;
    fogDriftEnabled: boolean;
    fogDriftAmount: number;
    fogDriftScale: number;
    fogDriftSpeed: number;
    timeSeconds: number;
    distanceTintEnabled: boolean;
    distanceTintNearColorHex: string;
    distanceTintMidColorHex: string;
    distanceTintFarColorHex: string;
    distanceTintNearDist: number;
    distanceTintFarDist: number;
    distanceTintStrength: number;
    grainEnabled: boolean;
    grainStrength: number;
    grainAnimated: boolean;
    grainSpeed: number;
    sunShaftsEnabled: boolean;
    sunScreenUv: { x: number; y: number };
    sunShaftsStrength: number;
    sunShaftsDecay: number;
    sunShaftsDensity: number;
    sunShaftsWeight: number;
    sunShaftsSamples: number;
  }): void {
    uInvProj.value.copy(opts.camera.projectionMatrixInverse);
    uCamWorld.value.copy(opts.camera.matrixWorld);
    const fc = new Color(opts.fogColorHex);
    uFogColor.value.set(fc.r, fc.g, fc.b);
    uFogDensity.value = opts.fogDensity;
    uFogEnabled.value = opts.fogEnabled ? 1 : 0;
    uFogThickness.value = opts.fogThickness;
    uFogMode.value = opts.mode === 'slab' ? 0 : 1;
    uPlaneN.value.set(opts.plane.nx, opts.plane.ny, opts.plane.nz);
    uPlaneC.value = opts.plane.c;
    uFogSpatial.value = opts.spatialMode === 'aerial' ? 1 : 0;
    uPlaneSoft.value = atmospherePlaneSoftness(opts.fogThickness);
    uFogHeightBias.value = opts.fogHeightBias;
    uFogHeightFalloff.value = Math.max(1, opts.fogHeightFalloff);
    uFogDriftEnabled.value = opts.fogDriftEnabled ? 1 : 0;
    uFogDriftAmount.value = opts.fogDriftAmount;
    uFogDriftScale.value = opts.fogDriftScale;
    uFogDriftSpeed.value = opts.fogDriftSpeed;
    uTimeSeconds.value = opts.timeSeconds;
    uDistanceTintEnabled.value = opts.distanceTintEnabled ? 1 : 0;
    const nc = new Color(opts.distanceTintNearColorHex);
    const mc = new Color(opts.distanceTintMidColorHex);
    const fc2 = new Color(opts.distanceTintFarColorHex);
    uDistanceTintNear.value.set(nc.r, nc.g, nc.b);
    uDistanceTintMid.value.set(mc.r, mc.g, mc.b);
    uDistanceTintFar.value.set(fc2.r, fc2.g, fc2.b);
    const nearDist = Math.max(0.001, opts.distanceTintNearDist);
    const farDist = Math.max(nearDist + 1, opts.distanceTintFarDist);
    uDistanceTintNearDist.value = nearDist;
    uDistanceTintFarDist.value = farDist;
    uDistanceTintStrength.value = opts.distanceTintStrength;
    uGrainEnabled.value = opts.grainEnabled ? 1 : 0;
    uGrainStrength.value = opts.grainStrength;
    uGrainAnimated.value = opts.grainAnimated ? 1 : 0;
    uGrainSpeed.value = opts.grainSpeed;
    uSunShaftsEnabled.value = opts.sunShaftsEnabled ? 1 : 0;
    uSunScreenUv.value.set(opts.sunScreenUv.x, opts.sunScreenUv.y, 0);
    uSunShaftsStrength.value = opts.sunShaftsStrength;
    uSunShaftsDecay.value = opts.sunShaftsDecay;
    uSunShaftsDensity.value = opts.sunShaftsDensity;
    uSunShaftsWeight.value = opts.sunShaftsWeight;
    uSunShaftsSamples.value = opts.sunShaftsSamples;
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
