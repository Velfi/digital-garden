<script lang="ts">
  import { tool, selection, lastDrawTool } from '../store';
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
  <button
    type="button"
    class:active={$tool === 'select'}
    onclick={() => {
      tool.set('select');
      lastDrawTool.set('select');
    }}
    title="Select voxels for stamping"
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
    title="Place a copy of the selection"
    disabled={$selection.size === 0}
  >
    Stamp
  </button>
  <button
    type="button"
    class:active={$tool === 'eyedropper'}
    onclick={() => {
      tool.set('eyedropper');
      lastDrawTool.set('eyedropper');
    }}
    title="Pick color from voxel"
  >
    Eyedropper
  </button>
  <button
    type="button"
    class:active={$tool === 'fly'}
    onclick={() => {
      tool.set('fly');
      lastDrawTool.set('fly');
    }}
    title="Fly camera (WASD, click+drag to look)"
  >
    Fly
  </button>
</div>

<style>
</style>
