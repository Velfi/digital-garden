<script lang="ts">
  import { clayMode, tool, clayBrushRadius, branchTaper, sidebarOpen } from './store';
</script>

{#if $tool === 'clay' && $clayMode === 'branch'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="add-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    aria-modal="false"
    aria-labelledby="branch-panel-title"
    tabindex="-1"
  >
    <h3 id="branch-panel-title">Branch</h3>
    <div class="add-panel-row">
      <span class="add-panel-label">Brush</span>
      <input
        type="range"
        min="0"
        max="2"
        step="1"
        value={$clayBrushRadius}
        oninput={(e) => clayBrushRadius.set(Number((e.target as HTMLInputElement).value))}
        title="Brush size (0–2)"
      />
      <span class="add-panel-value">{$clayBrushRadius}</span>
    </div>
    <div class="add-panel-row">
      <label class="add-panel-check">
        <input
          type="checkbox"
          checked={$branchTaper}
          onchange={(e) => branchTaper.set((e.target as HTMLInputElement).checked)}
          title="Taper from thick base to thin tip"
        />
        Taper
      </label>
    </div>
  </div>
{/if}

<style>
  .add-panel-value {
    font-size: 0.85rem;
    opacity: 0.8;
    min-width: 1.5rem;
  }

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
