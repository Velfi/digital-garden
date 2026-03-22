// @ts-nocheck — TSL typings incomplete for storage/compute in three r183.
/**
 * WebGPU compute: grid DDA + hash voxel lookup → StorageTexture.
 */
import type { Camera, WebGPURenderer } from 'three/webgpu';
import { Matrix4, StorageBufferAttribute, StorageTexture, Vector3 } from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  bitAnd,
  bitcast,
  bitXor,
  cos,
  cross,
  exp,
  float,
  floor,
  fract,
  int,
  instanceIndex,
  length,
  max,
  min,
  mul,
  normalize,
  pow,
  shiftRight,
  sign,
  sin,
  sqrt,
  storage,
  textureStore,
  TWO_PI,
  uint,
  uniform,
  uvec2,
  vec3,
  vec4
} from 'three/tsl';

import type { GpuVoxelAccelEmpty, GpuVoxelAccelHash } from './gpuVoxelAccel';
import { MAX_HASH_SLOTS } from './gpuVoxelAccel';
import {
  clampShadowSamples,
  MAX_SOFT_SHADOW_SAMPLES,
  shadowConeTanFromRadians
} from './gpuSoftShadow';
import type { VoxelRayTraceParams } from './voxelRayProgressive';

const WORKGROUP = 8;
const MAX_DDA_STEPS = 4096;
const MAX_HASH_PROBES = 4096;
const EPS = 1e-9;
/** Matches CPU `voxelRayProgressive` glass stack cap. */
const MAX_GLASS_STACK = 4;
const GLASS_IOR_F = 1.5;
const GLASS_R0 = Math.pow((1 - GLASS_IOR_F) / (1 + GLASS_IOR_F), 2);

export class GpuVoxelRayPipeline {
  readonly outTexture: StorageTexture;

  private renderer: WebGPURenderer;
  private computeNode = null;

  private bufW = 4;
  private bufH = 4;

  private hashBuffer: StorageBufferAttribute;
  private hashStorage;

  private uHasVoxels = uniform(0);
  private uHashMask = uniform(0);

  private uMatrixWorld = uniform(new Matrix4());
  private uInvProjection = uniform(new Matrix4());
  private uCamPos = uniform(new Vector3());
  private uPerspective = uniform(1);
  private uOrthoZ = uniform(0);
  private uOrthoRayDir = uniform(new Vector3(0, 0, -1));

  private uMaxDist = uniform(4000);

  private uToLight = uniform(new Vector3());
  private uSunDiffuse = uniform(new Vector3());
  private uAmbient = uniform(new Vector3());
  private uBackground = uniform(new Vector3());
  private uEnableSky = uniform(0);
  private uEnableShadows = uniform(0);
  /** Float for TSL comparisons; clamped 1..MAX_SOFT_SHADOW_SAMPLES. */
  private uShadowSampleCount = uniform(6);
  private uShadowConeTan = uniform(0.07);

  private scratchV = new Vector3();

  constructor(renderer: WebGPURenderer) {
    this.renderer = renderer;
    this.outTexture = new StorageTexture(4, 4);
    this.outTexture.internalFormat = 'rgba8unorm-srgb';
    this.outTexture.mipmapsAutoUpdate = false;

    const hashArray = new Int32Array(MAX_HASH_SLOTS * 4);
    this.hashBuffer = new StorageBufferAttribute(hashArray, 4, Int32Array);
    this.hashStorage = storage(this.hashBuffer, 'ivec4', MAX_HASH_SLOTS).toReadOnly();

    this.rebuildComputeFn();
  }

  dispose(): void {
    this.computeNode?.dispose();
    this.computeNode = null;
    this.outTexture.dispose();
  }

  setOutputSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (w === this.bufW && h === this.bufH) return;
    this.bufW = w;
    this.bufH = h;
    this.outTexture.setSize(w, h);
    this.computeNode?.dispose();
    this.rebuildComputeFn();
  }

  syncAccel(accel: GpuVoxelAccelHash | GpuVoxelAccelEmpty): void {
    if (accel.kind === 'empty') {
      this.uHasVoxels.value = 0;
      return;
    }
    this.uHasVoxels.value = 1;
    this.uHashMask.value = accel.mask;
    const arr = this.hashBuffer.array;
    arr.fill(0);
    arr.set(accel.table.subarray(0, accel.tableLen * 4));
    this.hashBuffer.needsUpdate = true;
  }

  setTraceParams(params: VoxelRayTraceParams): void {
    this.uToLight.value.set(params.toLightWorld[0], params.toLightWorld[1], params.toLightWorld[2]);
    this.uSunDiffuse.value.set(params.sunDiffuseR, params.sunDiffuseG, params.sunDiffuseB);
    this.uAmbient.value.set(params.ambientR, params.ambientG, params.ambientB);
    this.uBackground.value.set(params.backgroundR, params.backgroundG, params.backgroundB);
    this.uEnableSky.value = params.enableSky ? 1 : 0;
    this.uEnableShadows.value = params.enableShadows ? 1 : 0;
    this.uShadowSampleCount.value = clampShadowSamples(params.shadowRaySamples);
    this.uShadowConeTan.value = shadowConeTanFromRadians(params.shadowSoftnessRadians);
  }

  setMaxDistance(d: number): void {
    this.uMaxDist.value = d;
  }

  setCameraRays(camera: Camera): void {
    this.uMatrixWorld.value.copy(camera.matrixWorld);
    this.uInvProjection.value.copy(camera.projectionMatrixInverse);
    camera.getWorldPosition(this.uCamPos.value);
    if (camera.isPerspectiveCamera) {
      this.uPerspective.value = 1;
    } else {
      this.uPerspective.value = 0;
      const o = camera;
      this.uOrthoZ.value = (o.near + o.far) / (o.near - o.far);
      this.scratchV.set(0, 0, -1).transformDirection(camera.matrixWorld);
      this.uOrthoRayDir.value.copy(this.scratchV);
    }
  }

  dispatch(): void {
    if (!this.computeNode) return;
    this.renderer.compute(this.computeNode, this.bufW * this.bufH);
  }

  private rebuildComputeFn(): void {
    this.computeNode?.dispose();

    const outW = this.bufW;
    const outH = this.bufH;
    const outTex = this.outTexture;

    const uHasVoxels = this.uHasVoxels;
    const uHashMask = this.uHashMask;
    const hashStorage = this.hashStorage;

    const uMatrixWorld = this.uMatrixWorld;
    const uInvProjection = this.uInvProjection;
    const uCamPos = this.uCamPos;
    const uPerspective = this.uPerspective;
    const uOrthoZ = this.uOrthoZ;
    const uOrthoRayDir = this.uOrthoRayDir;
    const uMaxDist = this.uMaxDist;
    const uToLight = this.uToLight;
    const uSunDiffuse = this.uSunDiffuse;
    const uAmbient = this.uAmbient;
    const uBackground = this.uBackground;
    const uEnableSky = this.uEnableSky;
    const uEnableShadows = this.uEnableShadows;
    const uShadowSampleCount = this.uShadowSampleCount;
    const uShadowConeTan = this.uShadowConeTan;

    const feps = float(EPS);

    const kernel = Fn(() => {
      const count = uint(outW * outH);
      If(instanceIndex.lessThan(count), () => {
      const u = int(instanceIndex.mod(outW));
      const v = int(instanceIndex.div(outW));

      const bufWf = float(outW);
      const bufHf = float(outH);
      const nx = float(u).add(0.5).div(bufWf).mul(2.0).sub(1.0);
      const ny = float(v).add(0.5).div(bufHf).mul(-2.0).add(1.0);

      const clipPersp = vec4(nx, ny, float(0.5), float(1.0));
      const clipOrtho = vec4(nx, ny, uOrthoZ, float(1.0));

      const a = vec4().toVar();
      If(uPerspective.equal(1), () => {
        a.assign(uInvProjection.mul(clipPersp));
      }).Else(() => {
        a.assign(uInvProjection.mul(clipOrtho));
      });
      const aw = max(abs(a.w), float(1e-20));
      a.xyz.assign(a.xyz.div(aw));

      const b = vec4().toVar();
      b.assign(uMatrixWorld.mul(vec4(a.xyz, float(1.0))));
      const bw = max(abs(b.w), float(1e-20));
      const worldP = b.xyz.div(bw);

      const ro = vec3().toVar();
      const rd = vec3().toVar();
      If(uPerspective.equal(1), () => {
        ro.assign(uCamPos);
        rd.assign(normalize(worldP.sub(uCamPos)));
      }).Else(() => {
        ro.assign(worldP);
        rd.assign(normalize(uOrthoRayDir));
      });

      const rdLen = max(length(rd), float(1e-20));
      const cdx = float().toVar();
      const cdy = float().toVar();
      const cdz = float().toVar();
      cdx.assign(rd.x.div(rdLen));
      cdy.assign(rd.y.div(rdLen));
      cdz.assign(rd.z.div(rdLen));

      const oox = float().toVar();
      const ooy = float().toVar();
      const ooz = float().toVar();
      const remDist = float().toVar();
      const accR = float(0).toVar();
      const accG = float(0).toVar();
      const accB = float(0).toVar();
      const tr = float(1).toVar();
      const tg = float(1).toVar();
      const tb = float(1).toVar();
      const finished = int(0).toVar();
      const glassIter = int(0).toVar();

      remDist.assign(uMaxDist);
      oox.assign(ro.x.add(cdx.mul(feps)));
      ooy.assign(ro.y.add(cdy.mul(feps)));
      ooz.assign(ro.z.add(cdz.mul(feps)));

      const glassR0 = float(GLASS_R0);
      const glassEtaAG = float(1.0 / GLASS_IOR_F);
      const glassEtaGA = float(GLASS_IOR_F);
      const glassAbs = float(0.16);
      const glassMinTrans = float(0.35);
      const surfEps = float(2e-4);

      const outRgb = vec3().toVar();

      const hashProbe = (cx, cy, cz, outPacked) => {
        const hh = uint(2166136261).toVar();
        hh.assign(bitXor(hh, bitcast(cx, 'uint')));
        hh.assign(mul(hh, uint(16777619)));
        hh.assign(bitXor(hh, bitcast(cy, 'uint')));
        hh.assign(mul(hh, uint(16777619)));
        hh.assign(bitXor(hh, bitcast(cz, 'uint')));
        hh.assign(mul(hh, uint(16777619)));
        const probeIdx = bitAnd(hh, uHashMask).toVar();
        Loop(MAX_HASH_PROBES, () => {
          const slot = hashStorage.element(probeIdx);
          const sw = slot.w;
          If(sw.equal(int(0)), () => {
            outPacked.assign(uint(0));
            Break();
          });
          If(slot.x.equal(cx).and(slot.y.equal(cy)).and(slot.z.equal(cz)), () => {
            outPacked.assign(bitcast(sw, 'uint'));
            Break();
          });
          probeIdx.assign(bitAnd(probeIdx.add(uint(1)), uHashMask));
        });
      };

      Loop(MAX_GLASS_STACK, () => {
        If(finished.equal(1), () => Break());

        If(remDist.lessThan(float(1e-4)), () => {
          If(uEnableSky.equal(0), () => {
            outRgb.assign(
              vec3(
                accR.add(tr.mul(uBackground.x)),
                accG.add(tg.mul(uBackground.y)),
                accB.add(tb.mul(uBackground.z))
              )
            );
          }).Else(() => {
            const tsky0 = float(v).div(max(float(1), bufHf.sub(1.0)));
            const sky0 = vec3(0.455, 0.62, 0.855);
            const ground0 = vec3(0.192, 0.31, 0.4);
            const missC0 = sky0.mul(float(1).sub(tsky0)).add(ground0.mul(tsky0));
            outRgb.assign(
              vec3(
                accR.add(tr.mul(missC0.x)),
                accG.add(tg.mul(missC0.y)),
                accB.add(tb.mul(missC0.z))
              )
            );
          });
          finished.assign(1);
          Break();
        });

        const segOx = float().toVar();
        const segOy = float().toVar();
        const segOz = float().toVar();
        segOx.assign(oox);
        segOy.assign(ooy);
        segOz.assign(ooz);

        const hitPacked = uint(0).toVar();
        const hitNx = int(0).toVar();
        const hitNy = int(0).toVar();
        const hitNz = int(0).toVar();
        const hitCx = int(0).toVar();
        const hitCy = int(0).toVar();
        const hitCz = int(0).toVar();
        const found = int(0).toVar();
        const hitDist = float(0).toVar();

        const stepX = abs(cdx).lessThanEqual(feps)
          .select(int(0), cdx.greaterThan(float(0)).select(int(1), int(-1)));
        const stepY = abs(cdy).lessThanEqual(feps)
          .select(int(0), cdy.greaterThan(float(0)).select(int(1), int(-1)));
        const stepZ = abs(cdz).lessThanEqual(feps)
          .select(int(0), cdz.greaterThan(float(0)).select(int(1), int(-1)));

        const tDeltaX = stepX.equal(int(0)).select(float(1e30), abs(float(1.0).div(cdx)));
        const tDeltaY = stepY.equal(int(0)).select(float(1e30), abs(float(1.0).div(cdy)));
        const tDeltaZ = stepZ.equal(int(0)).select(float(1e30), abs(float(1.0).div(cdz)));

        const x = int(floor(oox)).toVar();
        const y = int(floor(ooy)).toVar();
        const z = int(floor(ooz)).toVar();

        const tMaxX = float().toVar();
        const tMaxY = float().toVar();
        const tMaxZ = float().toVar();

        If(stepX.greaterThan(int(0)), () => {
          tMaxX.assign(float(x.add(1).sub(oox)).div(cdx));
        }).ElseIf(stepX.lessThan(int(0)), () => {
          tMaxX.assign(float(x.sub(oox)).div(cdx));
        }).Else(() => {
          tMaxX.assign(float(1e30));
        });

        If(stepY.greaterThan(int(0)), () => {
          tMaxY.assign(float(y.add(1).sub(ooy)).div(cdy));
        }).ElseIf(stepY.lessThan(int(0)), () => {
          tMaxY.assign(float(y.sub(ooy)).div(cdy));
        }).Else(() => {
          tMaxY.assign(float(1e30));
        });

        If(stepZ.greaterThan(int(0)), () => {
          tMaxZ.assign(float(z.add(1).sub(ooz)).div(cdz));
        }).ElseIf(stepZ.lessThan(int(0)), () => {
          tMaxZ.assign(float(z.sub(ooz)).div(cdz));
        }).Else(() => {
          tMaxZ.assign(float(1e30));
        });

        If(tMaxX.lessThan(float(0)), () => {
          tMaxX.assign(float(0));
        });
        If(tMaxY.lessThan(float(0)), () => {
          tMaxY.assign(float(0));
        });
        If(tMaxZ.lessThan(float(0)), () => {
          tMaxZ.assign(float(0));
        });

        If(uHasVoxels.equal(0), () => {
          found.assign(int(0));
        }).Else(() => {
          const startPacked = uint(0).toVar();
          hashProbe(x, y, z, startPacked);

          If(startPacked.notEqual(uint(0)), () => {
            const ax = abs(cdx);
            const ay = abs(cdy);
            const az = abs(cdz);
            If(ax.greaterThanEqual(ay).and(ax.greaterThanEqual(az)), () => {
              hitNx.assign(sign(cdx).greaterThan(float(0)).select(int(-1), int(1)));
              hitNy.assign(int(0));
              hitNz.assign(int(0));
            })
              .ElseIf(ay.greaterThanEqual(az), () => {
                hitNx.assign(int(0));
                hitNy.assign(sign(cdy).greaterThan(float(0)).select(int(-1), int(1)));
                hitNz.assign(int(0));
              })
              .Else(() => {
                hitNx.assign(int(0));
                hitNy.assign(int(0));
                hitNz.assign(sign(cdz).greaterThan(float(0)).select(int(-1), int(1)));
              });
            hitPacked.assign(startPacked);
            hitCx.assign(x);
            hitCy.assign(y);
            hitCz.assign(z);
            found.assign(int(1));
            hitDist.assign(float(0));
          });

          const t = float(0).toVar();
          const maxT = remDist;

          Loop(MAX_DDA_STEPS, () => {
            If(found.equal(int(1)), () => {
              Break();
            });
            If(t.greaterThan(maxT), () => {
              Break();
            });

            const axis = int(0).toVar();
            If(tMaxX.lessThanEqual(tMaxY).and(tMaxX.lessThanEqual(tMaxZ)), () => {
              axis.assign(int(0));
              t.assign(tMaxX);
              tMaxX.assign(tMaxX.add(tDeltaX));
              x.assign(x.add(stepX));
            })
              .ElseIf(tMaxY.lessThanEqual(tMaxZ), () => {
                axis.assign(int(1));
                t.assign(tMaxY);
                tMaxY.assign(tMaxY.add(tDeltaY));
                y.assign(y.add(stepY));
              })
              .Else(() => {
                axis.assign(int(2));
                t.assign(tMaxZ);
                tMaxZ.assign(tMaxZ.add(tDeltaZ));
                z.assign(z.add(stepZ));
              });

            If(t.greaterThan(maxT), () => {
              Break();
            });

            const cellPacked = uint(0).toVar();
            hashProbe(x, y, z, cellPacked);
            If(cellPacked.notEqual(uint(0)), () => {
              hitPacked.assign(cellPacked);
              hitCx.assign(x);
              hitCy.assign(y);
              hitCz.assign(z);
              If(axis.equal(int(0)), () => {
                hitNx.assign(stepX.greaterThan(int(0)).select(int(-1), int(1)));
                hitNy.assign(int(0));
                hitNz.assign(int(0));
              })
                .ElseIf(axis.equal(int(1)), () => {
                  hitNx.assign(int(0));
                  hitNy.assign(stepY.greaterThan(int(0)).select(int(-1), int(1)));
                  hitNz.assign(int(0));
                })
                .Else(() => {
                  hitNx.assign(int(0));
                  hitNy.assign(int(0));
                  hitNz.assign(stepZ.greaterThan(int(0)).select(int(-1), int(1)));
                });
              found.assign(int(1));
              hitDist.assign(t);
            });
          });
        });

        If(found.equal(int(0)), () => {
          If(uEnableSky.equal(0), () => {
            outRgb.assign(
              vec3(
                accR.add(tr.mul(uBackground.x)),
                accG.add(tg.mul(uBackground.y)),
                accB.add(tb.mul(uBackground.z))
              )
            );
          }).Else(() => {
            const tskyM = float(v).div(max(float(1), bufHf.sub(1.0)));
            const skyM = vec3(0.455, 0.62, 0.855);
            const groundM = vec3(0.192, 0.31, 0.4);
            const missM = skyM.mul(float(1).sub(tskyM)).add(groundM.mul(tskyM));
            outRgb.assign(
              vec3(
                accR.add(tr.mul(missM.x)),
                accG.add(tg.mul(missM.y)),
                accB.add(tb.mul(missM.z))
              )
            );
          });
          finished.assign(1);
          Break();
        });

        If(found.equal(int(1)), () => {
        const col = bitAnd(hitPacked, uint(0xffffff));
        const matEnc = shiftRight(hitPacked, uint(24));
        const cr = float(bitAnd(shiftRight(col, uint(16)), uint(255))).div(255.0);
        const cg = float(bitAnd(shiftRight(col, uint(8)), uint(255))).div(255.0);
        const cb = float(bitAnd(col, uint(255))).div(255.0);

        const lx = uToLight.x;
        const ly = uToLight.y;
        const lz = uToLight.z;
        const nxf = float(hitNx);
        const nyf = float(hitNy);
        const nzf = float(hitNz);
        const ndotl = max(float(0), nxf.mul(lx).add(nyf.mul(ly)).add(nzf.mul(lz)));

        If(matEnc.equal(uint(3)), () => {
          If(glassIter.greaterThanEqual(int(3)), () => {
            const shx = float(1).toVar();
            const shy = float(1).toVar();
            const shz = float(1).toVar();
            If(uEnableShadows.equal(1).and(uHasVoxels.equal(1)), () => {
              const hpx = segOx.add(cdx.mul(hitDist)).add(float(hitNx).mul(0.0002));
              const hpy = segOy.add(cdy.mul(hitDist)).add(float(hitNy).mul(0.0002));
              const hpz = segOz.add(cdz.mul(hitDist)).add(float(hitNz).mul(0.0002));
              const Lraw = vec3(uToLight.x, uToLight.y, uToLight.z);
              const Llen = max(length(Lraw), float(1e-20));
              const Ln = vec3(Lraw.x.div(Llen), Lraw.y.div(Llen), Lraw.z.div(Llen));
              const temp = vec3().toVar();
              If(abs(Ln.y).lessThan(float(0.9)), () => {
                temp.assign(vec3(0, 1, 0));
              }).Else(() => {
                temp.assign(vec3(1, 0, 0));
              });
              const Ut = normalize(cross(temp, Ln));
              const Vt = cross(Ln, Ut);
              const accShx = float(0).toVar();
              const accShy = float(0).toVar();
              const accShz = float(0).toVar();
              const si = int(0).toVar();
              Loop(MAX_SOFT_SHADOW_SAMPLES, () => {
                If(uShadowSampleCount.lessThanEqual(float(si)), () => {
                  Break();
                });
                const fu = float(u).mul(12.9898).add(float(v).mul(78.233)).add(float(si).mul(19.1));
                const fv = float(u).mul(93.9898).add(float(v).mul(67.345)).add(float(si).mul(13.7));
                const h0 = fract(sin(fu).mul(43758.5453123));
                const h1 = fract(sin(fv).mul(24634.6345123));
                const diskR = sqrt(h0).mul(uShadowConeTan);
                const ang = h1.mul(TWO_PI);
                const off = Ut.mul(diskR.mul(cos(ang))).add(Vt.mul(diskR.mul(sin(ang))));
                const Ls = normalize(Ln.add(off));
                const lsx = Ls.x;
                const lsy = Ls.y;
                const lsz = Ls.z;
                const shsx = float(1).toVar();
                const shsy = float(1).toVar();
                const shsz = float(1).toVar();
                const shadowS = float(0.06).toVar();
                Loop(100, () => {
                  shadowS.addAssign(float(0.1));
                  const sx = int(floor(hpx.add(lsx.mul(shadowS))));
                  const sy = int(floor(hpy.add(lsy.mul(shadowS))));
                  const sz = int(floor(hpz.add(lsz.mul(shadowS))));
                  const pk = uint(0).toVar();
                  hashProbe(sx, sy, sz, pk);
                  If(pk.notEqual(uint(0)), () => {
                    const mtag = shiftRight(pk, uint(24));
                    If(mtag.equal(uint(3)), () => {
                      const cg2 = bitAnd(pk, uint(0xffffff));
                      const crr = float(bitAnd(shiftRight(cg2, uint(16)), uint(255))).div(255.0);
                      const cgg = float(bitAnd(shiftRight(cg2, uint(8)), uint(255))).div(255.0);
                      const cbb = float(bitAnd(cg2, uint(255))).div(255.0);
                      shsx.assign(shsx.mul(crr.mul(0.9)));
                      shsy.assign(shsy.mul(cgg.mul(0.9)));
                      shsz.assign(shsz.mul(cbb.mul(0.9)));
                    }).Else(() => {
                      shsx.assign(float(0));
                      shsy.assign(float(0));
                      shsz.assign(float(0));
                      Break();
                    });
                  });
                });
                accShx.addAssign(shsx);
                accShy.addAssign(shsy);
                accShz.addAssign(shsz);
                si.addAssign(1);
              });
              const invN = float(1).div(max(uShadowSampleCount, float(1)));
              shx.assign(accShx.mul(invN));
              shy.assign(accShy.mul(invN));
              shz.assign(accShz.mul(invN));
            });
            const drf = cr.mul(uAmbient.x.add(uSunDiffuse.x.mul(ndotl).mul(shx))).toVar();
            const dgf = cg.mul(uAmbient.y.add(uSunDiffuse.y.mul(ndotl).mul(shy))).toVar();
            const dbf = cb.mul(uAmbient.z.add(uSunDiffuse.z.mul(ndotl).mul(shz))).toVar();
            const cosIfb = max(
              float(0),
              nxf.mul(cdx).negate().add(nyf.mul(cdy).negate()).add(nzf.mul(cdz).negate())
            );
            const Rfb = glassR0.add(float(1).sub(glassR0).mul(pow(float(1).sub(cosIfb), float(5))));
            const Tfb = float(1).sub(Rfb);
            drf.assign(drf.mul(Tfb.mul(0.62)).add(uBackground.x.mul(Rfb.mul(0.38))));
            dgf.assign(dgf.mul(Tfb.mul(0.62)).add(uBackground.y.mul(Rfb.mul(0.38))));
            dbf.assign(dbf.mul(Tfb.mul(0.62)).add(uBackground.z.mul(Rfb.mul(0.38))));
            outRgb.assign(
              vec3(
                accR.add(tr.mul(drf)),
                accG.add(tg.mul(dgf)),
                accB.add(tb.mul(dbf))
              )
            );
            finished.assign(1);
          }).Else(() => {
            const cosiEntry = max(
              float(0),
              nxf.mul(cdx).negate().add(nyf.mul(cdy).negate()).add(nzf.mul(cdz).negate())
            );
            const Rf = glassR0.add(float(1).sub(glassR0).mul(pow(float(1).sub(cosiEntry), float(5))));
            const Tf = float(1).sub(Rf);
            If(uEnableSky.equal(0), () => {
              accR.addAssign(tr.mul(Rf).mul(uBackground.x));
              accG.addAssign(tg.mul(Rf).mul(uBackground.y));
              accB.addAssign(tb.mul(Rf).mul(uBackground.z));
            }).Else(() => {
              const tskyE = float(v).div(max(float(1), bufHf.sub(1.0)));
              const skyE = vec3(0.455, 0.62, 0.855);
              const groundE = vec3(0.192, 0.31, 0.4);
              const envE = skyE.mul(float(1).sub(tskyE)).add(groundE.mul(tskyE));
              accR.addAssign(tr.mul(Rf).mul(envE.x));
              accG.addAssign(tg.mul(Rf).mul(envE.y));
              accB.addAssign(tb.mul(Rf).mul(envE.z));
            });
            const kIn = float(1).sub(glassEtaAG.mul(glassEtaAG).mul(float(1).sub(cosiEntry.mul(cosiEntry))));
            const rgx = float().toVar();
            const rgy = float().toVar();
            const rgz = float().toVar();
            If(kIn.lessThan(float(0)), () => {
              rgx.assign(cdx);
              rgy.assign(cdy);
              rgz.assign(cdz);
            }).Else(() => {
              const sIn = sqrt(max(kIn, float(1e-20)));
              rgx.assign(glassEtaAG.mul(cdx).add(nxf.mul(glassEtaAG.mul(cosiEntry).sub(sIn))));
              rgy.assign(glassEtaAG.mul(cdy).add(nyf.mul(glassEtaAG.mul(cosiEntry).sub(sIn))));
              rgz.assign(glassEtaAG.mul(cdz).add(nzf.mul(glassEtaAG.mul(cosiEntry).sub(sIn))));
            });
            const rgLen = max(length(vec3(rgx, rgy, rgz)), float(1e-20));
            rgx.assign(rgx.div(rgLen));
            rgy.assign(rgy.div(rgLen));
            rgz.assign(rgz.div(rgLen));
            const pHitx = segOx.add(cdx.mul(hitDist));
            const pHity = segOy.add(cdy.mul(hitDist));
            const pHitz = segOz.add(cdz.mul(hitDist));
            const posx = float().toVar();
            const posy = float().toVar();
            const posz = float().toVar();
            posx.assign(pHitx.add(rgx.mul(surfEps)));
            posy.assign(pHity.add(rgy.mul(surfEps)));
            posz.assign(pHitz.add(rgz.mul(surfEps)));
            const fxc = float(hitCx);
            const fyc = float(hitCy);
            const fzc = float(hitCz);
            const tAbsAccum = float(0).toVar();
            const escaped = int(0).toVar();
            const pBx = float().toVar();
            const pBy = float().toVar();
            const pBz = float().toVar();
            Loop(6, () => {
              If(escaped.equal(1), () => Break());
              const tXp = rgx.greaterThan(feps).select(fxc.add(float(1)).sub(posx).div(rgx), float(1e30));
              const tXn = rgx.lessThan(float(0).sub(feps)).select(fxc.sub(posx).div(rgx), float(1e30));
              const tx = min(tXp, tXn);
              const tYp = rgy.greaterThan(feps).select(fyc.add(float(1)).sub(posy).div(rgy), float(1e30));
              const tYn = rgy.lessThan(float(0).sub(feps)).select(fyc.sub(posy).div(rgy), float(1e30));
              const ty = min(tYp, tYn);
              const tZp = rgz.greaterThan(feps).select(fzc.add(float(1)).sub(posz).div(rgz), float(1e30));
              const tZn = rgz.lessThan(float(0).sub(feps)).select(fzc.sub(posz).div(rgz), float(1e30));
              const tz = min(tZp, tZn);
              const tExit = min(tx, min(ty, tz));
              tAbsAccum.addAssign(tExit);
              pBx.assign(posx.add(rgx.mul(tExit)));
              pBy.assign(posy.add(rgy.mul(tExit)));
              pBz.assign(posz.add(rgz.mul(tExit)));
              const nEx = float().toVar();
              const nEy = float().toVar();
              const nEz = float().toVar();
              If(tx.lessThanEqual(ty).and(tx.lessThanEqual(tz)), () => {
                If(tXp.lessThanEqual(tXn), () => {
                  nEx.assign(float(1));
                  nEy.assign(float(0));
                  nEz.assign(float(0));
                }).Else(() => {
                  nEx.assign(float(-1));
                  nEy.assign(float(0));
                  nEz.assign(float(0));
                });
              })
                .ElseIf(ty.lessThanEqual(tz), () => {
                  If(tYp.lessThanEqual(tYn), () => {
                    nEx.assign(float(0));
                    nEy.assign(float(1));
                    nEz.assign(float(0));
                  }).Else(() => {
                    nEx.assign(float(0));
                    nEy.assign(float(-1));
                    nEz.assign(float(0));
                  });
                })
                .Else(() => {
                  If(tZp.lessThanEqual(tZn), () => {
                    nEx.assign(float(0));
                    nEy.assign(float(0));
                    nEz.assign(float(1));
                  }).Else(() => {
                    nEx.assign(float(0));
                    nEy.assign(float(0));
                    nEz.assign(float(-1));
                  });
                });
              const cosiG = max(float(0), nEx.mul(rgx).add(nEy.mul(rgy)).add(nEz.mul(rgz)));
              const nInX = nEx.negate();
              const nInY = nEy.negate();
              const nInZ = nEz.negate();
              const kOut = float(1).sub(glassEtaGA.mul(glassEtaGA).mul(float(1).sub(cosiG.mul(cosiG))));
              If(kOut.greaterThanEqual(float(0)), () => {
                const sOut = sqrt(max(kOut, float(1e-20)));
                const oax = glassEtaGA.mul(rgx).add(nInX.mul(glassEtaGA.mul(cosiG).sub(sOut)));
                const oay = glassEtaGA.mul(rgy).add(nInY.mul(glassEtaGA.mul(cosiG).sub(sOut)));
                const oaz = glassEtaGA.mul(rgz).add(nInZ.mul(glassEtaGA.mul(cosiG).sub(sOut)));
                const oaLen = max(length(vec3(oax, oay, oaz)), float(1e-20));
                cdx.assign(oax.div(oaLen));
                cdy.assign(oay.div(oaLen));
                cdz.assign(oaz.div(oaLen));
                oox.assign(pBx.add(cdx.mul(surfEps)));
                ooy.assign(pBy.add(cdy.mul(surfEps)));
                ooz.assign(pBz.add(cdz.mul(surfEps)));
                escaped.assign(1);
              }).Else(() => {
                const dotNI = nInX.mul(rgx).add(nInY.mul(rgy)).add(nInZ.mul(rgz));
                rgx.assign(rgx.sub(nInX.mul(float(2).mul(dotNI))));
                rgy.assign(rgy.sub(nInY.mul(float(2).mul(dotNI))));
                rgz.assign(rgz.sub(nInZ.mul(float(2).mul(dotNI))));
                const rl2 = max(length(vec3(rgx, rgy, rgz)), float(1e-20));
                rgx.assign(rgx.div(rl2));
                rgy.assign(rgy.div(rl2));
                rgz.assign(rgz.div(rl2));
                posx.assign(pBx.add(rgx.mul(surfEps)));
                posy.assign(pBy.add(rgy.mul(surfEps)));
                posz.assign(pBz.add(rgz.mul(surfEps)));
              });
            });
            If(escaped.equal(0), () => {
              cdx.assign(rgx);
              cdy.assign(rgy);
              cdz.assign(rgz);
              oox.assign(pBx.add(cdx.mul(surfEps)));
              ooy.assign(pBy.add(cdy.mul(surfEps)));
              ooz.assign(pBz.add(cdz.mul(surfEps)));
            });
            const att = max(glassMinTrans, exp(glassAbs.mul(float(-1)).mul(tAbsAccum)));
            tr.assign(tr.mul(Tf).mul(att).mul(cr));
            tg.assign(tg.mul(Tf).mul(att).mul(cg));
            tb.assign(tb.mul(Tf).mul(att).mul(cb));
            remDist.subAssign(hitDist.add(tAbsAccum).add(surfEps.mul(float(4))));
            glassIter.addAssign(1);
          });
        }).Else(() => {
          const shx = float(1).toVar();
          const shy = float(1).toVar();
          const shz = float(1).toVar();
          If(uEnableShadows.equal(1).and(uHasVoxels.equal(1)), () => {
            const hpx = segOx.add(cdx.mul(hitDist)).add(float(hitNx).mul(0.0002));
            const hpy = segOy.add(cdy.mul(hitDist)).add(float(hitNy).mul(0.0002));
            const hpz = segOz.add(cdz.mul(hitDist)).add(float(hitNz).mul(0.0002));
            const Lraw = vec3(uToLight.x, uToLight.y, uToLight.z);
            const Llen = max(length(Lraw), float(1e-20));
            const Ln = vec3(Lraw.x.div(Llen), Lraw.y.div(Llen), Lraw.z.div(Llen));
            const temp = vec3().toVar();
            If(abs(Ln.y).lessThan(float(0.9)), () => {
              temp.assign(vec3(0, 1, 0));
            }).Else(() => {
              temp.assign(vec3(1, 0, 0));
            });
            const Ut = normalize(cross(temp, Ln));
            const Vt = cross(Ln, Ut);
            const accShx = float(0).toVar();
            const accShy = float(0).toVar();
            const accShz = float(0).toVar();
            const si = int(0).toVar();
            Loop(MAX_SOFT_SHADOW_SAMPLES, () => {
              If(uShadowSampleCount.lessThanEqual(float(si)), () => {
                Break();
              });
              const fu = float(u).mul(12.9898).add(float(v).mul(78.233)).add(float(si).mul(19.1));
              const fv = float(u).mul(93.9898).add(float(v).mul(67.345)).add(float(si).mul(13.7));
              const h0 = fract(sin(fu).mul(43758.5453123));
              const h1 = fract(sin(fv).mul(24634.6345123));
              const diskR = sqrt(h0).mul(uShadowConeTan);
              const ang = h1.mul(TWO_PI);
              const off = Ut.mul(diskR.mul(cos(ang))).add(Vt.mul(diskR.mul(sin(ang))));
              const Ls = normalize(Ln.add(off));
              const lsx = Ls.x;
              const lsy = Ls.y;
              const lsz = Ls.z;
              const shsx = float(1).toVar();
              const shsy = float(1).toVar();
              const shsz = float(1).toVar();
              const shadowS = float(0.06).toVar();
              Loop(100, () => {
                shadowS.addAssign(float(0.1));
                const sx = int(floor(hpx.add(lsx.mul(shadowS))));
                const sy = int(floor(hpy.add(lsy.mul(shadowS))));
                const sz = int(floor(hpz.add(lsz.mul(shadowS))));
                const pk = uint(0).toVar();
                hashProbe(sx, sy, sz, pk);
                If(pk.notEqual(uint(0)), () => {
                  const mtag = shiftRight(pk, uint(24));
                  If(mtag.equal(uint(3)), () => {
                    const cg2 = bitAnd(pk, uint(0xffffff));
                    const crr = float(bitAnd(shiftRight(cg2, uint(16)), uint(255))).div(255.0);
                    const cgg = float(bitAnd(shiftRight(cg2, uint(8)), uint(255))).div(255.0);
                    const cbb = float(bitAnd(cg2, uint(255))).div(255.0);
                    shsx.assign(shsx.mul(crr.mul(0.9)));
                    shsy.assign(shsy.mul(cgg.mul(0.9)));
                    shsz.assign(shsz.mul(cbb.mul(0.9)));
                  }).Else(() => {
                    shsx.assign(float(0));
                    shsy.assign(float(0));
                    shsz.assign(float(0));
                    Break();
                  });
                });
              });
              accShx.addAssign(shsx);
              accShy.addAssign(shsy);
              accShz.addAssign(shsz);
              si.addAssign(1);
            });
            const invN = float(1).div(max(uShadowSampleCount, float(1)));
            shx.assign(accShx.mul(invN));
            shy.assign(accShy.mul(invN));
            shz.assign(accShz.mul(invN));
          });
          const dr = cr.mul(uAmbient.x.add(uSunDiffuse.x.mul(ndotl).mul(shx))).toVar();
          const dg = cg.mul(uAmbient.y.add(uSunDiffuse.y.mul(ndotl).mul(shy))).toVar();
          const db = cb.mul(uAmbient.z.add(uSunDiffuse.z.mul(ndotl).mul(shz))).toVar();
          If(matEnc.equal(uint(2)), () => {
            const hx = cdx.negate();
            const hy = cdy.negate();
            const hz = cdz.negate();
            const reflL = ndotl.mul(nxf).mul(2.0).sub(lx);
            const reflM = ndotl.mul(nyf).mul(2.0).sub(ly);
            const reflN = ndotl.mul(nzf).mul(2.0).sub(lz);
            const spec = max(float(0), hx.mul(reflL).add(hy.mul(reflM)).add(hz.mul(reflN)));
            const sp = pow(spec, float(48)).mul(0.45);
            dr.addAssign(sp.mul(uSunDiffuse.x.add(0.2)).mul(shx));
            dg.addAssign(sp.mul(uSunDiffuse.y.add(0.2)).mul(shy));
            db.addAssign(sp.mul(uSunDiffuse.z.add(0.2)).mul(shz));
          });
          If(matEnc.equal(uint(4)), () => {
            dr.addAssign(cr.mul(0.85));
            dg.addAssign(cg.mul(0.85));
            db.addAssign(cb.mul(0.85));
          });
          outRgb.assign(
            vec3(
              accR.add(tr.mul(dr)),
              accG.add(tg.mul(dg)),
              accB.add(tb.mul(db))
            )
          );
          finished.assign(1);
        });
        });
      });

      If(finished.equal(0), () => {
        If(uEnableSky.equal(0), () => {
          outRgb.assign(
            vec3(
              accR.add(tr.mul(uBackground.x)),
              accG.add(tg.mul(uBackground.y)),
              accB.add(tb.mul(uBackground.z))
            )
          );
        }).Else(() => {
          const tskyF = float(v).div(max(float(1), bufHf.sub(1.0)));
          const skyF = vec3(0.455, 0.62, 0.855);
          const groundF = vec3(0.192, 0.31, 0.4);
          const missCF = skyF.mul(float(1).sub(tskyF)).add(groundF.mul(tskyF));
          outRgb.assign(
            vec3(
              accR.add(tr.mul(missCF.x)),
              accG.add(tg.mul(missCF.y)),
              accB.add(tb.mul(missCF.z))
            )
          );
        });
      });

      const sr = pow(max(outRgb.x, float(0)), float(1.0 / 2.4));
      const sg = pow(max(outRgb.y, float(0)), float(1.0 / 2.4));
      const sb = pow(max(outRgb.z, float(0)), float(1.0 / 2.4));

      textureStore(outTex, uvec2(instanceIndex.mod(outW), instanceIndex.div(outW)), vec4(sr, sg, sb, float(1.0))).toWriteOnly();
      });
    });

    this.computeNode = kernel().compute(outW * outH, [WORKGROUP, 1, 1]);
  }
}
