<script lang="ts">
  import {
    tool,
    rockSize,
    rockRoughness,
    rockCount,
    rockClusterRadius,
    rockSinkDirection,
    rockSinkAmount,
    ashlarSize,
    ashlarRoughness,
    ashlarThickness,
    grassRadius,
    grassDensity,
    grassHeight,
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
    MAX_BRUSH_SIZE
  } from '../store/index';
  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;
  const rockVisible = $derived($tool === 'rocks');
  const grassVisible = $derived($tool === 'grass');
  const ashlarVisible = $derived($tool === 'ashlar');
  const roofVisible = $derived($tool === 'roof');

  const ROOF_SHED_EDGE_WRAP = 16;
  const ROOF_GABLE_ORIENT_STATES = 3;

  const gableOrientNorm = $derived.by(() => {
    const n = ROOF_GABLE_ORIENT_STATES;
    return (((($roofGableOrientation % n) + n) % n) as 0 | 1 | 2);
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

{#if rockVisible}
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

{#if ashlarVisible}
  <section class="tool-panel-section" aria-label="Ashlar">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Size</span>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        value={$ashlarSize}
        oninput={(e) => ashlarSize.set(Number((e.target as HTMLInputElement).value))}
        title="Block scale (1–20 voxels per dimension)"
      />
      <span class="tool-panel-value">{$ashlarSize}</span>
    </div>
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Roughness</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round($ashlarRoughness * 100)}
        oninput={(e) => ashlarRoughness.set(Number((e.target as HTMLInputElement).value) / 100)}
        title="Edge irregularity (0–100%)"
      />
      <span class="tool-panel-value">{Math.round($ashlarRoughness * 100)}%</span>
    </div>
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Thickness</span>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        value={$ashlarThickness}
        oninput={(e) => ashlarThickness.set(Number((e.target as HTMLInputElement).value))}
        title="Depth along surface normal (1–20 voxels); thin walls"
      />
      <span class="tool-panel-value">{$ashlarThickness}</span>
    </div>
  </section>
{/if}

{#if grassVisible}
  <section class="tool-panel-section" aria-label="Grass">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Radius</span>
      <input
        type="range"
        min="2"
        max="20"
        step="1"
        value={$grassRadius}
        oninput={(e) => grassRadius.set(Number((e.target as HTMLInputElement).value))}
        title="Patch radius (2–20 voxels)"
      />
      <span class="tool-panel-value">{$grassRadius}</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Density</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round($grassDensity * 100)}
        oninput={(e) => grassDensity.set(Number((e.target as HTMLInputElement).value) / 100)}
        title="Blade density (0–100%)"
      />
      <span class="tool-panel-value">{Math.round($grassDensity * 100)}%</span>
    </div>
    <div class="tool-panel-row">
      <span class="tool-panel-label">Height</span>
      <input
        type="range"
        min="1"
        max="6"
        step="1"
        value={$grassHeight}
        oninput={(e) => grassHeight.set(Number((e.target as HTMLInputElement).value))}
        title="Max blade height (1–6 voxels)"
      />
      <span class="tool-panel-value">{$grassHeight}</span>
    </div>
  </section>
{/if}

{#if roofVisible}
  <section class="tool-panel-section" aria-label="Roof">
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Style</span>
      <select
        class="tool-panel-select"
        value={$roofStyle}
        onchange={(e) =>
          roofStyle.set((e.target as HTMLSelectElement).value as typeof $roofStyle)}
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
          oninput={(e) =>
            roofBreakRatio.set(Number((e.target as HTMLInputElement).value) / 100)}
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
        <div
          class="stroke-buttons roof-shed-lr"
          role="group"
          aria-label="Rotate low eave edge"
        >
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
</style>
