<script lang="ts">
  import { selectionGizmoMode } from '../store/index';
</script>

<section class="tool-panel-section" aria-label="Transform gizmo">
  <div class="stroke-buttons" role="tablist" aria-label="Gizmo mode">
    <button
      type="button"
      role="tab"
      class:active={$selectionGizmoMode === 'move'}
      aria-selected={$selectionGizmoMode === 'move'}
      onclick={() => selectionGizmoMode.set('move')}
    >
      Move
    </button>
    <button
      type="button"
      role="tab"
      class:active={$selectionGizmoMode === 'rotate'}
      aria-selected={$selectionGizmoMode === 'rotate'}
      onclick={() => selectionGizmoMode.set('rotate')}
    >
      Rotate
    </button>
    <button
      type="button"
      role="tab"
      class:active={$selectionGizmoMode === 'scale'}
      aria-selected={$selectionGizmoMode === 'scale'}
      onclick={() => selectionGizmoMode.set('scale')}
    >
      Scale
    </button>
  </div>
  <p class="gizmo-hint">
    {$selectionGizmoMode === 'move'
      ? 'Drag RGB arrows to slide along axes.'
      : $selectionGizmoMode === 'rotate'
        ? 'Drag colored rings to rotate around X / Y / Z with free angles.'
        : 'Drag RGB boxes along ±X / ±Y / ±Z to scale on that axis.'}
  </p>
</section>

<style>
  .gizmo-hint {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.35;
    opacity: 0.82;
  }
</style>
