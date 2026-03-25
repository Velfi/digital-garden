<script lang="ts">
  import { gridSize, voxels, hiddenVoxels, projectPerfMetrics } from '../store/index';

  let { open = $bindable(false) }: { open?: boolean } = $props();

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
          <dt>Last undo duration</dt>
          <dd>{lastUndoDurationLabel}</dd>
        </div>
        <div class="stat-row">
          <dt>Last redo duration</dt>
          <dd>{lastRedoDurationLabel}</dd>
        </div>
      </dl>
      <div class="modal-buttons">
        <button type="button" onclick={() => (open = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal--project-stats {
    min-width: min(90vw, 20rem);
  }

  .stats-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
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
