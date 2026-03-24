/**
 * Bootstrapping pieces for VoxelCanvas onMount; keeps scene wiring in the component.
 */
import * as THREE from 'three';
import { getShareFromIndexedDB } from '../shareStorage';

/** High enough that ~1 voxel/cell leaves several texels between lines (512 was ~2px/cell → stroked lines merged into a solid mesh). */
export const PRECISE_GUIDE_TEX_SIZE = 2560;

export async function loadVoxelCanvasBootstrapModel(options: {
  loadFromBytes: (bytes: Uint8Array) => Promise<boolean>;
  loadFromStorageAsync: () => Promise<boolean>;
  initCanvas: (gridSize: number) => void;
  getGridSize: () => number;
}): Promise<{ fromUrl: boolean; loadedFromStorage: boolean }> {
  let fromUrl = false;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('m');
    if (id) {
      const isLocalhost = window.location.hostname === 'localhost';
      if (isLocalhost) {
        try {
          const modelBase64 = await getShareFromIndexedDB(id);
          if (modelBase64) {
            const binary = atob(modelBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            fromUrl = await options.loadFromBytes(bytes);
          }
        } catch {
          // ignore
        }
      }
      if (!fromUrl) {
        try {
          const res = await fetch(`/api/voxelle/model/${id}`);
          if (res.ok) {
            const bytes = new Uint8Array(await res.arrayBuffer());
            fromUrl = await options.loadFromBytes(bytes);
          }
        } catch {
          // ignore
        }
      }
    }
  }
  const loadedFromStorage = !fromUrl && (await options.loadFromStorageAsync());
  if (!fromUrl && !loadedFromStorage) options.initCanvas(options.getGridSize());
  return { fromUrl, loadedFromStorage };
}

export function createPreciseGuidePlaneInScene(scene: THREE.Scene): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  texture: THREE.CanvasTexture;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
} {
  const preciseGuidePlaneCanvas = document.createElement('canvas');
  preciseGuidePlaneCanvas.width = PRECISE_GUIDE_TEX_SIZE;
  preciseGuidePlaneCanvas.height = PRECISE_GUIDE_TEX_SIZE;
  const preciseGuidePlaneCtx = preciseGuidePlaneCanvas.getContext('2d', { alpha: true });
  const preciseGuidePlaneTexture = new THREE.CanvasTexture(preciseGuidePlaneCanvas);
  preciseGuidePlaneTexture.generateMipmaps = false;
  // Nearest keeps 1px canvas strokes sharp on the scaled plane; linear filtering reads as thick/blurry grid dots.
  preciseGuidePlaneTexture.minFilter = THREE.NearestFilter;
  preciseGuidePlaneTexture.magFilter = THREE.NearestFilter;
  preciseGuidePlaneTexture.wrapS = THREE.ClampToEdgeWrapping;
  preciseGuidePlaneTexture.wrapT = THREE.ClampToEdgeWrapping;
  const preciseGuidePlaneMaterial = new THREE.MeshBasicMaterial({
    map: preciseGuidePlaneTexture,
    color: 0xffffff,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false
  });
  const preciseGuidePlaneMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    preciseGuidePlaneMaterial
  );
  preciseGuidePlaneMesh.visible = false;
  preciseGuidePlaneMesh.frustumCulled = false;
  preciseGuidePlaneMesh.renderOrder = -2;
  preciseGuidePlaneMesh.raycast = () => {};
  scene.add(preciseGuidePlaneMesh);
  return {
    canvas: preciseGuidePlaneCanvas,
    ctx: preciseGuidePlaneCtx,
    texture: preciseGuidePlaneTexture,
    material: preciseGuidePlaneMaterial,
    mesh: preciseGuidePlaneMesh
  };
}
