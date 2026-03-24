<script lang="ts">
  import {
    tool,
    rockSize,
    rockRoughness,
    rockCount,
    rockClusterRadius,
    rockSinkDirection,
    rockSinkAmount
  } from '../store/index';
</script>

{#if $tool === 'rocks'}
  <section class="tool-panel-section" aria-label="Rocks">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Size</span>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        value={$rockSize}
        oninput={(e) => rockSize.set(Number((e.target as HTMLInputElement).value))}
        title="Rock radius (1–20 voxels)"
      />
      <span class="tool-panel-value">{$rockSize}</span>
    </div>
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Roughness</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round($rockRoughness * 100)}
        oninput={(e) => rockRoughness.set(Number((e.target as HTMLInputElement).value) / 100)}
        title="Surface irregularity (0–100%)"
      />
      <span class="tool-panel-value">{Math.round($rockRoughness * 100)}%</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Count</span>
      <input
        type="range"
        min="1"
        max="5"
        step="1"
        value={$rockCount}
        oninput={(e) => rockCount.set(Number((e.target as HTMLInputElement).value))}
        title="Rocks per click (1–5)"
      />
      <span class="tool-panel-value">{$rockCount}</span>
    </div>
    {#if $rockCount > 1}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Spread</span>
        <input
          type="range"
          min="0"
          max="3"
          step="1"
          value={$rockClusterRadius}
          oninput={(e) => rockClusterRadius.set(Number((e.target as HTMLInputElement).value))}
          title="Cluster radius in voxels (0–3)"
        />
        <span class="tool-panel-value">{$rockClusterRadius}</span>
      </div>
    {/if}
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Sink</span>
      <div class="stroke-buttons" role="group" aria-label="Sink direction">
        <button
          type="button"
          class:active={$rockSinkDirection === 'over'}
          onclick={() => rockSinkDirection.set('over')}
          title="Floating above surface"
        >
          Over
        </button>
        <button
          type="button"
          class:active={$rockSinkDirection === 'none'}
          onclick={() => rockSinkDirection.set('none')}
          title="Place on surface"
        >
          None
        </button>
        <button
          type="button"
          class:active={$rockSinkDirection === 'under'}
          onclick={() => rockSinkDirection.set('under')}
          title="Buried in surface"
        >
          Under
        </button>
      </div>
    </div>
    {#if $rockSinkDirection !== 'none'}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Layers</span>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={$rockSinkAmount}
          oninput={(e) => rockSinkAmount.set(Number((e.target as HTMLInputElement).value))}
          title="Sink layers (1–5)"
        />
        <span class="tool-panel-value">{$rockSinkAmount}</span>
      </div>
    {/if}
  </section>
{/if}
