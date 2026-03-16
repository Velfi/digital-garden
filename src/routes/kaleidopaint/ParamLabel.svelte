<script lang="ts">
  export let label: string;
  export let tip: string;
  export let id: string;

  let tipButton: HTMLButtonElement | null = null;
  let tooltipEl: HTMLDivElement | null = null;

  function positionTooltip() {
    if (!tipButton || !tooltipEl) return;
    const buttonRect = tipButton.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const gap = 8;
    const viewportPadding = 8;

    let left = buttonRect.right + gap;
    if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
      left = buttonRect.left - tooltipRect.width - gap;
    }
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));

    let top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
    top = Math.max(viewportPadding, Math.min(top, window.innerHeight - tooltipRect.height - viewportPadding));

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  function handleTooltipToggle() {
    if (!tooltipEl?.matches(':popover-open')) return;
    requestAnimationFrame(positionTooltip);
  }
</script>

<span class="param-label">
  {label}
  <button
    type="button"
    class="param-tip"
    bind:this={tipButton}
    id={id + '-btn'}
    popovertarget={id}
    aria-label="What does {label} do?"
    title={tip}
    on:click|stopPropagation
  >
    ⓘ
  </button>
</span>
<div bind:this={tooltipEl} {id} popover="auto" role="tooltip" class="param-tooltip" on:toggle={handleTooltipToggle}>
  {tip}
</div>

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
    inset: auto auto auto auto;
  }
</style>
