<script lang="ts">
  import { clayMode } from '../store';
</script>

<div class="clay-mode" role="group" aria-labelledby="clay-label">
  <span id="clay-label" class="stroke-label">Clay mode</span>
  <div class="stroke-buttons">
    <button
      type="button"
      class:active={$clayMode === 'bulk'}
      onclick={() => clayMode.set('bulk')}
      title="Bulk: pull voxels along cursor path (Blender Snake Hook style)"
    >
      Bulk
    </button>
    <button
      type="button"
      class:active={$clayMode === 'smooth'}
      onclick={() => clayMode.set('smooth')}
      title="Smooth: soften edges, fill small gaps"
    >
      Smooth
    </button>
    <button
      type="button"
      class:active={$clayMode === 'level'}
      onclick={() => clayMode.set('level')}
      title="Level: flatten surface to clicked height"
    >
      Level
    </button>
    <button
      type="button"
      class:active={$clayMode === 'gouge'}
      onclick={() => clayMode.set('gouge')}
      title="Gouge: carve trench along path"
    >
      Gouge
    </button>
    <button
      type="button"
      class:active={$clayMode === 'branch'}
      onclick={() => clayMode.set('branch')}
      title="Branch: extrude limbs/horns into empty space (follows cursor direction)"
    >
      Branch
    </button>
    <button
      type="button"
      class:active={$clayMode === 'puffy'}
      onclick={() => clayMode.set('puffy')}
      title="Puffy: organic spheres for clouds"
    >
      Puffy
    </button>
    <button
      type="button"
      class:active={$clayMode === 'melt'}
      onclick={() => clayMode.set('melt')}
      title="Melt: spread voxels downhill, highest first"
    >
      Melt
    </button>
    <button
      type="button"
      class:active={$clayMode === 'rope'}
      onclick={() => clayMode.set('rope')}
      title="Rope: pick two points, set tension, draw catenary with brush"
    >
      Rope
    </button>
  </div>
</div>

<style>
  .clay-mode {
    margin-bottom: 0.5rem;
  }
</style>
