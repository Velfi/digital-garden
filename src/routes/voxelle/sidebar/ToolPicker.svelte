<script lang="ts">
  import { tool, selection, lastDrawTool, bookStampPattern } from '../store/index';

  const stampPunchNeedSelection = $derived(
    ($bookStampPattern?.size ?? 0) === 0 && $selection.size === 0
  );
</script>

<div class="tool-picker" role="group" aria-label="Draw tools and selection">
  <div class="tool-picker-columns">
    <div class="tool-picker-col tool-picker-col--tools">
      <span class="sidebar-label tool-picker-col__heading">Tool</span>
      <div class="tool-buttons tool-picker-col__buttons">
        <button
          type="button"
          class:active={$tool === 'voxel'}
          onclick={() => {
            tool.set('voxel');
            lastDrawTool.set('voxel');
          }}
          title="Place voxels"
        >
          Add
        </button>
        <button
          type="button"
          class:active={$tool === 'remove'}
          onclick={() => {
            tool.set('remove');
            lastDrawTool.set('remove');
          }}
          title="Remove voxels"
        >
          Remove
        </button>
        <button
          type="button"
          class:active={$tool === 'paint'}
          onclick={() => {
            tool.set('paint');
            lastDrawTool.set('paint');
          }}
          title="Paint voxels"
        >
          Paint
        </button>
      </div>
    </div>
    <div class="tool-picker-col tool-picker-col--selection">
      <span class="sidebar-label tool-picker-col__heading">Selection</span>
      <div class="tool-buttons tool-picker-col__buttons">
        <button
          type="button"
          class:active={$tool === 'select'}
          onclick={() => {
            tool.set('select');
            lastDrawTool.set('select');
          }}
          title="Select voxels for Stamp and Punch"
        >
          Select
        </button>
        <button
          type="button"
          class:active={$tool === 'stamp'}
          onclick={() => {
            tool.set('stamp');
            lastDrawTool.set('stamp');
          }}
          title="Requires a stamp shape: select voxels, or load a stamp from the Stamp book. Places a copy on click."
          disabled={stampPunchNeedSelection}
          aria-describedby={stampPunchNeedSelection ? 'stamp-punch-hint' : undefined}
        >
          Stamp
        </button>
        <button
          type="button"
          class:active={$tool === 'punch'}
          onclick={() => {
            tool.set('punch');
            lastDrawTool.set('punch');
          }}
          title="Requires a stamp shape: select voxels, or load from the Stamp book. Cuts that shape into the surface."
          disabled={stampPunchNeedSelection}
          aria-describedby={stampPunchNeedSelection ? 'stamp-punch-hint' : undefined}
        >
          Punch
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .tool-picker {
    margin-bottom: 0.5rem;
  }

  .tool-picker-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    margin-bottom: 0.35rem;
    align-items: start;
  }

  .tool-picker-col {
    min-width: 0;
  }

  .tool-picker-col--tools {
    padding-right: 0.45rem;
  }

  .tool-picker-col--selection {
    border-left: 1px solid var(--border-color);
    padding-left: 0.45rem;
  }

  .tool-picker-col__heading {
    margin-bottom: 0.25rem;
  }

  .tool-picker-col__buttons {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 0.25rem;
    margin-bottom: 0;
  }

  .tool-picker-col__buttons > :global(button) {
    flex: none;
    width: 100%;
    min-width: 0;
  }
</style>
