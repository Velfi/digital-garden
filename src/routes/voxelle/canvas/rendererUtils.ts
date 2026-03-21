import type { WebGLRenderer } from 'three';

/** WebGL path: bloom / EffectComposer / fat lines. */
export function isWebGLRenderer(r: unknown): r is WebGLRenderer {
  return (
    typeof r === 'object' &&
    r !== null &&
    'isWebGLRenderer' in r &&
    (r as { isWebGLRenderer?: boolean }).isWebGLRenderer === true
  );
}

/** WebGPU path (three.js `WebGPURenderer`). */
export function isWebGPURenderer(r: unknown): boolean {
  return (
    typeof r === 'object' &&
    r !== null &&
    'isWebGPURenderer' in r &&
    (r as { isWebGPURenderer?: boolean }).isWebGPURenderer === true
  );
}
