<script lang="ts">
  import { symmetryX, symmetryY, symmetryZ } from '../store';
</script>

<div class="symmetry-section" role="group" aria-labelledby="symmetry-label">
  <span id="symmetry-label" class="stroke-label">Symmetry</span>
  <div class="stroke-buttons">
    <button
      type="button"
      class:active={$symmetryX}
      onclick={() => symmetryX.set(!$symmetryX)}
      title="Mirror across X axis"
    >
      X
    </button>
    <button
      type="button"
      class:active={$symmetryY}
      onclick={() => symmetryY.set(!$symmetryY)}
      title="Mirror across Y axis"
    >
      Y
    </button>
    <button
      type="button"
      class:active={$symmetryZ}
      onclick={() => symmetryZ.set(!$symmetryZ)}
      title="Mirror across Z axis"
    >
      Z
    </button>
  </div>
</div>

<style>
  .symmetry-section {
    margin-bottom: 0.5rem;
  }
</style>
