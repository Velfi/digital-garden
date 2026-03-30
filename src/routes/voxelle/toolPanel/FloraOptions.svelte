<script lang="ts">
  import {
    tool,
    FLORA_PRESET_NUMERIC,
    floraPreset,
    floraHeight,
    floraGirth,
    floraWobble,
    floraTaper,
    floraStemCount,
    floraClusterRadius,
    floraBranchCount,
    floraBranchDepth,
    floraBranchStart,
    floraBranchSpread,
    floraBranchPlacement,
    floraBranchWindYawDeg,
    floraBranchWindStrength,
    floraBraidStrands,
    floraBraidTwist,
    floraBarkJitter,
    FLORA_GIRTH_MAX,
    floraColorMode,
    floraCanopy,
    floraStemCrossSection,
    type FloraPresetId,
    type FloraColorMode,
    type FloraCrossSection,
    type FloraBranchPlacementMode
  } from '../store/index';

  function applyFloraPreset(id: FloraPresetId) {
    floraPreset.set(id);
    if (id === 'custom') return;
    const n = FLORA_PRESET_NUMERIC[id];
    floraHeight.set(n.height);
    floraGirth.set(n.girth);
    floraWobble.set(n.wobble);
    floraTaper.set(n.taper);
    floraStemCount.set(n.stemCount);
    floraClusterRadius.set(n.clusterRadius);
    floraBranchCount.set(n.branchCount);
    floraBranchDepth.set(n.branchDepth);
    floraBranchStart.set(n.branchStart);
    floraBranchSpread.set(n.branchSpread);
    floraBranchPlacement.set(n.branchPlacement);
    floraBranchWindYawDeg.set(n.branchWindYawDeg);
    floraBranchWindStrength.set(n.branchWindStrength);
    floraBraidStrands.set(n.braidStrands);
    floraBraidTwist.set(n.braidTwist);
    floraBarkJitter.set(n.barkJitter);
    floraColorMode.set(n.colorMode);
    floraCanopy.set(n.canopy);
    floraStemCrossSection.set(n.stemCrossSection);
  }

  function floraMarkCustom() {
    floraPreset.set('custom');
  }
</script>

{#if $tool === 'flora'}
  <section class="tool-panel-section" aria-label="Flora">
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Preset</span>
      <select
        class="tool-panel-select"
        value={$floraPreset}
        onchange={(e) => applyFloraPreset((e.target as HTMLSelectElement).value as FloraPresetId)}
        title="Houseplant-style silhouettes (sliders still apply after Custom)"
      >
        <option value="custom">Custom</option>
        <option value="stalk">Stalk (slender upright)</option>
        <option value="trunk">Trunk (woody, tapered)</option>
        <option value="contorted">Contorted stem</option>
        <option value="multi_stem">Multi-stem clump</option>
        <option value="branched">Branched (lollipop-ish)</option>
        <option value="braided">Braided bundle</option>
        <option value="tuft">Tuft (many short stems)</option>
      </select>
    </div>
    <details class="flora-details" open>
      <summary>Stem</summary>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Height</span>
        <input
          type="range"
          min="1"
          max="96"
          step="1"
          value={$floraHeight}
          oninput={(e) => {
            floraHeight.set(Number((e.target as HTMLInputElement).value));
            floraMarkCustom();
          }}
          title="Segments along face normal (1–96)"
        />
        <span class="tool-panel-value">{$floraHeight}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Girth</span>
        <input
          type="range"
          min="0"
          max={FLORA_GIRTH_MAX}
          step="0.5"
          value={$floraGirth}
          oninput={(e) => {
            floraGirth.set(Number((e.target as HTMLInputElement).value));
            floraMarkCustom();
          }}
          title="Cross-section in tangent plane (1×1 up to about (2×girth+1)×(2×girth+1) for square mode; 0.5 steps)"
        />
        <span class="tool-panel-value">{Math.floor($floraGirth * 2) + 1}x{Math.floor($floraGirth * 2) + 1}</span>
      </div>
      <div class="tool-panel-row tool-panel-row--wide-label">
        <span class="tool-panel-label">Wobble</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round($floraWobble * 100)}
          oninput={(e) => {
            floraWobble.set(Number((e.target as HTMLInputElement).value) / 100);
            floraMarkCustom();
          }}
          title="Lateral wander (0–100%)"
        />
        <span class="tool-panel-value">{Math.round($floraWobble * 100)}%</span>
      </div>
      <div class="tool-panel-row tool-panel-row--wide-label">
        <span class="tool-panel-label">Taper</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round($floraTaper * 100)}
          oninput={(e) => {
            floraTaper.set(Number((e.target as HTMLInputElement).value) / 100);
            floraMarkCustom();
          }}
          title="Narrow toward tip (0–100%)"
        />
        <span class="tool-panel-value">{Math.round($floraTaper * 100)}%</span>
      </div>
    </details>
    <details class="flora-details" open>
      <summary>Cluster</summary>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Stems</span>
        <input
          type="range"
          min="1"
          max="8"
          step="1"
          value={$floraStemCount}
          oninput={(e) => {
            floraStemCount.set(Number((e.target as HTMLInputElement).value));
            floraMarkCustom();
          }}
          title="Stems per click (1–8)"
        />
        <span class="tool-panel-value">{$floraStemCount}</span>
      </div>
      {#if $floraStemCount > 1}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Spread</span>
          <input
            type="range"
            min="0"
            max="4"
            step="1"
            value={$floraClusterRadius}
            oninput={(e) => {
              floraClusterRadius.set(Number((e.target as HTMLInputElement).value));
              floraMarkCustom();
            }}
            title="Root offset in tangent plane (0–4)"
          />
          <span class="tool-panel-value">{$floraClusterRadius}</span>
        </div>
      {/if}
    </details>
    <details class="flora-details" open>
      <summary>Branches</summary>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Count</span>
        <input
          type="range"
          min="0"
          max="6"
          step="1"
          value={$floraBranchCount}
          oninput={(e) => {
            floraBranchCount.set(Number((e.target as HTMLInputElement).value));
            floraMarkCustom();
          }}
          title="Side branches (0–6); uses main stem only when braided off"
        />
        <span class="tool-panel-value">{$floraBranchCount}</span>
      </div>
      {#if $floraBranchCount > 0}
        <div class="tool-panel-row">
          <span class="tool-panel-label">Depth</span>
          <input
            type="range"
            min="1"
            max="2"
            step="1"
            value={$floraBranchDepth}
            oninput={(e) => {
              floraBranchDepth.set(Number((e.target as HTMLInputElement).value));
              floraMarkCustom();
            }}
            title="Branch recursion depth (1–2)"
          />
          <span class="tool-panel-value">{$floraBranchDepth}</span>
        </div>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Start</span>
          <input
            type="range"
            min="0"
            max="90"
            step="1"
            value={Math.round($floraBranchStart * 100)}
            oninput={(e) => {
              floraBranchStart.set(Number((e.target as HTMLInputElement).value) / 100);
              floraMarkCustom();
            }}
            title="Forks only above this height fraction (0–90%)"
          />
          <span class="tool-panel-value">{Math.round($floraBranchStart * 100)}%</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Spread</span>
          <input
            type="range"
            min="0"
            max="3"
            step="1"
            value={$floraBranchSpread}
            oninput={(e) => {
              floraBranchSpread.set(Number((e.target as HTMLInputElement).value));
              floraMarkCustom();
            }}
            title="Lateral reach (0–3)"
          />
          <span class="tool-panel-value">{$floraBranchSpread}</span>
        </div>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Placement</span>
          <select
            class="tool-panel-select"
            value={$floraBranchPlacement}
            onchange={(e) => {
              floraBranchPlacement.set(
                (e.target as HTMLSelectElement).value as FloraBranchPlacementMode
              );
              floraMarkCustom();
            }}
            title="Spiral: golden-angle phyllotaxis + even heights. Alternate: decussate pairs. Random: legacy."
          >
            <option value="spiral">Spiral (phyllotaxis)</option>
            <option value="alternate">Alternate (decussate)</option>
            <option value="random">Random</option>
          </select>
        </div>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Wind yaw</span>
          <input
            type="range"
            min="0"
            max="360"
            step="1"
            value={$floraBranchWindYawDeg}
            oninput={(e) => {
              floraBranchWindYawDeg.set(Number((e.target as HTMLInputElement).value));
              floraMarkCustom();
            }}
            title="Horizontal lean direction in world XZ (0° = +X). Blends with placement when strength &gt; 0."
          />
          <span class="tool-panel-value">{$floraBranchWindYawDeg}°</span>
        </div>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Wind str.</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round($floraBranchWindStrength * 100)}
            oninput={(e) => {
              floraBranchWindStrength.set(Number((e.target as HTMLInputElement).value) / 100);
              floraMarkCustom();
            }}
            title="Blend lateral growth toward wind yaw on the stem tangent plane (0 = off)"
          />
          <span class="tool-panel-value">{Math.round($floraBranchWindStrength * 100)}%</span>
        </div>
      {/if}
    </details>
    <details class="flora-details" open>
      <summary>Braid</summary>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Strands</span>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={$floraBraidStrands}
          oninput={(e) => {
            floraBraidStrands.set(Number((e.target as HTMLInputElement).value));
            floraMarkCustom();
          }}
          title="1 = single stem; 2–5 intertwined"
        />
        <span class="tool-panel-value">{$floraBraidStrands}</span>
      </div>
      {#if $floraBraidStrands > 1}
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Twist</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round($floraBraidTwist * 100)}
            oninput={(e) => {
              floraBraidTwist.set(Number((e.target as HTMLInputElement).value) / 100);
              floraMarkCustom();
            }}
            title="Intertwine strength (0–100%)"
          />
          <span class="tool-panel-value">{Math.round($floraBraidTwist * 100)}%</span>
        </div>
      {/if}
    </details>
    <details class="flora-details">
      <summary>Surface</summary>
      <div class="tool-panel-row tool-panel-row--wide-label">
        <span class="tool-panel-label">Color map</span>
        <select
          class="tool-panel-select tool-panel-select--grow"
          value={$floraColorMode}
          onchange={(e) => {
            floraColorMode.set((e.target as HTMLSelectElement).value as FloraColorMode);
            floraMarkCustom();
          }}
          title="How multi-color / paint applies: along stem (default), per stem root, or world position"
        >
          <option value="alongStem">Along stem</option>
          <option value="perPlacement">Per stem root</option>
          <option value="world">World position</option>
        </select>
      </div>
      <div class="tool-panel-row tool-panel-row--wide-label">
        <span class="tool-panel-label">Stem shape</span>
        <select
          class="tool-panel-select tool-panel-select--grow"
          value={$floraStemCrossSection}
          onchange={(e) => {
            floraStemCrossSection.set((e.target as HTMLSelectElement).value as FloraCrossSection);
            floraMarkCustom();
          }}
          title="Round (Euclidean) vs square (Chebyshev) cross-section"
        >
          <option value="euclidean">Round</option>
          <option value="chebyshev">Square</option>
        </select>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Canopy</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round($floraCanopy * 100)}
          oninput={(e) => {
            floraCanopy.set(Number((e.target as HTMLInputElement).value) / 100);
            floraMarkCustom();
          }}
          title="Sparse foliage voxels at stem tips (0–100%)"
        />
        <span class="tool-panel-value">{Math.round($floraCanopy * 100)}%</span>
      </div>
      <div class="tool-panel-row tool-panel-row--wide-label">
        <span class="tool-panel-label">Bark</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round($floraBarkJitter * 100)}
          oninput={(e) => {
            floraBarkJitter.set(Number((e.target as HTMLInputElement).value) / 100);
            floraMarkCustom();
          }}
          title="Per-voxel color noise (0–100%)"
        />
        <span class="tool-panel-value">{Math.round($floraBarkJitter * 100)}%</span>
      </div>
    </details>
  </section>
{/if}

<style>
  .tool-panel-select--grow {
    flex: 1;
    min-width: 0;
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

  .flora-details {
    margin-top: 0.35rem;
  }
  .flora-details summary {
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-color);
    opacity: 0.9;
    margin-bottom: 0.25rem;
  }
</style>
