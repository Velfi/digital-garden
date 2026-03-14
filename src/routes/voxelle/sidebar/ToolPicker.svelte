<script lang="ts">
  import { tool, selection } from '../store';
</script>

<h2>Tool</h2>
<div class="tool-buttons">
  <button
    type="button"
    class:active={$tool === 'remove'}
    onclick={() => tool.set('remove')}
    title="Remove voxels"
  >
    Remove
  </button>
  <button
    type="button"
    class:active={$tool === 'voxel'}
    onclick={() => tool.set('voxel')}
    title="Place voxels"
  >
    Voxel
  </button>
  <button
    type="button"
    class:active={$tool === 'clay'}
    onclick={() => tool.set('clay')}
    title="Clay sculpting (bulk, etc.)"
  >
    Clay
  </button>
  <button
    type="button"
    class:active={$tool === 'paint'}
    onclick={() => tool.set('paint')}
    title="Paint voxels"
  >
    Paint
  </button>
  <button
    type="button"
    class:active={$tool === 'select'}
    onclick={() => tool.set('select')}
    title="Select voxels for stamping"
  >
    Select
  </button>
  <button
    type="button"
    class:active={$tool === 'stamp'}
    onclick={() => tool.set('stamp')}
    title="Place a copy of the selection"
    disabled={$selection.size === 0}
  >
    Stamp
  </button>
  <button
    type="button"
    class:active={$tool === 'eyedropper'}
    onclick={() => tool.set('eyedropper')}
    title="Pick color from voxel"
  >
    Eyedropper
  </button>
  <button
    type="button"
    class:active={$tool === 'fly'}
    onclick={() => tool.set('fly')}
    title="Fly camera (WASD, click+drag to look)"
  >
    Fly
  </button>
</div>

<style>
</style>
