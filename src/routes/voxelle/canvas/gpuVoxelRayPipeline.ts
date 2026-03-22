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
  float,
  floor,
  int,
  instanceIndex,
  max,
  min,
  mul,
  normalize,
  pow,
  shiftRight,
  sign,
  storage,
  textureStore,
  uint,
  uniform,
  uvec2,
  vec3,
  vec4
} from 'three/tsl';

import type { GpuVoxelAccelEmpty, GpuVoxelAccelHash } from './gpuVoxelAccel';
import { MAX_HASH_SLOTS } from './gpuVoxelAccel';

const WORKGROUP = 8;
const MAX_DDA_STEPS = 4096;
const MAX_HASH_PROBES = 4096;
const EPS = 1e-9;

export type GpuRayTraceParams = {
  toLightWorld: [number, number, number];
  sunDiffuseR: number;
  sunDiffuseG: number;
  sunDiffuseB: number;
  ambientR: number;
  ambientG: number;
  ambientB: number;
  backgroundR: number;
  backgroundG: number;
  backgroundB: number;
  enableSky: boolean;
  enableShadows: boolean;
};

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

  setTraceParams(params: GpuRayTraceParams): void {
    this.uToLight.value.set(params.toLightWorld[0], params.toLightWorld[1], params.toLightWorld[2]);
    this.uSunDiffuse.value.set(params.sunDiffuseR, params.sunDiffuseG, params.sunDiffuseB);
    this.uAmbient.value.set(params.ambientR, params.ambientG, params.ambientB);
    this.uBackground.value.set(params.backgroundR, params.backgroundG, params.backgroundB);
    this.uEnableSky.value = params.enableSky ? 1 : 0;
    this.uEnableShadows.value = params.enableShadows ? 1 : 0;
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

      const ox = ro.x.add(rd.x.mul(feps));
      const oy = ro.y.add(rd.y.mul(feps));
      const oz = ro.z.add(rd.z.mul(feps));

      const rdx = rd.x;
      const rdy = rd.y;
      const rdz = rd.z;

      const len = max(float(1e-20), pow(rdx.mul(rdx).add(rdy.mul(rdy)).add(rdz.mul(rdz)), float(0.5)));
      const rdxn = rdx.div(len);
      const rdyn = rdy.div(len);
      const rdzn = rdz.div(len);

      const stepX = abs(rdxn).lessThanEqual(feps)
        .select(int(0), rdxn.greaterThan(float(0)).select(int(1), int(-1)));
      const stepY = abs(rdyn).lessThanEqual(feps)
        .select(int(0), rdyn.greaterThan(float(0)).select(int(1), int(-1)));
      const stepZ = abs(rdzn).lessThanEqual(feps)
        .select(int(0), rdzn.greaterThan(float(0)).select(int(1), int(-1)));

      const tDeltaX = stepX.equal(int(0))
        .select(float(1e30), abs(float(1.0).div(rdxn)));
      const tDeltaY = stepY.equal(int(0))
        .select(float(1e30), abs(float(1.0).div(rdyn)));
      const tDeltaZ = stepZ.equal(int(0))
        .select(float(1e30), abs(float(1.0).div(rdzn)));

      const x = int(floor(ox)).toVar();
      const y = int(floor(oy)).toVar();
      const z = int(floor(oz)).toVar();

      const tMaxX = float().toVar();
      const tMaxY = float().toVar();
      const tMaxZ = float().toVar();

      If(stepX.greaterThan(int(0)), () => {
        tMaxX.assign(float(x.add(1).sub(ox)).div(rdxn));
      }).ElseIf(stepX.lessThan(int(0)), () => {
        tMaxX.assign(float(x.sub(ox)).div(rdxn));
      }).Else(() => {
        tMaxX.assign(float(1e30));
      });

      If(stepY.greaterThan(int(0)), () => {
        tMaxY.assign(float(y.add(1).sub(oy)).div(rdyn));
      }).ElseIf(stepY.lessThan(int(0)), () => {
        tMaxY.assign(float(y.sub(oy)).div(rdyn));
      }).Else(() => {
        tMaxY.assign(float(1e30));
      });

      If(stepZ.greaterThan(int(0)), () => {
        tMaxZ.assign(float(z.add(1).sub(oz)).div(rdzn));
      }).ElseIf(stepZ.lessThan(int(0)), () => {
        tMaxZ.assign(float(z.sub(oz)).div(rdzn));
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

      const hitPacked = uint(0).toVar();
      const hitNx = int(0).toVar();
      const hitNy = int(0).toVar();
      const hitNz = int(0).toVar();
      const found = int(0).toVar();
      const hitDist = float(0).toVar();

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

      If(uHasVoxels.equal(0), () => {
        found.assign(int(0));
      }).Else(() => {
        const startPacked = uint(0).toVar();
        hashProbe(x, y, z, startPacked);

        If(startPacked.notEqual(uint(0)), () => {
          const ax = abs(rdxn);
          const ay = abs(rdyn);
          const az = abs(rdzn);
          If(ax.greaterThanEqual(ay).and(ax.greaterThanEqual(az)), () => {
            hitNx.assign(sign(rdxn).greaterThan(float(0)).select(int(-1), int(1)));
            hitNy.assign(int(0));
            hitNz.assign(int(0));
          })
            .ElseIf(ay.greaterThanEqual(az), () => {
              hitNx.assign(int(0));
              hitNy.assign(sign(rdyn).greaterThan(float(0)).select(int(-1), int(1)));
              hitNz.assign(int(0));
            })
            .Else(() => {
              hitNx.assign(int(0));
              hitNy.assign(int(0));
              hitNz.assign(sign(rdzn).greaterThan(float(0)).select(int(-1), int(1)));
            });
          hitPacked.assign(startPacked);
          found.assign(int(1));
          hitDist.assign(float(0));
        });

        const t = float(0).toVar();
        const maxT = uMaxDist;

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

      const outRgb = vec3().toVar();

      If(found.equal(int(0)), () => {
        If(uEnableSky.equal(0), () => {
          outRgb.assign(uBackground);
        }).Else(() => {
          const tsky = float(v).div(max(float(1), bufHf.sub(1.0)));
          const sky = vec3(0.455, 0.62, 0.855);
          const ground = vec3(0.192, 0.31, 0.4);
          outRgb.assign(sky.mul(float(1).sub(tsky)).add(ground.mul(tsky)));
        });
      }).Else(() => {
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

        const shx = float(1).toVar();
        const shy = float(1).toVar();
        const shz = float(1).toVar();
        If(uEnableShadows.equal(1).and(uHasVoxels.equal(1)), () => {
          const hpx = ro.x.add(rdxn.mul(hitDist)).add(float(hitNx).mul(0.0002));
          const hpy = ro.y.add(rdyn.mul(hitDist)).add(float(hitNy).mul(0.0002));
          const hpz = ro.z.add(rdzn.mul(hitDist)).add(float(hitNz).mul(0.0002));
          const shadowS = float(0.06).toVar();
          Loop(100, () => {
            shadowS.addAssign(float(0.1));
            const sx = int(floor(hpx.add(lx.mul(shadowS))));
            const sy = int(floor(hpy.add(ly.mul(shadowS))));
            const sz = int(floor(hpz.add(lz.mul(shadowS))));
            const pk = uint(0).toVar();
            hashProbe(sx, sy, sz, pk);
            If(pk.notEqual(uint(0)), () => {
              const mtag = shiftRight(pk, uint(24));
              If(mtag.equal(uint(3)), () => {
                const cg2 = bitAnd(pk, uint(0xffffff));
                const crr = float(bitAnd(shiftRight(cg2, uint(16)), uint(255))).div(255.0);
                const cgg = float(bitAnd(shiftRight(cg2, uint(8)), uint(255))).div(255.0);
                const cbb = float(bitAnd(cg2, uint(255))).div(255.0);
                shx.assign(shx.mul(crr.mul(0.9)));
                shy.assign(shy.mul(cgg.mul(0.9)));
                shz.assign(shz.mul(cbb.mul(0.9)));
              }).Else(() => {
                shx.assign(float(0));
                shy.assign(float(0));
                shz.assign(float(0));
                Break();
              });
            });
          });
        });

        const dr = cr.mul(uAmbient.x.add(uSunDiffuse.x.mul(ndotl).mul(shx))).toVar();
        const dg = cg.mul(uAmbient.y.add(uSunDiffuse.y.mul(ndotl).mul(shy))).toVar();
        const db = cb.mul(uAmbient.z.add(uSunDiffuse.z.mul(ndotl).mul(shz))).toVar();

        If(matEnc.equal(uint(2)), () => {
          const hx = rd.x.negate();
          const hy = rd.y.negate();
          const hz = rd.z.negate();
          const reflL = ndotl.mul(nxf).mul(2.0).sub(lx);
          const reflM = ndotl.mul(nyf).mul(2.0).sub(ly);
          const reflN = ndotl.mul(nzf).mul(2.0).sub(lz);
          const spec = max(float(0), hx.mul(reflL).add(hy.mul(reflM)).add(hz.mul(reflN)));
          const sp = pow(spec, float(48)).mul(0.45);
          dr.addAssign(sp.mul(uSunDiffuse.x.add(0.2)).mul(shx));
          dg.addAssign(sp.mul(uSunDiffuse.y.add(0.2)).mul(shy));
          db.addAssign(sp.mul(uSunDiffuse.z.add(0.2)).mul(shz));
        }).ElseIf(matEnc.equal(uint(3)), () => {
          const cosI = max(
            float(0),
            nxf.mul(rd.x).negate().add(nyf.mul(rd.y).negate()).add(nzf.mul(rd.z).negate())
          );
          const R0 = float(0.04);
          const Rf = R0.add(float(1).sub(R0).mul(pow(float(1).sub(cosI), float(5))));
          const Tf = float(1).sub(Rf);
          dr.assign(dr.mul(Tf.mul(0.62)).add(uBackground.x.mul(Rf.mul(0.38))));
          dg.assign(dg.mul(Tf.mul(0.62)).add(uBackground.y.mul(Rf.mul(0.38))));
          db.assign(db.mul(Tf.mul(0.62)).add(uBackground.z.mul(Rf.mul(0.38))));
        }).ElseIf(matEnc.equal(uint(4)), () => {
          dr.addAssign(cr.mul(0.85));
          dg.addAssign(cg.mul(0.85));
          db.addAssign(cb.mul(0.85));
        });

        outRgb.assign(vec3(dr, dg, db));
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
