<script lang="ts">
  import { metalTool } from '../store';
  import type { MetalTool } from '../store/types';

  const navTools: { id: MetalTool; label: string; title: string }[] = [
    { id: 'select', label: 'Select', title: 'Pick and edit existing paths (V)' },
    { id: 'grab', label: 'Grab', title: 'Pan the view by dragging (H). Space also pans.' },
    { id: 'trim', label: 'Trim', title: 'Click an open line to snip its ends at the badge outline (T)' },
    { id: 'text', label: 'Text', title: 'Click to place a text element (W)' }
  ];

  const shapeTools: { id: MetalTool; label: string; title: string }[] = [
    { id: 'pen', label: 'Pen', title: 'Draw point-by-point (P). Click-drag for curves.' },
    { id: 'pencil', label: 'Pencil', title: 'Freehand drag — auto-smoothed into curves (N)' },
    { id: 'line', label: 'Line', title: 'Drag a straight line (L)' },
    { id: 'rect', label: 'Rect', title: 'Drag a rectangle (R)' },
    { id: 'ellipse', label: 'Ellipse', title: 'Drag an ellipse (E)' },
    { id: 'polygon', label: 'Polygon', title: 'Drag a regular polygon (G)' }
  ];
</script>

<div class="tool-picker" role="group" aria-label="Drawing tools">
  <div class="nav-row">
    <span class="sidebar-label nav-row__heading">Navigate</span>
    <div class="tool-buttons nav-row__buttons">
      {#each navTools as t (t.id)}
        <button
          type="button"
          class:active={$metalTool === t.id}
          onclick={() => metalTool.set(t.id)}
          title={t.title}
        >
          {t.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="shape-row">
    <span class="sidebar-label shape-row__heading">Shape</span>
    <div class="tool-buttons shape-row__buttons">
      {#each shapeTools as t (t.id)}
        <button
          type="button"
          class:active={$metalTool === t.id}
          onclick={() => metalTool.set(t.id)}
          title={t.title}
        >
          {t.label}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .tool-picker {
    margin-bottom: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .nav-row__heading,
  .shape-row__heading {
    display: block;
    margin-bottom: 0.25rem;
  }

  .nav-row__buttons {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
  }

  .shape-row__buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
  }

  .nav-row__buttons > :global(button),
  .shape-row__buttons > :global(button) {
    flex: none;
    width: 100%;
    min-width: 0;
  }

  .shape-row {
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-color);
  }
</style>
