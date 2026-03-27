/**
 * WebGPU TSL full-screen voxel ray trace (dense 3D uint texture only).
 * Parity targets: `voxelRayProgressive` / `voxelRayDda` (glass/water stack, tinted shadow rays).
 */
import {
  Data3DTexture,
  Matrix4,
  RedIntegerFormat,
  UnsignedIntType,
  Vector3,
  NearestFilter,
  type ColorSpace,
  type Camera
} from 'three';
import type { VoxelRayTraceParams } from './voxelRayShared';
import {
  GLOW_BLOOM_LINEAR_SCALE,
  GLASS_IOR,
  GLASS_MIN_TRANSMITTANCE,
  WATER_IOR
} from './voxelRayShared';
import { GLASS_ABSORPTION_PER_UNIT } from './voxelRayDda';
import { clampShadowSamples, GOLDEN_ANGLE, shadowConeTanFromRadians } from './gpuSoftShadow';

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
    params: VoxelRayTraceParams,
    maxDist: number
  ): void;
  dispose(): void;
};

const METAL_MAT = 1;
const GLASS_MAT = 3;
const WATER_MAT = 4;
const GLOW_MAT = 5;

function makePlaceholderVolumeTexture(): Data3DTexture {
  const t = new Data3DTexture(new Uint32Array(8), 2, 2, 2);
  t.type = UnsignedIntType;
  t.format = RedIntegerFormat;
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
    abs,
    min,
    max,
    clamp,
    normalize,
    pow,
    select,
    mix,
    floor,
    sin,
    cos,
    sqrt,
    fract,
    bitAnd,
    shiftRight,
    ivec3,
    greaterThan,
    lessThan,
    lessThanEqual,
    or,
    and,
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
  beautyTarget.texture.name = 'voxelleRayGpuBeauty';

  const bloomTarget = new RenderTarget(w, h, {
    type: HalfFloatType,
    depthBuffer: false,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    format: RGBAFormat,
    colorSpace: ColorManagement.workingColorSpace as ColorSpace,
    generateMipmaps: false
  });
  bloomTarget.texture.name = 'voxelleRayGpuBloom';

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
  /** Matches `buildVoxelRayTraceParams` `lightStrength01`. */
  const uLightStrength01 = uniform(0);
  /** `params.timeSeconds` for water surface normal. */
  const uTimeSeconds = uniform(0);
  /** Soft shadow stratified samples (1–8); must match `clampShadowSamples` / CPU progressive. */
  const uShadowSamples = uniform(8);
  /** tan(cone half-angle) toward the light; from `shadowConeTanFromRadians(params.shadowSoftnessRadians)`. */
  const uShadowTanHalf = uniform(0);
  const uPassBloom = uniform(0);
  const uBufH = uniform(h);
  const volTex = makePlaceholderVolumeTexture();

  const TSL_TWO_PI = float(2 * Math.PI);
  const TSL_GOLDEN = float(GOLDEN_ANGLE);
  const GLASS_IOR_F = float(GLASS_IOR);
  const WATER_IOR_F = float(WATER_IOR);
  const GLASS_MIN_T = float(GLASS_MIN_TRANSMITTANCE);
  const GLASS_ABS = float(GLASS_ABSORPTION_PER_UNIT);
  const DDA_HIT_EPS = float(1e-5);
  const GLASS_CELL_NUDGE = float(1e-6);
  const SHADOW_SURFACE_EPS = float(2e-4);

  const volAcc = texture3D(volTex);

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
  ) => {
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
    // TSL's `ivec3` constructor expects a single argument (a `vec3`).
    const coord = ivec3(vec3(lx, ly, lz));
    const sample = volAcc.load(coord).r;
    // Ensure we always return a uint node (not a float|uint union) for downstream bit ops.
    return select(oob, uint(0), uint(sample));
  };

  const isTransmissiveIdx = (matIdx: ReturnType<typeof uint>) =>
    or(matIdx.equal(uint(GLASS_MAT)), matIdx.equal(uint(WATER_MAT)));

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
    If(and(segLen.greaterThan(float(0)), greaterThan(me, uint(0))), () => {
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
      If(isTransmissiveIdx(mid), () => {
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
    const eps = float(1e-9);
    const oxp = ox.add(rdx.mul(eps));
    const oyp = oy.add(rdy.mul(eps));
    const ozp = oz.add(rdz.mul(eps));
    const x = int(floor(oxp)).toVar();
    const y = int(floor(oyp)).toVar();
    const z = int(floor(ozp)).toVar();
    const stepX = int(0).toVar();
    const stepY = int(0).toVar();
    const stepZ = int(0).toVar();
    If(greaterThan(rdx, float(1e-9)), () => stepX.assign(int(1)));
    If(lessThan(rdx, float(-1e-9)), () => stepX.assign(int(-1)));
    If(greaterThan(rdy, float(1e-9)), () => stepY.assign(int(1)));
    If(lessThan(rdy, float(-1e-9)), () => stepY.assign(int(-1)));
    If(greaterThan(rdz, float(1e-9)), () => stepZ.assign(int(1)));
    If(lessThan(rdz, float(-1e-9)), () => stepZ.assign(int(-1)));
    const big = float(1e30);
    const tDeltaX = select(equal(stepX, int(0)), big, float(1).div(abs(rdx)));
    const tDeltaY = select(equal(stepY, int(0)), big, float(1).div(abs(rdy)));
    const tDeltaZ = select(equal(stepZ, int(0)), big, float(1).div(abs(rdz)));
    const tMaxX = float(0).toVar();
    const tMaxY = float(0).toVar();
    const tMaxZ = float(0).toVar();
    If(greaterThan(stepX, int(0)), () => tMaxX.assign(float(x.add(int(1)).sub(oxp)).div(rdx)));
    If(lessThan(stepX, int(0)), () => tMaxX.assign(float(x.sub(oxp)).div(rdx)));
    If(equal(stepX, int(0)), () => tMaxX.assign(big));
    If(greaterThan(stepY, int(0)), () => tMaxY.assign(float(y.add(int(1)).sub(oyp)).div(rdy)));
    If(lessThan(stepY, int(0)), () => tMaxY.assign(float(y.sub(oyp)).div(rdy)));
    If(equal(stepY, int(0)), () => tMaxY.assign(big));
    If(greaterThan(stepZ, int(0)), () => tMaxZ.assign(float(z.add(int(1)).sub(ozp)).div(rdz)));
    If(lessThan(stepZ, int(0)), () => tMaxZ.assign(float(z.sub(ozp)).div(rdz)));
    If(equal(stepZ, int(0)), () => tMaxZ.assign(big));

    const fr = float(1).toVar();
    const fg = float(1).toVar();
    const fb = float(1).toVar();
    const tPrev = float(0).toVar();
    const skipShadowMarch = float(0).toVar();
    const pkStart = fetchPacked(x, y, z);
    const me0 = shiftRight(pkStart, uint(24));

    If(greaterThan(me0, uint(0)), () => {
      const mid0 = uint(me0.sub(uint(1)));
      If(isTransmissiveIdx(mid0), () => {
        const tFirst = min(tMaxX, min(tMaxY, tMaxZ));
        const seg0 = min(max(float(0), tFirst), maxDist);
        applyShadowSegment(fr, fg, fb, pkStart, seg0);
        If(tFirst.greaterThanEqual(maxDist), () => skipShadowMarch.assign(float(1)));
        If(
          and(
            tFirst.lessThan(maxDist),
            skipShadowMarch.lessThan(float(0.5)),
            or(
              fr.greaterThan(float(1e-8)),
              or(fg.greaterThan(float(1e-8)), fb.greaterThan(float(1e-8)))
            )
          ),
          () => {
            If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
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

    Loop({ start: int(0), end: int(512), type: 'int', condition: '<' }, () => {
      If(skipShadowMarch.greaterThan(float(0.5)), () => Break());
      If(
        and(
          fr.lessThanEqual(float(1e-8)),
          fg.lessThanEqual(float(1e-8)),
          fb.lessThanEqual(float(1e-8))
        ),
        () => Break()
      );
      const tHit = float(0).toVar();
      const axis = int(0).toVar();
      If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
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
      If(seg.greaterThan(float(0)), () => {
        applyShadowSegment(fr, fg, fb, fetchPacked(x0, y0, z0), seg);
      });
      If(
        and(
          fr.lessThanEqual(float(1e-8)),
          fg.lessThanEqual(float(1e-8)),
          fb.lessThanEqual(float(1e-8))
        ),
        () => Break()
      );
      If(tHit.greaterThan(maxDist), () => Break());
      If(axis.equal(int(0)), () => x.addAssign(stepX))
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
    const upHx = float(0).toVar();
    const upHy = float(0).toVar();
    const upHz = float(1).toVar();
    If(abs(lz).greaterThan(float(0.95)), () => {
      upHx.assign(float(1));
      upHy.assign(float(0));
      upHz.assign(float(0));
    });
    const tx = upHy.mul(lz).sub(upHz.mul(ly)).toVar();
    const ty = upHz.mul(lx).sub(upHx.mul(lz)).toVar();
    const tz = upHx.mul(ly).sub(upHy.mul(lx)).toVar();
    const tLen = sqrt(tx.mul(tx).add(ty.mul(ty)).add(tz.mul(tz))).toVar();
    If(tLen.lessThan(float(1e-8)), () => {
      upHx.assign(float(0));
      upHy.assign(float(1));
      upHz.assign(float(0));
      tx.assign(upHy.mul(lz).sub(upHz.mul(ly)));
      ty.assign(upHz.mul(lx).sub(upHx.mul(lz)));
      tz.assign(upHx.mul(ly).sub(upHy.mul(lx)));
      tLen.assign(sqrt(tx.mul(tx).add(ty.mul(ty)).add(tz.mul(tz))).max(float(1e-9)));
    });
    tx.assign(tx.div(tLen));
    ty.assign(ty.div(tLen));
    tz.assign(tz.div(tLen));
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
    Loop({ start: int(0), end: int(8), type: 'int', condition: '<' }, ({ i }) => {
      If(float(i).greaterThanEqual(uShadowSamples), () => Break());
      const fj = shadowDiskBasis(lx, ly, lz, float(i));
      const s = traceShadowTransmissionRgb(sx, sy, sz, fj.x, fj.y, fj.z, maxT);
      accR.addAssign(s.x);
      accG.addAssign(s.y);
      accB.addAssign(s.z);
    });
    const inv = max(uShadowSamples, float(1));
    return vec3(accR.div(inv), accG.div(inv), accB.div(inv));
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
    If(rdx.greaterThan(float(1e-9)), () =>
      tM.assign(
        min(
          tM,
          float(ix.add(int(1)))
            .sub(px)
            .div(rdx)
        )
      )
    );
    If(rdx.lessThan(float(-1e-9)), () => tM.assign(min(tM, float(ix).sub(px).div(rdx))));
    If(rdy.greaterThan(float(1e-9)), () =>
      tM.assign(
        min(
          tM,
          float(iy.add(int(1)))
            .sub(py)
            .div(rdy)
        )
      )
    );
    If(rdy.lessThan(float(-1e-9)), () => tM.assign(min(tM, float(iy).sub(py).div(rdy))));
    If(rdz.greaterThan(float(1e-9)), () =>
      tM.assign(
        min(
          tM,
          float(iz.add(int(1)))
            .sub(pz)
            .div(rdz)
        )
      )
    );
    If(rdz.lessThan(float(-1e-9)), () => tM.assign(min(tM, float(iz).sub(pz).div(rdz))));
    return select(tM.greaterThanEqual(float(1e20)), float(4e-9), tM);
  };

  /**
   * One transmissive slab traversal: entry/exit Fresnel, Beer–Lambert column merge, advance ray origin.
   * Aligns with `traceAndShade` / `voxelRayProgressive` (no water cap-wave normal on GPU yet — face normal).
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
    If(entryT.greaterThanEqual(DDA_HIT_EPS), () => {
      const Rentry = float(0).toVar();
      Rentry.assign(fresnelSchlick(cosIN, mediumIor, etaT));
      If(matIdx.equal(uint(WATER_MAT)), () => Rentry.assign(max(Rentry, float(0.12))));
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
    Loop({ start: int(0), end: int(32), type: 'int', condition: '<' }, () => {
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
      If(and(greaterThan(meN, uint(0)), curMid.equal(uint(meN.sub(uint(1))))), () => {
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
        If(and(greaterThan(meN, uint(0)), isTransmissiveIdx(midN)), () =>
          etaOutVar.assign(iorFromMatIdx(midN))
        );
        Break();
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
      int(floor(oox.add(rdx.mul(float(1e-9))))),
      int(floor(ooy.add(rdy.mul(float(1e-9))))),
      int(floor(ooz.add(rdz.mul(float(1e-9)))))
    );
    const meMed = shiftRight(pkMedN, uint(24));
    const midMed = uint(meMed.sub(uint(1)));
    If(and(greaterThan(meMed, uint(0)), isTransmissiveIdx(midMed)), () =>
      mediumIor.assign(iorFromMatIdx(midMed))
    );
  };

  const shadeOutput = Fn(() => {
    const suv = uv();
    const ndcX = suv.x.mul(float(2)).sub(float(1));
    const ndcY = suv.y.mul(float(2)).sub(float(1));
    const clip = vec4(ndcX, ndcY, float(0.5), float(1));
    const pw = uClipToWorld.mul(clip);
    const pWorld = pw.xyz.div(pw.w.max(float(1e-6)));
    const rd = normalize(pWorld.sub(vec3(uCamPos)));
    const ro = vec3(uCamPos);

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
      int(floor(ro.x.add(rdx.mul(float(1e-9))))),
      int(floor(ro.y.add(rdy.mul(float(1e-9))))),
      int(floor(ro.z.add(rdz.mul(float(1e-9)))))
    );
    const mei0 = shiftRight(pki0, uint(24));
    If(greaterThan(mei0, uint(0)), () => {
      const midI = uint(mei0.sub(uint(1)));
      If(isTransmissiveIdx(midI), () => mediumIor.assign(iorFromMatIdx(midI)));
    });
    const outR = float(0).toVar();
    const outG = float(0).toVar();
    const outB = float(0).toVar();
    const bloomR = float(0).toVar();
    const bloomG = float(0).toVar();
    const bloomB = float(0).toVar();
    const hitFound = float(0).toVar();
    const marchDidGlass = float(0).toVar();

    Loop({ start: int(0), end: int(4), type: 'int', condition: '<' }, () => {
      marchDidGlass.assign(float(0));
      If(hitFound.greaterThan(float(0.5)), () => Break());
      If(remDist.lessThan(float(1e-6)), () => {
        const missRem = vec3(uBg).toVar();
        If(uEnableSky.greaterThan(float(0.5)), () => {
          const denomR = uBufH.sub(float(1)).max(float(1));
          const tSkyR = clamp(suv.y.mul(uBufH).div(denomR), float(0), float(1));
          missRem.assign(mix(uSkyTop, uSkyBottom, tSkyR));
        });
        outR.assign(accR.add(tr.mul(missRem.x)));
        outG.assign(accG.add(tg.mul(missRem.y)));
        outB.assign(accB.add(tb.mul(missRem.z)));
        hitFound.assign(float(1));
        Break();
      });

      const eps = float(1e-9);
      const oxp = oox.add(rdx.mul(eps));
      const oyp = ooy.add(rdy.mul(eps));
      const ozp = ooz.add(rdz.mul(eps));
      const x = int(floor(oxp)).toVar();
      const y = int(floor(oyp)).toVar();
      const z = int(floor(ozp)).toVar();

      const stepX = int(0).toVar();
      const stepY = int(0).toVar();
      const stepZ = int(0).toVar();
      If(greaterThan(rdx, float(1e-9)), () => stepX.assign(int(1)));
      If(lessThan(rdx, float(-1e-9)), () => stepX.assign(int(-1)));
      If(greaterThan(rdy, float(1e-9)), () => stepY.assign(int(1)));
      If(lessThan(rdy, float(-1e-9)), () => stepY.assign(int(-1)));
      If(greaterThan(rdz, float(1e-9)), () => stepZ.assign(int(1)));
      If(lessThan(rdz, float(-1e-9)), () => stepZ.assign(int(-1)));

      const big = float(1e30);
      const tDeltaX = select(equal(stepX, int(0)), big, float(1).div(abs(rdx)));
      const tDeltaY = select(equal(stepY, int(0)), big, float(1).div(abs(rdy)));
      const tDeltaZ = select(equal(stepZ, int(0)), big, float(1).div(abs(rdz)));
      const tMaxX = float(0).toVar();
      const tMaxY = float(0).toVar();
      const tMaxZ = float(0).toVar();
      If(greaterThan(stepX, int(0)), () => tMaxX.assign(float(x.add(int(1)).sub(oxp)).div(rdx)));
      If(lessThan(stepX, int(0)), () => tMaxX.assign(float(x.sub(oxp)).div(rdx)));
      If(equal(stepX, int(0)), () => tMaxX.assign(big));
      If(greaterThan(stepY, int(0)), () => tMaxY.assign(float(y.add(int(1)).sub(oyp)).div(rdy)));
      If(lessThan(stepY, int(0)), () => tMaxY.assign(float(y.sub(oyp)).div(rdy)));
      If(equal(stepY, int(0)), () => tMaxY.assign(big));
      If(greaterThan(stepZ, int(0)), () => tMaxZ.assign(float(z.add(int(1)).sub(ozp)).div(rdz)));
      If(lessThan(stepZ, int(0)), () => tMaxZ.assign(float(z.sub(ozp)).div(rdz)));
      If(equal(stepZ, int(0)), () => tMaxZ.assign(big));

      const maxT = remDist;

      const pkStart = fetchPacked(x, y, z);
      const matStart = shiftRight(pkStart, uint(24));
      If(greaterThan(matStart, uint(0)), () => {
        const matIdx = uint(matStart.sub(uint(1)));
        If(isTransmissiveIdx(matIdx), () => {
          const ax0 = abs(rdx);
          const ay0 = abs(rdy);
          const az0 = abs(rdz);
          const nx0 = float(0).toVar();
          const ny0 = float(0).toVar();
          const nz0 = float(0).toVar();
          If(and(ax0.greaterThanEqual(ay0), ax0.greaterThanEqual(az0)), () => {
            nx0.assign(select(greaterThan(rdx.negate(), float(0)), float(1), float(-1)));
          })
            .ElseIf(ay0.greaterThanEqual(az0), () => {
              ny0.assign(select(greaterThan(rdy.negate(), float(0)), float(1), float(-1)));
            })
            .Else(() => {
              nz0.assign(select(greaterThan(rdz.negate(), float(0)), float(1), float(-1)));
            });
          accumulateGlassInterface(
            matIdx,
            pkStart,
            x,
            y,
            z,
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
            rdz
          );
        }).Else(() => {
          const rgb = unpackLinearRgb(pkStart);
          const ax = abs(rdx);
          const ay = abs(rdy);
          const az = abs(rdz);
          const nx = float(0).toVar();
          const ny = float(0).toVar();
          const nz = float(0).toVar();
          If(and(ax.greaterThanEqual(ay), ax.greaterThanEqual(az)), () => {
            nx.assign(select(greaterThan(rdx, float(0)), float(1), float(-1)));
          })
            .ElseIf(ay.greaterThanEqual(az), () => {
              ny.assign(select(greaterThan(rdy, float(0)), float(1), float(-1)));
            })
            .Else(() => {
              nz.assign(select(greaterThan(rdz, float(0)), float(1), float(-1)));
            });
          const lx = uToLight.x;
          const ly = uToLight.y;
          const lz = uToLight.z;
          const ndotl = max(float(0), nx.mul(lx).add(ny.mul(ly)).add(nz.mul(lz)));
          const shR = float(1).toVar();
          const shG = float(1).toVar();
          const shB = float(1).toVar();
          If(uEnableShadows.greaterThan(float(0.5)), () => {
            const hx = float(x).add(nx.mul(SHADOW_SURFACE_EPS));
            const hy = float(y).add(ny.mul(SHADOW_SURFACE_EPS));
            const hz = float(z).add(nz.mul(SHADOW_SURFACE_EPS));
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
          const dFinalR = select(isMetal, dMetalR, dr);
          const dFinalG = select(isMetal, dMetalG, dg);
          const dFinalB = select(isMetal, dMetalB, db);
          const addR = cr.mul(float(0.85));
          const addG = cg.mul(float(0.85));
          const addB = cb.mul(float(0.85));
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
        });
      });

      If(hitFound.lessThan(float(0.5)), () => {
        Loop({ start: int(0), end: int(768), type: 'int', condition: '<' }, () => {
          const tHit = float(0).toVar();
          const axis = int(0).toVar();
          If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
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
          If(tHit.greaterThan(maxT), () => Break());
          const hpx = oxp.add(rdx.mul(tHit));
          const hpy = oyp.add(rdy.mul(tHit));
          const hpz = ozp.add(rdz.mul(tHit));
          const pk = fetchPacked(x, y, z);
          const matEnc = shiftRight(pk, uint(24));
          If(greaterThan(matEnc, uint(0)), () => {
            const matIdx = uint(matEnc.sub(uint(1)));
            const nx = float(0).toVar();
            const ny = float(0).toVar();
            const nz = float(0).toVar();
            If(axis.equal(int(0)), () => {
              nx.assign(select(greaterThan(stepX, int(0)), float(-1), float(1)));
            })
              .ElseIf(axis.equal(int(1)), () => {
                ny.assign(select(greaterThan(stepY, int(0)), float(-1), float(1)));
              })
              .Else(() => {
                nz.assign(select(greaterThan(stepZ, int(0)), float(-1), float(1)));
              });
            If(isTransmissiveIdx(matIdx), () => {
              accumulateGlassInterface(
                matIdx,
                pk,
                x,
                y,
                z,
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
                rdz
              );
              marchDidGlass.assign(float(1));
              Break();
            }).Else(() => {
              const rgb = unpackLinearRgb(pk);
              const lx = uToLight.x;
              const ly = uToLight.y;
              const lz = uToLight.z;
              const ndotl = max(float(0), nx.mul(lx).add(ny.mul(ly)).add(nz.mul(lz)));
              const shR = float(1).toVar();
              const shG = float(1).toVar();
              const shB = float(1).toVar();
              If(uEnableShadows.greaterThan(float(0.5)), () => {
                const hx = float(x).add(nx.mul(SHADOW_SURFACE_EPS));
                const hy = float(y).add(ny.mul(SHADOW_SURFACE_EPS));
                const hz = float(z).add(nz.mul(SHADOW_SURFACE_EPS));
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
              const dFinalR = select(isMetal, dMetalR, dr);
              const dFinalG = select(isMetal, dMetalG, dg);
              const dFinalB = select(isMetal, dMetalB, db);
              const addR = cr.mul(float(0.85));
              const addG = cg.mul(float(0.85));
              const addB = cb.mul(float(0.85));
              const surfR = dFinalR.add(select(isGlow, addR, float(0)));
              const surfG = dFinalG.add(select(isGlow, addG, float(0)));
              const surfB = dFinalB.add(select(isGlow, addB, float(0)));
              outR.assign(accR.add(tr.mul(surfR)));
              outG.assign(accG.add(tg.mul(surfG)));
              outB.assign(accB.add(tb.mul(surfB)));
              bloomR.assign(
                tr.mul(select(isGlow, addR.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)))
              );
              bloomG.assign(
                tg.mul(select(isGlow, addG.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)))
              );
              bloomB.assign(
                tb.mul(select(isGlow, addB.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)))
              );
              hitFound.assign(float(1));
              Break();
            });
          });
        });
      });

      If(and(hitFound.lessThan(float(0.5)), marchDidGlass.lessThan(float(0.5))), () => {
        const missSeg = vec3(uBg).toVar();
        If(uEnableSky.greaterThan(float(0.5)), () => {
          const denomS = uBufH.sub(float(1)).max(float(1));
          const tSkyS = clamp(suv.y.mul(uBufH).div(denomS), float(0), float(1));
          missSeg.assign(mix(uSkyTop, uSkyBottom, tSkyS));
        });
        outR.assign(accR.add(tr.mul(missSeg.x)));
        outG.assign(accG.add(tg.mul(missSeg.y)));
        outB.assign(accB.add(tb.mul(missSeg.z)));
        hitFound.assign(float(1));
      });
    });

    If(hitFound.lessThan(float(0.5)), () => {
      const miss = vec3(uBg).toVar();
      If(uEnableSky.greaterThan(float(0.5)), () => {
        const denom = uBufH.sub(float(1)).max(float(1));
        const tSky = clamp(suv.y.mul(uBufH).div(denom), float(0), float(1));
        miss.assign(mix(uSkyTop, uSkyBottom, tSky));
      });
      outR.assign(accR.add(tr.mul(miss.x)));
      outG.assign(accG.add(tg.mul(miss.y)));
      outB.assign(accB.add(tb.mul(miss.z)));
    });

    const bloomOut = vec4(bloomR, bloomG, bloomB, float(1));
    const beautyOut = vec4(outR, outG, outB, float(1));
    return select(uPassBloom.greaterThan(float(0.5)), bloomOut, beautyOut);
  })();

  const material = new NodeMaterial();
  material.fragmentNode = shadeOutput;
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
      params: VoxelRayTraceParams,
      maxDist: number
    ) {
      volAcc.value = volTex;
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
      uShadowSamples.value = clampShadowSamples(params.shadowRaySamples);
      uShadowTanHalf.value = shadowConeTanFromRadians(params.shadowSoftnessRadians);
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
      uPassBloom.value = 0;
      renderer.setRenderTarget(beautyTarget);
      renderer.clear(true, false, false);
      renderer.render(scene, ortho);
      uPassBloom.value = 1;
      renderer.setRenderTarget(bloomTarget);
      renderer.clear(true, false, false);
      renderer.render(scene, ortho);
      renderer.setRenderTarget(prevT);

      renderer.toneMapping = prevTm;
      renderer.outputColorSpace = prevCs;
    },
    dispose() {
      beautyTarget.dispose();
      bloomTarget.dispose();
      material.dispose();
      volAcc.value.dispose();
    }
  };
}
