import { writable } from 'svelte/store';
import { RAY_TRACE_MAX_BUFFER_DIM } from '../canvas/voxelRayProgressive';

export type VoxelleRuntimeMetrics = {
  /** True when `performance.memory` exists (Chromium); false on Safari and most browsers. */
  memoryApiAvailable: boolean;
  jsHeapUsedBytes: number | null;
  jsHeapTotalBytes: number | null;
  jsHeapLimitBytes: number | null;
  /** 0–100 when limit known; null otherwise. */
  heapUsagePercent: number | null;
  /** `performance.now()` when sampled (ms since navigation start; for in-tab debugging only). */
  lastSamplePerfMs: number;
  /** Wall-clock time when sampled (stable in exported JSON). */
  lastSampleAtIso: string | null;
  renderingMode: 'greedy' | 'marchingCubes' | 'dualContour' | 'ray';
  rendererPixelRatio: number;
  /** Effective ray trace DPR (`min(rendererDpr, 1)`), same as `VoxelRayTsl`. */
  rayTracePixelRatio: number | null;
  /** Ray trace internal buffer size after DPR cap (null when not ray mode). */
  rayBufferWidth: number | null;
  rayBufferHeight: number | null;
  filledVoxelCount: number;
  hiddenVoxelCount: number;
};

const initialRuntimeMetrics: VoxelleRuntimeMetrics = {
  memoryApiAvailable: false,
  jsHeapUsedBytes: null,
  jsHeapTotalBytes: null,
  jsHeapLimitBytes: null,
  heapUsagePercent: null,
  lastSamplePerfMs: 0,
  lastSampleAtIso: null,
  renderingMode: 'greedy',
  rendererPixelRatio: 1,
  rayTracePixelRatio: null,
  rayBufferWidth: null,
  rayBufferHeight: null,
  filledVoxelCount: 0,
  hiddenVoxelCount: 0
};

export const voxelleRuntimeMetrics = writable<VoxelleRuntimeMetrics>({ ...initialRuntimeMetrics });

let lastSampleWallMs = 0;
const SAMPLE_INTERVAL_MS = 1000;

type PerfMemory = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

function readPerformanceMemory(): PerfMemory | null {
  if (typeof performance === 'undefined') return null;
  const p = performance as Performance & { memory?: PerfMemory };
  const m = p.memory;
  if (
    !m ||
    typeof m.usedJSHeapSize !== 'number' ||
    typeof m.totalJSHeapSize !== 'number' ||
    typeof m.jsHeapSizeLimit !== 'number'
  ) {
    return null;
  }
  return m;
}

function rayBufferDims(
  mode: VoxelleRuntimeMetrics['renderingMode'],
  containerW: number,
  containerH: number,
  rendererDpr: number,
  rayMaxBufferDim?: number
): {
  rayTracePixelRatio: number | null;
  rayBufferWidth: number | null;
  rayBufferHeight: number | null;
} {
  if (mode !== 'ray') {
    return { rayTracePixelRatio: null, rayBufferWidth: null, rayBufferHeight: null };
  }
  const rayDpr = Math.min(rendererDpr, 1);
  const bufferDimCap = Math.min(
    RAY_TRACE_MAX_BUFFER_DIM,
    Math.max(64, Math.floor(rayMaxBufferDim ?? RAY_TRACE_MAX_BUFFER_DIM))
  );
  let bufW = Math.max(1, Math.round(containerW * rayDpr));
  let bufH = Math.max(1, Math.round(containerH * rayDpr));
  const m = Math.max(bufW, bufH);
  if (m > bufferDimCap) {
    const s = bufferDimCap / m;
    bufW = Math.max(1, Math.round(bufW * s));
    bufH = Math.max(1, Math.round(bufH * s));
  }
  return { rayTracePixelRatio: rayDpr, rayBufferWidth: bufW, rayBufferHeight: bufH };
}

/**
 * Throttled (1s) snapshot for Project stats / debugging. Safe to call every frame from the canvas loop.
 */
export function maybeSampleVoxelleRuntimeMetrics(
  nowMs: number,
  snap: {
    renderingMode: VoxelleRuntimeMetrics['renderingMode'];
    rendererPixelRatio: number;
    containerWidth: number;
    containerHeight: number;
    filledVoxelCount: number;
    hiddenVoxelCount: number;
    rayMaxBufferDim?: number;
  }
): void {
  if (nowMs - lastSampleWallMs < SAMPLE_INTERVAL_MS) return;
  lastSampleWallMs = nowMs;

  const mem = readPerformanceMemory();
  const { rayTracePixelRatio, rayBufferWidth, rayBufferHeight } = rayBufferDims(
    snap.renderingMode,
    snap.containerWidth,
    snap.containerHeight,
    snap.rendererPixelRatio,
    snap.rayMaxBufferDim
  );

  let heapUsagePercent: number | null = null;
  if (mem && mem.jsHeapSizeLimit > 0) {
    heapUsagePercent = Math.min(100, (mem.usedJSHeapSize / mem.jsHeapSizeLimit) * 100);
  }

  voxelleRuntimeMetrics.set({
    memoryApiAvailable: mem !== null,
    jsHeapUsedBytes: mem ? mem.usedJSHeapSize : null,
    jsHeapTotalBytes: mem ? mem.totalJSHeapSize : null,
    jsHeapLimitBytes: mem ? mem.jsHeapSizeLimit : null,
    heapUsagePercent,
    lastSamplePerfMs: nowMs,
    lastSampleAtIso:
      typeof Date !== 'undefined' && typeof Date.now === 'function'
        ? new Date(Date.now()).toISOString()
        : null,
    renderingMode: snap.renderingMode,
    rendererPixelRatio: snap.rendererPixelRatio,
    rayTracePixelRatio,
    rayBufferWidth,
    rayBufferHeight,
    filledVoxelCount: snap.filledVoxelCount,
    hiddenVoxelCount: snap.hiddenVoxelCount
  });
}
