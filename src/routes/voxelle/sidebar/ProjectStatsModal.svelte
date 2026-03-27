<script lang="ts">
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import {
    gridSize,
    voxels,
    hiddenVoxels,
    projectPerfMetrics,
    voxelleRuntimeMetrics
  } from '../store/index';
  import type { ProjectPerfMetrics } from '../store/projectPerf';
  import type { VoxelleRuntimeMetrics } from '../store/runtimeMetrics';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let copyJsonLabel = $state('Copy JSON');
  let copyJsonTimer: ReturnType<typeof setTimeout> | null = null;
  /** Refreshes "sample age" row while the dialog is open. */
  let sampleAgeTick = $state(0);

  onDestroy(() => {
    if (copyJsonTimer !== null) clearTimeout(copyJsonTimer);
  });

  $effect(() => {
    if (!open) return;
    const id = setInterval(() => {
      sampleAgeTick = performance.now();
    }, 250);
    return () => clearInterval(id);
  });

  function formatBytes(n: number | null): string {
    if (n === null || !Number.isFinite(n)) return 'n/a';
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  }

  /** Avoid float noise like 26.999999999992724 in exported JSON. */
  function roundMs(n: number | null): number | null {
    if (n === null || !Number.isFinite(n)) return n;
    return Math.round(n * 100) / 100;
  }

  function projectPerfMetricsForExport(m: ProjectPerfMetrics): ProjectPerfMetrics {
    return {
      ...m,
      lastEditDurationMs: roundMs(m.lastEditDurationMs),
      lastEditSyncDurationMs: roundMs(m.lastEditSyncDurationMs),
      lastEditRequestDelayMs: roundMs(m.lastEditRequestDelayMs),
      lastEditWorkerRoundTripMs: roundMs(m.lastEditWorkerRoundTripMs),
      lastEditApplyDurationMs: roundMs(m.lastEditApplyDurationMs),
      lastWorkerParseInputMs: roundMs(m.lastWorkerParseInputMs),
      lastWorkerMeshComputeMs: roundMs(m.lastWorkerMeshComputeMs),
      lastUndoDurationMs: roundMs(m.lastUndoDurationMs),
      lastUndoSyncDurationMs: roundMs(m.lastUndoSyncDurationMs),
      lastRedoDurationMs: roundMs(m.lastRedoDurationMs),
      lastRedoSyncDurationMs: roundMs(m.lastRedoSyncDurationMs)
    };
  }

  function runtimeMetricsForExport(r: VoxelleRuntimeMetrics): VoxelleRuntimeMetrics {
    return {
      ...r,
      lastSamplePerfMs: Number.isFinite(r.lastSamplePerfMs)
        ? Math.round(r.lastSamplePerfMs)
        : r.lastSamplePerfMs,
      heapUsagePercent: roundMs(r.heapUsagePercent),
      rendererPixelRatio: Math.round(r.rendererPixelRatio * 1000) / 1000,
      rayTracePixelRatio:
        r.rayTracePixelRatio === null
          ? null
          : Math.round(r.rayTracePixelRatio * 1000) / 1000
    };
  }

  async function copyStatsAsJson() {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    const payload = {
      gridSize: get(gridSize),
      filledVoxelCount: get(voxels).size + get(hiddenVoxels).size,
      ...projectPerfMetricsForExport(get(projectPerfMetrics)),
      runtime: runtimeMetricsForExport(get(voxelleRuntimeMetrics))
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      copyJsonLabel = 'Copied!';
      if (copyJsonTimer !== null) clearTimeout(copyJsonTimer);
      copyJsonTimer = setTimeout(() => {
        copyJsonLabel = 'Copy JSON';
        copyJsonTimer = null;
      }, 2000);
    } catch {
      /* ignore clipboard errors */
    }
  }

  const filledVoxelCount = $derived($voxels.size + $hiddenVoxels.size);
  const gridSizeLabel = $derived(`${$gridSize} x ${$gridSize} x ${$gridSize}`);
  const lastEditDurationLabel = $derived(
    $projectPerfMetrics.lastEditDurationMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditDurationMs.toFixed(2)} ms`
  );
  const lastUndoDurationLabel = $derived(
    $projectPerfMetrics.lastUndoDurationMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastUndoDurationMs.toFixed(2)} ms`
  );
  const lastRedoDurationLabel = $derived(
    $projectPerfMetrics.lastRedoDurationMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastRedoDurationMs.toFixed(2)} ms`
  );
  const lastUndoSyncDurationLabel = $derived(
    $projectPerfMetrics.lastUndoSyncDurationMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastUndoSyncDurationMs.toFixed(2)} ms`
  );
  const lastRedoSyncDurationLabel = $derived(
    $projectPerfMetrics.lastRedoSyncDurationMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastRedoSyncDurationMs.toFixed(2)} ms`
  );
  const lastEditSyncDurationLabel = $derived(
    $projectPerfMetrics.lastEditSyncDurationMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditSyncDurationMs.toFixed(2)} ms`
  );
  const lastEditRequestDelayLabel = $derived(
    $projectPerfMetrics.lastEditRequestDelayMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditRequestDelayMs.toFixed(2)} ms`
  );
  const lastEditWorkerRoundTripLabel = $derived(
    $projectPerfMetrics.lastEditWorkerRoundTripMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditWorkerRoundTripMs.toFixed(2)} ms`
  );
  const lastEditApplyDurationLabel = $derived(
    $projectPerfMetrics.lastEditApplyDurationMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditApplyDurationMs.toFixed(2)} ms`
  );
  const lastEditDirtyChunksLabel = $derived(
    $projectPerfMetrics.lastEditDirtyChunkCount === null
      ? 'full rebuild'
      : `${$projectPerfMetrics.lastEditDirtyChunkCount}`
  );
  const lastEditHaloChunksLabel = $derived(
    $projectPerfMetrics.lastEditHaloChunkCount === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditHaloChunkCount}`
  );
  const lastEditChangedBucketsLabel = $derived(
    $projectPerfMetrics.lastEditChangedBucketCount === null
      ? 'full rebuild'
      : `${$projectPerfMetrics.lastEditChangedBucketCount}`
  );
  const lastEditResultVerticesLabel = $derived(
    $projectPerfMetrics.lastEditResultVertexCount === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditResultVertexCount}`
  );
  const lastEditResultIndicesLabel = $derived(
    $projectPerfMetrics.lastEditResultIndexCount === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastEditResultIndexCount}`
  );
  const lastWorkerParseInputLabel = $derived(
    $projectPerfMetrics.lastWorkerParseInputMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastWorkerParseInputMs.toFixed(2)} ms`
  );
  const lastWorkerMeshComputeLabel = $derived(
    $projectPerfMetrics.lastWorkerMeshComputeMs === null
      ? 'n/a'
      : `${$projectPerfMetrics.lastWorkerMeshComputeMs.toFixed(2)} ms`
  );

  const memoryApiLabel = $derived(
    $voxelleRuntimeMetrics.memoryApiAvailable ? 'available' : 'unavailable (e.g. Safari)'
  );
  const jsHeapUsedLabel = $derived(formatBytes($voxelleRuntimeMetrics.jsHeapUsedBytes));
  const jsHeapTotalLabel = $derived(formatBytes($voxelleRuntimeMetrics.jsHeapTotalBytes));
  const jsHeapLimitLabel = $derived(formatBytes($voxelleRuntimeMetrics.jsHeapLimitBytes));
  const heapUsagePctLabel = $derived(
    $voxelleRuntimeMetrics.heapUsagePercent === null
      ? 'n/a'
      : `${$voxelleRuntimeMetrics.heapUsagePercent.toFixed(1)}%`
  );
  const sampleAgeLabel = $derived.by(() => {
    void sampleAgeTick;
    const t0 = $voxelleRuntimeMetrics.lastSamplePerfMs;
    if (t0 <= 0) return 'n/a';
    const age = Math.max(0, performance.now() - t0);
    return age < 1000 ? `${Math.round(age)} ms` : `${(age / 1000).toFixed(1)} s`;
  });
  const sampleWallLabel = $derived($voxelleRuntimeMetrics.lastSampleAtIso ?? 'n/a');
  const renderingModeLabel = $derived($voxelleRuntimeMetrics.renderingMode);
  const rendererDprLabel = $derived($voxelleRuntimeMetrics.rendererPixelRatio.toFixed(2));
  const rayBufLabel = $derived(
    $voxelleRuntimeMetrics.rayBufferWidth === null ||
      $voxelleRuntimeMetrics.rayBufferHeight === null
      ? 'n/a'
      : `${$voxelleRuntimeMetrics.rayBufferWidth}×${$voxelleRuntimeMetrics.rayBufferHeight}`
  );
  const rayDprLabel = $derived(
    $voxelleRuntimeMetrics.rayTracePixelRatio === null
      ? 'n/a'
      : $voxelleRuntimeMetrics.rayTracePixelRatio.toFixed(2)
  );
  const runtimeVoxelLabel = $derived(
    `${$voxelleRuntimeMetrics.filledVoxelCount} + ${$voxelleRuntimeMetrics.hiddenVoxelCount} hidden`
  );
</script>

{#if open}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="project-stats-title"
    tabindex="-1"
    onclick={(e: MouseEvent) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e: KeyboardEvent) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal modal--project-stats">
      <h3 id="project-stats-title">Project stats</h3>
      <dl class="stats-list">
        <div class="stat-row">
          <dt>Grid size</dt>
          <dd>{gridSizeLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Filled voxel count</dt>
          <dd>{filledVoxelCount}</dd>
        </div>
        <div class="stat-row">
          <dt>JS heap API</dt>
          <dd>{memoryApiLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>JS heap used</dt>
          <dd>{jsHeapUsedLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>JS heap total</dt>
          <dd>{jsHeapTotalLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>JS heap limit</dt>
          <dd>{jsHeapLimitLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Heap usage (used / limit)</dt>
          <dd>{heapUsagePctLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Runtime sample age</dt>
          <dd>{sampleAgeLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Sample time (UTC)</dt>
          <dd class="stats-dd--wrap">{sampleWallLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Rendering mode (last sample)</dt>
          <dd>{renderingModeLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Renderer pixel ratio</dt>
          <dd>{rendererDprLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Ray trace DPR (last sample)</dt>
          <dd>{rayDprLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Ray buffer (internal)</dt>
          <dd>{rayBufLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Voxels (last sample)</dt>
          <dd>{runtimeVoxelLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit duration</dt>
          <dd>{lastEditDurationLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit sync (main thread)</dt>
          <dd>{lastEditSyncDurationLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit request delay</dt>
          <dd>{lastEditRequestDelayLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit worker round-trip</dt>
          <dd>{lastEditWorkerRoundTripLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit mesh apply</dt>
          <dd>{lastEditApplyDurationLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit dirty chunks</dt>
          <dd>{lastEditDirtyChunksLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit halo chunks</dt>
          <dd>{lastEditHaloChunksLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit changed buckets</dt>
          <dd>{lastEditChangedBucketsLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit result vertices</dt>
          <dd>{lastEditResultVerticesLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last edit result indices</dt>
          <dd>{lastEditResultIndicesLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last worker parse input</dt>
          <dd>{lastWorkerParseInputLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last worker mesh compute</dt>
          <dd>{lastWorkerMeshComputeLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last undo duration (gesture → mesh)</dt>
          <dd>{lastUndoDurationLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last undo sync (main thread)</dt>
          <dd>{lastUndoSyncDurationLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last redo duration (gesture → mesh)</dt>
          <dd>{lastRedoDurationLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last redo sync (main thread)</dt>
          <dd>{lastRedoSyncDurationLabel}</dd>
        </div>
      </dl>
      <div class="modal-buttons">
        <button type="button" onclick={() => void copyStatsAsJson()}>{copyJsonLabel}</button>
        <button type="button" onclick={() => (open = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal--project-stats {
    min-width: min(90vw, 20rem);
    max-width: min(92vw, 28rem);
    max-height: min(90vh, calc(100dvh - 2rem));
    overflow: hidden;
  }

  .modal--project-stats h3 {
    flex-shrink: 0;
    margin: 0;
  }

  .stats-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding-right: 0.125rem;
  }

  .stat-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color);
  }

  .stat-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  dt {
    font-weight: 600;
  }

  dd {
    margin: 0;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .stats-dd--wrap {
    text-align: right;
    max-width: 12rem;
    word-break: break-all;
  }

  .modal--project-stats .modal-buttons {
    flex-shrink: 0;
  }

  .modal-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .modal-buttons button {
    padding: 0.35rem 0.75rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .modal-buttons button:hover {
    background: var(--block-quote-bg-color);
  }
</style>
