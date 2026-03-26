/**
 * WebGPU TSL full-screen voxel ray trace (dense 3D uint texture only).
 * Used when ray backend is GPU/auto, model fits dense accel, and there are no glass/water voxels.
 */
import {
  Data3DTexture,
  Matrix4,
  RedIntegerFormat,
  UnsignedIntType,
  Vector3,
  NearestFilter,
  type Camera
} from 'three';
import type { Voxel } from '../voxelMaterial';
import type { VoxelRayTraceParams } from './voxelRayShared';
import { GLOW_BLOOM_LINEAR_SCALE } from './voxelRayShared';
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
    Return,
    texture3D,
    abs,
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
    equal
  } = tslMod;

  type ColorSpace = (typeof ColorManagement)['workingColorSpace'];

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
  /** Soft shadow stratified samples (1–8); must match `clampShadowSamples` / CPU progressive. */
  const uShadowSamples = uniform(8);
  /** tan(cone half-angle) toward the light; from `shadowConeTanFromRadians(params.shadowSoftnessRadians)`. */
  const uShadowTanHalf = uniform(0);
  const uPassBloom = uniform(0);
  const uBufH = uniform(h);
  const uVolTex = uniform(makePlaceholderVolumeTexture());

  const TSL_TWO_PI = float(2 * Math.PI);
  const TSL_GOLDEN = float(GOLDEN_ANGLE);

  const volAcc = texture3D(uVolTex);

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
    return vec3(srgbChannel(float(r8).div(float(255))), srgbChannel(float(g8).div(float(255))), srgbChannel(float(b8).div(float(255))));
  };

  const fetchPacked = (ix: ReturnType<typeof int>, iy: ReturnType<typeof int>, iz: ReturnType<typeof int>) => {
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
    const coord = ivec3(lx, ly, lz);
    const sample = volAcc.load(coord).r;
    return select(oob, uint(0), sample);
  };

  const traceOpaqueShadow = (
    ox: ReturnType<typeof float>,
    oy: ReturnType<typeof float>,
    oz: ReturnType<typeof float>,
    ldx: ReturnType<typeof float>,
    ldy: ReturnType<typeof float>,
    ldz: ReturnType<typeof float>,
    maxT: ReturnType<typeof float>
  ) => {
    const hit = float(1).toVar();
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
    const tHit = float(0).toVar();
    Loop({ start: int(0), end: int(512), type: 'int', condition: '<' }, () => {
      If(and(tMaxX.lessThanEqual(tMaxY), tMaxX.lessThanEqual(tMaxZ)), () => {
        tHit.assign(tMaxX);
        tMaxX.addAssign(tDeltaX);
        x.addAssign(stepX);
      })
        .ElseIf(tMaxY.lessThanEqual(tMaxZ), () => {
          tHit.assign(tMaxY);
          tMaxY.addAssign(tDeltaY);
          y.addAssign(stepY);
        })
        .Else(() => {
          tHit.assign(tMaxZ);
          tMaxZ.addAssign(tDeltaZ);
          z.addAssign(stepZ);
        });
      If(tHit.greaterThan(maxT), () => Return());
      const pk = fetchPacked(x, y, z);
      const matEnc = shiftRight(pk, uint(24));
      If(greaterThan(matEnc, uint(0)), () => {
        hit.assign(float(0));
        Return();
      });
    });
    return hit;
  };

  /** Averages `traceOpaqueShadow` over Vogel-disk jittered light directions (see `gpuSoftShadow.ts`). */
  const averagedOpaqueShadow = (
    sx: ReturnType<typeof float>,
    sy: ReturnType<typeof float>,
    sz: ReturnType<typeof float>,
    lx: ReturnType<typeof float>,
    ly: ReturnType<typeof float>,
    lz: ReturnType<typeof float>,
    maxT: ReturnType<typeof float>
  ) => {
    const acc = float(0).toVar();
    Loop({ start: int(0), end: int(8), type: 'int', condition: '<' }, ({ i }) => {
      If(float(i).greaterThanEqual(uShadowSamples), () => Break());
      const fi = float(i);
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
      const jx = lx.add(oxj).toVar();
      const jy = ly.add(oyj).toVar();
      const jz = lz.add(ozj).toVar();
      const jLen = sqrt(jx.mul(jx).add(jy.mul(jy)).add(jz.mul(jz))).max(float(1e-12));
      acc.addAssign(traceOpaqueShadow(sx, sy, sz, jx.div(jLen), jy.div(jLen), jz.div(jLen), maxT));
    });
    return acc.div(max(uShadowSamples, float(1)));
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
    const ox = ro.x;
    const oy = ro.y;
    const oz = ro.z;

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

    const maxT = uMaxDist;
    const outR = float(0).toVar();
    const outG = float(0).toVar();
    const outB = float(0).toVar();
    const bloomR = float(0).toVar();
    const bloomG = float(0).toVar();
    const bloomB = float(0).toVar();
    const hitFound = float(0).toVar();

    const pkStart = fetchPacked(x, y, z);
    const matStart = shiftRight(pkStart, uint(24));
    If(greaterThan(matStart, uint(0)), () => {
      const matIdx = matStart.sub(uint(1));
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
      const sh = float(1).toVar();
      If(uEnableShadows.greaterThan(float(0.5)), () => {
        const hx = float(x).add(nx.mul(float(2e-4)));
        const hy = float(y).add(ny.mul(float(2e-4)));
        const hz = float(z).add(nz.mul(float(2e-4)));
        sh.assign(averagedOpaqueShadow(hx, hy, hz, lx, ly, lz, maxT));
      });
      const cr = rgb.x;
      const cg = rgb.y;
      const cb = rgb.z;
      const dr = cr.mul(uAmbient.x).add(cr.mul(uSunDiffuse.x).mul(ndotl).mul(sh));
      const dg = cg.mul(uAmbient.y).add(cg.mul(uSunDiffuse.y).mul(ndotl).mul(sh));
      const db = cb.mul(uAmbient.z).add(cb.mul(uSunDiffuse.z).mul(ndotl).mul(sh));
      const isMetal = matIdx.equal(uint(1));
      const isGlow = matIdx.equal(uint(GLOW_MAT));
      const vx = rdx.negate();
      const vy = rdy.negate();
      const vz = rdz.negate();
      const reflL = ndotl.mul(float(2)).mul(nx).sub(lx);
      const reflM = ndotl.mul(float(2)).mul(ny).sub(ly);
      const reflN = ndotl.mul(float(2)).mul(nz).sub(lz);
      const spec = max(float(0), vx.mul(reflL).add(vy.mul(reflM)).add(vz.mul(reflN)));
      const sp = pow(spec, float(48)).mul(float(0.45));
      const dMetalR = dr.add(sp.mul(uSunDiffuse.x).mul(sh));
      const dMetalG = dg.add(sp.mul(uSunDiffuse.y).mul(sh));
      const dMetalB = db.add(sp.mul(uSunDiffuse.z).mul(sh));
      const dFinalR = select(isMetal, dMetalR, dr);
      const dFinalG = select(isMetal, dMetalG, dg);
      const dFinalB = select(isMetal, dMetalB, db);
      const addR = cr.mul(float(0.85));
      const addG = cg.mul(float(0.85));
      const addB = cb.mul(float(0.85));
      outR.assign(dFinalR.add(select(isGlow, addR, float(0))));
      outG.assign(dFinalG.add(select(isGlow, addG, float(0))));
      outB.assign(dFinalB.add(select(isGlow, addB, float(0))));
      bloomR.assign(select(isGlow, addR.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)));
      bloomG.assign(select(isGlow, addG.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)));
      bloomB.assign(select(isGlow, addB.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)));
      hitFound.assign(float(1));
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
        const pk = fetchPacked(x, y, z);
        const matEnc = shiftRight(pk, uint(24));
        If(greaterThan(matEnc, uint(0)), () => {
          const matIdx = matEnc.sub(uint(1));
          const rgb = unpackLinearRgb(pk);
          const nx = float(0).toVar();
          const ny = float(0).toVar();
          const nz = float(0).toVar();
          If(axis.equal(int(0)), () => {
            nx.assign(select(greaterThan(stepX, int(0)), float(-1), float(1)));
          }).ElseIf(axis.equal(int(1)), () => {
            ny.assign(select(greaterThan(stepY, int(0)), float(-1), float(1)));
          }).Else(() => {
            nz.assign(select(greaterThan(stepZ, int(0)), float(-1), float(1)));
          });
          const lx = uToLight.x;
          const ly = uToLight.y;
          const lz = uToLight.z;
          const ndotl = max(float(0), nx.mul(lx).add(ny.mul(ly)).add(nz.mul(lz)));
          const sh = float(1).toVar();
          If(uEnableShadows.greaterThan(float(0.5)), () => {
            const hx = float(x).add(nx.mul(float(2e-4)));
            const hy = float(y).add(ny.mul(float(2e-4)));
            const hz = float(z).add(nz.mul(float(2e-4)));
            sh.assign(averagedOpaqueShadow(hx, hy, hz, lx, ly, lz, maxT));
          });
          const cr = rgb.x;
          const cg = rgb.y;
          const cb = rgb.z;
          const dr = cr.mul(uAmbient.x).add(cr.mul(uSunDiffuse.x).mul(ndotl).mul(sh));
          const dg = cg.mul(uAmbient.y).add(cg.mul(uSunDiffuse.y).mul(ndotl).mul(sh));
          const db = cb.mul(uAmbient.z).add(cb.mul(uSunDiffuse.z).mul(ndotl).mul(sh));
          const isMetal = matIdx.equal(uint(1));
          const isGlow = matIdx.equal(uint(GLOW_MAT));
          const vx = rdx.negate();
          const vy = rdy.negate();
          const vz = rdz.negate();
          const reflL = ndotl.mul(float(2)).mul(nx).sub(lx);
          const reflM = ndotl.mul(float(2)).mul(ny).sub(ly);
          const reflN = ndotl.mul(float(2)).mul(nz).sub(lz);
          const spec = max(float(0), vx.mul(reflL).add(vy.mul(reflM)).add(vz.mul(reflN)));
          const sp = pow(spec, float(48)).mul(float(0.45));
          const dMetalR = dr.add(sp.mul(uSunDiffuse.x).mul(sh));
          const dMetalG = dg.add(sp.mul(uSunDiffuse.y).mul(sh));
          const dMetalB = db.add(sp.mul(uSunDiffuse.z).mul(sh));
          const dFinalR = select(isMetal, dMetalR, dr);
          const dFinalG = select(isMetal, dMetalG, dg);
          const dFinalB = select(isMetal, dMetalB, db);
          const addR = cr.mul(float(0.85));
          const addG = cg.mul(float(0.85));
          const addB = cb.mul(float(0.85));
          outR.assign(dFinalR.add(select(isGlow, addR, float(0))));
          outG.assign(dFinalG.add(select(isGlow, addG, float(0))));
          outB.assign(dFinalB.add(select(isGlow, addB, float(0))));
          bloomR.assign(select(isGlow, addR.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)));
          bloomG.assign(select(isGlow, addG.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)));
          bloomB.assign(select(isGlow, addB.mul(float(GLOW_BLOOM_LINEAR_SCALE)), float(0)));
          hitFound.assign(float(1));
          Break();
        });
      });
    });

    If(hitFound.lessThan(float(0.5)), () => {
      const miss = vec3(uBg).toVar();
      If(uEnableSky.greaterThan(float(0.5)), () => {
        const denom = uBufH.sub(float(1)).max(float(1));
        const tSky = clamp(suv.y.mul(uBufH).div(denom), float(0), float(1));
        miss.assign(mix(uSkyTop, uSkyBottom, tSky));
      });
      outR.assign(miss.x);
      outG.assign(miss.y);
      outB.assign(miss.z);
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

  return {
    beautyTexture: beautyTarget.texture,
    bloomTexture: bloomTarget.texture,
    setSize(nw: number, nh: number, ndpr: number) {
      const cw = Math.max(1, Math.floor(nw * ndpr));
      const ch = Math.max(1, Math.floor(nh * ndpr));
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
      uVolTex.value = volTex;
      const clipToWorld = new Matrix4().multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      uClipToWorld.value.copy(clipToWorld);
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
        (tr <= 0.04045 ? tr / 12.92 : Math.pow((tr + 0.055) / 1.055, 2.4)) * (1 - 0.3 * params.lightStrength01) +
        params.lightColorR * 0.3 * params.lightStrength01;
      const lg =
        (tg <= 0.04045 ? tg / 12.92 : Math.pow((tg + 0.055) / 1.055, 2.4)) * (1 - 0.3 * params.lightStrength01) +
        params.lightColorG * 0.3 * params.lightStrength01;
      const lb =
        (tb <= 0.04045 ? tb / 12.92 : Math.pow((tb + 0.055) / 1.055, 2.4)) * (1 - 0.3 * params.lightStrength01) +
        params.lightColorB * 0.3 * params.lightStrength01;
      const br = ((grnd >> 16) & 255) / 255;
      const bg = ((grnd >> 8) & 255) / 255;
      const bb = (grnd & 255) / 255;
      const gr =
        (br <= 0.04045 ? br / 12.92 : Math.pow((br + 0.055) / 1.055, 2.4)) * (1 - 0.12 * params.lightStrength01) +
        params.lightColorR * 0.12 * params.lightStrength01;
      const gg =
        (bg <= 0.04045 ? bg / 12.92 : Math.pow((bg + 0.055) / 1.055, 2.4)) * (1 - 0.12 * params.lightStrength01) +
        params.lightColorG * 0.12 * params.lightStrength01;
      const gb =
        (bb <= 0.04045 ? bb / 12.92 : Math.pow((bb + 0.055) / 1.055, 2.4)) * (1 - 0.12 * params.lightStrength01) +
        params.lightColorB * 0.12 * params.lightStrength01;
      uSkyTop.value.set(lr, lg, lb);
      uSkyBottom.value.set(gr, gg, gb);

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
      uVolTex.value.dispose();
    }
  };
}

export function voxelMapHasTransmissiveMaterial(voxels: Map<string, Voxel>): boolean {
  for (const v of voxels.values()) {
    if (v.material === 'glass' || v.material === 'water') return true;
  }
  return false;
}
