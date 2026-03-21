/**
 * WebGPU TSL bloom without PassNode: full scene → HalfFloat beauty RT (correct
 * `viewportOpaqueMipTexture` for transmission), glow-only pass → second HalfFloat RT + depth (same as WebGL
 * stash), then `RenderPipeline` composites `beauty + bloom(glow)`.
 */
import type { Camera, ColorSpace, Scene } from 'three';

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
  bloomSourceRenderTarget: { setSize: (w: number, h: number, d?: number) => void; dispose: () => void };
  /** Full scene → beauty RT. */
  renderSceneToTarget(renderer: WebGPURendererLike, scene: Scene, camera: Camera): void;
  /** After non-glow materials are blacked out → bloom source RT (cleared each call). */
  renderBloomSourceToTarget(renderer: WebGPURendererLike, scene: Scene, camera: Camera): void;
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
  const renderPipeline = new RenderPipeline(renderer as ConstructorParameters<typeof RenderPipeline>[0]);
  renderPipeline.outputNode = beautyColor.add(bloomPass);
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
