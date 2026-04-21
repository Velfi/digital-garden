<script lang="ts">
  import { document as docStore, selectedPathIds, selectedHandles } from '../store';
  import type { BadgePath, NodeType } from '../store/types';
  import {
    setNodeTypeForSelection,
    setSegmentType,
    insertNode,
    deleteSelectedNodes,
    breakAtSelected,
    joinSelectedEndpoints,
    joinSelectedWithSegment,
    deleteSelectedSegments,
    retractSelectedHandles,
    selectedAnchorsFor,
    selectedSegmentsFrom,
    commonNodeType
  } from '../pathActions';

  let selectedPath: BadgePath | null = $derived.by(() => {
    const ids = $selectedPathIds;
    if (ids.size !== 1) return null;
    const id = [...ids][0];
    return $docStore.metal.paths.find((p) => p.id === id) ?? null;
  });

  let selAnchors = $derived.by(() => {
    void $selectedHandles;
    void $docStore;
    const path = selectedPath;
    return path ? selectedAnchorsFor(path) : [];
  });
  let anchorCount = $derived(selAnchors.length);
  let segmentCount = $derived(selectedSegmentsFrom(selAnchors).length);

  let currentNodeType: NodeType | null = $derived.by(() => {
    void $docStore;
    const path = selectedPath;
    return path ? commonNodeType(path, selAnchors) : null;
  });

  // Endpoint count across the raw handle selection (may span paths).
  let endpointCount = $derived.by(() => {
    let c = 0;
    for (const k of $selectedHandles) {
      const lastColon = k.lastIndexOf(':');
      if (lastColon < 0) continue;
      const secondLast = k.lastIndexOf(':', lastColon - 1);
      if (secondLast < 0) continue;
      const pathId = k.slice(0, secondLast);
      const kind = k.slice(secondLast + 1, lastColon);
      const idx = Number(k.slice(lastColon + 1));
      const path = $docStore.metal.paths.find((p) => p.id === pathId);
      if (!path || path.closed) continue;
      if (kind === 'start') c++;
      else if (kind === 'node' && idx === path.nodes.length - 1) c++;
    }
    return c;
  });

  // Human-readable selection summary. Stays terse so it doesn't push the
  // toolbar down the sidebar.
  let summary = $derived.by(() => {
    if (!selectedPath) return '';
    const n = anchorCount;
    const s = segmentCount;
    const parts: string[] = [];
    if (n === 0) parts.push('no nodes');
    else parts.push(`${n} node${n === 1 ? '' : 's'}`);
    if (s > 0) parts.push(`${s} segment${s === 1 ? '' : 's'}`);
    return parts.join(' · ');
  });

  const nodeTypes: Array<{ id: NodeType; label: string; shortcut: string; title: string }> = [
    { id: 'cusp', label: 'Cusp', shortcut: '⇧C', title: 'Corner — handles move independently' },
    { id: 'smooth', label: 'Smooth', shortcut: '⇧S', title: 'Collinear handles, independent lengths' },
    { id: 'symmetric', label: 'Symmetric', shortcut: '⇧Y', title: 'Mirrored handles' },
    { id: 'auto', label: 'Auto', shortcut: '⇧A', title: 'Handles derived from neighbors' }
  ];
</script>

{#if selectedPath}
  <div class="node-toolbar" role="toolbar" aria-label="Node tool">
    <div class="summary" aria-live="polite">{summary}</div>

    <div class="section">
      <span class="section-label">Node type</span>
      <div
        class="segmented"
        role="radiogroup"
        aria-label="Node type"
        aria-disabled={anchorCount === 0}
      >
        {#each nodeTypes as t (t.id)}
          <button
            type="button"
            class="seg"
            class:active={currentNodeType === t.id}
            aria-pressed={currentNodeType === t.id}
            disabled={anchorCount === 0}
            title={`${t.title} (${t.shortcut})`}
            onclick={() => setNodeTypeForSelection(t.id)}
          >
            <svg class="glyph" viewBox="-6 -6 12 12" aria-hidden="true">
              {#if t.id === 'cusp'}
                <rect x="-4" y="-4" width="8" height="8" fill="currentColor" />
              {:else if t.id === 'smooth'}
                <circle cx="0" cy="0" r="4" fill="currentColor" />
              {:else if t.id === 'symmetric'}
                <rect
                  x="-4" y="-4" width="8" height="8"
                  fill="currentColor"
                  transform="rotate(45)"
                />
              {:else}
                <circle
                  cx="0" cy="0" r="4"
                  fill="none" stroke="currentColor" stroke-width="1.5"
                  stroke-dasharray="1.5,1.5"
                />
              {/if}
            </svg>
            <span class="seg-label">{t.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="section">
      <span class="section-label">Segments</span>
      <div class="row">
        <button
          type="button"
          disabled={segmentCount === 0}
          title="Make selected segments lines (L)"
          onclick={() => setSegmentType('line')}
        >
          Line<kbd>L</kbd>
        </button>
        <button
          type="button"
          disabled={segmentCount === 0}
          title="Make selected segments curves (C)"
          onclick={() => setSegmentType('curve')}
        >
          Curve<kbd>C</kbd>
        </button>
        <button
          type="button"
          disabled={segmentCount === 0}
          title="Insert node at midpoint of each selected segment (Insert)"
          onclick={insertNode}
        >
          Insert<kbd>Ins</kbd>
        </button>
        <button
          type="button"
          class="danger-outline"
          disabled={segmentCount === 0}
          title="Delete selected segments"
          onclick={deleteSelectedSegments}
        >
          Delete
        </button>
      </div>
    </div>

    <div class="section">
      <span class="section-label">Nodes</span>
      <div class="row">
        <button
          type="button"
          disabled={anchorCount !== 1}
          title="Break path at selected node (⇧B)"
          onclick={breakAtSelected}
        >
          Break<kbd>⇧B</kbd>
        </button>
        <button
          type="button"
          disabled={endpointCount !== 2}
          title="Join two selected endpoint nodes — merge to midpoint (⇧J)"
          onclick={joinSelectedEndpoints}
        >
          Join<kbd>⇧J</kbd>
        </button>
        <button
          type="button"
          disabled={endpointCount !== 2}
          title="Join two selected endpoint nodes with a new straight segment"
          onclick={joinSelectedWithSegment}
        >
          Join&nbsp;+&nbsp;seg
        </button>
        <button
          type="button"
          disabled={$selectedHandles.size === 0}
          title="Retract handles at selected nodes"
          onclick={retractSelectedHandles}
        >
          Retract
        </button>
        <button
          type="button"
          class="danger-outline"
          disabled={$selectedHandles.size === 0}
          title="Delete selected nodes (Delete)"
          onclick={deleteSelectedNodes}
        >
          Delete<kbd>⌫</kbd>
        </button>
      </div>
    </div>

  </div>
{/if}

<style>
  .node-toolbar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
  }

  .summary {
    font-size: 0.72rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .section-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.65;
    font-weight: 600;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem;
  }

  .row button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.45rem;
    font-size: 0.78rem;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-color);
    color: inherit;
    cursor: pointer;
  }

  .row button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
    border-color: var(--link-color);
  }

  .row button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .row button.danger-outline:not(:disabled) {
    border-color: rgba(200, 60, 60, 0.4);
  }
  .row button.danger-outline:hover:not(:disabled) {
    background: rgba(200, 60, 60, 0.12);
    border-color: rgba(200, 60, 60, 0.7);
  }

  kbd {
    font-family: inherit;
    font-size: 0.62rem;
    padding: 0.02rem 0.25rem;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    opacity: 0.7;
    background: transparent;
    font-variant: tabular-nums;
  }

  .segmented {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    overflow: hidden;
  }

  .segmented .seg {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.18rem;
    padding: 0.35rem 0.25rem;
    border: none;
    border-right: 1px solid var(--border-color);
    background: var(--bg-color);
    color: inherit;
    cursor: pointer;
    font-size: 0.7rem;
  }

  .segmented .seg:last-child {
    border-right: none;
  }

  .segmented .seg:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .segmented .seg.active {
    background: var(--link-color);
    color: #fff;
  }
  .segmented .seg.active:hover:not(:disabled) {
    background: var(--link-color);
    filter: brightness(1.1);
  }

  .segmented .seg:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .glyph {
    width: 14px;
    height: 14px;
  }

  .seg-label {
    letter-spacing: 0.02em;
  }
</style>
