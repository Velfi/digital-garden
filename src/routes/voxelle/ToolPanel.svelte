<script lang="ts">
  import { get } from 'svelte/store';
  import {
    tool,
    toolPane,
    strokeMode,
    planeAxis,
    sidebarOpen,
    selection,
    stampRotation,
    clayMode,
    clayBrushRadius,
    branchTaper,
    puffRadius,
    puffRadiusRange,
    puffRadiusMin,
    puffRadiusMax,
    puffScatter,
    ropeBrushShape,
    ropeBrushRadius,
    drawBrushShape,
    drawBrushSize,
    drawBrushSnapToSurface,
    airbrushRadius,
    airbrushScatter,
    airbrushRadiusRange,
    airbrushRadiusMin,
    airbrushRadiusMax,
    fillSelectDiagonals,
    fillRespectsColor,
    type DrawBrushShape,
    type StampRotation
  } from './store';

  const STROKE_TOOLS = ['voxel', 'remove', 'paint', 'select', 'selectByColor'] as const;
  const isStrokeTool = (t: string) => STROKE_TOOLS.includes(t as (typeof STROKE_TOOLS)[number]);

  const drawBrushVisible = $derived($toolPane === 'draw' && isStrokeTool($tool));
  const planeAxisVisible = $derived(
    ($strokeMode === 'plane' || $strokeMode === 'cuboid') && isStrokeTool($tool)
  );
  const airbrushVisible = $derived($strokeMode === 'airbrush' && isStrokeTool($tool));
  const fillVisible = $derived($strokeMode === 'fill' && isStrokeTool($tool));
  const stampVisible = $derived($tool === 'stamp' && $selection.size > 0);
  const clayVisible = $derived($tool === 'clay');

  const show = $derived(
    drawBrushVisible || planeAxisVisible || airbrushVisible || fillVisible || stampVisible || clayVisible
  );

  const DRAW_BRUSH_SHAPES: { id: DrawBrushShape; label: string; title: string }[] = [
    { id: 'sphere', label: 'Sphere', title: 'Spherical brush (Euclidean distance)' },
    { id: 'cube', label: 'Cube', title: 'Cubic brush (Chebyshev distance)' },
    { id: 'pyramid', label: 'Pyramid', title: 'Pyramid brush (tapers from base to tip)' }
  ];

  function clampRot(n: number) {
    return Math.max(0, Math.min(3, Math.floor(n))) & 3;
  }
  function updateStamp<K extends keyof StampRotation>(k: K, v: StampRotation[K]) {
    stampRotation.update((s: StampRotation) => ({ ...s, [k]: v }));
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="tool-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    aria-modal="false"
    aria-label="Tool options"
    tabindex="-1"
  >
    {#if drawBrushVisible}
      <section class="tool-panel-section" aria-label="Draw brush">
        <div class="stroke-buttons" role="group" aria-label="Brush shape">
          {#each DRAW_BRUSH_SHAPES as s}
            <button
              type="button"
              class:active={$drawBrushShape === s.id}
              onclick={() => drawBrushShape.set(s.id)}
              title={s.title}
            >
              {s.label}
            </button>
          {/each}
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Size</span>
          <input
            type="range"
            min="0"
            max="5"
            step="1"
            value={$drawBrushSize}
            oninput={(e) => drawBrushSize.set(Number((e.target as HTMLInputElement).value))}
            title="Brush radius (0 = single voxel)"
          />
          <span class="tool-panel-value">{$drawBrushSize}</span>
        </div>
        <label class="tool-panel-check">
          <input
            type="checkbox"
            checked={$drawBrushSnapToSurface}
            onchange={(e) => drawBrushSnapToSurface.set((e.target as HTMLInputElement).checked)}
            title="Offset brush along surface normal so it sits on the face instead of through it"
          />
          Snap to surface
        </label>
      </section>
    {/if}

    {#if planeAxisVisible}
      <section class="tool-panel-section" aria-label="Plane axis">
        <div class="stroke-buttons" role="group" aria-label="Plane axis">
          <button
            type="button"
            class:active={$planeAxis === 0}
            onclick={() => planeAxis.set(0)}
            title="Vertical plane (YZ)"
          >
            X
          </button>
          <button
            type="button"
            class:active={$planeAxis === 1}
            onclick={() => planeAxis.set(1)}
            title="Horizontal plane (XZ)"
          >
            Y
          </button>
          <button
            type="button"
            class:active={$planeAxis === 2}
            onclick={() => planeAxis.set(2)}
            title="Vertical plane (XY)"
          >
            Z
          </button>
          <button
            type="button"
            class:active={$planeAxis === 'auto'}
            onclick={() => planeAxis.set('auto')}
            title="Auto: use clicked face"
          >
            Auto
          </button>
        </div>
      </section>
    {/if}

    {#if airbrushVisible}
      <section class="tool-panel-section" aria-label="Airbrush">
        <div class="tool-panel-row">
          <label class="tool-panel-check">
            <input
              type="checkbox"
              checked={$airbrushRadiusRange}
              onchange={(e) => airbrushRadiusRange.set((e.target as HTMLInputElement).checked)}
              title="Vary droplet size for spray effect"
            />
            Size range
          </label>
        </div>
        {#if $airbrushRadiusRange}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Min</span>
            <input
              type="range"
              min="0"
              max="5"
              step="1"
              value={$airbrushRadiusMin}
              oninput={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                airbrushRadiusMin.set(v);
                if (v > get(airbrushRadiusMax)) airbrushRadiusMax.set(v);
              }}
            />
            <span class="tool-panel-value">{$airbrushRadiusMin}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Max</span>
            <input
              type="range"
              min="0"
              max="5"
              step="1"
              value={$airbrushRadiusMax}
              oninput={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                airbrushRadiusMax.set(v);
                if (v < get(airbrushRadiusMin)) airbrushRadiusMin.set(v);
              }}
            />
            <span class="tool-panel-value">{$airbrushRadiusMax}</span>
          </div>
        {:else}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Size</span>
            <input
              type="range"
              min="0"
              max="5"
              step="1"
              value={$airbrushRadius}
              oninput={(e) => airbrushRadius.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$airbrushRadius}</span>
          </div>
        {/if}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Scatter</span>
          <input
            type="range"
            min="0"
            max="4"
            step="1"
            value={$airbrushScatter}
            oninput={(e) => airbrushScatter.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$airbrushScatter}</span>
        </div>
      </section>
    {/if}

    {#if fillVisible}
      <section class="tool-panel-section" aria-label="Fill">
        <div class="tool-panel-row">
          <label class="tool-panel-check">
            <input
              type="checkbox"
              checked={$fillSelectDiagonals}
              onchange={(e) => fillSelectDiagonals.set((e.target as HTMLInputElement).checked)}
            />
            Include diagonals
          </label>
        </div>
        <div class="tool-panel-row">
          <label class="tool-panel-check">
            <input
              type="checkbox"
              checked={$fillRespectsColor}
              onchange={(e) => fillRespectsColor.set((e.target as HTMLInputElement).checked)}
            />
            Respect color
          </label>
        </div>
      </section>
    {/if}

    {#if stampVisible}
      <section class="tool-panel-section" aria-label="Stamp">
        <div class="tool-panel-row">
          <span class="tool-panel-label">Rot</span>
          <input
            type="number"
            min="0"
            max="3"
            step="1"
            value={$stampRotation.rotX}
            oninput={(e) => updateStamp('rotX', clampRot(Number((e.target as HTMLInputElement).value)))}
            title="X (0–3 = 0°–270°)"
          />
          <input
            type="number"
            min="0"
            max="3"
            step="1"
            value={$stampRotation.rotY}
            oninput={(e) => updateStamp('rotY', clampRot(Number((e.target as HTMLInputElement).value)))}
            title="Y"
          />
          <input
            type="number"
            min="0"
            max="3"
            step="1"
            value={$stampRotation.rotZ}
            oninput={(e) => updateStamp('rotZ', clampRot(Number((e.target as HTMLInputElement).value)))}
            title="Z"
          />
        </div>
        <div class="tool-panel-cross">
          <button
            type="button"
            class="cross-up"
            onclick={() => updateStamp('rotX', clampRot($stampRotation.rotX - 1))}
            title="Tilt up"
          >
            Up
          </button>
          <button
            type="button"
            class="cross-down"
            onclick={() => updateStamp('rotX', clampRot($stampRotation.rotX + 1))}
            title="Tilt down"
          >
            Down
          </button>
          <button
            type="button"
            class="cross-left"
            onclick={() => updateStamp('rotY', clampRot($stampRotation.rotY - 1))}
            title="Turn left"
          >
            Left
          </button>
          <button
            type="button"
            class="cross-right"
            onclick={() => updateStamp('rotY', clampRot($stampRotation.rotY + 1))}
            title="Turn right"
          >
            Right
          </button>
          <div class="cross-center" aria-hidden="true"></div>
        </div>
        <div class="tool-panel-row tool-panel-roll">
          <span class="tool-panel-label">Roll</span>
          <button type="button" onclick={() => updateStamp('rotZ', clampRot($stampRotation.rotZ - 1))} title="Roll left">
            ←
          </button>
          <button type="button" onclick={() => updateStamp('rotZ', clampRot($stampRotation.rotZ + 1))} title="Roll right">
            →
          </button>
        </div>
      </section>
    {/if}

    {#if clayVisible}
      <section class="tool-panel-section tool-panel-clay" aria-label="Clay">
        {#if ['bulk', 'smooth', 'level', 'gouge', 'branch', 'melt'].includes($clayMode)}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Brush</span>
            <input
              type="range"
              min="0"
              max="2"
              step="1"
              value={$clayBrushRadius}
              oninput={(e) => clayBrushRadius.set(Number((e.target as HTMLInputElement).value))}
              title="Brush size (0–2)"
            />
            <span class="tool-panel-value">{$clayBrushRadius}</span>
          </div>
          {#if $clayMode === 'branch'}
            <div class="tool-panel-row">
              <label class="tool-panel-check">
                <input
                  type="checkbox"
                  checked={$branchTaper}
                  onchange={(e) => branchTaper.set((e.target as HTMLInputElement).checked)}
                  title="Taper from thick base to thin tip"
                />
                Taper
              </label>
            </div>
          {/if}
        {/if}
        {#if $clayMode === 'puffy'}
          <div class="tool-panel-row">
            <label class="tool-panel-check">
              <input
                type="checkbox"
                checked={$puffRadiusRange}
                onchange={(e) => puffRadiusRange.set((e.target as HTMLInputElement).checked)}
                title="Vary sphere size per stamp"
              />
              Size range
            </label>
          </div>
          {#if $puffRadiusRange}
            <div class="tool-panel-row">
              <span class="tool-panel-label">Min</span>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={$puffRadiusMin}
                oninput={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  puffRadiusMin.set(v);
                  if (v > get(puffRadiusMax)) puffRadiusMax.set(v);
                }}
              />
              <span class="tool-panel-value">{$puffRadiusMin}</span>
            </div>
            <div class="tool-panel-row">
              <span class="tool-panel-label">Max</span>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={$puffRadiusMax}
                oninput={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  puffRadiusMax.set(v);
                  if (v < get(puffRadiusMin)) puffRadiusMin.set(v);
                }}
              />
              <span class="tool-panel-value">{$puffRadiusMax}</span>
            </div>
          {:else}
            <div class="tool-panel-row">
              <span class="tool-panel-label">Size</span>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={$puffRadius}
                oninput={(e) => puffRadius.set(Number((e.target as HTMLInputElement).value))}
              />
              <span class="tool-panel-value">{$puffRadius}</span>
            </div>
          {/if}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Scatter</span>
            <input
              type="range"
              min="0"
              max="4"
              step="1"
              value={$puffScatter}
              oninput={(e) => puffScatter.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$puffScatter}</span>
          </div>
        {/if}
        {#if $clayMode === 'rope'}
          <div class="tool-panel-row">
            <span class="tool-panel-label">Shape</span>
            <div class="stroke-buttons" role="group" aria-label="Rope brush shape">
              <button
                type="button"
                class:active={$ropeBrushShape === 'sphere'}
                onclick={() => ropeBrushShape.set('sphere')}
                title="Spherical brush"
              >
                Sphere
              </button>
              <button
                type="button"
                class:active={$ropeBrushShape === 'cube'}
                onclick={() => ropeBrushShape.set('cube')}
                title="Cube brush"
              >
                Cube
              </button>
            </div>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Size</span>
            <input
              type="range"
              min="0"
              max="5"
              step="1"
              value={$ropeBrushRadius}
              oninput={(e) => ropeBrushRadius.set(Number((e.target as HTMLInputElement).value))}
              title="Brush size (0–5)"
            />
            <span class="tool-panel-value">{$ropeBrushRadius}</span>
          </div>
        {/if}
      </section>
    {/if}
  </div>
{/if}

<style>
  .tool-panel {
    position: fixed;
    bottom: 1rem;
    left: calc(1.5rem + 1rem);
    z-index: 100;
    background: var(--bg-color);
    color: var(--text-color);
    padding: 0.75rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 12rem;
    max-width: 16rem;
    max-height: min(80vh, 28rem);
    overflow-y: auto;
  }

  .tool-panel.sidebar-open {
    left: calc(360px + 1rem);
  }

  .tool-panel-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tool-panel-section + .tool-panel-section {
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-color);
  }

  .tool-panel-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tool-panel-label {
    flex-shrink: 0;
    width: 2.5rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .tool-panel-value {
    font-size: 0.85rem;
    opacity: 0.8;
    min-width: 1.5rem;
  }

  .tool-panel-row input[type='range'],
  .tool-panel-row input[type='number'] {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.35rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .tool-panel-row input[type='range'] {
    accent-color: var(--link-color);
    padding: 0;
  }

  .tool-panel-row input[type='number'] {
    width: 3rem;
  }

  .tool-panel-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .tool-panel-check input[type='checkbox'] {
    accent-color: var(--link-color);
  }

  .tool-panel-cross {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    grid-template-rows: auto auto auto;
    gap: 0.25rem;
    place-items: center;
    margin-top: 0.25rem;
  }

  .cross-up {
    grid-column: 2;
    grid-row: 1;
  }
  .cross-down {
    grid-column: 2;
    grid-row: 3;
  }
  .cross-left {
    grid-column: 1;
    grid-row: 2;
  }
  .cross-right {
    grid-column: 3;
    grid-row: 2;
  }
  .cross-center {
    grid-column: 2;
    grid-row: 2;
    width: 2.5rem;
    height: 2rem;
  }

  .tool-panel-cross button,
  .tool-panel-roll button {
    min-width: 2.75rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .tool-panel-cross button:hover,
  .tool-panel-roll button:hover {
    background: var(--block-quote-bg-color);
  }

  .tool-panel-roll {
    margin-top: 0.25rem;
    gap: 0.25rem;
  }

  .tool-panel-roll button {
    min-width: 2.5rem;
  }
</style>
