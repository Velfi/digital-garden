/** Set after `import('three/webgpu')` so THREE.TSL warnings include JS stack traces in dev. */
export function enableThreeNodeStackTracesInDev(webgpuMod: typeof import('three/webgpu')): void {
  if (import.meta.env.DEV) {
    webgpuMod.Node.captureStackTrace = true;
  }
}

let renderPassLabelPatchApplied = false;

/**
 * Three.js WebGPU often leaves `GPURenderPassDescriptor.label` unset; Chrome then reports
 * `RenderPassEncoder (unlabeled)`. Patch once so every pass gets a stable id.
 */
export function ensureWebGpuRenderPassLabels(): void {
  if (renderPassLabelPatchApplied) return;
  if (typeof GPUCommandEncoder === 'undefined') return;
  renderPassLabelPatchApplied = true;
  const orig = GPUCommandEncoder.prototype.beginRenderPass;
  let seq = 0;
  GPUCommandEncoder.prototype.beginRenderPass = function (descriptor: GPURenderPassDescriptor) {
    if (descriptor && !descriptor.label) {
      descriptor.label = `Voxelle renderPass #${++seq}`;
    }
    return orig.call(this, descriptor);
  };
}

let zeroPrimitiveDrawPatchApplied = false;

/**
 * Three.js WebGPU can emit drawIndexed/draw with a primary count of 0 (getDrawParameters allows
 * count === 0). Chrome's validation layer warns; skipping is equivalent to drawing nothing.
 */
export function ensureWebGpuSkipZeroPrimitiveDraws(): void {
  if (zeroPrimitiveDrawPatchApplied) return;
  if (typeof GPURenderPassEncoder === 'undefined') return;
  zeroPrimitiveDrawPatchApplied = true;
  const proto = GPURenderPassEncoder.prototype;
  const origIndexed = proto.drawIndexed;
  const origDraw = proto.draw;
  proto.drawIndexed = function (
    indexCount: GPUIndex32,
    instanceCount?: GPUSize32,
    firstIndex?: GPUIndex32,
    baseVertex?: number,
    firstInstance?: GPUSize32
  ) {
    if (indexCount === 0) return;
    return origIndexed.call(this, indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
  };
  proto.draw = function (
    vertexCount: GPUSize32,
    instanceCount?: GPUSize32,
    firstVertex?: GPUSize32,
    firstInstance?: GPUSize32
  ) {
    if (vertexCount === 0) return;
    return origDraw.call(this, vertexCount, instanceCount, firstVertex, firstInstance);
  };
}

/** Run once per session after `import('three/webgpu')`, before renderer init or TSL builds. */
export function installVoxelleWebGpuPatches(webgpuMod: typeof import('three/webgpu')): void {
  enableThreeNodeStackTracesInDev(webgpuMod);
  ensureWebGpuRenderPassLabels();
  ensureWebGpuSkipZeroPrimitiveDraws();
}
