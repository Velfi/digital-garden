<script lang="ts">
  import {
    tool,
    selection,
    bookStampPattern,
    stampRotation,
    stampOriginMode,
    punchDepth,
    PUNCH_DEPTH_MAX,
    clampQuarterTurn,
    modalRequest,
    type StampRotation
  } from '../store/index';

  const hasStampShape = $derived(($bookStampPattern?.size ?? 0) > 0 || $selection.size > 0);
  function updateStamp<K extends keyof StampRotation>(k: K, v: StampRotation[K]) {
    stampRotation.update((s: StampRotation) => ({ ...s, [k]: v }));
  }
</script>

{#if $tool === 'stamp' || $tool === 'punch'}
  <div class="stamp-book-link-row">
    <button type="button" class="stamp-book-open" onclick={() => modalRequest.set('stampBook')}>
      Stamp book…
    </button>
  </div>
{/if}

{#if ($tool === 'stamp' || $tool === 'punch') && hasStampShape}
  <section class="tool-panel-section" aria-label="Stamp and punch">
    {#if $tool === 'punch'}
      <div class="tool-panel-row tool-panel-row--wide-label">
        <span class="tool-panel-label">Depth</span>
        <input
          type="range"
          min="1"
          max={PUNCH_DEPTH_MAX}
          step="1"
          value={$punchDepth}
          oninput={(e) => {
            const v = Math.floor(Number((e.target as HTMLInputElement).value));
            punchDepth.set(Math.max(1, Math.min(PUNCH_DEPTH_MAX, v)));
          }}
          aria-label="Punch depth in voxel layers"
        />
        <span class="tool-panel-value" title="Layers along punch direction">{$punchDepth}</span>
      </div>
    {/if}
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Origin</span>
      <select
        class="tool-panel-select"
        value={$stampOriginMode}
        onchange={(e) =>
          stampOriginMode.set((e.target as HTMLSelectElement).value as 'center' | 'corner')}
      >
        <option value="center">From center</option>
        <option value="corner">From corner</option>
      </select>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Rot</span>
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$stampRotation.rotX}
        oninput={(e) =>
          updateStamp('rotX', clampQuarterTurn(Number((e.target as HTMLInputElement).value)))}
        title="X (0–3 = 0°–270°)"
      />
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$stampRotation.rotY}
        oninput={(e) =>
          updateStamp('rotY', clampQuarterTurn(Number((e.target as HTMLInputElement).value)))}
        title="Y"
      />
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$stampRotation.rotZ}
        oninput={(e) =>
          updateStamp('rotZ', clampQuarterTurn(Number((e.target as HTMLInputElement).value)))}
        title="Z"
      />
    </div>
    <div class="tool-panel-cross">
      <button
        type="button"
        class="cross-up"
        onclick={() => updateStamp('rotX', clampQuarterTurn($stampRotation.rotX - 1))}
        title="Tilt up"
      >
        Up
      </button>
      <button
        type="button"
        class="cross-down"
        onclick={() => updateStamp('rotX', clampQuarterTurn($stampRotation.rotX + 1))}
        title="Tilt down"
      >
        Down
      </button>
      <button
        type="button"
        class="cross-left"
        onclick={() => updateStamp('rotY', clampQuarterTurn($stampRotation.rotY - 1))}
        title="Turn left"
      >
        Left
      </button>
      <button
        type="button"
        class="cross-right"
        onclick={() => updateStamp('rotY', clampQuarterTurn($stampRotation.rotY + 1))}
        title="Turn right"
      >
        Right
      </button>
      <div class="cross-center" aria-hidden="true"></div>
    </div>
    <div class="tool-panel-row tool-panel-roll">
      <span class="tool-panel-label">Roll</span>
      <button
        type="button"
        onclick={() => updateStamp('rotZ', clampQuarterTurn($stampRotation.rotZ - 1))}
        title="Roll left"
      >
        ←
      </button>
      <button
        type="button"
        onclick={() => updateStamp('rotZ', clampQuarterTurn($stampRotation.rotZ + 1))}
        title="Roll right"
      >
        →
      </button>
    </div>
  </section>
{/if}

<style>
  .stamp-book-link-row {
    margin-bottom: 0.35rem;
  }

  .stamp-book-open {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .stamp-book-open:hover {
    background: var(--block-quote-bg-color);
  }
</style>
