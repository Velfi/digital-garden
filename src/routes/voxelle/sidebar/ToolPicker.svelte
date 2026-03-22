<script lang="ts">
  import { tool, selection, lastDrawTool } from '../store/index';

  const stampPunchNeedSelection = $derived($selection.size === 0);
</script>

<h2>Tool</h2>
<div class="tool-buttons">
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
    class:active={$tool === 'voxel'}
    onclick={() => {
      tool.set('voxel');
      lastDrawTool.set('voxel');
    }}
    title="Place voxels"
  >
    Voxel
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

<div class="tool-group tool-group--selection">
  <span class="sidebar-label">Selection</span>
  <div class="tool-buttons tool-buttons--selection">
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
      title="Requires a selection — use Select (or menu select tools) first. Places a copy of the selection."
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
      title="Requires a selection — use Select (or menu select tools) first. Cuts the selection shape into voxels (into the surface)."
      disabled={stampPunchNeedSelection}
      aria-describedby={stampPunchNeedSelection ? 'stamp-punch-hint' : undefined}
    >
      Punch
    </button>
  </div>
  {#if stampPunchNeedSelection}
    <p id="stamp-punch-hint" class="selection-hint dimmed">
      Select voxels first, then use Stamp or Punch.
    </p>
  {/if}
</div>

<style>
  .tool-group--selection {
    margin-bottom: 0.5rem;
    padding: 0.5rem 0 0;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .tool-group--selection .sidebar-label {
    margin-bottom: 0;
  }

  .tool-group--selection .tool-buttons--selection {
    margin-bottom: 0;
  }

  .selection-hint {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.35;
  }
</style>
