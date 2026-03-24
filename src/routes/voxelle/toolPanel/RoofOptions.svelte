<script lang="ts">
  import {
    tool,
    roofStyle,
    roofHeight,
    roofThickness,
    roofShedEdgeIndex,
    roofGableOrientation,
    roofBreakRatio,
    roofWallHeight,
    roofParapetHeight,
    roofSaltSkew,
    roofWindingFlipTick,
    roofHollow
  } from '../store/index';

  const ROOF_SHED_EDGE_WRAP = 16;
  const ROOF_GABLE_ORIENT_STATES = 3;

  const gableOrientNorm = $derived.by(() => {
    const n = ROOF_GABLE_ORIENT_STATES;
    return ((($roofGableOrientation % n) + n) % n) as 0 | 1 | 2;
  });
  const gableOrientationLabel = $derived(
    gableOrientNorm === 0 ? 'Auto' : gableOrientNorm === 1 ? 'U' : 'V'
  );

  function rotateShedEdge(delta: number) {
    roofShedEdgeIndex.update((i) => {
      const w = ROOF_SHED_EDGE_WRAP;
      return (((i + delta) % w) + w) % w;
    });
  }

  function rotateGableOrientation(delta: number) {
    roofGableOrientation.update((i) => {
      const w = ROOF_GABLE_ORIENT_STATES;
      return (((i + delta) % w) + w) % w;
    });
  }

  const roofShowThickness = $derived($roofStyle === 'flat' || $roofStyle === 'flat_parapet');
  const roofShowHeight = $derived($roofStyle !== 'flat' && $roofStyle !== 'flat_parapet');
  const roofShowRidge = $derived(
    $roofStyle === 'gable' ||
      $roofStyle === 'hip' ||
      $roofStyle === 'barrel' ||
      $roofStyle === 'dutch_gable'
  );
  const roofShowShedEdge = $derived($roofStyle === 'shed' || $roofStyle === 'saltbox');
  const roofShowSaltSkew = $derived($roofStyle === 'saltbox');
  const roofShowBreak = $derived(
    $roofStyle === 'mansard' || $roofStyle === 'gambrel' || $roofStyle === 'pavilion'
  );
  const roofShowWall = $derived($roofStyle === 'dutch_gable');
  const roofShowParapet = $derived($roofStyle === 'flat_parapet');
</script>

{#if $tool === 'roof'}
  <section class="tool-panel-section" aria-label="Roof">
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Style</span>
      <select
        class="tool-panel-select"
        value={$roofStyle}
        onchange={(e) => roofStyle.set((e.target as HTMLSelectElement).value as typeof $roofStyle)}
        title="Roof profile"
      >
        <option value="flat">Flat</option>
        <option value="flat_parapet">Flat + parapet</option>
        <option value="pyramid">Pyramid</option>
        <option value="cone">Cone (turret)</option>
        <option value="shed">Shed</option>
        <option value="saltbox">Saltbox</option>
        <option value="gable">Gable</option>
        <option value="hip">Hip</option>
        <option value="barrel">Barrel vault</option>
        <option value="mansard">Mansard</option>
        <option value="gambrel">Gambrel</option>
        <option value="pavilion">Pavilion</option>
        <option value="dutch_gable">Dutch gable</option>
      </select>
    </div>
    <div class="tool-panel-row">
      <label class="tool-panel-check">
        <input
          type="checkbox"
          checked={$roofHollow}
          onchange={(e) => roofHollow.set((e.target as HTMLInputElement).checked)}
          title="Keep only surface voxels (hollow interior)"
        />
        Hollow (shell only)
      </label>
    </div>
    <div class="tool-panel-row tool-panel-row--roof-edge">
      <span class="tool-panel-label">Winding</span>
      <div class="stroke-buttons roof-shed-lr" role="group" aria-label="Roof polygon winding">
        <button
          type="button"
          onclick={() => roofWindingFlipTick.update((n) => n + 1)}
          title="Reverse corner order (affects shed direction, fill normal, and asymmetry)"
        >
          Flip
        </button>
      </div>
    </div>
    {#if roofShowThickness}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Thickness</span>
        <input
          type="range"
          min="1"
          max="20"
          step="1"
          value={$roofThickness}
          oninput={(e) => roofThickness.set(Number((e.target as HTMLInputElement).value))}
          title="Slab depth (1–20 voxels)"
        />
        <span class="tool-panel-value">{$roofThickness}</span>
      </div>
    {/if}
    {#if roofShowParapet}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Parapet</span>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          value={$roofParapetHeight}
          oninput={(e) => roofParapetHeight.set(Number((e.target as HTMLInputElement).value))}
          title="Extra layers on boundary ring (1–8)"
        />
        <span class="tool-panel-value">{$roofParapetHeight}</span>
      </div>
    {/if}
    {#if roofShowHeight}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Height</span>
        <input
          type="range"
          min="1"
          max="32"
          step="1"
          value={$roofHeight}
          oninput={(e) => roofHeight.set(Number((e.target as HTMLInputElement).value))}
          title="Max rise (1–32 voxels)"
        />
        <span class="tool-panel-value">{$roofHeight}</span>
      </div>
    {/if}
    {#if roofShowWall}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Wall</span>
        <input
          type="range"
          min="0"
          max="16"
          step="1"
          value={$roofWallHeight}
          oninput={(e) => roofWallHeight.set(Number((e.target as HTMLInputElement).value))}
          title="Vertical wall layers before gable (0–16)"
        />
        <span class="tool-panel-value">{$roofWallHeight}</span>
      </div>
    {/if}
    {#if roofShowBreak}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Knee</span>
        <input
          type="range"
          min="20"
          max="80"
          step="1"
          value={Math.round($roofBreakRatio * 100)}
          oninput={(e) => roofBreakRatio.set(Number((e.target as HTMLInputElement).value) / 100)}
          title="Slope break along span (20–80%)"
        />
        <span class="tool-panel-value">{Math.round($roofBreakRatio * 100)}%</span>
      </div>
    {/if}
    {#if roofShowSaltSkew}
      <div class="tool-panel-row">
        <span class="tool-panel-label">Skew</span>
        <input
          type="range"
          min="-50"
          max="50"
          step="1"
          value={$roofSaltSkew}
          oninput={(e) => roofSaltSkew.set(Number((e.target as HTMLInputElement).value))}
          title="Move ridge along span: short steep leg vs long gentle leg (-50…50)"
        />
        <span class="tool-panel-value">{$roofSaltSkew}</span>
      </div>
    {/if}
    {#if roofShowShedEdge}
      <div class="tool-panel-row tool-panel-row--roof-edge">
        <span class="tool-panel-label">Edge</span>
        <div class="stroke-buttons roof-shed-lr" role="group" aria-label="Rotate low eave edge">
          <button
            type="button"
            onclick={() => rotateShedEdge(-1)}
            title="Previous eave edge (wraps)"
            aria-label="Previous eave edge"
          >
            L
          </button>
          <span class="tool-panel-value roof-shed-edge-value">{$roofShedEdgeIndex}</span>
          <button
            type="button"
            onclick={() => rotateShedEdge(1)}
            title="Next eave edge (wraps)"
            aria-label="Next eave edge"
          >
            R
          </button>
        </div>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label" aria-hidden="true"></span>
        <input
          type="range"
          min="0"
          max="15"
          step="1"
          value={$roofShedEdgeIndex}
          oninput={(e) => roofShedEdgeIndex.set(Number((e.target as HTMLInputElement).value))}
          title="Low eave: vertex index for edge i → i+1 (wraps)"
        />
      </div>
    {/if}
    {#if roofShowRidge}
      <div class="tool-panel-row tool-panel-row--roof-edge">
        <span class="tool-panel-label">Ridge</span>
        <div
          class="stroke-buttons roof-shed-lr"
          role="group"
          aria-label="Cycle gable ridge direction"
        >
          <button
            type="button"
            onclick={() => rotateGableOrientation(-1)}
            title="Previous: Auto → V → U → Auto"
            aria-label="Previous gable ridge orientation"
          >
            L
          </button>
          <span class="tool-panel-value roof-shed-edge-value">{gableOrientationLabel}</span>
          <button
            type="button"
            onclick={() => rotateGableOrientation(1)}
            title="Next: Auto → U → V → Auto"
            aria-label="Next gable ridge orientation"
          >
            R
          </button>
        </div>
      </div>
    {/if}
  </section>
{/if}

<style>
  .tool-panel-select {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.35rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  :global(.tool-panel-row--roof-edge .roof-shed-lr) {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-width: 0;
  }

  :global(.roof-shed-edge-value) {
    min-width: 1.25rem;
    text-align: center;
  }
</style>
