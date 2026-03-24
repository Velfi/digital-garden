<script lang="ts">
  import { voxelMaterial, VOXEL_MATERIAL_IDS, type VoxelMaterialId } from '../store/index';

  const labels: Record<VoxelMaterialId, string> = {
    plastic: 'Plastic',
    metal: 'Metal',
    rubber: 'Rubber',
    glass: 'Glass',
    water: 'Water',
    glow: 'Glow'
  };
</script>

<h2>Material</h2>
<p class="hint">
  Material for new voxels, paint, and clay strokes. Eyedropper picks both color and material.
</p>
<div class="material-grid" role="group" aria-label="Voxel material">
  {#each VOXEL_MATERIAL_IDS as id (id)}
    <button
      type="button"
      class="mat-btn"
      class:active={$voxelMaterial === id}
      onclick={() => voxelMaterial.set(id)}
    >
      {labels[id]}
    </button>
  {/each}
</div>

<style>
  .hint {
    font-size: 0.8rem;
    opacity: 0.85;
    margin: 0 0 0.75rem;
    line-height: 1.35;
  }

  .material-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .mat-btn {
    padding: 0.45rem 0.5rem;
    font-size: 0.8rem;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .mat-btn:hover {
    filter: brightness(1.06);
  }

  .mat-btn.active {
    border-color: var(--accent-color, #3399ff);
    box-shadow: 0 0 0 1px var(--accent-color, #3399ff);
  }
</style>
