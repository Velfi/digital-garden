<script lang="ts">
  import { sculptMode } from '../store/index';
</script>

<div class="sculpt-mode" role="group" aria-labelledby="sculpt-label">
  <span id="sculpt-label" class="stroke-label">Sculpt mode</span>
  <div class="stroke-buttons sculpt-mode-buttons">
    <button
      type="button"
      class:active={$sculptMode === 'draw'}
      onclick={() => sculptMode.set('draw')}
      title="Draw: fill empty voxels along the stroke (voxel add; same brush footprint as other sculpt strokes)"
    >
      Draw
    </button>
    <button
      type="button"
      class:active={$sculptMode === 'gouge'}
      onclick={() => sculptMode.set('gouge')}
      title="Scrape: delete solid voxels along the stroke (voxel subtract)"
    >
      Scrape
    </button>
    <button
      type="button"
      class:active={$sculptMode === 'smooth'}
      onclick={() => sculptMode.set('smooth')}
      title="Smooth: local majority rule in the brush (fill pockets, remove isolated voxels; voxel smooth)"
    >
      Smooth
    </button>
    <button
      type="button"
      class:active={$sculptMode === 'branch'}
      onclick={() => sculptMode.set('branch')}
      title="Extrude: add voxels along a stroke extruded in view space from the start face"
    >
      Extrude
    </button>
    <button
      type="button"
      class:active={$sculptMode === 'wall'}
      onclick={() => sculptMode.set('wall')}
      title="Extend voxels along an axis from the path"
    >
      Wall
    </button>
    <button
      type="button"
      class:active={$sculptMode === 'terrain'}
      onclick={() => sculptMode.set('terrain')}
      title="Heightfield: raise, lower, or smooth column tops (Y-up)"
    >
      Terrain
    </button>
  </div>
</div>

<style>
  .sculpt-mode {
    margin-bottom: 0.5rem;
  }

  .sculpt-mode-buttons {
    margin-top: 0.25rem;
  }
</style>
