import * as THREE from 'three';
import { buildBvh } from './ptBvh';

// Flatten a THREE.Group (from assembleBadgeMesh) into GPU-friendly
// triangle + material tables. Each mesh in the group contributes
// triangles whose per-vertex positions and normals are concatenated into
// two RGBA32F textures (3 texels per triangle). Per-triangle material id
// lives in a third R16UI texture, and per-material parameters in a 2-texel
// RGBA32F material table.
//
// Positions are baked into *world space* at pack time — the mesh rotations
// in assembleBadgeMesh (rotation.x = -pi/2) plus the per-mesh
// position.y = baseThickness offsets are applied here once, so the path
// tracer works purely in world coordinates with no per-triangle matrix
// uniform. Rebuilding is cheap (one texture upload) so we can afford to
// redo it on any topology change.

export type PtMaterial = {
  // RGB in [0,1]
  baseColor: [number, number, number];
  // 0..1
  metalness: number;
  // 0..1 (linear roughness; Three's MeshPhysicalMaterial uses this directly)
  roughness: number;
  // 0..1 clearcoat intensity
  clearcoat: number;
  // 0..1 clearcoat roughness
  clearcoatRoughness: number;
  // bit 0 = isGlitter, bit 1 = isMetallicEnamel, bit 2 = isDielectric,
  // bit 3 = isGroundPlane (pure matte shadow catcher), bit 4 = isEnamelStack
  // (dielectric top coat + tinted substrate, uses absorption)
  flags: number;
  // Index of refraction. Only read when the dielectric flag is set.
  // Typical values: 1.5 (glass/resin/enamel), 1.33 (water), 2.4 (diamond).
  ior: number;
  // Volumetric absorption (Beer-Lambert). Shader applies exp(-absorption * t)
  // to the throughput across each transmitted ray segment, where `t` is the
  // path length inside the medium. Only meaningful for dielectrics. Units:
  // mm^-1 in the scene's world space (badges are modelled in mm).
  absorption: [number, number, number];
};

export type PtScenePayload = {
  triCount: number;
  materialCount: number;
  // RGBA32F, 3 texels per triangle (vertex positions v0, v1, v2). W-channel
  // unused for now — reserved for per-vertex UVs when we need them.
  triPositionsTex: THREE.DataTexture;
  triPositionsWidth: number;
  triPositionsHeight: number;
  // RGBA32F, 3 texels per triangle (vertex normals n0, n1, n2).
  triNormalsTex: THREE.DataTexture;
  triNormalsWidth: number;
  triNormalsHeight: number;
  // R16UI, 1 texel per triangle.
  triMaterialIdTex: THREE.DataTexture;
  triMaterialIdWidth: number;
  triMaterialIdHeight: number;
  // RGBA32F, 4 texels per material.
  //   texel 0: (baseColor.r, baseColor.g, baseColor.b, metalness)
  //   texel 1: (roughness, clearcoat, clearcoatRoughness, flags)
  //   texel 2: (ior, _, _, _)           — dielectric params
  //   texel 3: (absorption.r, .g, .b, _) — Beer-Lambert sigma_a, per mm
  materialTableTex: THREE.DataTexture;
  materialTableWidth: number;
  materialTableHeight: number;
  // World-space bbox of all packed triangles — used by the shader for a
  // bounding-sphere early-out on the ray test.
  bbox: THREE.Box3;

  // --- SAH BVH acceleration ---
  // Depth-first, stackless (miss-link) layout. See ptBvh.ts for the
  // node encoding. Each interior node's left child is at nodeIdx+1; on
  // AABB miss (or leaf completion) traversal jumps to the stored miss
  // link. Sentinel miss link == nodeCount terminates traversal.
  bvhNodeCount: number;
  bvhNodesTex: THREE.DataTexture;
  bvhNodesWidth: number;
  bvhNodesHeight: number;
  bvhPrimIndicesTex: THREE.DataTexture;
  bvhPrimIndicesWidth: number;
  bvhPrimIndicesHeight: number;

  dispose(): void;
};

// Extract MeshPhysicalMaterial parameters into a flat PtMaterial record.
// Values not set on the material fall back to three's defaults.
function materialParams(mat: THREE.Material): PtMaterial {
  // MeshStandardMaterial is the common ancestor of MeshPhysicalMaterial
  // and exposes metalness/roughness. Clearcoat lives on MeshPhysicalMaterial.
  const std = mat as THREE.MeshStandardMaterial;
  const phys = mat as THREE.MeshPhysicalMaterial;
  const col = (std.color ?? new THREE.Color(0xcccccc)).clone();
  // userData.ptFlags is set by the scene builder for glitter / metallic
  // enamel so the path tracer can branch without the shader having to
  // reason about onBeforeCompile's glitter injection (which only exists
  // in the raster render).
  let flags = typeof mat.userData?.ptFlags === 'number' ? mat.userData.ptFlags : 0;
  // Auto-detect dielectric from MeshPhysicalMaterial.transmission so any
  // existing glass/resin material that sets `transmission > 0` is picked
  // up by the path tracer without a scene-builder change. Callers can
  // also force the bit (4) directly via userData.ptFlags.
  const transmission = (phys.transmission ?? 0) as number;
  if (transmission > 0) flags |= 4;
  const ior = (phys.ior ?? 1.5) as number;
  // Absorption is propagated via userData.ptAbsorption — the mesh assembler
  // sets it for enamel stacks so the resin's top-coat darkens the substrate
  // colour the long way through the meniscus without requiring a Three
  // material property that isn't otherwise used.
  const absUD = mat.userData?.ptAbsorption as
    | [number, number, number]
    | { r: number; g: number; b: number }
    | undefined;
  let absorption: [number, number, number] = [0, 0, 0];
  if (Array.isArray(absUD)) absorption = [absUD[0], absUD[1], absUD[2]];
  else if (absUD && 'r' in absUD) absorption = [absUD.r, absUD.g, absUD.b];
  return {
    baseColor: [col.r, col.g, col.b],
    metalness: std.metalness ?? 0,
    roughness: std.roughness ?? 0.5,
    clearcoat: phys.clearcoat ?? 0,
    clearcoatRoughness: phys.clearcoatRoughness ?? 0,
    flags,
    ior,
    absorption
  };
}

// Stable stringified key for material de-duplication across the scene.
function materialKey(m: PtMaterial): string {
  return `${m.baseColor[0]}|${m.baseColor[1]}|${m.baseColor[2]}|${m.metalness}|${m.roughness}|${m.clearcoat}|${m.clearcoatRoughness}|${m.flags}|${m.ior}|${m.absorption[0]}|${m.absorption[1]}|${m.absorption[2]}`;
}

export type PackSceneOptions = {
  // Pad the ground plane radius beyond the badge's XZ extent. The ground
  // lives at bbox.min.y and extends this many world units past the bbox
  // in X and Z. Large values avoid a visible plane edge for wide-angle
  // rays, small values keep the BVH tight. 200mm covers any reasonable
  // badge + lens combination without polluting the root AABB.
  groundPadding?: number;
  // When false, no ground plane is emitted. Useful for previews or for
  // setups where the host wants its own traced floor.
  addGround?: boolean;
};

export function packScene(group: THREE.Group, opts: PackSceneOptions = {}): PtScenePayload {
  group.updateMatrixWorld(true);
  const groundPadding = opts.groundPadding ?? 200;
  const addGround = opts.addGround ?? true;

  // Pass 1: collect triangles and their material ids.
  const positions: number[] = [];
  const normals: number[] = [];
  const matIds: number[] = [];
  const materials: PtMaterial[] = [];
  const materialIndex = new Map<string, number>();
  const bbox = new THREE.Box3();

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const n0 = new THREE.Vector3();
  const n1 = new THREE.Vector3();
  const n2 = new THREE.Vector3();
  const normalMat = new THREE.Matrix3();

  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geom = mesh.geometry;
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | undefined;
    const normAttr = geom.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!posAttr) return;

    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    // Skip shadow-catcher and similar non-shaded materials — they exist
    // only to receive raster shadows and aren't meant to appear in a
    // photoreal trace. The HDRI provides the lighting directly.
    if ((mat as THREE.Material).type === 'ShadowMaterial') return;
    const matRec = materialParams(mat);
    const key = materialKey(matRec);
    let matId = materialIndex.get(key);
    if (matId === undefined) {
      matId = materials.length;
      materials.push(matRec);
      materialIndex.set(key, matId);
    }

    const idxAttr = geom.getIndex();
    const triCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3;

    // Normal-transform matrix for world-space normals. We bake the rotation
    // + non-uniform scale (if any) into the uploaded normals so the shader
    // doesn't carry a per-tri basis.
    normalMat.getNormalMatrix(mesh.matrixWorld);

    for (let t = 0; t < triCount; t++) {
      const ia = idxAttr ? idxAttr.getX(t * 3) : t * 3;
      const ib = idxAttr ? idxAttr.getX(t * 3 + 1) : t * 3 + 1;
      const ic = idxAttr ? idxAttr.getX(t * 3 + 2) : t * 3 + 2;

      v0.fromBufferAttribute(posAttr, ia).applyMatrix4(mesh.matrixWorld);
      v1.fromBufferAttribute(posAttr, ib).applyMatrix4(mesh.matrixWorld);
      v2.fromBufferAttribute(posAttr, ic).applyMatrix4(mesh.matrixWorld);

      if (normAttr) {
        n0.fromBufferAttribute(normAttr, ia).applyMatrix3(normalMat).normalize();
        n1.fromBufferAttribute(normAttr, ib).applyMatrix3(normalMat).normalize();
        n2.fromBufferAttribute(normAttr, ic).applyMatrix3(normalMat).normalize();
      } else {
        // Derive a face normal when the mesh has no normal attribute.
        const e1 = new THREE.Vector3().subVectors(v1, v0);
        const e2 = new THREE.Vector3().subVectors(v2, v0);
        const fn = e1.cross(e2).normalize();
        n0.copy(fn);
        n1.copy(fn);
        n2.copy(fn);
      }

      positions.push(v0.x, v0.y, v0.z, 0);
      positions.push(v1.x, v1.y, v1.z, 0);
      positions.push(v2.x, v2.y, v2.z, 0);
      normals.push(n0.x, n0.y, n0.z, 0);
      normals.push(n1.x, n1.y, n1.z, 0);
      normals.push(n2.x, n2.y, n2.z, 0);
      matIds.push(matId);

      bbox.expandByPoint(v0);
      bbox.expandByPoint(v1);
      bbox.expandByPoint(v2);
    }
  });

  // Inject a large ground plane so the path tracer sees the badge sitting on
  // a surface. Without this the HDRI shows through below the horizon and the
  // badge reads as floating. We pick the plane height from the badge's bbox
  // and extend it far enough that the plane's edge never enters the frame
  // for plausible camera distances.
  if (addGround && !bbox.isEmpty()) {
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const centre = new THREE.Vector3();
    bbox.getCenter(centre);
    const halfX = Math.max(size.x, size.z) * 0.5 + groundPadding;
    const halfZ = halfX;
    const gy = bbox.min.y - 0.05; // hairline below so the badge clearly sits on it

    const groundMat: PtMaterial = {
      // Warm ivory sweep, closer to catalog / mockup lighting than neutral
      // grey. Kept under pure white so plated highlights still pop brighter
      // than the ground.
      baseColor: [0.9, 0.875, 0.84],
      metalness: 0,
      roughness: 1,
      clearcoat: 0,
      clearcoatRoughness: 0,
      flags: 8, // bit 3 = isGroundPlane
      ior: 1.5,
      absorption: [0, 0, 0]
    };
    const gKey = materialKey(groundMat);
    let gId = materialIndex.get(gKey);
    if (gId === undefined) {
      gId = materials.length;
      materials.push(groundMat);
      materialIndex.set(gKey, gId);
    }

    // Two triangles forming a quad centered on the badge's XZ centre. Normals
    // point straight up so grazing rays still hit with a valid shading normal.
    const x0 = centre.x - halfX;
    const x1 = centre.x + halfX;
    const z0 = centre.z - halfZ;
    const z1 = centre.z + halfZ;
    const up = [0, 1, 0];
    // tri 1: (x0,z0) (x1,z0) (x1,z1)
    positions.push(x0, gy, z0, 0, x1, gy, z0, 0, x1, gy, z1, 0);
    normals.push(...up, 0, ...up, 0, ...up, 0);
    matIds.push(gId);
    bbox.expandByPoint(new THREE.Vector3(x0, gy, z0));
    bbox.expandByPoint(new THREE.Vector3(x1, gy, z1));
    // tri 2: (x0,z0) (x1,z1) (x0,z1)
    positions.push(x0, gy, z0, 0, x1, gy, z1, 0, x0, gy, z1, 0);
    normals.push(...up, 0, ...up, 0, ...up, 0);
    matIds.push(gId);
  }

  const triCount = matIds.length;
  if (triCount === 0) {
    // Empty scene: produce a 1-triangle degenerate payload so the shader
    // and uniform bindings stay well-formed.
    positions.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    normals.push(0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0);
    matIds.push(0);
    materials.push({
      baseColor: [0.5, 0.5, 0.5],
      metalness: 0,
      roughness: 1,
      clearcoat: 0,
      clearcoatRoughness: 0,
      flags: 0,
      ior: 1.5,
      absorption: [0, 0, 0]
    });
  }

  const realTriCount = matIds.length;

  // Textures. RGBA32F for positions/normals, R16UI for material ids, RGBA32F
  // for the material table. Sized as roughly-square power-of-two atlases so
  // driver NPOT quirks don't bite.
  const posTexelCount = realTriCount * 3;
  const posW = nextPow2(Math.max(64, Math.ceil(Math.sqrt(posTexelCount))));
  const posH = Math.max(1, Math.ceil(posTexelCount / posW));
  const posData = new Float32Array(posW * posH * 4);
  posData.set(positions);
  const triPositionsTex = makeFloatTex(posData, posW, posH);

  const nrmData = new Float32Array(posW * posH * 4);
  nrmData.set(normals);
  const triNormalsTex = makeFloatTex(nrmData, posW, posH);

  const matIdW = nextPow2(Math.max(64, Math.ceil(Math.sqrt(realTriCount))));
  const matIdH = Math.max(1, Math.ceil(realTriCount / matIdW));
  const matIdData = new Uint16Array(matIdW * matIdH);
  matIdData.set(matIds);
  const triMaterialIdTex = makeU16Tex(matIdData, matIdW, matIdH);

  const matTexelsPerMat = 4;
  const matTableTexels = materials.length * matTexelsPerMat;
  const matW = nextPow2(Math.max(16, Math.ceil(Math.sqrt(matTableTexels))));
  const matH = Math.max(1, Math.ceil(matTableTexels / matW));
  const matData = new Float32Array(matW * matH * 4);
  for (let i = 0; i < materials.length; i++) {
    const m = materials[i];
    const o = i * matTexelsPerMat * 4;
    matData[o + 0] = m.baseColor[0];
    matData[o + 1] = m.baseColor[1];
    matData[o + 2] = m.baseColor[2];
    matData[o + 3] = m.metalness;
    matData[o + 4] = m.roughness;
    matData[o + 5] = m.clearcoat;
    matData[o + 6] = m.clearcoatRoughness;
    matData[o + 7] = m.flags;
    matData[o + 8] = m.ior;
    matData[o + 9] = 0;
    matData[o + 10] = 0;
    matData[o + 11] = 0;
    matData[o + 12] = m.absorption[0];
    matData[o + 13] = m.absorption[1];
    matData[o + 14] = m.absorption[2];
    matData[o + 15] = 0;
  }
  const materialTableTex = makeFloatTex(matData, matW, matH);

  if (bbox.isEmpty()) bbox.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));

  // --- Build BVH ---
  const bvh = buildBvh(positions, realTriCount);

  return {
    triCount: realTriCount,
    materialCount: materials.length,
    triPositionsTex,
    triPositionsWidth: posW,
    triPositionsHeight: posH,
    triNormalsTex,
    triNormalsWidth: posW,
    triNormalsHeight: posH,
    triMaterialIdTex,
    triMaterialIdWidth: matIdW,
    triMaterialIdHeight: matIdH,
    materialTableTex,
    materialTableWidth: matW,
    materialTableHeight: matH,
    bbox,
    bvhNodeCount: bvh.nodeCount,
    bvhNodesTex: bvh.nodesTex,
    bvhNodesWidth: bvh.nodesWidth,
    bvhNodesHeight: bvh.nodesHeight,
    bvhPrimIndicesTex: bvh.primIndicesTex,
    bvhPrimIndicesWidth: bvh.primIndicesWidth,
    bvhPrimIndicesHeight: bvh.primIndicesHeight,
    dispose() {
      triPositionsTex.dispose();
      triNormalsTex.dispose();
      triMaterialIdTex.dispose();
      materialTableTex.dispose();
      bvh.dispose();
    }
  };
}

function makeFloatTex(data: Float32Array, w: number, h: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.internalFormat = 'RGBA32F';
  tex.needsUpdate = true;
  return tex;
}

function makeU16Tex(data: Uint16Array, w: number, h: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    data,
    w,
    h,
    THREE.RedIntegerFormat,
    THREE.UnsignedShortType
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.internalFormat = 'R16UI';
  tex.needsUpdate = true;
  return tex;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
