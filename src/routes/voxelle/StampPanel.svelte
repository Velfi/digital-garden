<script lang="ts">
  import { stampRotation, tool, selection, sidebarOpen, type StampRotation } from './store';

  function update<K extends keyof StampRotation>(k: K, v: StampRotation[K]) {
    stampRotation.update((s) => ({ ...s, [k]: v }));
  }

  function clampRot(n: number) {
    return Math.max(0, Math.min(3, Math.floor(n))) & 3;
  }
</script>

{#if $tool === 'stamp' && $selection.size > 0}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="add-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    aria-modal="false"
    aria-labelledby="stamp-panel-title"
    tabindex="-1"
  >
    <h3 id="stamp-panel-title">Stamp rotation</h3>
    <div class="add-panel-row">
      <span class="add-panel-label">Rot</span>
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$stampRotation.rotX}
        oninput={(e) => update('rotX', clampRot(Number((e.target as HTMLInputElement).value)))}
        title="X (0–3 = 0°–270°)"
      />
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$stampRotation.rotY}
        oninput={(e) => update('rotY', clampRot(Number((e.target as HTMLInputElement).value)))}
        title="Y"
      />
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$stampRotation.rotZ}
        oninput={(e) => update('rotZ', clampRot(Number((e.target as HTMLInputElement).value)))}
        title="Z"
      />
    </div>
    <div class="add-panel-cross">
      <button
        type="button"
        class="cross-up"
        onclick={() => update('rotX', clampRot($stampRotation.rotX - 1))}
        title="Tilt up"
      >
        Up
      </button>
      <button
        type="button"
        class="cross-down"
        onclick={() => update('rotX', clampRot($stampRotation.rotX + 1))}
        title="Tilt down"
      >
        Down
      </button>
      <button
        type="button"
        class="cross-left"
        onclick={() => update('rotY', clampRot($stampRotation.rotY - 1))}
        title="Turn left"
      >
        Left
      </button>
      <button
        type="button"
        class="cross-right"
        onclick={() => update('rotY', clampRot($stampRotation.rotY + 1))}
        title="Turn right"
      >
        Right
      </button>
      <div class="cross-center" aria-hidden="true"></div>
    </div>
    <div class="add-panel-row add-panel-roll">
      <span class="add-panel-label">Roll</span>
      <button type="button" onclick={() => update('rotZ', clampRot($stampRotation.rotZ - 1))} title="Roll left">
        ←
      </button>
      <button type="button" onclick={() => update('rotZ', clampRot($stampRotation.rotZ + 1))} title="Roll right">
        →
      </button>
    </div>
  </div>
{/if}

<style>
  .add-panel-cross {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    grid-template-rows: auto auto auto;
    gap: 0.25rem;
    place-items: center;
    margin-top: 0.25rem;
  }

  .cross-up { grid-column: 2; grid-row: 1; }
  .cross-down { grid-column: 2; grid-row: 3; }
  .cross-left { grid-column: 1; grid-row: 2; }
  .cross-right { grid-column: 3; grid-row: 2; }
  .cross-center { grid-column: 2; grid-row: 2; width: 2.5rem; height: 2rem; }

  .add-panel-cross button,
  .add-panel-roll button {
    min-width: 2.75rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .add-panel-cross button:hover,
  .add-panel-roll button:hover {
    background: var(--block-quote-bg-color);
  }

  .add-panel-roll {
    margin-top: 0.25rem;
    gap: 0.25rem;
  }

  .add-panel-roll button {
    min-width: 2.5rem;
  }
</style>
