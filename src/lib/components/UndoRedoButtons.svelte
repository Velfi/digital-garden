<script lang="ts">
  interface HistoryApi {
    undo: () => void;
    redo: () => void;
  }
  interface Props {
    history: HistoryApi;
    canUndo: { subscribe: (fn: (v: boolean) => void) => () => void };
    canRedo: { subscribe: (fn: (v: boolean) => void) => () => void };
  }

  let { history, canUndo, canRedo }: Props = $props();
</script>

<div class="undo-redo">
  <button
    type="button"
    onclick={() => history.undo()}
    disabled={!$canUndo}
    title="Undo (Ctrl+Z / Cmd+Z)"
  >
    Undo
  </button>
  <button
    type="button"
    onclick={() => history.redo()}
    disabled={!$canRedo}
    title="Redo (Ctrl+Shift+Z / Cmd+Y)"
  >
    Redo
  </button>
</div>

<style>
  .undo-redo {
    display: flex;
    gap: 0.25rem;
  }

  .undo-redo button {
    flex: 1;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .undo-redo button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .undo-redo button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
