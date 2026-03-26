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
  lastWorkerParseInputMs: number | null;
  lastWorkerMeshComputeMs: number | null;
  /** Undo: keyboard/menu gesture through mesh applied + rendered (see lastUndoSyncDurationMs for main-thread only). */
  lastUndoDurationMs: number | null;
  lastUndoSyncDurationMs: number | null;
  lastRedoDurationMs: number | null;
  lastRedoSyncDurationMs: number | null;
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
  lastWorkerParseInputMs: null,
  lastWorkerMeshComputeMs: null,
  lastUndoDurationMs: null,
  lastUndoSyncDurationMs: null,
  lastRedoDurationMs: null,
  lastRedoSyncDurationMs: null
};

export const projectPerfMetrics = writable<ProjectPerfMetrics>({ ...initialMetrics });

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

let editMeasureDepth = 0;
let pendingEditStartMs: number | null = null;

/** Keyboard (keyup) / menu click start until greedy mesh pipeline finishes. */
let pendingUndoRedoE2E: { kind: 'undo' | 'redo'; startMs: number } | null = null;

/** Call on keyboard shortcut (Ctrl/Cmd+Z/Y) or immediately before menu undo/redo so duration includes gesture → mesh. */
export function markUndoRedoGestureStart(kind: 'undo' | 'redo'): void {
  pendingEditStartMs = null;
  const t0 = nowMs();
  pendingUndoRedoE2E = { kind, startMs: t0 };
  if (kind === 'undo') {
    projectPerfMetrics.update((m) => ({
      ...m,
      lastUndoDurationMs: null,
      lastUndoSyncDurationMs: null
    }));
  } else {
    projectPerfMetrics.update((m) => ({
      ...m,
      lastRedoDurationMs: null,
      lastRedoSyncDurationMs: null
    }));
  }
}

export function clearPendingUndoRedoGesture(): void {
  pendingUndoRedoE2E = null;
}

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
      lastEditResultIndexCount: null,
      lastWorkerParseInputMs: null,
      lastWorkerMeshComputeMs: null
    }));
    editMeasureDepth--;
  }
}

export function markWorkerTimingStats(stats: {
  parseInputMs: number | null;
  meshComputeMs: number | null;
}): void {
  if (pendingEditStartMs === null) return;
  projectPerfMetrics.update((m) => ({
    ...m,
    lastWorkerParseInputMs: stats.parseInputMs,
    lastWorkerMeshComputeMs: stats.meshComputeMs
  }));
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
  if (pendingUndoRedoE2E !== null) {
    const { kind, startMs } = pendingUndoRedoE2E;
    pendingUndoRedoE2E = null;
    pendingEditStartMs = null;
    const total = Math.max(0, renderedAtMs - startMs);
    if (kind === 'undo') {
      projectPerfMetrics.update((m) => ({ ...m, lastUndoDurationMs: total }));
    } else {
      projectPerfMetrics.update((m) => ({ ...m, lastRedoDurationMs: total }));
    }
    return;
  }
  if (pendingEditStartMs === null) return;
  const total = Math.max(0, renderedAtMs - pendingEditStartMs);
  pendingEditStartMs = null;
  projectPerfMetrics.update((m) => ({ ...m, lastEditDurationMs: total }));
}

export function measureUndoDuration<T>(fn: () => T): T {
  const t0 = nowMs();
  if (pendingUndoRedoE2E === null) {
    pendingEditStartMs = null;
    pendingUndoRedoE2E = { kind: 'undo', startMs: t0 };
    projectPerfMetrics.update((m) => ({
      ...m,
      lastUndoDurationMs: null,
      lastUndoSyncDurationMs: null
    }));
  }
  try {
    return fn();
  } finally {
    const dt = Math.max(0, nowMs() - t0);
    projectPerfMetrics.update((m) => ({ ...m, lastUndoSyncDurationMs: dt }));
  }
}

export function measureRedoDuration<T>(fn: () => T): T {
  const t0 = nowMs();
  if (pendingUndoRedoE2E === null) {
    pendingEditStartMs = null;
    pendingUndoRedoE2E = { kind: 'redo', startMs: t0 };
    projectPerfMetrics.update((m) => ({
      ...m,
      lastRedoDurationMs: null,
      lastRedoSyncDurationMs: null
    }));
  }
  try {
    return fn();
  } finally {
    const dt = Math.max(0, nowMs() - t0);
    projectPerfMetrics.update((m) => ({ ...m, lastRedoSyncDurationMs: dt }));
  }
}
