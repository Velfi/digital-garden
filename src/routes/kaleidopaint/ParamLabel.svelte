<script lang="ts">
  export let label: string;
  export let tip: string;
  export let id: string;
</script>

<span class="param-label">
  {label}
  <button
    type="button"
    class="param-tip"
    id={id + '-btn'}
    popovertarget={id}
    aria-label="What does {label} do?"
    title={tip}
    on:click|stopPropagation
  >
    ⓘ
  </button>
</span>
<div {id} popover="auto" anchor={`${id}-btn`} role="tooltip" class="param-tooltip">{tip}</div>

<style>
  .param-label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    justify-content: space-between;
  }

  .param-tip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    min-height: 1.5rem;
    padding: 0.2em;
    font-size: 0.85em;
    line-height: 1;
    border: none;
    border-radius: 50%;
    background: var(--text-color-muted, #888);
    color: var(--bg-color, #fff);
    cursor: pointer;
    flex-shrink: 0;
  }

  .param-tip:hover {
    background: var(--accent-color, #08c);
  }

  .param-tip:focus-visible {
    outline: 2px solid var(--accent-color, #08c);
    outline-offset: 2px;
  }

  .param-tooltip {
    margin: 0;
    padding: 0.5rem 0.75rem;
    max-width: 16rem;
    font-size: 0.85rem;
    line-height: 1.4;
    background: var(--text-color, #333);
    color: var(--bg-color, #fff);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    position: fixed;
    position-area: block-center inline-end;
    margin-inline-start: 0.5rem;
  }
</style>
