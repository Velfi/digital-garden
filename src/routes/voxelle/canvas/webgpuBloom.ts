/**
 * WebGPU TSL bloom without PassNode: scene renders once to a single HalfFloat RT (correct
 * `viewportOpaqueMipTexture` for transmission), then `RenderPipeline` composites `scene + bloom`.
 * Bloom is threshold-tuned on the full HDR image (approximates old MRT emissive-only bloom).
 */
import type { Camera, ColorSpace, Scene } from 'three';

/** Full-scene bloom: raise threshold so mostly emissive/glow peaks contribute. */
export const WEBGPU_BLOOM_STRENGTH = 0.38;
export const WEBGPU_BLOOM_RADIUS = 0.26;
export const WEBGPU_BLOOM_THRESHOLD = 0.65;

type WebGPURendererLike = {
  getRenderTarget: () => unknown;
  setRenderTarget: (t: unknown, ...rest: unknown[]) => void;
  getMRT: () => unknown;
  setMRT: (m: unknown) => void;
  render: (s: Scene, c: Camera) => void;
  toneMapping: number;
  outputColorSpace: string;
  getPixelRatio: () => number;
};

export type WebGPUBloomPipeline = {
  renderPipeline: { render(): void; dispose(): void; needsUpdate: boolean };
  bloomPass: { dispose(): void };
  /** HalfFloat scene color + depth; single attachment (no MRT). */
  sceneRenderTarget: { setSize: (w: number, h: number, d?: number) => void; dispose: () => void };
  /** Rasterize scene into `sceneRenderTarget` (restores RT/MRT/tone mapping after). */
  renderSceneToTarget(renderer: WebGPURendererLike, scene: Scene, camera: Camera): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
};

export async function createWebGPUBloomPipeline(
  renderer: unknown,
  _scene: Scene,
  _camera: Camera,
  width: number,
  height: number,
  pixelRatio: number
): Promise<WebGPUBloomPipeline> {
  const [
    {
      RenderPipeline,
      RenderTarget,
      HalfFloatType,
      DepthTexture,
      RGBAFormat,
      LinearFilter,
      NoToneMapping,
      ColorManagement
    },
    { texture },
    { bloom }
  ] = await Promise.all([
    import('three/webgpu'),
    import('three/tsl'),
    import('three/addons/tsl/display/BloomNode.js')
  ]);

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

  const sceneColor = texture(sceneRenderTarget.texture);
  const bloomPass = bloom(
    sceneColor,
    WEBGPU_BLOOM_STRENGTH,
    WEBGPU_BLOOM_RADIUS,
    WEBGPU_BLOOM_THRESHOLD
  );
  const renderPipeline = new RenderPipeline(renderer as ConstructorParameters<typeof RenderPipeline>[0]);
  renderPipeline.outputNode = sceneColor.add(bloomPass);
  renderPipeline.needsUpdate = true;

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

  return {
    renderPipeline,
    bloomPass,
    sceneRenderTarget,
    renderSceneToTarget,
    setSize(nw: number, nh: number, pr: number) {
      const cw = Math.max(1, Math.floor(nw * pr));
      const ch = Math.max(1, Math.floor(nh * pr));
      sceneRenderTarget.setSize(cw, ch, 1);
      renderPipeline.needsUpdate = true;
    },
    dispose() {
      sceneRenderTarget.dispose();
      bloomPass.dispose();
      renderPipeline.dispose();
    }
  };
}
