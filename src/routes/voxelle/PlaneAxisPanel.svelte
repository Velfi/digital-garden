<script lang="ts">
  import { strokeMode, planeAxis, tool, sidebarOpen } from './store';

  const STROKE_TOOLS = ['voxel', 'remove', 'paint', 'select', 'selectByColor'] as const;
  const isStrokeTool = (t: string) => STROKE_TOOLS.includes(t as (typeof STROKE_TOOLS)[number]);
  const show = $derived(
    ($strokeMode === 'plane' || $strokeMode === 'cuboid') && isStrokeTool($tool)
  );
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="add-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    aria-modal="false"
    aria-label="Plane axis"
    tabindex="-1"
  >
    <div class="stroke-buttons" role="group" aria-label="Plane axis">
      <button
        type="button"
        class:active={$planeAxis === 0}
        onclick={() => planeAxis.set(0)}
        title="Vertical plane (YZ)"
      >
        X
      </button>
      <button
        type="button"
        class:active={$planeAxis === 1}
        onclick={() => planeAxis.set(1)}
        title="Horizontal plane (XZ)"
      >
        Y
      </button>
      <button
        type="button"
        class:active={$planeAxis === 2}
        onclick={() => planeAxis.set(2)}
        title="Vertical plane (XY)"
      >
        Z
      </button>
    <button
      type="button"
      class:active={$planeAxis === 'auto'}
      onclick={() => planeAxis.set('auto')}
      title="Auto: use clicked face"
    >
      Auto
    </button>
    </div>
  </div>
{/if}
