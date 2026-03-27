<script lang="ts">
  import { strokeMode } from '../store/index';
</script>

<div class="stroke-mode" role="group" aria-labelledby="stroke-label">
  <span id="stroke-label" class="stroke-label">Selection method</span>
  <div class="stroke-buttons">
    <button
      type="button"
      class:active={$strokeMode === 'line'}
      onclick={() => strokeMode.set('line')}
      title="Draw lines (axis-aligned)"
    >
      Line
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'plane'}
      onclick={() => strokeMode.set('plane')}
      title="Fill whole plane (Alt+scroll to cycle orientation, hold Shift while dragging to mirror around drag start)"
    >
      Plane
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'circle'}
      onclick={() => strokeMode.set('circle')}
      title="Drag from center to edge: disk in the plane (Alt+scroll to cycle orientation)"
    >
      Circle
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'precise'}
      onclick={() => strokeMode.set('precise')}
      title="Click voxel to lock plane from face normal, then click to place one voxel or drag to place a plane"
    >
      Precise
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'cuboid'}
      onclick={() => strokeMode.set('cuboid')}
      title="Drag to set plane (Alt+scroll to cycle), scroll for depth, click or Done to apply"
    >
      Cuboid
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'cylindroid'}
      onclick={() => strokeMode.set('cylindroid')}
      title="Drag center to edge for base disk (Alt+scroll to cycle plane), scroll for depth, Done to apply — cone option in tool panel"
    >
      Cylindroid
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'polygon'}
      onclick={() => strokeMode.set('polygon')}
      title="Click to place points, Done to fill convex hull"
    >
      Polygon
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'polygonoid'}
      onclick={() => strokeMode.set('polygonoid')}
      title="Click to place outline corners, Extrude, then adjust depth (slider / vertical drag) and Done — like cuboid"
    >
      Polygonoid
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'fill'}
      onclick={() => strokeMode.set('fill')}
      title="Click to flood-fill: Voxel (empty space), Remove/Paint (voxels), Select/SelectByColor (selection)"
    >
      Fill
    </button>
    <button
      type="button"
      class:active={$strokeMode === 'airbrush'}
      onclick={() => strokeMode.set('airbrush')}
      title="Drag to paint a soft spherical brush along the path"
    >
      Airbrush
    </button>
  </div>
</div>

<style>
  .stroke-mode {
    margin-bottom: 0.5rem;
  }
</style>
