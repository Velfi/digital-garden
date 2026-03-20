<script lang="ts">
  import {
    loadPreferences,
    savePreferences,
    voxellePreferences,
    type VoxellePreferences
  } from '../store/index';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let prefs = $state<VoxellePreferences>(loadPreferences());

  $effect(() => {
    if (open) {
      const loaded = loadPreferences();
      prefs = loaded;
      voxellePreferences.set(loaded);
    }
  });

  function onMovementDeltaHintChange(checked: boolean) {
    prefs = { ...prefs, showMovementDeltaHint: checked };
    savePreferences(prefs);
  }

  function onDragDeltaHintChange(checked: boolean) {
    prefs = { ...prefs, showDragDeltaHint: checked };
    savePreferences(prefs);
  }

  function onGizmosAlwaysOnTopChange(checked: boolean) {
    prefs = { ...prefs, gizmosAlwaysOnTop: checked };
    savePreferences(prefs);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="preferences-title"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal modal--preferences">
      <h3 id="preferences-title">Preferences</h3>
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={prefs.showMovementDeltaHint}
          onchange={(e) => onMovementDeltaHintChange(e.currentTarget.checked)}
        />
        Show movement delta hint (Δx, Δy, Δz near cursor during strokes)
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={prefs.showDragDeltaHint}
          onchange={(e) => onDragDeltaHintChange(e.currentTarget.checked)}
        />
        Show selection move drag hint (line and delta at original position)
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={prefs.gizmosAlwaysOnTop}
          onchange={(e) => onGizmosAlwaysOnTopChange(e.currentTarget.checked)}
        />
        Always render movement and rotation gizmos on top
      </label>
      <div class="modal-buttons">
        <button type="button" onclick={() => (open = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal--preferences {
    min-width: min(90vw, 24rem);
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
    line-height: 1.35;
    cursor: pointer;
  }

  .checkbox-label input {
    margin-top: 0.15rem;
    flex-shrink: 0;
  }

  .modal-buttons button {
    padding: 0.35rem 0.75rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .modal-buttons button:hover {
    background: var(--block-quote-bg-color);
  }
</style>
