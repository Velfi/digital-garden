<script lang="ts">
  import { strokeMode } from '../store/index';
  import type { SelectionStrokeFamily } from '../store/selectionStrokeFamily';
  import {
    SELECTION_STROKE_FAMILY_LABELS,
    SELECTION_STROKE_FAMILY_VARIANTS,
    strokeModeToSelectionStrokeFamily,
    defaultStrokeModeForSelectionStrokeFamily,
    isStrokeModeInSelectionStrokeFamily
  } from '../store/selectionStrokeFamily';

  /** Sidebar layout: primary row then flood / spray row. */
  const FAMILY_ROW_PRIMARY: readonly SelectionStrokeFamily[] = ['stroke', 'surface', 'solid'];
  const FAMILY_ROW_SECONDARY: readonly SelectionStrokeFamily[] = ['spray', 'fill'];

  function pickFamily(family: SelectionStrokeFamily) {
    if (!isStrokeModeInSelectionStrokeFamily($strokeMode, family)) {
      strokeMode.set(defaultStrokeModeForSelectionStrokeFamily(family));
    }
  }

  const activeFamily = $derived(strokeModeToSelectionStrokeFamily($strokeMode));
</script>

<div class="stroke-mode" role="group" aria-labelledby="stroke-label">
  <span id="stroke-label" class="stroke-label">Selection method</span>
  <div
    class="stroke-buttons stroke-buttons--families stroke-buttons--row-primary"
    role="group"
    aria-label="Stroke, surface, and solid"
  >
    {#each FAMILY_ROW_PRIMARY as family (family)}
      <button
        type="button"
        class:active={activeFamily === family}
        onclick={() => pickFamily(family)}
        title={SELECTION_STROKE_FAMILY_VARIANTS[family][0]?.title ??
          SELECTION_STROKE_FAMILY_LABELS[family]}
      >
        {SELECTION_STROKE_FAMILY_LABELS[family]}
      </button>
    {/each}
  </div>
  <div
    class="stroke-buttons stroke-buttons--families stroke-buttons--row-secondary"
    role="group"
    aria-label="Spray and fill"
  >
    {#each FAMILY_ROW_SECONDARY as family (family)}
      <button
        type="button"
        class:active={activeFamily === family}
        onclick={() => pickFamily(family)}
        title={SELECTION_STROKE_FAMILY_VARIANTS[family][0]?.title ??
          SELECTION_STROKE_FAMILY_LABELS[family]}
      >
        {SELECTION_STROKE_FAMILY_LABELS[family]}
      </button>
    {/each}
  </div>
</div>

<style>
  .stroke-mode {
    margin-bottom: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-color);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .stroke-buttons--row-primary,
  .stroke-buttons--row-secondary {
    display: grid;
    gap: 0.25rem;
    flex-wrap: unset;
  }

  .stroke-buttons--row-primary {
    grid-template-columns: repeat(3, 1fr);
  }

  .stroke-buttons--row-secondary {
    grid-template-columns: 1fr 1fr;
  }

  .stroke-buttons--row-primary > :global(button),
  .stroke-buttons--row-secondary > :global(button) {
    flex: unset;
    min-width: 0;
  }
</style>
