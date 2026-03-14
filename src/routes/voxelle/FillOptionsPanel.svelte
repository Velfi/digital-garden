<script lang="ts">
  import {
    strokeMode,
    tool,
    sidebarOpen,
    fillSelectDiagonals,
    fillRespectsColor
  } from './store';

  const STROKE_TOOLS = ['voxel', 'remove', 'paint', 'select', 'selectByColor'] as const;
  const isStrokeTool = (t: string) => STROKE_TOOLS.includes(t as (typeof STROKE_TOOLS)[number]);
  const show = $derived($strokeMode === 'fill' && isStrokeTool($tool));
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
    aria-label="Fill options"
    tabindex="-1"
  >
    <div class="add-panel-row">
      <label class="add-panel-check">
        <input
          type="checkbox"
          checked={$fillSelectDiagonals}
          onchange={(e) => fillSelectDiagonals.set((e.target as HTMLInputElement).checked)}
        />
        Include diagonals
      </label>
    </div>
    <div class="add-panel-row">
      <label class="add-panel-check">
        <input
          type="checkbox"
          checked={$fillRespectsColor}
          onchange={(e) => fillRespectsColor.set((e.target as HTMLInputElement).checked)}
        />
        Respect color
      </label>
    </div>
  </div>
{/if}

<style>
  .add-panel-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .add-panel-check input[type='checkbox'] {
    accent-color: var(--link-color);
  }
</style>
