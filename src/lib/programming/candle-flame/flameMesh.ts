import * as THREE from 'three';
import {
  FLAME_BASE,
  flameEnvelopeWidth,
  flameHeightAt,
  flameLocalRadial,
  plumeAnchor,
  simDisplacement,
  y01FromHeight,
  type PlumeParams
} from './plumeSim';
import { createFlameMaterial, updateFlameMaterialCamera } from './flameMaterial';

export interface FlameMeshBundle {
  mesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  glowMesh: THREE.Mesh;
  update: (params: PlumeParams, camera: THREE.Camera) => void;
  dispose: () => void;
  setWireframe: (enabled: boolean) => void;
}

interface VertexMeta {
  cosTheta: number;
  sinTheta: number;
  y01: number;
}

const LATHE_DETAIL: Record<number, { radial: number; height: number }> = {
  2: { radial: 20, height: 12 },
  3: { radial: 28, height: 16 },
  4: { radial: 36, height: 20 },
  5: { radial: 52, height: 28 }
};

const CAP_STEPS = 6;

/** Quarter-circle foot so the lathe silhouette has a round bottom, not a flat cut. */
function appendFlameCapProfile(profile: THREE.Vector2[], flameHeight: number): number {
  const mergeY01 = 0.09;
  const capR = Math.max(flameEnvelopeWidth(mergeY01), 0.007);
  const capTopY = flameHeightAt(mergeY01, flameHeight);

  for (let i = 0; i <= CAP_STEPS; i++) {
    const theta = (i / CAP_STEPS) * Math.PI * 0.5;
    profile.push(
      new THREE.Vector2(
        capR * Math.sin(theta),
        FLAME_BASE + (capTopY - FLAME_BASE) * (1 - Math.cos(theta))
      )
    );
  }

  return mergeY01;
}

function createFlameLatheGeometry(
  flameHeight: number,
  detail: number
): { geo: THREE.BufferGeometry; meta: VertexMeta[] } {
  const { radial, height } = LATHE_DETAIL[detail] ?? LATHE_DETAIL[3];
  const profile: THREE.Vector2[] = [];
  const mergeY01 = appendFlameCapProfile(profile, flameHeight);
  const startI = Math.max(1, Math.ceil(mergeY01 * height));

  for (let i = startI; i <= height; i++) {
    const y01 = i / height;
    profile.push(new THREE.Vector2(flameEnvelopeWidth(y01), flameHeightAt(y01, flameHeight)));
  }

  const geo = new THREE.LatheGeometry(profile, radial);
  const positions = geo.attributes.position as THREE.BufferAttribute;
  const meta: VertexMeta[] = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const r = Math.hypot(x, z);
    meta.push({
      cosTheta: r > 0.00001 ? x / r : 1,
      sinTheta: r > 0.00001 ? z / r : 0,
      y01: y01FromHeight(y, flameHeight)
    });
  }

  return { geo, meta };
}

function restPoint(meta: VertexMeta, flameHeight: number): [number, number, number, number] {
  const y01 = meta.y01;
  const y = flameHeightAt(y01, flameHeight);
  const width = flameEnvelopeWidth(y01);
  return [meta.cosTheta * width, y, meta.sinTheta * width, y01];
}

export function createFlameMesh(detail = 5): FlameMeshBundle {
  const initialHeight = 0.3;
  const { geo, meta } = createFlameLatheGeometry(initialHeight, detail);
  const count = (geo.attributes.position as THREE.BufferAttribute).count;

  const flameParams = new Float32Array(count * 2);
  geo.setAttribute('aFlameParams', new THREE.BufferAttribute(flameParams, 2));

  const mat = createFlameMaterial('body');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;

  const coreGeo = geo.clone();
  coreGeo.setAttribute(
    'aFlameParams',
    (geo.attributes.aFlameParams as THREE.BufferAttribute).clone()
  );
  const coreMat = createFlameMaterial('core');
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.renderOrder = 3;

  const glowGeo = geo.clone();
  glowGeo.setAttribute(
    'aFlameParams',
    (geo.attributes.aFlameParams as THREE.BufferAttribute).clone()
  );
  const glowMat = createFlameMaterial('glow');
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.renderOrder = 1;

  function update(params: PlumeParams, camera: THREE.Camera) {
    updateFlameMaterialCamera(mat, camera);
    updateFlameMaterialCamera(coreMat, camera);
    updateFlameMaterialCamera(glowMat, camera);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const fp = geo.attributes.aFlameParams as THREE.BufferAttribute;
    const corePos = coreGeo.attributes.position as THREE.BufferAttribute;
    const coreFp = coreGeo.attributes.aFlameParams as THREE.BufferAttribute;
    const glowPos = glowGeo.attributes.position as THREE.BufferAttribute;
    const glowFp = glowGeo.attributes.aFlameParams as THREE.BufferAttribute;

    for (let i = 0; i < count; i++) {
      const m = meta[i];
      const [rx, ry, rz, y01] = restPoint(m, params.flameHeight);

      const [ax, az] = plumeAnchor(ry, params);
      const [dx, dy, dz] = simDisplacement(rx, ry, rz, y01, params);
      const lx = rx + dx;
      const lz = rz + dz;
      const x = ax + lx;
      const y = ry + dy;
      const z = az + lz;

      pos.setXYZ(i, x, y, z);

      const radial = flameLocalRadial(y01, lx, lz);
      fp.setXY(i, y01, radial);
      coreFp.setXY(i, y01, radial * 0.72);

      const glowScale = 1.06 + y01 * 0.1;
      const glowLx = lx * glowScale;
      const glowLz = lz * glowScale;
      glowFp.setXY(i, y01, flameLocalRadial(y01, glowLx, glowLz));

      const corePull = 0.62;
      corePos.setXYZ(i, ax + lx * corePull, y, az + lz * corePull);

      glowPos.setXYZ(i, ax + glowLx, y + FLAME_BASE * 0.004 * (1 - y01), az + glowLz);
    }

    pos.needsUpdate = true;
    fp.needsUpdate = true;
    corePos.needsUpdate = true;
    coreFp.needsUpdate = true;
    glowPos.needsUpdate = true;
    glowFp.needsUpdate = true;
  }

  return {
    mesh,
    coreMesh,
    glowMesh,
    update,
    setWireframe(enabled) {
      mat.wireframe = enabled;
      coreMat.wireframe = enabled;
      glowMat.wireframe = enabled;
    },
    dispose() {
      geo.dispose();
      coreGeo.dispose();
      glowGeo.dispose();
      mat.dispose();
      coreMat.dispose();
      glowMat.dispose();
    }
  };
}
