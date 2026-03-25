<script lang="ts">
  import { tool, toolPane, strokeMode, selection, sidebarOpen, addPanelStore } from './store/index';
  import DrawToolOptions from './toolPanel/DrawToolOptions.svelte';
  import ClayToolOptions from './toolPanel/ClayToolOptions.svelte';
  import StampToolOptions from './toolPanel/StampToolOptions.svelte';
  import GeneratorToolOptions from './toolPanel/GeneratorToolOptions.svelte';
  import SelectionGizmoTabs from './toolPanel/SelectionGizmoTabs.svelte';
  import {
    gizmoTabsVisible as gizmoTabsVisibleFn,
    piscinaWide as piscinaWideFn,
    toolPanelShellVisible
  } from './toolPanel/toolVisibility';

  const gizmoTabsVisible = $derived(
    gizmoTabsVisibleFn($tool, $selection.size, $addPanelStore.open)
  );
  const piscinaWide = $derived(piscinaWideFn($tool));
  const show = $derived(
    toolPanelShellVisible({
      tool: $tool,
      toolPane: $toolPane,
      strokeMode: $strokeMode,
      selectionSize: $selection.size,
      addPanelOpen: $addPanelStore.open
    })
  );
</script>

{#if show}
  <div
    class="tool-panel"
    class:sidebar-open={$sidebarOpen}
    class:piscina-wide={piscinaWide}
    data-voxelle-no-passthrough
    role="dialog"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    aria-modal="false"
    aria-label="Tool options"
    tabindex="-1"
  >
    {#if gizmoTabsVisible}
      <div class="tool-panel-gizmo">
        <SelectionGizmoTabs />
      </div>
    {/if}
    <div class="tool-panel-main">
      <DrawToolOptions />
      <StampToolOptions />
      <GeneratorToolOptions />
      <ClayToolOptions />
    </div>
  </div>
{/if}

<style>
  .tool-panel {
    position: fixed;
    bottom: 1rem;
    left: calc(1.5rem + 1rem);
    z-index: 100;
    background: var(--bg-color);
    color: var(--text-color);
    padding: 0.75rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 12rem;
    max-width: 16rem;
    max-height: min(80vh, 28rem);
    overflow-y: auto;
  }

  .tool-panel-main {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .tool-panel.sidebar-open {
    left: calc(360px + 1rem);
  }

  /*
   * Piscina / Insecta: wide enough for the multi-column layout, but capped so the
   * viewport stays usable. Internal scroll (below) holds long forms.
   */
  .tool-panel.piscina-wide {
    left: max(1rem, calc(1.5rem + 1rem));
    right: auto;
    width: auto;
    min-width: min(100%, 18rem);
    max-width: min(44rem, calc(100vw - 2.5rem));
    min-height: 0;
    /* Definite height so the flex child can shrink and scroll (max-height alone stays content-sized). */
    height: min(46vh, 24rem);
    max-height: min(46vh, 24rem);
    overflow: hidden;
    gap: 0.35rem;
    padding: 0.55rem 0.75rem;
  }

  .tool-panel-gizmo {
    flex-shrink: 0;
  }

  .tool-panel.piscina-wide .tool-panel-main {
    flex: 1 1 0;
    min-height: 0;
    min-width: 0;
    overflow-y: scroll;
    overflow-x: hidden;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-gutter: stable;
    padding-right: 0.25rem;
    margin-right: -0.1rem;
    gap: 0.35rem;
    scrollbar-width: thin;
  }

  .tool-panel.piscina-wide .tool-panel-main::-webkit-scrollbar {
    width: 8px;
  }

  .tool-panel.piscina-wide .tool-panel-main::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: color-mix(in oklab, var(--border-color) 65%, var(--text-color) 35%);
  }

  .tool-panel.piscina-wide .tool-panel-main::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklab, var(--border-color) 45%, var(--text-color) 55%);
  }

  .tool-panel.piscina-wide :global(.tool-panel-section) {
    gap: 0.35rem;
  }

  .tool-panel.piscina-wide :global(.tool-panel-section + .tool-panel-section) {
    padding-top: 0.35rem;
  }

  .tool-panel.piscina-wide :global(.tool-panel-row) {
    gap: 0.35rem;
  }

  /* Wide generator panels: avoid 2.5rem label column wrapping ("Ant len" → two lines). */
  .tool-panel.piscina-wide :global(.tool-panel-label) {
    width: auto;
    min-width: 4.25rem;
    white-space: nowrap;
  }

  .tool-panel.piscina-wide :global(.tool-panel-row--wide-label .tool-panel-label) {
    min-width: 5.5rem;
  }

  .tool-panel.sidebar-open.piscina-wide {
    left: calc(360px + 1rem);
    max-width: min(44rem, calc(100vw - 360px - 2rem));
  }

  .tool-panel :global(.tool-panel-section) {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tool-panel :global(.tool-panel-section + .tool-panel-section) {
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-color);
  }

  .tool-panel :global(.tool-panel-row) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tool-panel :global(.tool-panel-label) {
    flex-shrink: 0;
    width: 2.5rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .tool-panel :global(.tool-panel-value) {
    font-size: 0.85rem;
    opacity: 0.8;
    min-width: 1.5rem;
  }

  .tool-panel :global(.tool-panel-row input[type='range']),
  .tool-panel :global(.tool-panel-row input[type='number']) {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.35rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .tool-panel :global(.tool-panel-row input[type='range']) {
    accent-color: var(--link-color);
    padding: 0;
  }

  .tool-panel :global(.tool-panel-row input[type='number']) {
    width: 3rem;
  }

  .tool-panel :global(.tool-panel-row select.tool-panel-select),
  .tool-panel :global(.tool-panel-row .tool-panel-select) {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.35rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .tool-panel :global(.tool-panel-row--wide-label .tool-panel-label) {
    width: 5rem;
  }

  .tool-panel :global(.tool-panel-check) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .tool-panel :global(.tool-panel-check input[type='checkbox']) {
    accent-color: var(--link-color);
  }

  .tool-panel :global(.tool-panel-cross) {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    grid-template-rows: auto auto auto;
    gap: 0.25rem;
    place-items: center;
    margin-top: 0.25rem;
  }

  .tool-panel :global(.cross-up) {
    grid-column: 2;
    grid-row: 1;
  }
  .tool-panel :global(.cross-down) {
    grid-column: 2;
    grid-row: 3;
  }
  .tool-panel :global(.cross-left) {
    grid-column: 1;
    grid-row: 2;
  }
  .tool-panel :global(.cross-right) {
    grid-column: 3;
    grid-row: 2;
  }
  .tool-panel :global(.cross-center) {
    grid-column: 2;
    grid-row: 2;
    width: 2.5rem;
    height: 2rem;
  }

  .tool-panel :global(.tool-panel-cross button),
  .tool-panel :global(.tool-panel-roll button) {
    min-width: 2.75rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .tool-panel :global(.tool-panel-cross button:hover),
  .tool-panel :global(.tool-panel-roll button:hover) {
    background: var(--block-quote-bg-color);
  }

  .tool-panel :global(.tool-panel-roll) {
    margin-top: 0.25rem;
    gap: 0.25rem;
  }

  .tool-panel :global(.tool-panel-roll button) {
    min-width: 2.5rem;
  }

  .tool-panel :global(.stroke-buttons) {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tool-panel :global(.stroke-buttons button) {
    min-width: 2.5rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .tool-panel :global(.stroke-buttons button:hover) {
    background: var(--block-quote-bg-color);
  }

  .tool-panel :global(.stroke-buttons button.active) {
    background: var(--link-color);
    color: var(--bg-color);
    border-color: var(--link-color);
  }
</style>
