import { writable } from 'svelte/store';

export type ProjectPerfMetrics = {
  /** End-to-end edit latency: commit -> mesh applied/rendered. */
  lastEditDurationMs: number | null;
  /** Synchronous edit mutation/undo bookkeeping time on main thread. */
  lastEditSyncDurationMs: number | null;
  /** Delay from edit commit to mesh worker request post. */
  lastEditRequestDelayMs: number | null;
  /** Worker round-trip (postMessage -> onmessage). */
  lastEditWorkerRoundTripMs: number | null;
  /** Main-thread mesh apply duration. */
  lastEditApplyDurationMs: number | null;
  lastEditDirtyChunkCount: number | null;
  lastEditHaloChunkCount: number | null;
  lastEditChangedBucketCount: number | null;
  lastEditResultVertexCount: number | null;
  lastEditResultIndexCount: number | null;
  lastUndoDurationMs: number | null;
  lastRedoDurationMs: number | null;
};

const initialMetrics: ProjectPerfMetrics = {
  lastEditDurationMs: null,
  lastEditSyncDurationMs: null,
  lastEditRequestDelayMs: null,
  lastEditWorkerRoundTripMs: null,
  lastEditApplyDurationMs: null,
  lastEditDirtyChunkCount: null,
  lastEditHaloChunkCount: null,
  lastEditChangedBucketCount: null,
  lastEditResultVertexCount: null,
  lastEditResultIndexCount: null,
  lastUndoDurationMs: null,
  lastRedoDurationMs: null
};

export const projectPerfMetrics = writable<ProjectPerfMetrics>({ ...initialMetrics });

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

let editMeasureDepth = 0;
let pendingEditStartMs: number | null = null;

export function measureEditDuration<T>(fn: () => T): T {
  if (editMeasureDepth > 0) return fn();
  editMeasureDepth++;
  const t0 = nowMs();
  try {
    return fn();
  } finally {
    const dt = Math.max(0, nowMs() - t0);
    pendingEditStartMs = t0;
    projectPerfMetrics.update((m) => ({
      ...m,
      lastEditDurationMs: dt,
      lastEditSyncDurationMs: dt,
      lastEditRequestDelayMs: null,
      lastEditWorkerRoundTripMs: null,
      lastEditApplyDurationMs: null,
      lastEditDirtyChunkCount: null,
      lastEditHaloChunkCount: null,
      lastEditChangedBucketCount: null,
      lastEditResultVertexCount: null,
      lastEditResultIndexCount: null
    }));
    editMeasureDepth--;
  }
}

export function markEditTransferStats(stats: {
  dirtyChunkCount: number | null;
  haloChunkCount: number | null;
}): void {
  if (pendingEditStartMs === null) return;
  projectPerfMetrics.update((m) => ({
    ...m,
    lastEditDirtyChunkCount: stats.dirtyChunkCount,
    lastEditHaloChunkCount: stats.haloChunkCount
  }));
}

export function markEditResultStats(stats: {
  changedBucketCount: number | null;
  resultVertexCount: number;
  resultIndexCount: number;
}): void {
  if (pendingEditStartMs === null) return;
  projectPerfMetrics.update((m) => ({
    ...m,
    lastEditChangedBucketCount: stats.changedBucketCount,
    lastEditResultVertexCount: stats.resultVertexCount,
    lastEditResultIndexCount: stats.resultIndexCount
  }));
}

export function markEditMeshRequested(requestStartedAtMs: number): void {
  if (pendingEditStartMs === null) return;
  projectPerfMetrics.update((m) => ({
    ...m,
    lastEditRequestDelayMs: Math.max(0, requestStartedAtMs - pendingEditStartMs!)
  }));
}

export function markEditWorkerRoundTrip(roundTripMs: number): void {
  if (pendingEditStartMs === null) return;
  projectPerfMetrics.update((m) => ({
    ...m,
    lastEditWorkerRoundTripMs: Math.max(0, roundTripMs)
  }));
}

export function markEditApplyDuration(applyMs: number): void {
  if (pendingEditStartMs === null) return;
  projectPerfMetrics.update((m) => ({
    ...m,
    lastEditApplyDurationMs: Math.max(0, applyMs)
  }));
}

export function markEditRendered(renderedAtMs: number): void {
  if (pendingEditStartMs === null) return;
  const total = Math.max(0, renderedAtMs - pendingEditStartMs);
  pendingEditStartMs = null;
  projectPerfMetrics.update((m) => ({ ...m, lastEditDurationMs: total }));
}

export function measureUndoDuration<T>(fn: () => T): T {
  const t0 = nowMs();
  try {
    return fn();
  } finally {
    const dt = Math.max(0, nowMs() - t0);
    projectPerfMetrics.update((m) => ({ ...m, lastUndoDurationMs: dt }));
  }
}

export function measureRedoDuration<T>(fn: () => T): T {
  const t0 = nowMs();
  try {
    return fn();
  } finally {
    const dt = Math.max(0, nowMs() - t0);
    projectPerfMetrics.update((m) => ({ ...m, lastRedoDurationMs: dt }));
  }
}

