<script lang="ts">
  import { displayUnit, snapEnabled } from './store/units';

  let { open = $bindable(false) } = $props();
</script>

{#if open}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal">
      <h3>Options</h3>

      <fieldset class="unit-group">
        <legend>Display units</legend>
        <p class="hint">
          Enamel pins are physical objects — all dimensions are stored in millimeters.
          This only changes how measurements are shown in the UI.
        </p>
        <label class="unit-option">
          <input
            type="radio"
            name="display-unit"
            value="mm"
            checked={$displayUnit === 'mm'}
            onchange={() => displayUnit.set('mm')}
          />
          Millimeters (mm)
        </label>
        <label class="unit-option">
          <input
            type="radio"
            name="display-unit"
            value="in"
            checked={$displayUnit === 'in'}
            onchange={() => displayUnit.set('in')}
          />
          Inches (in)
        </label>
      </fieldset>

      <fieldset class="unit-group">
        <legend>Snapping</legend>
        <p class="hint">
          Path anchors quantize to a 1&nbsp;mm grid so endpoints from different
          paths land on the same point. Disable for free placement.
        </p>
        <label class="unit-option">
          <input
            type="checkbox"
            checked={$snapEnabled}
            onchange={(e) => snapEnabled.set(e.currentTarget.checked)}
          />
          Snap anchors to grid
        </label>
      </fieldset>

      <div class="modal-buttons">
        <button type="button" onclick={() => (open = false)}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .unit-group {
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.6rem 0.8rem 0.4rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .unit-group legend {
    padding: 0 0.3rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .hint {
    font-size: 0.8rem;
    opacity: 0.8;
    margin: 0 0 0.4rem;
    line-height: 1.35;
  }

  .unit-option {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
</style>
