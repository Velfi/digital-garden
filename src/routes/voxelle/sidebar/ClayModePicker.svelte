<script lang="ts">
  import { clayMode } from '../store/index';
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
      title="Smooth: configurable reach and strength; wider reach helps large-scale surfaces"
    >
      Smooth
    </button>
    <button
      type="button"
      class:active={$clayMode === 'inflate'}
      onclick={() => clayMode.set('inflate')}
      title="Inflate: push surface outward along normals"
    >
      Inflate
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
      class:active={$clayMode === 'terrain'}
      onclick={() => clayMode.set('terrain')}
      title="Terrain: heightfield sculpt (raise, lower, smooth). Each column becomes a solid stack; caves collapse when edited."
    >
      Terrain
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
      class:active={$clayMode === 'melt'}
      onclick={() => clayMode.set('melt')}
      title="Melt: fried-egg flatten or gravity flow; brush shape in tool panel"
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
    <button
      type="button"
      class:active={$clayMode === 'wall'}
      onclick={() => clayMode.set('wall')}
      title="Wall: extend voxels along an axis from the path (e.g. Y− for rain)"
    >
      Wall
    </button>
  </div>
</div>

<style>
  .clay-mode {
    margin-bottom: 0.5rem;
  }
</style>
