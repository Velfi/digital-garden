<script lang="ts">
  import { squishyMode } from '../store/index';
</script>

<div class="squishy-mode" role="group" aria-labelledby="squishy-label">
  <span id="squishy-label" class="stroke-label">Squishy mode</span>
  <div class="stroke-buttons">
    <button
      type="button"
      class:active={$squishyMode === 'add'}
      onclick={() => squishyMode.set('add')}
      title="Add metaball (A)"
    >
      Add
    </button>
    <button
      type="button"
      class:active={$squishyMode === 'edit'}
      onclick={() => squishyMode.set('edit')}
      title="Edit metaball with gizmo (E)"
    >
      Edit
    </button>
    <button
      type="button"
      class:active={$squishyMode === 'delete'}
      onclick={() => squishyMode.set('delete')}
      title="Delete metaball (D)"
    >
      Delete
    </button>
  </div>
</div>

<style>
  .squishy-mode {
    margin-bottom: 0.5rem;
  }
</style>
