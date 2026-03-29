<script lang="ts">
  import { selection, deselectAll } from './store/index';
</script>

{#if $selection.size > 0}
  <div
    class="selection-panel"
    data-voxelle-no-passthrough
    role="status"
    aria-live="polite"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
  >
    <span class="selection-text">
      {$selection.size}
      {$selection.size === 1 ? 'voxel' : 'voxels'} selected
    </span>
    <button
      type="button"
      class="deselect-btn"
      onclick={(e) => {
        e.stopPropagation();
        deselectAll();
      }}
      title="Deselect all"
      aria-label="Deselect all">×</button
    >
  </div>
{/if}

<style>
  /* Absolute in .canvas-container (like .fps-counter): avoids overlapping the page menubar, which fixed + top: 4rem did when the real header is taller. */
  .selection-panel {
    position: absolute;
    top: 3rem;
    left: 0.5rem;
    z-index: 20;
    background: var(--bg-color);
    color: var(--text-color);
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    font-size: 0.9rem;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .deselect-btn {
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    line-height: 1;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .deselect-btn:hover {
    background: var(--block-quote-bg-color);
  }
</style>
