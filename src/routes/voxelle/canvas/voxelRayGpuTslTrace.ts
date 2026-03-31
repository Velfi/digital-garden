/**
 * WebGPU TSL full-screen voxel ray trace (dense 3D volume; packed uint32 per texel in R32Float).
 * Parity targets: `voxelRayProgressive` / `voxelRayDda` (glass/water stack, tinted shadow rays).
 */
import {
  Data3DTexture,
  DataTexture,
  Matrix4,
  RedFormat,
  RGBAFormat,
  FloatType,
  Vector3,
  NearestFilter,
  type ColorSpace,
  type Camera
} from 'three';
import type { VoxelRayTraceParams } from './voxelRayShared';
import {
  GLOW_BLOOM_LINEAR_SCALE,
  GLOW_EMISSIVE_LIGHT_INTENSITY,
  GLOW_EMISSIVE_LIGHT_RADIUS,
  GLOW_EMISSIVE_PROXIMITY_FILL,
  GLOW_SELF_EMISSIVE_SCALE,
  GLOW_EMISSIVE_SHADOW_END_BIAS,
  GLOW_EMISSIVE_LIGHT_SOFTNESS,
  GLOW_VISIBILITY_OCCLUSION_SAMPLES,
  GLOW_VISIBILITY_SURFACE_OFFSET,
  GLASS_IOR,
  GLASS_MIN_TRANSMITTANCE,
  MAX_RAY_GLOW_EMITTERS,
  WATER_IOR
} from './voxelRayShared';
import { GLASS_ABSORPTION_PER_UNIT } from './voxelRayDda';
import { clampShadowSamples, GOLDEN_ANGLE, shadowConeTanFromRadians } from './gpuSoftShadow';
import { installVoxelleWebGpuPatches } from './threeNodeDevDebug';

/** Primary-ray DDA cannot use a tiny fixed iteration cap or distant grazing hits become background (diagonal “horizon” cut). */
const PRIMARY_DDA_STEPS_ABS_MAX = 65536;
const PRIMARY_DDA_STEPS_ABS_MIN = 768;

function primaryDdaStepBudget(
  maxDist: number,
  dims: readonly [number, number, number]
): number {
  const sumDim = dims[0] + dims[1] + dims[2];
  const distBased = Math.ceil(maxDist * Math.sqrt(3)) + 256;
  const volBased = sumDim + 512;
  return Math.min(
    PRIMARY_DDA_STEPS_ABS_MAX,
    Math.max(PRIMARY_DDA_STEPS_ABS_MIN, distBased, volBased)
  );
}

export type VoxelRayGpuTracePipeline = {
  beautyTexture: import('three').Texture;
  bloomTexture: import('three').Texture;
  setSize(width: number, height: number, dpr: number): void;
  render(
    renderer: import('three/webgpu').WebGPURenderer,
    camera: Camera,
    volTex: Data3DTexture,
    origin: readonly [number, number, number],
    dims: readonly [number, number, number],
    glowEmitterTex: DataTexture | null,
    glowEmitterCount: number,
    params: VoxelRayTraceParams,
    maxDist: number
  ): void;
  dispose(): void;
};

const PLASTIC_MAT = 0;
const METAL_MAT = 1;
const RUBBER_MAT = 2;
const GLASS_MAT = 3;
const WATER_MAT = 4;
const GLOW_MAT = 5;

function makePlaceholderVolumeTexture(): Data3DTexture {
  const u32 = new Uint32Array(8);
  const t = new Data3DTexture(new Float32Array(u32.buffer, u32.byteOffset, u32.length), 2, 2, 2);
  t.type = FloatType;
  t.format = RedFormat;
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function makePlaceholderGlowTexture(): DataTexture {
  const data = new Float32Array(8);
  const t = new DataTexture(data, 2, 1, RGBAFormat, FloatType);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export async function createVoxelRayGpuTracePipeline(
  width: number,
  height: number,
  dpr: number
): Promise<VoxelRayGpuTracePipeline> {
  const [webgpuMod, tslMod] = await Promise.all([import('three/webgpu'), import('three/tsl')]);
  installVoxelleWebGpuPatches(webgpuMod);

  const {
    RenderTarget,
    HalfFloatType,
    RGBAFormat,
    LinearFilter,
    NoToneMapping,
    ColorManagement,
    QuadMesh,
    NodeMaterial,
    OrthographicCamera,
    Scene
  } = webgpuMod;

  const {
    Fn,
    float,
    floatBitsToUint,
    int,
    uint,
    vec3,
    vec4,
    uniform,
    uv,
    Loop,
    Break,
    If,
    texture3D,
    texture,
    textureLoad,
    abs,
    min,
    max,
    clamp,
    normalize,
    pow,
    select,
    mix,
    step,
    floor,
    sin,
    cos,
    sqrt,
    fract,
    bitAnd,
    shiftRight,
    ivec3,
    ivec2,
    greaterThan,
    lessThan,
    lessThanEqual,
    or,
    and,
    not,
    equal,
    exp
  } = tslMod;

  const w = Math.max(1, Math.floor(width * dpr));
  const h = Math.max(1, Math.floor(height * dpr));

  const beautyTarget = new RenderTarget(w, h, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    colorSpace: ColorManagement.workingColorSpace as ColorSpace,
    generateMipmaps: false
  });
  beautyTarget.texture.name = 'beauty';
  const bloomTarget = new RenderTarget(w, h, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    colorSpace: ColorManagement.workingColorSpace as ColorSpace,
    generateMipmaps: false
  });
  bloomTarget.texture.name = 'bloom';

  let lastRayTargetW = w;
  let lastRayTargetH = h;

  const uClipToWorld = uniform(new Matrix4());
  const uCamPos = uniform(new Vector3());
  const uOrigin = uniform(new Vector3());
  const uDims = uniform(new Vector3());
  const uToLight = uniform(new Vector3());
  const uSunDiffuse = uniform(new Vector3());
  const uAmbient = uniform(new Vector3());
  const uBg = uniform(new Vector3());
  const uSkyTop = uniform(new Vector3());
  const uSkyBottom = uniform(new Vector3());
  const uEnableSky = uniform(0);
  const uEnableShadows = uniform(0);
  const uMaxDist = uniform(4000);
  const uPrimaryDdaMaxSteps = uniform(768);
  /** Matches `buildVoxelRayTraceParams` `lightStrength01`. */
  const uLightStrength01 = uniform(0);
  /** `params.timeSeconds` for water surface normal. */
  const uTimeSeconds = uniform(0);
  /** Soft shadow stratified samples (1–8); must match `clampShadowSamples` / CPU progressive. */
  const uShadowSamples = uniform(8);
  /** tan(cone half-angle) toward the light; from `shadowConeTanFromRadians(params.shadowSoftnessRadians)`. */
  const uShadowTanHalf = uniform(0);
  const uBufH = uniform(h);
  const uPassBloom = uniform(0);
  const uGlowEmitterCount = uniform(0);
  const uDistanceTintEnabled = uniform(0);
  const uDistanceTintNear = uniform(new Vector3(1, 1, 1));
  const uDistanceTintMid = uniform(new Vector3(1, 1, 1));
  const uDistanceTintFar = uniform(new Vector3(1, 1, 1));
  const uDistanceTintNearDist = uniform(16);
  const uDistanceTintFarDist = uniform(140);
  const uDistanceTintStrength = uniform(0);
  const uGrainEnabled = uniform(0);
  const uGrainStrength = uniform(0);
  const uGrainAnimated = uniform(1);
  const uGrainSpeed = uniform(1);
  const uGrainColorful = uniform(1);
  const volTex = makePlaceholderVolumeTexture();
  const glowTex = makePlaceholderGlowTexture();

  const TSL_TWO_PI = float(2 * Math.PI);
  const TSL_GOLDEN = float(GOLDEN_ANGLE);
  const GLOW_PROX_FILL = float(GLOW_EMISSIVE_PROXIMITY_FILL);
  const GLOW_SELF_SCALE = float(GLOW_SELF_EMISSIVE_SCALE);
  const GLOW_VIS_OFF = float(GLOW_VISIBILITY_SURFACE_OFFSET);
  const GLOW_VIS_N = float(GLOW_VISIBILITY_OCCLUSION_SAMPLES);
  const GLASS_IOR_F = float(GLASS_IOR);
  const WATER_IOR_F = float(WATER_IOR);
  const GLASS_MIN_T = float(GLASS_MIN_TRANSMITTANCE);
  const GLASS_ABS = float(GLASS_ABSORPTION_PER_UNIT);
  const DDA_HIT_EPS = float(1e-5);
  const GLASS_CELL_NUDGE = float(1e-6);
  /** Float32-safe DDA origin nudge; avoids boundary jitter at larger world coords. */
  const DDA_RAY_ORIGIN_EPS = float(1e-4);
  const SHADOW_SURFACE_EPS = float(2e-4);
  const WATER_WAVE_AMP1 = float(0.18);
  const WATER_WAVE_AMP2 = float(0.12);
  const WATER_WAVE_F1 = float(1.1);
  const WATER_WAVE_F2 = float(1.75);

  const volAcc = texture3D(volTex);
  const glowAcc = texture(glowTex);

  const srgbChannel = (c: ReturnType<typeof float>) => {
    const x = clamp(c, float(0), float(1));
    return select(
      lessThanEqual(x, float(0.04045)),
      x.div(float(12.92)),
      pow(x.add(float(0.055)).div(float(1.055)), float(2.4))
    );
  };

  const unpackLinearRgb = (packed: ReturnType<typeof uint>) => {
    const c24 = bitAnd(packed, uint(0xffffff));
    const r8 = bitAnd(shiftRight(c24, uint(16)), uint(255));
    const g8 = bitAnd(shiftRight(c24, uint(8)), uint(255));
    const b8 = bitAnd(c24, uint(255));
    return vec3(
      srgbChannel(float(r8).div(float(255))),
      srgbChannel(float(g8).div(float(255))),
      srgbChannel(float(b8).div(float(255)))
    );
  };

  const fetchPacked = (
    ix: ReturnType<typeof int>,
    iy: ReturnType<typeof int>,
    iz: ReturnType<typeof int>
  ): ReturnType<typeof uint> => {
    const ox = int(floor(uOrigin.x));
    const oy = int(floor(uOrigin.y));
    const oz = int(floor(uOrigin.z));
    const dx = int(floor(uDims.x));
    const dy = int(floor(uDims.y));
    const dz = int(floor(uDims.z));
    const lx = ix.sub(ox);
    const ly = iy.sub(oy);
    const lz = iz.sub(oz);
    const oob = or(
      or(or(lx.lessThan(int(0)), ly.lessThan(int(0))), lz.lessThan(int(0))),
      or(or(lx.greaterThanEqual(dx), ly.greaterThanEqual(dy)), lz.greaterThanEqual(dz))
    );
    const coord = ivec3(vec3(lx, ly, lz));
    const sample = floatBitsToUint(textureLoad(volAcc, coord, int(0)).r);
    return select(oob, uint(0), sample) as ReturnType<typeof uint>;
  };

  const isTransmissiveIdx = (matIdx: ReturnType<typeof uint>) =>
    or(matIdx.equal(uint(GLASS_MAT)), matIdx.equal(uint(WATER_MAT)));

  /** Plastic / metal / rubber — matches `emptyBlockedByCornerWalls` on CPU (glow visibility). */
  const isOpaqueNonGlowIdx = (matIdx: ReturnType<typeof uint>) =>
    or(
      matIdx.equal(uint(PLASTIC_MAT)),
      or(matIdx.equal(uint(METAL_MAT)), matIdx.equal(uint(RUBBER_MAT)))
    );

  const opaqueNonGlowFromPacked = (pk: ReturnType<typeof uint>) => {
    const me = shiftRight(pk, uint(24));
    const mid = uint(me.sub(uint(1)));
    return and(greaterThan(me, uint(0)), isOpaqueNonGlowIdx(mid));
  };

  /** Empty cell blocked when two perpendicular face neighbors are opaque non-glow. */
  const cornerSealEmptyCell = (
    ix: ReturnType<typeof int>,
    iy: ReturnType<typeof int>,
    iz: ReturnType<typeof int>
  ) => {
    const opPx = opaqueNonGlowFromPacked(fetchPacked(ix.add(int(1)), iy, iz));
    const opNx = opaqueNonGlowFromPacked(fetchPacked(ix.sub(int(1)), iy, iz));
    const opPy = opaqueNonGlowFromPacked(fetchPacked(ix, iy.add(int(1)), iz));
    const opNy = opaqueNonGlowFromPacked(fetchPacked(ix, iy.sub(int(1)), iz));
    const opPz = opaqueNonGlowFromPacked(fetchPacked(ix, iy, iz.add(int(1))));
    const opNz = opaqueNonGlowFromPacked(fetchPacked(ix, iy, iz.sub(int(1))));
    const xy = or(
      or(and(opPx, opPy), and(opPx, opNy)),
      or(and(opNx, opPy), and(opNx, opNy))
    );
    const xz = or(
      or(and(opPx, opPz), and(opPx, opNz)),
      or(and(opNx, opPz), and(opNx, opNz))
    );
    const yz = or(
      or(and(opPy, opPz), and(opPy, opNz)),
      or(and(opNy, opPz), and(opNy, opNz))
    );
    return or(or(xy, xz), yz);
  };

  const iorFromMatIdx = (matIdx: ReturnType<typeof uint>) =>
    select(
      matIdx.equal(uint(WATER_MAT)),
      WATER_IOR_F,
      select(matIdx.equal(uint(GLASS_MAT)), GLASS_IOR_F, float(1))
    );

  const fresnelSchlick = (
    cosI: ReturnType<typeof float>,
    etaI: ReturnType<typeof float>,
    etaT: ReturnType<typeof float>
  ) => {
    const c = clamp(cosI, float(0), float(1));
    const r0 = pow(etaI.sub(etaT).div(etaI.add(etaT)), float(2));
    return r0.add(
      float(1)
        .sub(r0)
        .mul(pow(float(1).sub(c), float(5)))
    );
  };

  const applyShadowSegment = (
    fr: ReturnType<typeof float> & { value?: unknown },
    fg: ReturnType<typeof float> & { value?: unknown },
    fb: ReturnType<typeof float> & { value?: unknown },
    pk: ReturnType<typeof uint>,
    segLen: ReturnType<typeof float>
  ) => {
    const me = shiftRight(pk, uint(24));
    void If(and(segLen.greaterThan(float(0)), greaterThan(me, uint(0))), () => {
      const mid = uint(me.sub(uint(1)));
      const isW = mid.equal(uint(WATER_MAT));
      const absR = select(isW, float(0.03), GLASS_ABS);
      const absG = select(isW, float(0.012), GLASS_ABS);
      const absB = select(isW, float(0.006), GLASS_ABS);
      const attR = max(GLASS_MIN_T, exp(absR.negate().mul(segLen)));
      const attG = max(GLASS_MIN_T, exp(absG.negate().mul(segLen)));
      const attB = max(GLASS_MIN_T, exp(absB.negate().mul(segLen)));
      const rgbLin = unpackLinearRgb(pk);
      const tR = select(isW, float(1), rgbLin.x);
      const tG = select(isW, float(1), rgbLin.y);
      const tB = select(isW, float(1), rgbLin.z);
      void If(isTransmissiveIdx(mid), () => {
        fr.assign(fr.mul(tR).mul(attR));
        fg.assign(fg.mul(tG).mul(attG));
        fb.assign(fb.mul(tB).mul(attB));
      }).Else(() => {
        fr.assign(float(0));
        fg.assign(float(0));
        fb.assign(float(0));
      });
    });
  };

  /** Like `applyShadowSegment`, but glow voxels do not occlude (glow-light visibility rays). */
  const applyShadowSegmentGlowEmitter = (
    fr: ReturnType<typeof float> & { value?: unknown },
    fg: ReturnType<typeof float> & { value?: unknown },
    fb: ReturnType<typeof float> & { value?: unknown },
    pk: ReturnType<typeof uint>,
    segLen: ReturnType<typeof float>,
    ix: ReturnType<typeof int>,
    iy: ReturnType<typeof int>,
    iz: ReturnType<typeof int>
  ) => {
    const me = shiftRight(pk, uint(24));
    void If(segLen.greaterThan(float(0)), () => {
      void If(equal(me, uint(0)), () => {
        void If(cornerSealEmptyCell(ix, iy, iz), () => {
          fr.assign(float(0));
          fg.assign(float(0));
          fb.assign(float(0));
        });
      }).Else(() => {
        const mid = uint(me.sub(uint(1)));
        void If(isTransmissiveIdx(mid), () => {
          const isW = mid.equal(uint(WATER_MAT));
          const absR = select(isW, float(0.03), GLASS_ABS);
          const absG = select(isW, float(0.012), GLASS_ABS);
          const absB = select(isW, float(0.006), GLASS_ABS);
          const attR = max(GLASS_MIN_T, exp(absR.negate().mul(segLen)));
          const attG = max(GLASS_MIN_T, exp(absG.negate().mul(segLen)));
          const attB = max(GLASS_MIN_T, exp(absB.negate().mul(segLen)));
          const rgbLin = unpackLinearRgb(pk);
          const tR = select(isW, float(1), rgbLin.x);
          const tG = select(isW, float(1), rgbLin.y);
          const tB = select(isW, float(1), rgbLin.z);
          fr.assign(fr.mul(tR).mul(attR));
          fg.assign(fg.mul(tG).mul(attG));
          fb.assign(fb.mul(tB).mul(attB));
        })
          .ElseIf(mid.equal(uint(GLOW_MAT)), () => {
            fr.assign(fr);
            fg.assign(fg);
            fb.assign(fb);
          })
          .Else(() => {
            fr.assign(float(0));
            fg.assign(float(0));
            fb.assign(float(0));
          });
      });
    });
  };

  /**
   * RGB shadow factor along one light direction — mirrors `traceShadowRayDda` (Beer–Lambert + tint).
   */
  const traceShadowTransmissionRgb = (
    ox: ReturnType<typeof float>,
    oy: ReturnType<typeof float>,
    oz: ReturnType<typeof float>,
    ldx: ReturnType<typeof float>,
    ldy: ReturnType<typeof float>,
    ldz: ReturnType<typeof float>,
    maxDist: ReturnType<typeof float>
  ) => {
    const rdx = ldx.toVar();
    const rdy = ldy.toVar();
    const rdz = ldz.toVar();
    const len = rdx.mul(rdx).add(rdy.mul(rdy)).add(rdz.mul(rdz)).sqrt().max(float(1e-9));
    rdx.assign(rdx.div(len));
    rdy.assign(rdy.div(len));
    rdz.assign(rdz.div(len));
    const oxp = ox.add(rdx.mul(DDA_RAY_ORIGIN_EPS));
    const oyp = oy.add(rdy.mul(DDA_RAY_ORIGIN_EPS));
    const ozp = oz.add(rdz.mul(DDA_RAY_ORIGIN_EPS));
    const x = int(floor(oxp)).toVar();
    const y = int(floor(oyp)).toVar();
    const z = int(floor(ozp)).toVar();
    const stepX = int(0).toVar();
    const stepY = int(0).toVar();
    const stepZ = int(0).toVar();
    void If(greaterThan(rdx, float(1e-9)), () => stepX.assign(int(1)));
    void If(lessThan(rdx, float(-1e-9)), () => stepX.assign(int(-1)));
    void If(greaterThan(rdy, float(1e-9)), () => stepY.assign(int(1)));
    void If(lessThan(rdy, float(-1e-9)), () => stepY.assign(int(-1)));
    void If(greaterThan(rdz, float(1e-9)), () => stepZ.assign(int(1)));
    void If(lessThan(rdz, float(-1e-9)), () => stepZ.assign(int(-1)));
    const big = float(1e30);
    const tDeltaX = select(equal(stepX, int(0)), big, float(1).div(abs(rdx)));
    const tDeltaY = select(equal(stepY, int(0)), big, float(1).div(abs(rdy)));
    const tDeltaZ = select(equal(stepZ, int(0)), big, float(1).div(abs(rdz)));
    const tMaxX = float(0).toVar();
    const tMaxY = float(0).toVar();
    const tMaxZ = float(0).toVar();
    void If(greaterThan(stepX, int(0)), () => tMaxX.assign(float(x.add(int(1)).sub(oxp)).div(rdx)));
    void If(lessThan(stepX, int(0)), () => tMaxX.assign(float(x.sub(oxp)).div(rdx)));
    void If(equal(stepX, int(0)), () => tMaxX.assign(big));
    void If(greaterThan(stepY, int(0)), () => tMaxY.assign(float(y.add(int(1)).sub(oyp)).div(rdy)));
    void If(lessThan(stepY, int(0)), () => tMaxY.assign(float(y.sub(oyp)).div(rdy)));
    void If(equal(stepY, int(0)), () => tMaxY.assign(big));
    void If(greaterThan(stepZ, int(0)), () => tMaxZ.assign(float(z.add(int(1)).sub(ozp)).div(rdz)));
    void If(lessThan(stepZ, int(0)), () => tMaxZ.assign(float(z.sub(ozp)).div(rdz)));
    void If(equal(stepZ, int(0)), () => tMaxZ.assign(big));

    const fr = float(1).toVar();
    const fg = float(1).toVar();
    const fb = float(1).toVar();
    const tPrev = float(0).toVar();
    const skipShadowMarch = float(0).toVar();
    const pkStart = fetchPacked(x, y, z);
    const me0 = shiftRight(pkStart, uint(24));

    void If(greaterThan(me0, uint(0)), () => {
      const mid0 = uint(me0.sub(uint(1)));
      void If(isTransmissiveIdx(mid0), () => {
        const tFirst = min(tMaxX, min(tMaxY, tMaxZ));
        const seg0 = min(max(float(0), tFirst), maxDist);
        applyShadowSegment(fr, fg, fb, pkStart, seg0);
        void If(tFirst.greaterThanEqual(maxDist), () => skipShadowMarch.assign(float(1)));
        void If(
          and(
            tFirst.lessThan(maxDist),
            skipShadowMarch.lessThan(float(0.5)),
            or(
              fr.greaterThan(float(1e-8)),
              or(fg.greaterThan(float(1e-8)), fb.greaterThan(float(1e-8)))
            )
          ),
          () => {
            void If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
              tPrev.assign(tMaxX);
              tMaxX.addAssign(tDeltaX);
              x.addAssign(stepX);
            })
              .ElseIf(tMaxY.lessThanEqual(tMaxZ), () => {
                tPrev.assign(tMaxY);
                tMaxY.addAssign(tDeltaY);
                y.addAssign(stepY);
              })
              .Else(() => {
                tPrev.assign(tMaxZ);
                tMaxZ.addAssign(tDeltaZ);
                z.addAssign(stepZ);
              });
          }
        );
      }).Else(() => {
        fr.assign(float(0));
        fg.assign(float(0));
        fb.assign(float(0));
        skipShadowMarch.assign(float(1));
      });
    });

    void Loop({ start: int(0), end: int(512), type: 'int', condition: '<' }, () => {
      void If(skipShadowMarch.greaterThan(float(0.5)), () => void Break());
      void If(
        and(
          fr.lessThanEqual(float(1e-8)),
          fg.lessThanEqual(float(1e-8)),
          fb.lessThanEqual(float(1e-8))
        ),
        () => void Break()
      );
      const tHit = float(0).toVar();
      const axis = int(0).toVar();
      void If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
        axis.assign(int(0));
        tHit.assign(tMaxX);
        tMaxX.addAssign(tDeltaX);
      })
        .ElseIf(tMaxY.lessThanEqual(tMaxZ), () => {
          axis.assign(int(1));
          tHit.assign(tMaxY);
          tMaxY.addAssign(tDeltaY);
        })
        .Else(() => {
          axis.assign(int(2));
          tHit.assign(tMaxZ);
          tMaxZ.addAssign(tDeltaZ);
        });
      const x0 = x;
      const y0 = y;
      const z0 = z;
      const seg = min(tHit, maxDist).sub(tPrev);
      void If(seg.greaterThan(float(0)), () => {
        applyShadowSegment(fr, fg, fb, fetchPacked(x0, y0, z0), seg);
      });
      void If(
        and(
          fr.lessThanEqual(float(1e-8)),
          fg.lessThanEqual(float(1e-8)),
          fb.lessThanEqual(float(1e-8))
        ),
        () => void Break()
      );
      void If(tHit.greaterThan(maxDist), () => void Break());
      void If(axis.equal(int(0)), () => x.addAssign(stepX))
        .ElseIf(axis.equal(int(1)), () => y.addAssign(stepY))
        .Else(() => z.addAssign(stepZ));
      tPrev.assign(tHit);
    });

    return vec3(max(fr, float(0)), max(fg, float(0)), max(fb, float(0)));
  };

  /**
   * Like `traceShadowTransmissionRgb`, but glow voxels never occlude — used only for glow-light
   * visibility (see `traceShadowRayDdaForGlowEmitterVisibility` on CPU).
   */
  const traceGlowEmitterVisibilityTransmissionRgb = (
    ox: ReturnType<typeof float>,
    oy: ReturnType<typeof float>,
    oz: ReturnType<typeof float>,
    ldx: ReturnType<typeof float>,
    ldy: ReturnType<typeof float>,
    ldz: ReturnType<typeof float>,
    maxDist: ReturnType<typeof float>
  ) => {
    const rdx = ldx.toVar();
    const rdy = ldy.toVar();
    const rdz = ldz.toVar();
    const len = rdx.mul(rdx).add(rdy.mul(rdy)).add(rdz.mul(rdz)).sqrt().max(float(1e-9));
    rdx.assign(rdx.div(len));
    rdy.assign(rdy.div(len));
    rdz.assign(rdz.div(len));
    const oxp = ox.add(rdx.mul(DDA_RAY_ORIGIN_EPS));
    const oyp = oy.add(rdy.mul(DDA_RAY_ORIGIN_EPS));
    const ozp = oz.add(rdz.mul(DDA_RAY_ORIGIN_EPS));
    const x = int(floor(oxp)).toVar();
    const y = int(floor(oyp)).toVar();
    const z = int(floor(ozp)).toVar();
    const stepX = int(0).toVar();
    const stepY = int(0).toVar();
    const stepZ = int(0).toVar();
    void If(greaterThan(rdx, float(1e-9)), () => stepX.assign(int(1)));
    void If(lessThan(rdx, float(-1e-9)), () => stepX.assign(int(-1)));
    void If(greaterThan(rdy, float(1e-9)), () => stepY.assign(int(1)));
    void If(lessThan(rdy, float(-1e-9)), () => stepY.assign(int(-1)));
    void If(greaterThan(rdz, float(1e-9)), () => stepZ.assign(int(1)));
    void If(lessThan(rdz, float(-1e-9)), () => stepZ.assign(int(-1)));
    const big = float(1e30);
    const tDeltaX = select(equal(stepX, int(0)), big, float(1).div(abs(rdx)));
    const tDeltaY = select(equal(stepY, int(0)), big, float(1).div(abs(rdy)));
    const tDeltaZ = select(equal(stepZ, int(0)), big, float(1).div(abs(rdz)));
    const tMaxX = float(0).toVar();
    const tMaxY = float(0).toVar();
    const tMaxZ = float(0).toVar();
    void If(greaterThan(stepX, int(0)), () => tMaxX.assign(float(x.add(int(1)).sub(oxp)).div(rdx)));
    void If(lessThan(stepX, int(0)), () => tMaxX.assign(float(x.sub(oxp)).div(rdx)));
    void If(equal(stepX, int(0)), () => tMaxX.assign(big));
    void If(greaterThan(stepY, int(0)), () => tMaxY.assign(float(y.add(int(1)).sub(oyp)).div(rdy)));
    void If(lessThan(stepY, int(0)), () => tMaxY.assign(float(y.sub(oyp)).div(rdy)));
    void If(equal(stepY, int(0)), () => tMaxY.assign(big));
    void If(greaterThan(stepZ, int(0)), () => tMaxZ.assign(float(z.add(int(1)).sub(ozp)).div(rdz)));
    void If(lessThan(stepZ, int(0)), () => tMaxZ.assign(float(z.sub(ozp)).div(rdz)));
    void If(equal(stepZ, int(0)), () => tMaxZ.assign(big));

    const fr = float(1).toVar();
    const fg = float(1).toVar();
    const fb = float(1).toVar();
    const tPrev = float(0).toVar();
    const skipShadowMarch = float(0).toVar();
    const pkStart = fetchPacked(x, y, z);
    const me0 = shiftRight(pkStart, uint(24));

    void If(greaterThan(me0, uint(0)), () => {
      const mid0 = uint(me0.sub(uint(1)));
      void If(or(isTransmissiveIdx(mid0), mid0.equal(uint(GLOW_MAT))), () => {
        const tFirst = min(tMaxX, min(tMaxY, tMaxZ));
        const seg0 = min(max(float(0), tFirst), maxDist);
        applyShadowSegmentGlowEmitter(fr, fg, fb, pkStart, seg0, x, y, z);
        void If(tFirst.greaterThanEqual(maxDist), () => skipShadowMarch.assign(float(1)));
        void If(
          and(
            tFirst.lessThan(maxDist),
            skipShadowMarch.lessThan(float(0.5)),
            or(
              fr.greaterThan(float(1e-8)),
              or(fg.greaterThan(float(1e-8)), fb.greaterThan(float(1e-8)))
            )
          ),
          () => {
            void If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
              tPrev.assign(tMaxX);
              tMaxX.addAssign(tDeltaX);
              x.addAssign(stepX);
            })
              .ElseIf(tMaxY.lessThanEqual(tMaxZ), () => {
                tPrev.assign(tMaxY);
                tMaxY.addAssign(tDeltaY);
                y.addAssign(stepY);
              })
              .Else(() => {
                tPrev.assign(tMaxZ);
                tMaxZ.addAssign(tDeltaZ);
                z.addAssign(stepZ);
              });
          }
        );
      }).Else(() => {
        fr.assign(float(0));
        fg.assign(float(0));
        fb.assign(float(0));
        skipShadowMarch.assign(float(1));
      });
    });

    void Loop({ start: int(0), end: int(512), type: 'int', condition: '<' }, () => {
      void If(skipShadowMarch.greaterThan(float(0.5)), () => void Break());
      void If(
        and(
          fr.lessThanEqual(float(1e-8)),
          fg.lessThanEqual(float(1e-8)),
          fb.lessThanEqual(float(1e-8))
        ),
        () => void Break()
      );
      const tHit = float(0).toVar();
      const axis = int(0).toVar();
      void If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
        axis.assign(int(0));
        tHit.assign(tMaxX);
        tMaxX.addAssign(tDeltaX);
      })
        .ElseIf(tMaxY.lessThanEqual(tMaxZ), () => {
          axis.assign(int(1));
          tHit.assign(tMaxY);
          tMaxY.addAssign(tDeltaY);
        })
        .Else(() => {
          axis.assign(int(2));
          tHit.assign(tMaxZ);
          tMaxZ.addAssign(tDeltaZ);
        });
      const x0 = x;
      const y0 = y;
      const z0 = z;
      const seg = min(tHit, maxDist).sub(tPrev);
      void If(seg.greaterThan(float(0)), () => {
        applyShadowSegmentGlowEmitter(fr, fg, fb, fetchPacked(x0, y0, z0), seg, x0, y0, z0);
      });
      void If(
        and(
          fr.lessThanEqual(float(1e-8)),
          fg.lessThanEqual(float(1e-8)),
          fb.lessThanEqual(float(1e-8))
        ),
        () => void Break()
      );
      void If(tHit.greaterThan(maxDist), () => void Break());
      void If(axis.equal(int(0)), () => x.addAssign(stepX))
        .ElseIf(axis.equal(int(1)), () => y.addAssign(stepY))
        .Else(() => z.addAssign(stepZ));
      tPrev.assign(tHit);
    });

    return vec3(max(fr, float(0)), max(fg, float(0)), max(fb, float(0)));
  };

  const shadowDiskBasis = (
    lx: ReturnType<typeof float>,
    ly: ReturnType<typeof float>,
    lz: ReturnType<typeof float>,
    fi: ReturnType<typeof float>
  ) => {
    const fn = max(uShadowSamples, float(1));
    const r = sqrt(fi.div(fn.sub(float(0.5))));
    const angle = fract(fi.mul(TSL_GOLDEN).div(TSL_TWO_PI)).mul(TSL_TWO_PI);
    const scale = uShadowTanHalf.mul(r);
    const almostZ = abs(lz).greaterThan(float(0.95));
    const upHx = select(almostZ, float(1), float(0));
    const upHy = float(0);
    const upHz = select(almostZ, float(0), float(1));
    const tx0 = upHy.mul(lz).sub(upHz.mul(ly));
    const ty0 = upHz.mul(lx).sub(upHx.mul(lz));
    const tz0 = upHx.mul(ly).sub(upHy.mul(lx));
    const tLen0 = sqrt(tx0.mul(tx0).add(ty0.mul(ty0)).add(tz0.mul(tz0)));
    // Fallback up = (0,1,0) when primary tangent degenerates
    const tx1 = float(1).mul(lz).sub(float(0).mul(ly));
    const ty1 = float(0).mul(lx).sub(float(0).mul(lz));
    const tz1 = float(0).mul(ly).sub(float(1).mul(lx));
    const tLen1 = sqrt(tx1.mul(tx1).add(ty1.mul(ty1)).add(tz1.mul(tz1))).max(float(1e-9));
    const degen = tLen0.lessThan(float(1e-8));
    const tLenF = select(degen, tLen1, tLen0);
    const tx = select(degen, tx1, tx0).div(tLenF);
    const ty = select(degen, ty1, ty0).div(tLenF);
    const tz = select(degen, tz1, tz0).div(tLenF);
    const bx = ly.mul(tz).sub(lz.mul(ty));
    const by = lz.mul(tx).sub(lx.mul(tz));
    const bz = lx.mul(ty).sub(ly.mul(tx));
    const ca = cos(angle);
    const sa = sin(angle);
    const oxj = scale.mul(ca.mul(tx).add(sa.mul(bx)));
    const oyj = scale.mul(ca.mul(ty).add(sa.mul(by)));
    const ozj = scale.mul(ca.mul(tz).add(sa.mul(bz)));
    const jx = lx.add(oxj);
    const jy = ly.add(oyj);
    const jz = lz.add(ozj);
    const jLen = sqrt(jx.mul(jx).add(jy.mul(jy)).add(jz.mul(jz))).max(float(1e-12));
    return vec3(jx.div(jLen), jy.div(jLen), jz.div(jLen));
  };

  /** Soft-shadow average of `traceShadowTransmissionRgb` (Vogel disk, matches CPU). */
  const averagedShadowTransmission = (
    sx: ReturnType<typeof float>,
    sy: ReturnType<typeof float>,
    sz: ReturnType<typeof float>,
    lx: ReturnType<typeof float>,
    ly: ReturnType<typeof float>,
    lz: ReturnType<typeof float>,
    maxT: ReturnType<typeof float>
  ) => {
    const accR = float(0).toVar();
    const accG = float(0).toVar();
    const accB = float(0).toVar();
    void Loop({ start: int(0), end: int(8), type: 'int', condition: '<' }, ({ i }) => {
      void If(float(i).greaterThanEqual(uShadowSamples), () => void Break());
      const fj = shadowDiskBasis(lx, ly, lz, float(i));
      const s = traceShadowTransmissionRgb(sx, sy, sz, fj.x, fj.y, fj.z, maxT);
      accR.addAssign(s.x);
      accG.addAssign(s.y);
      accB.addAssign(s.z);
    });
    const inv = max(uShadowSamples, float(1));
    return vec3(accR.div(inv), accG.div(inv), accB.div(inv));
  };

  /**
   * Small offsets in the plane perpendicular to the shading normal (Vogel disk, same spiral as
   * `shadowDiskBasis`) so glow occlusion is not locked to one DDA column — avoids banding when
   * corner-seal toggles across voxel boundaries.
   */
  const glowVisibilityTangentDisk = (
    nx: ReturnType<typeof float>,
    ny: ReturnType<typeof float>,
    nz: ReturnType<typeof float>,
    fi: ReturnType<typeof float>
  ) => {
    const fn = GLOW_VIS_N.max(float(1));
    const r = sqrt(fi.div(fn.sub(float(0.5))));
    const angle = fract(fi.mul(TSL_GOLDEN).div(TSL_TWO_PI)).mul(TSL_TWO_PI);
    const scale = GLOW_VIS_OFF.mul(r);
    const almostZ = abs(nz).greaterThan(float(0.95));
    const upHx = select(almostZ, float(1), float(0));
    const upHy = float(0);
    const upHz = select(almostZ, float(0), float(1));
    const tx0 = upHy.mul(nz).sub(upHz.mul(ny));
    const ty0 = upHz.mul(nx).sub(upHx.mul(nz));
    const tz0 = upHx.mul(ny).sub(upHy.mul(nx));
    const tLen0 = sqrt(tx0.mul(tx0).add(ty0.mul(ty0)).add(tz0.mul(tz0)));
    // Fallback up = (0,1,0) when primary tangent degenerates
    const tx1 = float(1).mul(nz).sub(float(0).mul(ny));
    const ty1 = float(0).mul(nx).sub(float(0).mul(nz));
    const tz1 = float(0).mul(ny).sub(float(1).mul(nx));
    const tLen1 = sqrt(tx1.mul(tx1).add(ty1.mul(ty1)).add(tz1.mul(tz1))).max(float(1e-9));
    const degen = tLen0.lessThan(float(1e-8));
    const tLenF = select(degen, tLen1, tLen0);
    const tx = select(degen, tx1, tx0).div(tLenF);
    const ty = select(degen, ty1, ty0).div(tLenF);
    const tz = select(degen, tz1, tz0).div(tLenF);
    const bx = ny.mul(tz).sub(nz.mul(ty));
    const by = nz.mul(tx).sub(nx.mul(tz));
    const bz = nx.mul(ty).sub(ny.mul(tx));
    const ca = cos(angle);
    const sa = sin(angle);
    return vec3(
      scale.mul(ca.mul(tx).add(sa.mul(bx))),
      scale.mul(ca.mul(ty).add(sa.mul(by))),
      scale.mul(ca.mul(tz).add(sa.mul(bz)))
    );
  };

  const averagedGlowEmitterVisibilityTransmissionRgb = (
    sx: ReturnType<typeof float>,
    sy: ReturnType<typeof float>,
    sz: ReturnType<typeof float>,
    nx: ReturnType<typeof float>,
    ny: ReturnType<typeof float>,
    nz: ReturnType<typeof float>,
    ldx: ReturnType<typeof float>,
    ldy: ReturnType<typeof float>,
    ldz: ReturnType<typeof float>,
    maxDist: ReturnType<typeof float>
  ) => {
    const accR = float(0).toVar();
    const accG = float(0).toVar();
    const accB = float(0).toVar();
    void Loop(
      { start: int(0), end: int(GLOW_VISIBILITY_OCCLUSION_SAMPLES), type: 'int', condition: '<' },
      ({ i }) => {
        const off = glowVisibilityTangentDisk(nx, ny, nz, float(i));
        const s = traceGlowEmitterVisibilityTransmissionRgb(
          sx.add(off.x),
          sy.add(off.y),
          sz.add(off.z),
          ldx,
          ldy,
          ldz,
          maxDist
        );
        accR.addAssign(s.x);
        accG.addAssign(s.y);
        accB.addAssign(s.z);
      }
    );
    return vec3(accR.div(GLOW_VIS_N), accG.div(GLOW_VIS_N), accB.div(GLOW_VIS_N));
  };

  const accumulateGlowDirect = (
    sx: ReturnType<typeof float>,
    sy: ReturnType<typeof float>,
    sz: ReturnType<typeof float>,
    nx: ReturnType<typeof float>,
    ny: ReturnType<typeof float>,
    nz: ReturnType<typeof float>,
    maxT: ReturnType<typeof float>
  ) => {
    const addR = float(0).toVar();
    const addG = float(0).toVar();
    const addB = float(0).toVar();
    void If(uGlowEmitterCount.greaterThan(float(0.5)), () => {
      void Loop(
        { start: int(0), end: int(MAX_RAY_GLOW_EMITTERS), type: 'int', condition: '<' },
        ({ i }) => {
          void If(float(i).greaterThanEqual(uGlowEmitterCount), () => void Break());
          const idx = int(i).mul(int(2));
          const posSample = textureLoad(glowAcc, ivec2(idx, int(0)), int(0));
          const colSample = textureLoad(glowAcc, ivec2(idx.add(int(1)), int(0)), int(0));
          const dx = posSample.x.sub(sx);
          const dy = posSample.y.sub(sy);
          const dz = posSample.z.sub(sz);
          const d2 = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
          const radiusSq = float(GLOW_EMISSIVE_LIGHT_RADIUS * GLOW_EMISSIVE_LIGHT_RADIUS);
          void If(and(d2.greaterThan(float(1e-8)), d2.lessThan(radiusSq)), () => {
            const dist = sqrt(d2).max(float(1e-4));
            const invDist = float(1).div(dist);
            const ldx = dx.mul(invDist);
            const ldy = dy.mul(invDist);
            const ldz = dz.mul(invDist);
            const rawNdot = nx.mul(ldx).add(ny.mul(ldy)).add(nz.mul(ldz));
            const hl = rawNdot.mul(float(0.5)).add(float(0.5));
            const hlClamped = clamp(hl, float(0), float(1));
            const ndSoft = hlClamped.mul(hlClamped);
            const u = clamp(float(1).sub(dist.div(float(GLOW_EMISSIVE_LIGHT_RADIUS))), float(0), float(1));
            const window = u.mul(u).mul(float(3).sub(u.mul(float(2))));
            const ndComb = ndSoft.add(GLOW_PROX_FILL.mul(window).mul(hlClamped));
            void If(ndComb.greaterThan(float(1e-6)), () => {
              const atten = window
                .mul(float(GLOW_EMISSIVE_LIGHT_INTENSITY))
                .div(float(1).add(d2.mul(float(GLOW_EMISSIVE_LIGHT_SOFTNESS))));
              const visR = float(1).toVar();
              const visG = float(1).toVar();
              const visB = float(1).toVar();
              void If(uEnableShadows.greaterThan(float(0.5)), () => {
                const reach = max(float(0), min(maxT, dist.sub(float(GLOW_EMISSIVE_SHADOW_END_BIAS))));
                const tr = averagedGlowEmitterVisibilityTransmissionRgb(
                  sx,
                  sy,
                  sz,
                  nx,
                  ny,
                  nz,
                  ldx,
                  ldy,
                  ldz,
                  reach
                );
                visR.assign(tr.x);
                visG.assign(tr.y);
                visB.assign(tr.z);
              });
              addR.addAssign(colSample.x.mul(atten).mul(ndComb).mul(visR));
              addG.addAssign(colSample.y.mul(atten).mul(ndComb).mul(visG));
              addB.addAssign(colSample.z.mul(atten).mul(ndComb).mul(visB));
            });
          });
        }
      );
    });
    return vec3(addR, addG, addB);
  };

  const envReflectDir = (
    reflX: ReturnType<typeof float>,
    reflY: ReturnType<typeof float>,
    reflZ: ReturnType<typeof float>,
    matIdx: ReturnType<typeof uint>
  ) => {
    const tEnv = clamp(reflY.add(float(1)).mul(float(0.5)), float(0), float(1));
    const skR = mix(uSkyBottom.x, uSkyTop.x, tEnv);
    const skG = mix(uSkyBottom.y, uSkyTop.y, tEnv);
    const skB = mix(uSkyBottom.z, uSkyTop.z, tEnv);
    const lx = uToLight.x;
    const ly = uToLight.y;
    const lz = uToLight.z;
    const sunAlign = max(float(0), reflX.mul(lx).add(reflY.mul(ly)).add(reflZ.mul(lz)));
    const sunExp = select(matIdx.equal(uint(WATER_MAT)), float(12), float(48));
    const sunMul = select(
      matIdx.equal(uint(WATER_MAT)),
      float(3.5),
      select(matIdx.equal(uint(GLASS_MAT)), float(1.38), float(1.2))
    );
    const envW = select(matIdx.equal(uint(GLASS_MAT)), float(0.78), float(0.72));
    const ambW = select(matIdx.equal(uint(GLASS_MAT)), float(0.22), float(0.28));
    const sunLobe = pow(sunAlign, sunExp).mul(sunMul);
    return vec3(
      skR.mul(envW).add(uAmbient.x.mul(ambW)).add(uSunDiffuse.x.mul(sunLobe)),
      skG.mul(envW).add(uAmbient.y.mul(ambW)).add(uSunDiffuse.y.mul(sunLobe)),
      skB.mul(envW).add(uAmbient.z.mul(ambW)).add(uSunDiffuse.z.mul(sunLobe))
    );
  };

  const transmissiveSunSpec = (
    matIdx: ReturnType<typeof uint>,
    nx: ReturnType<typeof float>,
    ny: ReturnType<typeof float>,
    nz: ReturnType<typeof float>,
    rdx: ReturnType<typeof float>,
    rdy: ReturnType<typeof float>,
    rdz: ReturnType<typeof float>
  ) => {
    const lx = uToLight.x;
    const ly = uToLight.y;
    const lz = uToLight.z;
    const vx = rdx.negate();
    const vy = rdy.negate();
    const vz = rdz.negate();
    const ndotl = nx.mul(lx).add(ny.mul(ly)).add(nz.mul(lz));
    const ndotv = nx.mul(vx).add(ny.mul(vy)).add(nz.mul(vz));
    const ndotlValid = and(ndotl.greaterThan(float(0)), ndotv.greaterThan(float(0)));
    const reflL = ndotl.mul(float(2)).mul(nx).sub(lx);
    const reflM = ndotl.mul(float(2)).mul(ny).sub(ly);
    const reflN = ndotl.mul(float(2)).mul(nz).sub(lz);
    const rv = max(float(0), vx.mul(reflL).add(vy.mul(reflM)).add(vz.mul(reflN)));
    const broad = pow(rv, float(6)).mul(float(1.1));
    const tight = pow(rv, float(32)).mul(float(0.9));
    const ndotlSoft = float(0.3).add(max(float(0), ndotl).mul(float(0.7)));
    const sWater = broad.add(tight).mul(ndotlSoft);
    const waterRgb = vec3(
      sWater.mul(uSunDiffuse.x),
      sWater.mul(uSunDiffuse.y),
      sWater.mul(uSunDiffuse.z)
    );
    const shin = float(96);
    const intens = select(matIdx.equal(uint(GLASS_MAT)), float(0.34), float(0.28));
    const sGlass = pow(rv, shin).mul(intens);
    const glassRgb = vec3(
      sGlass.mul(uSunDiffuse.x),
      sGlass.mul(uSunDiffuse.y),
      sGlass.mul(uSunDiffuse.z)
    );
    const picked = select(matIdx.equal(uint(WATER_MAT)), waterRgb, glassRgb);
    const zero = vec3(float(0), float(0), float(0));
    return select(ndotlValid, picked, zero);
  };

  /** Distance through unit cell [ix,iy,iz] — aligns with `distToExitUnitCell`. */
  const distToExitCell = (
    px: ReturnType<typeof float>,
    py: ReturnType<typeof float>,
    pz: ReturnType<typeof float>,
    rdx: ReturnType<typeof float>,
    rdy: ReturnType<typeof float>,
    rdz: ReturnType<typeof float>,
    ix: ReturnType<typeof int>,
    iy: ReturnType<typeof int>,
    iz: ReturnType<typeof int>
  ) => {
    const tM = float(1e30).toVar();
    void If(rdx.greaterThan(float(1e-9)), () =>
      tM.assign(
        min(
          tM,
          float(ix.add(int(1)))
            .sub(px)
            .div(rdx)
        )
      )
    );
    void If(rdx.lessThan(float(-1e-9)), () => tM.assign(min(tM, float(ix).sub(px).div(rdx))));
    void If(rdy.greaterThan(float(1e-9)), () =>
      tM.assign(
        min(
          tM,
          float(iy.add(int(1)))
            .sub(py)
            .div(rdy)
        )
      )
    );
    void If(rdy.lessThan(float(-1e-9)), () => tM.assign(min(tM, float(iy).sub(py).div(rdy))));
    void If(rdz.greaterThan(float(1e-9)), () =>
      tM.assign(
        min(
          tM,
          float(iz.add(int(1)))
            .sub(pz)
            .div(rdz)
        )
      )
    );
    void If(rdz.lessThan(float(-1e-9)), () => tM.assign(min(tM, float(iz).sub(pz).div(rdz))));
    return select(tM.greaterThanEqual(float(1e20)), float(4e-9), tM);
  };

  const waterWaveNormal = (
    px: ReturnType<typeof float>,
    pz: ReturnType<typeof float>,
    signY: ReturnType<typeof float>
  ) => {
    const ph1 = WATER_WAVE_F1.mul(px.mul(float(0.85)).add(pz.mul(float(1.05)))).add(
      uTimeSeconds.mul(float(1.45))
    );
    const ph2 = WATER_WAVE_F2.mul(px.mul(float(1.2)).sub(pz.mul(float(0.65)))).add(
      uTimeSeconds.mul(float(1.05))
    );
    const dhdx = WATER_WAVE_AMP1.mul(float(0.85)).mul(WATER_WAVE_F1).mul(cos(ph1)).add(
      WATER_WAVE_AMP2.mul(float(1.2)).mul(WATER_WAVE_F2).mul(cos(ph2))
    );
    const dhdz = WATER_WAVE_AMP1.mul(float(1.05)).mul(WATER_WAVE_F1).mul(cos(ph1)).sub(
      WATER_WAVE_AMP2.mul(float(0.65)).mul(WATER_WAVE_F2).mul(cos(ph2))
    );
    const sy = select(signY.greaterThan(float(0)), float(1), float(-1));
    const nx = dhdx.negate().mul(sy);
    const ny = sy;
    const nz = dhdz.negate().mul(sy);
    const inv = float(1).div(sqrt(nx.mul(nx).add(ny.mul(ny)).add(nz.mul(nz))).max(float(1e-8)));
    return vec3(nx.mul(inv), ny.mul(inv), nz.mul(inv));
  };

  const transmissiveShadingNormal = (
    matIdx: ReturnType<typeof uint>,
    ix: ReturnType<typeof int>,
    iy: ReturnType<typeof int>,
    iz: ReturnType<typeof int>,
    hpx: ReturnType<typeof float>,
    hpz: ReturnType<typeof float>,
    nx: ReturnType<typeof float>,
    ny: ReturnType<typeof float>,
    nz: ReturnType<typeof float>
  ) => {
    const sx = nx.toVar();
    const sy = ny.toVar();
    const sz = nz.toVar();
    void If(matIdx.equal(uint(WATER_MAT)), () => {
      const axisAlignedTopBottom = and(abs(sy).greaterThanEqual(float(0.8)), and(equal(sx, float(0)), equal(sz, float(0))));
      void If(axisAlignedTopBottom, () => {
        const neigh = fetchPacked(ix.add(int(sx)), iy.add(int(sy)), iz.add(int(sz)));
        const neighMatEnc = shiftRight(neigh, uint(24));
        const neighWater = and(
          greaterThan(neighMatEnc, uint(0)),
          uint(neighMatEnc.sub(uint(1))).equal(uint(WATER_MAT))
        );
        void If(not(neighWater), () => {
          const wN = waterWaveNormal(hpx, hpz, sy);
          sx.assign(wN.x);
          sy.assign(wN.y);
          sz.assign(wN.z);
        });
      });
    });
    return vec3(sx, sy, sz);
  };

  const applyRayPostMood = (
    inR: ReturnType<typeof float>,
    inG: ReturnType<typeof float>,
    inB: ReturnType<typeof float>,
    su: ReturnType<typeof float>,
    sv: ReturnType<typeof float>,
    travelDist: ReturnType<typeof float>
  ) => {
    const pr = inR.toVar();
    const pg = inG.toVar();
    const pb = inB.toVar();
    void If(uDistanceTintEnabled.greaterThan(float(0.5)), () => {
      const nearT = clamp(
        travelDist.div(max(float(0.001), uDistanceTintNearDist)),
        float(0),
        float(1)
      );
      const farSpan = max(float(1), uDistanceTintFarDist.sub(uDistanceTintNearDist));
      const farT = clamp(travelDist.sub(uDistanceTintNearDist).div(farSpan), float(0), float(1));
      const tintA = vec3(
        mix(uDistanceTintNear.x, uDistanceTintMid.x, nearT),
        mix(uDistanceTintNear.y, uDistanceTintMid.y, nearT),
        mix(uDistanceTintNear.z, uDistanceTintMid.z, nearT)
      );
      const tint = vec3(
        mix(tintA.x, uDistanceTintFar.x, farT),
        mix(tintA.y, uDistanceTintFar.y, farT),
        mix(tintA.z, uDistanceTintFar.z, farT)
      );
      const s = clamp(uDistanceTintStrength, float(0), float(1));
      pr.assign(mix(pr, tint.x, s));
      pg.assign(mix(pg, tint.y, s));
      pb.assign(mix(pb, tint.z, s));
    });
    void If(and(uGrainEnabled.greaterThan(float(0.5)), uGrainStrength.greaterThan(float(0))), () => {
      const tt = select(
        uGrainAnimated.greaterThan(float(0.5)),
        uTimeSeconds.mul(uGrainSpeed),
        float(0)
      );
      const s = uGrainStrength;
      const fract01 = (x: ReturnType<typeof float>) => fract(x);
      void If(uGrainColorful.greaterThan(float(0.5)), () => {
        const n1 = fract01(
          sin(su.add(tt.mul(float(0.37))).mul(float(12.9898)).add(sv.add(tt.mul(float(0.19))).mul(float(78.233)))).mul(float(43758.5453))
        );
        const n2 = fract01(
          sin(
            su
              .add(tt.mul(float(0.41)))
              .add(float(19.19))
              .mul(float(93.9898))
              .add(sv.add(tt.mul(float(0.23))).add(float(73.73)).mul(float(67.345)))
          ).mul(float(24634.6345))
        );
        const n3 = fract01(
          sin(
            su
              .add(tt.mul(float(0.29)))
              .add(float(47.77))
              .mul(float(27.123))
              .add(sv.add(tt.mul(float(0.31))).add(float(11.13)).mul(float(98.456)))
          ).mul(float(56445.2345))
        );
        pr.addAssign(n1.sub(float(0.5)).mul(s));
        pg.addAssign(n2.sub(float(0.5)).mul(s));
        pb.addAssign(n3.sub(float(0.5)).mul(s));
      }).Else(() => {
        const n = fract01(
          sin(su.add(tt.mul(float(0.37))).mul(float(12.9898)).add(sv.add(tt.mul(float(0.19))).mul(float(78.233)))).mul(float(43758.5453))
        );
        const gn = n.sub(float(0.5)).mul(s);
        pr.addAssign(gn);
        pg.addAssign(gn);
        pb.addAssign(gn);
      });
    });
    return vec3(pr, pg, pb);
  };

  /**
   * One transmissive slab traversal: entry/exit Fresnel, Beer–Lambert column merge, advance ray origin.
   * Aligns with `traceAndShade` / `voxelRayProgressive` (including exposed top/bottom water wave normal).
   */
  const accumulateGlassInterface = (
    matIdx: ReturnType<typeof uint>,
    pkHit: ReturnType<typeof uint>,
    ix: ReturnType<typeof int>,
    iy: ReturnType<typeof int>,
    iz: ReturnType<typeof int>,
    nx: ReturnType<typeof float>,
    ny: ReturnType<typeof float>,
    nz: ReturnType<typeof float>,
    entryT: ReturnType<typeof float>,
    hpx: ReturnType<typeof float>,
    hpy: ReturnType<typeof float>,
    hpz: ReturnType<typeof float>,
    oox: ReturnType<typeof float> & { value?: unknown },
    ooy: ReturnType<typeof float> & { value?: unknown },
    ooz: ReturnType<typeof float> & { value?: unknown },
    remDist: ReturnType<typeof float> & { value?: unknown },
    mediumIor: ReturnType<typeof float> & { value?: unknown },
    accR: ReturnType<typeof float> & { value?: unknown },
    accG: ReturnType<typeof float> & { value?: unknown },
    accB: ReturnType<typeof float> & { value?: unknown },
    tr: ReturnType<typeof float> & { value?: unknown },
    tg: ReturnType<typeof float> & { value?: unknown },
    tb: ReturnType<typeof float> & { value?: unknown },
    rdx: ReturnType<typeof float> & { value?: unknown },
    rdy: ReturnType<typeof float> & { value?: unknown },
    rdz: ReturnType<typeof float> & { value?: unknown }
  ) => {
    const sx = nx;
    const sy = ny;
    const sz = nz;
    const cosIN = max(
      float(0),
      rdx.negate().mul(sx).add(rdy.negate().mul(sy)).add(rdz.negate().mul(sz))
    );
    const etaT = iorFromMatIdx(matIdx);
    void If(entryT.greaterThanEqual(DDA_HIT_EPS), () => {
      const Rentry = float(0).toVar();
      Rentry.assign(fresnelSchlick(cosIN, mediumIor, etaT));
      void If(matIdx.equal(uint(WATER_MAT)), () => Rentry.assign(max(Rentry, float(0.12))));
      const Tentry = float(1).sub(Rentry);
      const ndoti = sx.mul(rdx).add(sy.mul(rdy)).add(sz.mul(rdz));
      const rfx = rdx.sub(sx.mul(ndoti).mul(float(2)));
      const rfy = rdy.sub(sy.mul(ndoti).mul(float(2)));
      const rfz = rdz.sub(sz.mul(ndoti).mul(float(2)));
      const reflCol = envReflectDir(rfx, rfy, rfz, matIdx);
      const sunS = transmissiveSunSpec(matIdx, sx, sy, sz, rdx, rdy, rdz);
      accR.assign(accR.add(tr.mul(Rentry).mul(reflCol.x)));
      accG.assign(accG.add(tg.mul(Rentry).mul(reflCol.y)));
      accB.assign(accB.add(tb.mul(Rentry).mul(reflCol.z)));
      accR.assign(accR.add(tr.mul(sunS.x)));
      accG.assign(accG.add(tg.mul(sunS.y)));
      accB.assign(accB.add(tb.mul(sunS.z)));
      tr.assign(tr.mul(Tentry));
      tg.assign(tg.mul(Tentry));
      tb.assign(tb.mul(Tentry));
    });
    const cx = ix.toVar();
    const cy = iy.toVar();
    const cz = iz.toVar();
    const cpx = hpx.toVar();
    const cpy = hpy.toVar();
    const cpz = hpz.toVar();
    const curMid = matIdx.toVar();
    const curPk = pkHit.toVar();
    const stepAcc = float(0).toVar();
    stepAcc.assign(entryT);
    const etaOutVar = float(1).toVar();
    void Loop({ start: int(0), end: int(32), type: 'int', condition: '<' }, () => {
      const tThru = distToExitCell(cpx, cpy, cpz, rdx, rdy, rdz, cx, cy, cz);
      const isWcell = curMid.equal(uint(WATER_MAT));
      const aRcol = select(isWcell, float(0.03), GLASS_ABS);
      const aGcol = select(isWcell, float(0.012), GLASS_ABS);
      const aBcol = select(isWcell, float(0.006), GLASS_ABS);
      const atR = max(GLASS_MIN_T, exp(aRcol.negate().mul(tThru)));
      const atG = max(GLASS_MIN_T, exp(aGcol.negate().mul(tThru)));
      const atB = max(GLASS_MIN_T, exp(aBcol.negate().mul(tThru)));
      const rgbC = unpackLinearRgb(curPk);
      const cTR = select(isWcell, float(1), rgbC.x);
      const cTG = select(isWcell, float(1), rgbC.y);
      const cTB = select(isWcell, float(1), rgbC.z);
      tr.assign(tr.mul(atR).mul(cTR));
      tg.assign(tg.mul(atG).mul(cTG));
      tb.assign(tb.mul(atB).mul(cTB));
      const tStep = max(tThru, float(4e-9));
      cpx.assign(cpx.add(rdx.mul(tStep)));
      cpy.assign(cpy.add(rdy.mul(tStep)));
      cpz.assign(cpz.add(rdz.mul(tStep)));
      stepAcc.assign(stepAcc.add(tStep));
      const nxp = cpx.add(rdx.mul(GLASS_CELL_NUDGE));
      const nyp = cpy.add(rdy.mul(GLASS_CELL_NUDGE));
      const nzp = cpz.add(rdz.mul(GLASS_CELL_NUDGE));
      const ncx = int(floor(nxp));
      const ncy = int(floor(nyp));
      const ncz = int(floor(nzp));
      const pkN = fetchPacked(ncx, ncy, ncz);
      const meN = shiftRight(pkN, uint(24));
      void If(and(greaterThan(meN, uint(0)), curMid.equal(uint(meN.sub(uint(1))))), () => {
        cx.assign(ncx);
        cy.assign(ncy);
        cz.assign(ncz);
        cpx.assign(nxp);
        cpy.assign(nyp);
        cpz.assign(nzp);
        curPk.assign(pkN);
        stepAcc.assign(stepAcc.add(GLASS_CELL_NUDGE));
      }).Else(() => {
        const midN = uint(meN.sub(uint(1)));
        void If(and(greaterThan(meN, uint(0)), isTransmissiveIdx(midN)), () =>
          etaOutVar.assign(iorFromMatIdx(midN))
        );
        void Break();
      });
    });
    const Rexit = fresnelSchlick(cosIN, iorFromMatIdx(curMid), etaOutVar);
    const Texit = float(1).sub(Rexit);
    tr.assign(tr.mul(Texit));
    tg.assign(tg.mul(Texit));
    tb.assign(tb.mul(Texit));
    const stepTot = stepAcc.add(SHADOW_SURFACE_EPS);
    oox.assign(oox.add(rdx.mul(stepTot)));
    ooy.assign(ooy.add(rdy.mul(stepTot)));
    ooz.assign(ooz.add(rdz.mul(stepTot)));
    remDist.assign(remDist.sub(stepTot));
    mediumIor.assign(float(1));
    const pkMedN = fetchPacked(
      int(floor(oox.add(rdx.mul(DDA_RAY_ORIGIN_EPS)))),
      int(floor(ooy.add(rdy.mul(DDA_RAY_ORIGIN_EPS)))),
      int(floor(ooz.add(rdz.mul(DDA_RAY_ORIGIN_EPS))))
    );
    const meMed = shiftRight(pkMedN, uint(24));
    const midMed = uint(meMed.sub(uint(1)));
    void If(and(greaterThan(meMed, uint(0)), isTransmissiveIdx(midMed)), () =>
      mediumIor.assign(iorFromMatIdx(midMed))
    );
  };

  /** Background RGB for a ray miss: `uBg`, optionally replaced by vertical sky gradient from quad UV. */
  const missBackgroundFromUv = (suv: ReturnType<typeof uv>) => {
    const miss = vec3(uBg).toVar();
    void If(uEnableSky.greaterThan(float(0.5)), () => {
      const denom = uBufH.sub(float(1)).max(float(1));
      const tSky = clamp(suv.y.mul(uBufH).div(denom), float(0), float(1));
      miss.assign(mix(uSkyTop, uSkyBottom, tSky));
    });
    return miss;
  };

  /** `out* = acc* + transmittance * missRgb`; optionally sets `hitFound` to 1 (segment / ray exhausted). */
  const accumulateTransmittedMissRgb = (
    miss: { x: ReturnType<typeof float>; y: ReturnType<typeof float>; z: ReturnType<typeof float> },
    accR: ReturnType<typeof float> & { value?: unknown },
    accG: ReturnType<typeof float> & { value?: unknown },
    accB: ReturnType<typeof float> & { value?: unknown },
    tr: ReturnType<typeof float> & { value?: unknown },
    tg: ReturnType<typeof float> & { value?: unknown },
    tb: ReturnType<typeof float> & { value?: unknown },
    outR: ReturnType<typeof float> & { value?: unknown },
    outG: ReturnType<typeof float> & { value?: unknown },
    outB: ReturnType<typeof float> & { value?: unknown },
    hitFound: (ReturnType<typeof float> & { value?: unknown }) | null
  ) => {
    outR.assign(accR.add(tr.mul(miss.x)));
    outG.assign(accG.add(tg.mul(miss.y)));
    outB.assign(accB.add(tb.mul(miss.z)));
    if (hitFound !== null) {
      hitFound.assign(float(1));
    }
  };

  /** Quad UV → world-space primary ray (matches CPU trace clip unproject). */
  const cameraRayFromUv = (suv: ReturnType<typeof uv>) => {
    const ndcX = suv.x.mul(float(2)).sub(float(1));
    const ndcY = suv.y.mul(float(2)).sub(float(1));
    const clip = vec4(ndcX, ndcY, float(0.5), float(1));
    const pw = uClipToWorld.mul(clip);
    const pWorld = pw.xyz.div(pw.w.max(float(1e-6)));
    const rd = normalize(pWorld.sub(vec3(uCamPos)));
    const ro = vec3(uCamPos);
    return { rd, ro };
  };

  /** DDA voxel grid + tMax/tDelta from current ray origin (`oox`..`ooz`) and direction. */
  const primaryRayDdaPrep = (
    oox: ReturnType<typeof float> & { value?: unknown },
    ooy: ReturnType<typeof float> & { value?: unknown },
    ooz: ReturnType<typeof float> & { value?: unknown },
    rdx: ReturnType<typeof float> & { value?: unknown },
    rdy: ReturnType<typeof float> & { value?: unknown },
    rdz: ReturnType<typeof float> & { value?: unknown }
  ) => {
    const oxp = oox.add(rdx.mul(DDA_RAY_ORIGIN_EPS));
    const oyp = ooy.add(rdy.mul(DDA_RAY_ORIGIN_EPS));
    const ozp = ooz.add(rdz.mul(DDA_RAY_ORIGIN_EPS));
    const x = int(floor(oxp)).toVar();
    const y = int(floor(oyp)).toVar();
    const z = int(floor(ozp)).toVar();
    const stepX = int(0).toVar();
    const stepY = int(0).toVar();
    const stepZ = int(0).toVar();
    void If(greaterThan(rdx, float(1e-9)), () => stepX.assign(int(1)));
    void If(lessThan(rdx, float(-1e-9)), () => stepX.assign(int(-1)));
    void If(greaterThan(rdy, float(1e-9)), () => stepY.assign(int(1)));
    void If(lessThan(rdy, float(-1e-9)), () => stepY.assign(int(-1)));
    void If(greaterThan(rdz, float(1e-9)), () => stepZ.assign(int(1)));
    void If(lessThan(rdz, float(-1e-9)), () => stepZ.assign(int(-1)));
    const big = float(1e30);
    const tDeltaX = select(equal(stepX, int(0)), big, float(1).div(abs(rdx)));
    const tDeltaY = select(equal(stepY, int(0)), big, float(1).div(abs(rdy)));
    const tDeltaZ = select(equal(stepZ, int(0)), big, float(1).div(abs(rdz)));
    const tMaxX = float(0).toVar();
    const tMaxY = float(0).toVar();
    const tMaxZ = float(0).toVar();
    void If(greaterThan(stepX, int(0)), () => tMaxX.assign(float(x.add(int(1)).sub(oxp)).div(rdx)));
    void If(lessThan(stepX, int(0)), () => tMaxX.assign(float(x.sub(oxp)).div(rdx)));
    void If(equal(stepX, int(0)), () => tMaxX.assign(big));
    void If(greaterThan(stepY, int(0)), () => tMaxY.assign(float(y.add(int(1)).sub(oyp)).div(rdy)));
    void If(lessThan(stepY, int(0)), () => tMaxY.assign(float(y.sub(oyp)).div(rdy)));
    void If(equal(stepY, int(0)), () => tMaxY.assign(big));
    void If(greaterThan(stepZ, int(0)), () => tMaxZ.assign(float(z.add(int(1)).sub(ozp)).div(rdz)));
    void If(lessThan(stepZ, int(0)), () => tMaxZ.assign(float(z.sub(ozp)).div(rdz)));
    void If(equal(stepZ, int(0)), () => tMaxZ.assign(big));
    return { oxp, oyp, ozp, x, y, z, stepX, stepY, stepZ, tDeltaX, tDeltaY, tDeltaZ, tMaxX, tMaxY, tMaxZ };
  };

  /** Major-axis face normal pointing opposite to `-rd` (glass slab entry from outside). */
  const ddaMajorAxisNormalTowardNegRay = (
    rdx: ReturnType<typeof float> & { value?: unknown },
    rdy: ReturnType<typeof float> & { value?: unknown },
    rdz: ReturnType<typeof float> & { value?: unknown }
  ) => {
    const ax = abs(rdx);
    const ay = abs(rdy);
    const az = abs(rdz);
    const nx = float(0).toVar();
    const ny = float(0).toVar();
    const nz = float(0).toVar();
    void If(and(ax.greaterThanEqual(ay), ax.greaterThanEqual(az)), () => {
      nx.assign(select(greaterThan(rdx.negate(), float(0)), float(1), float(-1)));
    })
      .ElseIf(ay.greaterThanEqual(az), () => {
        ny.assign(select(greaterThan(rdy.negate(), float(0)), float(1), float(-1)));
      })
      .Else(() => {
        nz.assign(select(greaterThan(rdz.negate(), float(0)), float(1), float(-1)));
      });
    return { nx, ny, nz };
  };

  /** Major-axis face normal pointing toward `+rd` (opaque cube exit / camera side). */
  const ddaMajorAxisNormalTowardPosRay = (
    rdx: ReturnType<typeof float> & { value?: unknown },
    rdy: ReturnType<typeof float> & { value?: unknown },
    rdz: ReturnType<typeof float> & { value?: unknown }
  ) => {
    const ax = abs(rdx);
    const ay = abs(rdy);
    const az = abs(rdz);
    const nx = float(0).toVar();
    const ny = float(0).toVar();
    const nz = float(0).toVar();
    void If(and(ax.greaterThanEqual(ay), ax.greaterThanEqual(az)), () => {
      nx.assign(select(greaterThan(rdx, float(0)), float(1), float(-1)));
    })
      .ElseIf(ay.greaterThanEqual(az), () => {
        ny.assign(select(greaterThan(rdy, float(0)), float(1), float(-1)));
      })
      .Else(() => {
        nz.assign(select(greaterThan(rdz, float(0)), float(1), float(-1)));
      });
    return { nx, ny, nz };
  };

  /** Advance DDA to the next voxel boundary; updates `tMax*`, `x|y|z`, returns `tHit` and crossed `axis`. */
  const ddaAdvanceNextVoxel = (
    tMaxX: ReturnType<typeof float> & { value?: unknown },
    tMaxY: ReturnType<typeof float> & { value?: unknown },
    tMaxZ: ReturnType<typeof float> & { value?: unknown },
    tDeltaX: ReturnType<typeof float>,
    tDeltaY: ReturnType<typeof float>,
    tDeltaZ: ReturnType<typeof float>,
    stepX: ReturnType<typeof int> & { value?: unknown },
    stepY: ReturnType<typeof int> & { value?: unknown },
    stepZ: ReturnType<typeof int> & { value?: unknown },
    x: ReturnType<typeof int> & { value?: unknown },
    y: ReturnType<typeof int> & { value?: unknown },
    z: ReturnType<typeof int> & { value?: unknown }
  ) => {
    const tHit = float(0).toVar();
    const axis = int(0).toVar();
    void If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
      axis.assign(int(0));
      tHit.assign(tMaxX);
      tMaxX.addAssign(tDeltaX);
      x.addAssign(stepX);
    })
      .ElseIf(tMaxY.lessThanEqual(tMaxZ), () => {
        axis.assign(int(1));
        tHit.assign(tMaxY);
        tMaxY.addAssign(tDeltaY);
        y.addAssign(stepY);
      })
      .Else(() => {
        axis.assign(int(2));
        tHit.assign(tMaxZ);
        tMaxZ.addAssign(tDeltaZ);
        z.addAssign(stepZ);
      });
    return { tHit, axis };
  };

  /** Face normal for the DDA step axis (points into the entered voxel, ±1 on crossed axis). */
  const ddaStepFaceNormal = (
    axis: ReturnType<typeof int> & { value?: unknown },
    stepX: ReturnType<typeof int> & { value?: unknown },
    stepY: ReturnType<typeof int> & { value?: unknown },
    stepZ: ReturnType<typeof int> & { value?: unknown }
  ) => {
    const nx = float(0).toVar();
    const ny = float(0).toVar();
    const nz = float(0).toVar();
    void If(axis.equal(int(0)), () => {
      nx.assign(select(greaterThan(stepX, int(0)), float(-1), float(1)));
    })
      .ElseIf(axis.equal(int(1)), () => {
        ny.assign(select(greaterThan(stepY, int(0)), float(-1), float(1)));
      })
      .Else(() => {
        nz.assign(select(greaterThan(stepZ, int(0)), float(-1), float(1)));
      });
    return { nx, ny, nz };
  };

  /**
   * Lambert + metal spec + glow accumulation + bloom mask for one opaque voxel hit.
   * `base*` is the shaded surface point (ro for cell entry, hit position along march for DDA step).
   */
  const shadeOpaqueVoxelContribution = (
    shouldBreakAfter: boolean,
    pk: ReturnType<typeof uint>,
    matIdx: ReturnType<typeof uint>,
    baseX: ReturnType<typeof float>,
    baseY: ReturnType<typeof float>,
    baseZ: ReturnType<typeof float>,
    nx: ReturnType<typeof float> & { value?: unknown },
    ny: ReturnType<typeof float> & { value?: unknown },
    nz: ReturnType<typeof float> & { value?: unknown },
    maxT: ReturnType<typeof float>,
    rdx: ReturnType<typeof float> & { value?: unknown },
    rdy: ReturnType<typeof float> & { value?: unknown },
    rdz: ReturnType<typeof float> & { value?: unknown },
    accR: ReturnType<typeof float> & { value?: unknown },
    accG: ReturnType<typeof float> & { value?: unknown },
    accB: ReturnType<typeof float> & { value?: unknown },
    tr: ReturnType<typeof float> & { value?: unknown },
    tg: ReturnType<typeof float> & { value?: unknown },
    tb: ReturnType<typeof float> & { value?: unknown },
    outR: ReturnType<typeof float> & { value?: unknown },
    outG: ReturnType<typeof float> & { value?: unknown },
    outB: ReturnType<typeof float> & { value?: unknown },
    bloomR: ReturnType<typeof float> & { value?: unknown },
    bloomG: ReturnType<typeof float> & { value?: unknown },
    bloomB: ReturnType<typeof float> & { value?: unknown },
    hitFound: ReturnType<typeof float> & { value?: unknown }
  ) => {
    const rgb = unpackLinearRgb(pk);
    const lx = uToLight.x;
    const ly = uToLight.y;
    const lz = uToLight.z;
    const ndotl = max(float(0), nx.mul(lx).add(ny.mul(ly)).add(nz.mul(lz)));
    const shR = float(1).toVar();
    const shG = float(1).toVar();
    const shB = float(1).toVar();
    void If(uEnableShadows.greaterThan(float(0.5)), () => {
      const hx = baseX.add(nx.mul(SHADOW_SURFACE_EPS));
      const hy = baseY.add(ny.mul(SHADOW_SURFACE_EPS));
      const hz = baseZ.add(nz.mul(SHADOW_SURFACE_EPS));
      const st = averagedShadowTransmission(hx, hy, hz, lx, ly, lz, maxT);
      shR.assign(st.x);
      shG.assign(st.y);
      shB.assign(st.z);
    });
    const cr = rgb.x;
    const cg = rgb.y;
    const cb = rgb.z;
    const dr = cr.mul(uAmbient.x).add(cr.mul(uSunDiffuse.x).mul(ndotl).mul(shR));
    const dg = cg.mul(uAmbient.y).add(cg.mul(uSunDiffuse.y).mul(ndotl).mul(shG));
    const db = cb.mul(uAmbient.z).add(cb.mul(uSunDiffuse.z).mul(ndotl).mul(shB));
    const eAdd = accumulateGlowDirect(
      baseX.add(nx.mul(SHADOW_SURFACE_EPS)),
      baseY.add(ny.mul(SHADOW_SURFACE_EPS)),
      baseZ.add(nz.mul(SHADOW_SURFACE_EPS)),
      nx,
      ny,
      nz,
      maxT
    );
    const isMetal = matIdx.equal(uint(METAL_MAT));
    const isGlow = matIdx.equal(uint(GLOW_MAT));
    const vx = rdx.negate();
    const vy = rdy.negate();
    const vz = rdz.negate();
    const reflL = ndotl.mul(float(2)).mul(nx).sub(lx);
    const reflM = ndotl.mul(float(2)).mul(ny).sub(ly);
    const reflN = ndotl.mul(float(2)).mul(nz).sub(lz);
    const spec = max(float(0), vx.mul(reflL).add(vy.mul(reflM)).add(vz.mul(reflN)));
    const sp = pow(spec, float(48)).mul(float(0.45));
    const dMetalR = dr.add(sp.mul(uSunDiffuse.x).mul(shR));
    const dMetalG = dg.add(sp.mul(uSunDiffuse.y).mul(shG));
    const dMetalB = db.add(sp.mul(uSunDiffuse.z).mul(shB));
    const dFinalR = select(isMetal, dMetalR, dr).add(eAdd.x);
    const dFinalG = select(isMetal, dMetalG, dg).add(eAdd.y);
    const dFinalB = select(isMetal, dMetalB, db).add(eAdd.z);
    const addR = cr.mul(GLOW_SELF_SCALE);
    const addG = cg.mul(GLOW_SELF_SCALE);
    const addB = cb.mul(GLOW_SELF_SCALE);
    const surfR = dFinalR.add(select(isGlow, addR, float(0)));
    const surfG = dFinalG.add(select(isGlow, addG, float(0)));
    const surfB = dFinalB.add(select(isGlow, addB, float(0)));
    outR.assign(accR.add(tr.mul(surfR)));
    outG.assign(accG.add(tg.mul(surfG)));
    outB.assign(accB.add(tb.mul(surfB)));
    bloomR.assign(tr.mul(select(isGlow, addR.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0))));
    bloomG.assign(tg.mul(select(isGlow, addG.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0))));
    bloomB.assign(tb.mul(select(isGlow, addB.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0))));
    hitFound.assign(float(1));
    if (shouldBreakAfter) {
      void Break();
    }
  };

  /** Glass/water slab: Fresnel + column + advance ray. March step sets `marchDidGlass` and breaks the inner loop. */
  const runTransmissiveGlassSlab = (
    isMarchStep: boolean,
    matIdx: ReturnType<typeof uint>,
    pk: ReturnType<typeof uint>,
    ix: ReturnType<typeof int>,
    iy: ReturnType<typeof int>,
    iz: ReturnType<typeof int>,
    wavePx: ReturnType<typeof float>,
    wavePz: ReturnType<typeof float>,
    nx: ReturnType<typeof float> & { value?: unknown },
    ny: ReturnType<typeof float> & { value?: unknown },
    nz: ReturnType<typeof float> & { value?: unknown },
    entryT: ReturnType<typeof float>,
    ifaceX: ReturnType<typeof float>,
    ifaceY: ReturnType<typeof float>,
    ifaceZ: ReturnType<typeof float>,
    oox: ReturnType<typeof float> & { value?: unknown },
    ooy: ReturnType<typeof float> & { value?: unknown },
    ooz: ReturnType<typeof float> & { value?: unknown },
    remDist: ReturnType<typeof float> & { value?: unknown },
    mediumIor: ReturnType<typeof float> & { value?: unknown },
    accR: ReturnType<typeof float> & { value?: unknown },
    accG: ReturnType<typeof float> & { value?: unknown },
    accB: ReturnType<typeof float> & { value?: unknown },
    tr: ReturnType<typeof float> & { value?: unknown },
    tg: ReturnType<typeof float> & { value?: unknown },
    tb: ReturnType<typeof float> & { value?: unknown },
    rdx: ReturnType<typeof float> & { value?: unknown },
    rdy: ReturnType<typeof float> & { value?: unknown },
    rdz: ReturnType<typeof float> & { value?: unknown },
    marchDidGlass: ReturnType<typeof float> & { value?: unknown }
  ) => {
    const sN = transmissiveShadingNormal(matIdx, ix, iy, iz, wavePx, wavePz, nx, ny, nz);
    accumulateGlassInterface(
      matIdx,
      pk,
      ix,
      iy,
      iz,
      sN.x,
      sN.y,
      sN.z,
      entryT,
      ifaceX,
      ifaceY,
      ifaceZ,
      oox,
      ooy,
      ooz,
      remDist,
      mediumIor,
      accR,
      accG,
      accB,
      tr,
      tg,
      tb,
      rdx,
      rdy,
      rdz
    );
    if (isMarchStep) {
      marchDidGlass.assign(float(1));
      void Break();
    }
  };

  const composeBeautyBloomRgba = (
    postX: ReturnType<typeof float>,
    postY: ReturnType<typeof float>,
    postZ: ReturnType<typeof float>,
    bloomR: ReturnType<typeof float> & { value?: unknown },
    bloomG: ReturnType<typeof float> & { value?: unknown },
    bloomB: ReturnType<typeof float> & { value?: unknown }
  ) => {
    const bloomOut = vec4(bloomR, bloomG, bloomB, float(1));
    const beautyOut = vec4(postX, postY, postZ, float(1));
    const bloomMixT = step(float(0.5), uPassBloom);
    return vec4(
      mix(beautyOut.x, bloomOut.x, bloomMixT),
      mix(beautyOut.y, bloomOut.y, bloomMixT),
      mix(beautyOut.z, bloomOut.z, bloomMixT),
      float(1)
    );
  };

  // Inline `Fn(..., 'vec4')` only: object layout extracts a WGSL helper and can mis-type returns (f32 vs vec4).
  // TSL: stack children are built with `void` output; prefix `If`/`Loop`/`Break` with `void` so branches are not emitted as invalid `return` in non-function flow.
  const shadeOutputFn = Fn(() => {
    const suv = uv();
    const { rd, ro } = cameraRayFromUv(suv);

    const rdx = rd.x.toVar();
    const rdy = rd.y.toVar();
    const rdz = rd.z.toVar();
    const oox = ro.x.toVar();
    const ooy = ro.y.toVar();
    const ooz = ro.z.toVar();
    const remDist = float(0).toVar();
    remDist.assign(uMaxDist);
    const accR = float(0).toVar();
    const accG = float(0).toVar();
    const accB = float(0).toVar();
    const tr = float(1).toVar();
    const tg = float(1).toVar();
    const tb = float(1).toVar();
    const mediumIor = float(1).toVar();
    const pki0 = fetchPacked(
      int(floor(ro.x.add(rdx.mul(DDA_RAY_ORIGIN_EPS)))),
      int(floor(ro.y.add(rdy.mul(DDA_RAY_ORIGIN_EPS)))),
      int(floor(ro.z.add(rdz.mul(DDA_RAY_ORIGIN_EPS))))
    );
    const mei0 = shiftRight(pki0, uint(24));
    void If(greaterThan(mei0, uint(0)), () => {
      const midI = uint(mei0.sub(uint(1)));
      void If(isTransmissiveIdx(midI), () => mediumIor.assign(iorFromMatIdx(midI)));
    });
    const outR = float(0).toVar();
    const outG = float(0).toVar();
    const outB = float(0).toVar();
    const bloomR = float(0).toVar();
    const bloomG = float(0).toVar();
    const bloomB = float(0).toVar();
    const hitFound = float(0).toVar();
    const marchDidGlass = float(0).toVar();

    void Loop({ start: int(0), end: int(4), type: 'int', condition: '<' }, () => {
      marchDidGlass.assign(float(0));
      void If(hitFound.greaterThan(float(0.5)), () => void Break());
      void If(remDist.lessThan(float(1e-6)), () => {
        accumulateTransmittedMissRgb(
          missBackgroundFromUv(suv),
          accR,
          accG,
          accB,
          tr,
          tg,
          tb,
          outR,
          outG,
          outB,
          hitFound
        );
        void Break();
      });

      const {
        oxp,
        oyp,
        ozp,
        x,
        y,
        z,
        stepX,
        stepY,
        stepZ,
        tDeltaX,
        tDeltaY,
        tDeltaZ,
        tMaxX,
        tMaxY,
        tMaxZ
      } = primaryRayDdaPrep(oox, ooy, ooz, rdx, rdy, rdz);

      const maxT = remDist;

      const pkStart = fetchPacked(x, y, z);
      const matStart = shiftRight(pkStart, uint(24));
      void If(greaterThan(matStart, uint(0)), () => {
        const matIdx = uint(matStart.sub(uint(1)));
        void If(isTransmissiveIdx(matIdx), () => {
          const { nx: nx0, ny: ny0, nz: nz0 } = ddaMajorAxisNormalTowardNegRay(rdx, rdy, rdz);
          runTransmissiveGlassSlab(
            false,
            matIdx,
            pkStart,
            x,
            y,
            z,
            oox,
            ooz,
            nx0,
            ny0,
            nz0,
            float(0),
            oox,
            ooy,
            ooz,
            oox,
            ooy,
            ooz,
            remDist,
            mediumIor,
            accR,
            accG,
            accB,
            tr,
            tg,
            tb,
            rdx,
            rdy,
            rdz,
            marchDidGlass
          );
        }).Else(() => {
          const { nx, ny, nz } = ddaMajorAxisNormalTowardPosRay(rdx, rdy, rdz);
          shadeOpaqueVoxelContribution(
            false,
            pkStart,
            matIdx,
            oox,
            ooy,
            ooz,
            nx,
            ny,
            nz,
            maxT,
            rdx,
            rdy,
            rdz,
            accR,
            accG,
            accB,
            tr,
            tg,
            tb,
            outR,
            outG,
            outB,
            bloomR,
            bloomG,
            bloomB,
            hitFound
          );
        });
      });

      void If(hitFound.lessThan(float(0.5)), () => {
        void Loop(
          { start: int(0), end: int(floor(uPrimaryDdaMaxSteps)), type: 'int', condition: '<' },
          () => {
          const { tHit, axis } = ddaAdvanceNextVoxel(
            tMaxX,
            tMaxY,
            tMaxZ,
            tDeltaX,
            tDeltaY,
            tDeltaZ,
            stepX,
            stepY,
            stepZ,
            x,
            y,
            z
          );
          void If(tHit.greaterThan(maxT), () => void Break());
          const hpx = oxp.add(rdx.mul(tHit));
          const hpy = oyp.add(rdy.mul(tHit));
          const hpz = ozp.add(rdz.mul(tHit));
          const pk = fetchPacked(x, y, z);
          const matEnc = shiftRight(pk, uint(24));
          void If(greaterThan(matEnc, uint(0)), () => {
            const matIdx = uint(matEnc.sub(uint(1)));
            const { nx, ny, nz } = ddaStepFaceNormal(axis, stepX, stepY, stepZ);
            void If(isTransmissiveIdx(matIdx), () => {
              runTransmissiveGlassSlab(
                true,
                matIdx,
                pk,
                x,
                y,
                z,
                hpx,
                hpz,
                nx,
                ny,
                nz,
                tHit,
                hpx,
                hpy,
                hpz,
                oox,
                ooy,
                ooz,
                remDist,
                mediumIor,
                accR,
                accG,
                accB,
                tr,
                tg,
                tb,
                rdx,
                rdy,
                rdz,
                marchDidGlass
              );
            }).Else(() => {
              shadeOpaqueVoxelContribution(
                true,
                pk,
                matIdx,
                hpx,
                hpy,
                hpz,
                nx,
                ny,
                nz,
                maxT,
                rdx,
                rdy,
                rdz,
                accR,
                accG,
                accB,
                tr,
                tg,
                tb,
                outR,
                outG,
                outB,
                bloomR,
                bloomG,
                bloomB,
                hitFound
              );
            });
          });
        });

      });

      void If(and(hitFound.lessThan(float(0.5)), marchDidGlass.lessThan(float(0.5))), () => {
        accumulateTransmittedMissRgb(
          missBackgroundFromUv(suv),
          accR,
          accG,
          accB,
          tr,
          tg,
          tb,
          outR,
          outG,
          outB,
          hitFound
        );
      });
    });

    void If(hitFound.lessThan(float(0.5)), () => {
      accumulateTransmittedMissRgb(
        missBackgroundFromUv(suv),
        accR,
        accG,
        accB,
        tr,
        tg,
        tb,
        outR,
        outG,
        outB,
        null
      );
    });

    const post = applyRayPostMood(
      outR,
      outG,
      outB,
      suv.x,
      suv.y,
      uMaxDist.mul(float(0.5))
    );
    return composeBeautyBloomRgba(post.x, post.y, post.z, bloomR, bloomG, bloomB);
  }, 'vec4');

  const material = new NodeMaterial();
  material.fragmentNode = shadeOutputFn();
  material.toneMapped = false;
  material.depthTest = false;
  material.depthWrite = false;

  const quad = new QuadMesh(material);
  const scene = new Scene();
  scene.add(quad);
  const ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const clipToWorldScratch = new Matrix4();

  return {
    beautyTexture: beautyTarget.texture,
    bloomTexture: bloomTarget.texture,
    setSize(nw: number, nh: number, ndpr: number) {
      const cw = Math.max(1, Math.floor(nw * ndpr));
      const ch = Math.max(1, Math.floor(nh * ndpr));
      if (cw === lastRayTargetW && ch === lastRayTargetH) return;
      lastRayTargetW = cw;
      lastRayTargetH = ch;
      beautyTarget.setSize(cw, ch, 1);
      bloomTarget.setSize(cw, ch, 1);
      uBufH.value = ch;
    },
    render(
      renderer: import('three/webgpu').WebGPURenderer,
      camera: Camera,
      volTex: Data3DTexture,
      origin: readonly [number, number, number],
      dims: readonly [number, number, number],
      glowEmitterTex: DataTexture | null,
      glowEmitterCount: number,
      params: VoxelRayTraceParams,
      maxDist: number
    ) {
      volAcc.value = volTex;
      glowAcc.value = glowEmitterTex ?? glowTex;
      uGlowEmitterCount.value = Math.max(0, Math.min(MAX_RAY_GLOW_EMITTERS, glowEmitterCount | 0));
      clipToWorldScratch.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      uClipToWorld.value.copy(clipToWorldScratch);
      uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      uOrigin.value.set(origin[0], origin[1], origin[2]);
      uDims.value.set(dims[0], dims[1], dims[2]);
      uToLight.value.set(params.toLightWorld[0], params.toLightWorld[1], params.toLightWorld[2]);
      uSunDiffuse.value.set(params.sunDiffuseR, params.sunDiffuseG, params.sunDiffuseB);
      uAmbient.value.set(params.ambientR, params.ambientG, params.ambientB);
      uBg.value.set(params.backgroundR, params.backgroundG, params.backgroundB);
      uEnableSky.value = params.enableSky ? 1 : 0;
      uEnableShadows.value = params.enableShadows ? 1 : 0;
      uMaxDist.value = maxDist;
      uPrimaryDdaMaxSteps.value = primaryDdaStepBudget(maxDist, dims);
      uShadowSamples.value = clampShadowSamples(params.shadowRaySamples);
      uShadowTanHalf.value = shadowConeTanFromRadians(params.shadowSoftnessRadians);
      uDistanceTintEnabled.value = params.distanceTintEnabled ? 1 : 0;
      uDistanceTintNear.value.set(
        params.distanceTintNearColor[0],
        params.distanceTintNearColor[1],
        params.distanceTintNearColor[2]
      );
      uDistanceTintMid.value.set(
        params.distanceTintMidColor[0],
        params.distanceTintMidColor[1],
        params.distanceTintMidColor[2]
      );
      uDistanceTintFar.value.set(
        params.distanceTintFarColor[0],
        params.distanceTintFarColor[1],
        params.distanceTintFarColor[2]
      );
      uDistanceTintNearDist.value = params.distanceTintNearDist;
      uDistanceTintFarDist.value = params.distanceTintFarDist;
      uDistanceTintStrength.value = params.distanceTintStrength;
      uGrainEnabled.value = params.grainEnabled ? 1 : 0;
      uGrainStrength.value = params.grainStrength;
      uGrainAnimated.value = params.grainAnimated ? 1 : 0;
      uGrainSpeed.value = params.grainSpeed;
      uGrainColorful.value = params.grainColorful ? 1 : 0;
      const sky = 0x9ec8f0;
      const grnd = 0x4a5568;
      const tr = ((sky >> 16) & 255) / 255;
      const tg = ((sky >> 8) & 255) / 255;
      const tb = (sky & 255) / 255;
      const lr =
        (tr <= 0.04045 ? tr / 12.92 : Math.pow((tr + 0.055) / 1.055, 2.4)) *
          (1 - 0.3 * params.lightStrength01) +
        params.lightColorR * 0.3 * params.lightStrength01;
      const lg =
        (tg <= 0.04045 ? tg / 12.92 : Math.pow((tg + 0.055) / 1.055, 2.4)) *
          (1 - 0.3 * params.lightStrength01) +
        params.lightColorG * 0.3 * params.lightStrength01;
      const lb =
        (tb <= 0.04045 ? tb / 12.92 : Math.pow((tb + 0.055) / 1.055, 2.4)) *
          (1 - 0.3 * params.lightStrength01) +
        params.lightColorB * 0.3 * params.lightStrength01;
      const br = ((grnd >> 16) & 255) / 255;
      const bg = ((grnd >> 8) & 255) / 255;
      const bb = (grnd & 255) / 255;
      const gr =
        (br <= 0.04045 ? br / 12.92 : Math.pow((br + 0.055) / 1.055, 2.4)) *
          (1 - 0.12 * params.lightStrength01) +
        params.lightColorR * 0.12 * params.lightStrength01;
      const gg =
        (bg <= 0.04045 ? bg / 12.92 : Math.pow((bg + 0.055) / 1.055, 2.4)) *
          (1 - 0.12 * params.lightStrength01) +
        params.lightColorG * 0.12 * params.lightStrength01;
      const gb =
        (bb <= 0.04045 ? bb / 12.92 : Math.pow((bb + 0.055) / 1.055, 2.4)) *
          (1 - 0.12 * params.lightStrength01) +
        params.lightColorB * 0.12 * params.lightStrength01;
      uSkyTop.value.set(lr, lg, lb);
      uSkyBottom.value.set(gr, gg, gb);
      uLightStrength01.value = params.lightStrength01;
      uTimeSeconds.value = params.timeSeconds;

      const prevTm = renderer.toneMapping;
      const prevCs = renderer.outputColorSpace;
      renderer.toneMapping = NoToneMapping;
      renderer.outputColorSpace = ColorManagement.workingColorSpace as ColorSpace;

      const prevT = renderer.getRenderTarget();
      const prevMrt = renderer.getMRT();
      renderer.setMRT(null);
      renderer.setRenderTarget(beautyTarget);
      renderer.clear(true, false, false);
      uPassBloom.value = 0;
      renderer.render(scene, ortho);
      renderer.setRenderTarget(bloomTarget);
      renderer.clear(true, false, false);
      uPassBloom.value = 1;
      renderer.render(scene, ortho);
      renderer.setRenderTarget(prevT);
      renderer.setMRT(prevMrt);

      renderer.toneMapping = prevTm;
      renderer.outputColorSpace = prevCs;
    },
    dispose() {
      beautyTarget.dispose();
      bloomTarget.dispose();
      material.dispose();
      volAcc.value.dispose();
      glowAcc.value.dispose();
    }
  };
}
