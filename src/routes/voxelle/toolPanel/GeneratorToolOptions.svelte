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
    floraBraidStrands,
    floraBraidTwist,
    floraBarkJitter,
    FISH_SPECIES_DEFAULT_FIN_MODES,
    FISH_SPECIES_DEFAULT_NUMERIC,
    piscinaSpecies,
    piscinaLength,
    piscinaFinDorsal,
    piscinaFinAnal,
    piscinaFinCaudal,
    piscinaFinPectoral,
    piscinaFinPelvic,
    piscinaFinAdipose,
    piscinaShowFinDorsal,
    piscinaShowFinAnal,
    piscinaShowFinCaudal,
    piscinaShowFinPectoral,
    piscinaShowFinPelvic,
    piscinaShowFinAdipose,
    piscinaWidth,
    piscinaThickness,
    piscinaAnchorOffsetU,
    piscinaAnchorOffsetV,
    piscinaSpineBend,
    piscinaSpineSCurve,
    piscinaFinDorsalPitch,
    piscinaFinDorsalSweep,
    piscinaFinAnalPitch,
    piscinaFinDorsalMode,
    piscinaFinAnalMode,
    piscinaFinCaudalMode,
    piscinaFinPectoralMode,
    piscinaFinPelvicMode,
    piscinaFinAdiposeMode,
    piscinaFinDorsalLength,
    piscinaFinAnalLength,
    piscinaFinDorsalPosition,
    piscinaFinCaudalSpread,
    piscinaFinPectoralCant,
    piscinaFinPectoralSweep,
    type FloraPresetId,
    type FishSpeciesId,
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
    roofHollow,
    MAX_BRUSH_SIZE,
    isGeneratorTool
  } from '../store/index';
  const BRUSH_SIZE_MAX = MAX_BRUSH_SIZE - 1;
  const generatorPanelOpen = $derived(isGeneratorTool($tool));
  const rockVisible = $derived($tool === 'rocks');
  const grassVisible = $derived($tool === 'grass');
  const ashlarVisible = $derived($tool === 'ashlar');
  const roofVisible = $derived($tool === 'roof');
  const floraVisible = $derived($tool === 'flora');
  const piscinaVisible = $derived($tool === 'piscina');

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
    floraBraidStrands.set(n.braidStrands);
    floraBraidTwist.set(n.braidTwist);
    floraBarkJitter.set(n.barkJitter);
  }

  function floraMarkCustom() {
    floraPreset.set('custom');
  }

  function applyPiscinaPreset(id: FishSpeciesId) {
    piscinaSpecies.set(id);
    const n = FISH_SPECIES_DEFAULT_NUMERIC[id];
    piscinaLength.set(n.length);
    piscinaFinDorsal.set(n.finDorsal);
    piscinaFinAnal.set(n.finAnal);
    piscinaFinCaudal.set(n.finCaudal);
    piscinaFinPectoral.set(n.finPectoral);
    piscinaFinPelvic.set(n.finPelvic);
    piscinaFinAdipose.set(n.finAdipose);
    /** Preset width = lateral → `piscinaThickness`; thickness = DV → `piscinaWidth`. */
    piscinaThickness.set(n.width);
    piscinaWidth.set(n.thickness);
    piscinaAnchorOffsetU.set(n.anchorOffsetU);
    piscinaAnchorOffsetV.set(n.anchorOffsetV);
    piscinaShowFinDorsal.set(true);
    piscinaShowFinAnal.set(true);
    piscinaShowFinCaudal.set(true);
    piscinaShowFinPectoral.set(true);
    piscinaShowFinPelvic.set(true);
    piscinaShowFinAdipose.set(id === 'trout');
    piscinaFinPectoralSweep.set(0);
    const finModes = FISH_SPECIES_DEFAULT_FIN_MODES[id];
    piscinaFinDorsalMode.set(finModes.dorsalMode);
    piscinaFinAnalMode.set(finModes.analMode);
    piscinaFinCaudalMode.set('species');
    piscinaFinPectoralMode.set(finModes.pectoralMode);
    piscinaFinPelvicMode.set(finModes.pelvicMode);
    piscinaFinAdiposeMode.set(finModes.adiposeMode);
    piscinaFinDorsalLength.set(1);
    piscinaFinAnalLength.set(1);
    piscinaFinDorsalPosition.set(0);
  }

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

{#if generatorPanelOpen}
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

{#if floraVisible}
  <section class="tool-panel-section" aria-label="Flora">
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Preset</span>
      <select
        class="tool-panel-select"
        value={$floraPreset}
        onchange={(e) =>
          applyFloraPreset((e.target as HTMLSelectElement).value as FloraPresetId)}
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
          max="48"
          step="1"
          value={$floraHeight}
          oninput={(e) => {
            floraHeight.set(Number((e.target as HTMLInputElement).value));
            floraMarkCustom();
          }}
          title="Segments along face normal (1–48)"
        />
        <span class="tool-panel-value">{$floraHeight}</span>
      </div>
      <div class="tool-panel-row">
        <span class="tool-panel-label">Girth</span>
        <input
          type="range"
          min="0"
          max="4"
          step="1"
          value={$floraGirth}
          oninput={(e) => {
            floraGirth.set(Number((e.target as HTMLInputElement).value));
            floraMarkCustom();
          }}
          title="Cross-section radius in tangent plane (0–4)"
        />
        <span class="tool-panel-value">{$floraGirth}</span>
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

{#if piscinaVisible}
  <section class="tool-panel-section piscina-panel" aria-label="Piscina">
    <p class="piscina-steps">
      1. Click a wall or floor to choose where the fish sits.<br />
      2. Use the sliders below to shape body, placement, fins, and spine.<br />
      3. Tap Place fish on the canvas (or press Enter).
    </p>
    <div class="piscina-grid">
      <div class="piscina-card piscina-card--body">
        <h4>Body</h4>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Species</span>
          <select
            class="tool-panel-select"
            value={$piscinaSpecies}
            onchange={(e) =>
              applyPiscinaPreset((e.target as HTMLSelectElement).value as FishSpeciesId)}
            title="Body outline; each species uses different proportions"
          >
            <option value="bass">Bass</option>
            <option value="trout">Trout</option>
            <option value="goldfish">Goldfish</option>
            <option value="tuna">Tuna</option>
            <option value="eel">Eel</option>
          </select>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Length</span>
          <input
            type="range"
            min="4"
            max="72"
            step="1"
            value={$piscinaLength}
            oninput={(e) => piscinaLength.set(Number((e.target as HTMLInputElement).value))}
            title="Nose to tail length (4–72)"
          />
          <span class="tool-panel-value">{$piscinaLength}</span>
        </div>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Lateral</span>
          <input
            type="range"
            min="2"
            max="48"
            step="1"
            value={$piscinaThickness}
            oninput={(e) => piscinaThickness.set(Number((e.target as HTMLInputElement).value))}
            title="Side-to-side half-width"
          />
          <span class="tool-panel-value">{$piscinaThickness}</span>
        </div>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Back↔belly</span>
          <input
            type="range"
            min="1"
            max="36"
            step="1"
            value={$piscinaWidth}
            oninput={(e) => piscinaWidth.set(Number((e.target as HTMLInputElement).value))}
            title="Top-to-bottom half-thickness"
          />
          <span class="tool-panel-value">{$piscinaWidth}</span>
        </div>
      </div>

      <div class="piscina-card piscina-card--placement">
        <h4>Placement & spine</h4>
        <div class="piscina-placement-grid">
          <div class="piscina-placement-cell">
            <span class="piscina-fin-sub">Slide U</span>
            <div class="tool-panel-row">
              <input
                type="range"
                min="-24"
                max="24"
                step="1"
                value={$piscinaAnchorOffsetU}
                oninput={(e) => piscinaAnchorOffsetU.set(Number((e.target as HTMLInputElement).value))}
                title="Slide fish along nose-to-tail axis"
              />
              <span class="tool-panel-value">{$piscinaAnchorOffsetU}</span>
            </div>
          </div>
          <div class="piscina-placement-cell">
            <span class="piscina-fin-sub">Slide V</span>
            <div class="tool-panel-row">
              <input
                type="range"
                min="-24"
                max="24"
                step="1"
                value={$piscinaAnchorOffsetV}
                oninput={(e) => piscinaAnchorOffsetV.set(Number((e.target as HTMLInputElement).value))}
                title="Slide fish side-to-side"
              />
              <span class="tool-panel-value">{$piscinaAnchorOffsetV}</span>
            </div>
          </div>
          <div class="piscina-placement-cell">
            <span class="piscina-fin-sub">Bend</span>
            <div class="tool-panel-row">
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={Math.round($piscinaSpineBend * 100)}
                oninput={(e) =>
                  piscinaSpineBend.set(Number((e.target as HTMLInputElement).value) / 100)}
                title="Side-to-side curve (−100…100)"
              />
              <span class="tool-panel-value">{Math.round($piscinaSpineBend * 100)}</span>
            </div>
          </div>
          <div class="piscina-placement-cell">
            <span class="piscina-fin-sub">S-curve</span>
            <div class="tool-panel-row">
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={Math.round($piscinaSpineSCurve * 100)}
                oninput={(e) =>
                  piscinaSpineSCurve.set(Number((e.target as HTMLInputElement).value) / 100)}
                title="Secondary wave (−100…100)"
              />
              <span class="tool-panel-value">{Math.round($piscinaSpineSCurve * 100)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="piscina-card piscina-card--fins">
        <h4>Fins</h4>
        <div class="piscina-fin-groups">
          <div class="piscina-fin-group">
            <h5>Dorsal</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"><input type="checkbox" checked={$piscinaShowFinDorsal} onchange={(e) => piscinaShowFinDorsal.set((e.target as HTMLInputElement).checked)} />On</label>
              <input type="range" min="1" max="8" step="1" disabled={!$piscinaShowFinDorsal} value={$piscinaFinDorsal} oninput={(e) => piscinaFinDorsal.set(Number((e.target as HTMLInputElement).value))} title="Dorsal fin size" />
              <span class="tool-panel-value">{$piscinaFinDorsal}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select class="tool-panel-select" disabled={!$piscinaShowFinDorsal} value={$piscinaFinDorsalMode} onchange={(e) => piscinaFinDorsalMode.set((e.target as HTMLSelectElement).value as typeof $piscinaFinDorsalMode)} title="Dorsal fin shape profile">
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Length</span>
              <input type="range" min="50" max="250" step="1" disabled={!$piscinaShowFinDorsal} value={Math.round($piscinaFinDorsalLength * 100)} oninput={(e) => piscinaFinDorsalLength.set(Number((e.target as HTMLInputElement).value) / 100)} title="Dorsal fin front-to-back length (%)" />
              <span class="tool-panel-value">{Math.round($piscinaFinDorsalLength * 100)}%</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Position</span>
              <input type="range" min="-45" max="45" step="1" disabled={!$piscinaShowFinDorsal} value={Math.round($piscinaFinDorsalPosition * 100)} oninput={(e) => piscinaFinDorsalPosition.set(Number((e.target as HTMLInputElement).value) / 100)} title="Dorsal fin position along body (% headward/tailward)" />
              <span class="tool-panel-value">{Math.round($piscinaFinDorsalPosition * 100)}%</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Pitch</span>
              <input type="range" min="-45" max="45" step="1" disabled={!$piscinaShowFinDorsal} value={$piscinaFinDorsalPitch} oninput={(e) => piscinaFinDorsalPitch.set(Number((e.target as HTMLInputElement).value))} title="Dorsal fin pitch (°)" />
              <span class="tool-panel-value">{$piscinaFinDorsalPitch}°</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Sweep</span>
              <input type="range" min="-45" max="45" step="1" disabled={!$piscinaShowFinDorsal} value={$piscinaFinDorsalSweep} oninput={(e) => piscinaFinDorsalSweep.set(Number((e.target as HTMLInputElement).value))} title="Dorsal fin sweep (°)" />
              <span class="tool-panel-value">{$piscinaFinDorsalSweep}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Anal</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"><input type="checkbox" checked={$piscinaShowFinAnal} onchange={(e) => piscinaShowFinAnal.set((e.target as HTMLInputElement).checked)} />On</label>
              <input type="range" min="1" max="8" step="1" disabled={!$piscinaShowFinAnal} value={$piscinaFinAnal} oninput={(e) => piscinaFinAnal.set(Number((e.target as HTMLInputElement).value))} title="Anal fin size" />
              <span class="tool-panel-value">{$piscinaFinAnal}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select class="tool-panel-select" disabled={!$piscinaShowFinAnal} value={$piscinaFinAnalMode} onchange={(e) => piscinaFinAnalMode.set((e.target as HTMLSelectElement).value as typeof $piscinaFinAnalMode)} title="Anal fin shape profile">
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Length</span>
              <input type="range" min="50" max="250" step="1" disabled={!$piscinaShowFinAnal} value={Math.round($piscinaFinAnalLength * 100)} oninput={(e) => piscinaFinAnalLength.set(Number((e.target as HTMLInputElement).value) / 100)} title="Anal fin front-to-back length (%)" />
              <span class="tool-panel-value">{Math.round($piscinaFinAnalLength * 100)}%</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Pitch</span>
              <input type="range" min="-45" max="45" step="1" disabled={!$piscinaShowFinAnal} value={$piscinaFinAnalPitch} oninput={(e) => piscinaFinAnalPitch.set(Number((e.target as HTMLInputElement).value))} title="Anal fin pitch (°)" />
              <span class="tool-panel-value">{$piscinaFinAnalPitch}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Caudal</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"><input type="checkbox" checked={$piscinaShowFinCaudal} onchange={(e) => piscinaShowFinCaudal.set((e.target as HTMLInputElement).checked)} />On</label>
              <input type="range" min="1" max="8" step="1" disabled={!$piscinaShowFinCaudal} value={$piscinaFinCaudal} oninput={(e) => piscinaFinCaudal.set(Number((e.target as HTMLInputElement).value))} title="Caudal fin size" />
              <span class="tool-panel-value">{$piscinaFinCaudal}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Tail</span>
              <select class="tool-panel-select" disabled={!$piscinaShowFinCaudal} value={$piscinaFinCaudalMode} onchange={(e) => piscinaFinCaudalMode.set((e.target as HTMLSelectElement).value as typeof $piscinaFinCaudalMode)} title="Caudal tail silhouette (species default uses each preset’s tail)">
                <option value="species">Species default</option>
                <option value="fork">Fork</option>
                <option value="deepFork">Deep fork</option>
                <option value="lunate">Lunate / chevron (tuna)</option>
                <option value="truncate">Truncate</option>
                <option value="rounded">Rounded</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Spread</span>
              <input type="range" min="0" max="45" step="1" disabled={!$piscinaShowFinCaudal} value={$piscinaFinCaudalSpread} oninput={(e) => piscinaFinCaudalSpread.set(Number((e.target as HTMLInputElement).value))} title="Caudal fin spread (°)" />
              <span class="tool-panel-value">{$piscinaFinCaudalSpread}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Pectoral</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"><input type="checkbox" checked={$piscinaShowFinPectoral} onchange={(e) => piscinaShowFinPectoral.set((e.target as HTMLInputElement).checked)} />On</label>
              <input type="range" min="1" max="8" step="1" disabled={!$piscinaShowFinPectoral} value={$piscinaFinPectoral} oninput={(e) => piscinaFinPectoral.set(Number((e.target as HTMLInputElement).value))} title="Pectoral fin size" />
              <span class="tool-panel-value">{$piscinaFinPectoral}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select class="tool-panel-select" disabled={!$piscinaShowFinPectoral} value={$piscinaFinPectoralMode} onchange={(e) => piscinaFinPectoralMode.set((e.target as HTMLSelectElement).value as typeof $piscinaFinPectoralMode)} title="Pectoral fin generator profile">
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Cant</span>
              <input type="range" min="-45" max="45" step="1" disabled={!$piscinaShowFinPectoral} value={$piscinaFinPectoralCant} oninput={(e) => piscinaFinPectoralCant.set(Number((e.target as HTMLInputElement).value))} title="Pectoral cant (°)" />
              <span class="tool-panel-value">{$piscinaFinPectoralCant}°</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Sweep</span>
              <input type="range" min="-45" max="45" step="1" disabled={!$piscinaShowFinPectoral} value={$piscinaFinPectoralSweep} oninput={(e) => piscinaFinPectoralSweep.set(Number((e.target as HTMLInputElement).value))} title="Pectoral sweep (°)" />
              <span class="tool-panel-value">{$piscinaFinPectoralSweep}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Pelvic</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"><input type="checkbox" checked={$piscinaShowFinPelvic} onchange={(e) => piscinaShowFinPelvic.set((e.target as HTMLInputElement).checked)} />On</label>
              <input type="range" min="1" max="8" step="1" disabled={!$piscinaShowFinPelvic} value={$piscinaFinPelvic} oninput={(e) => piscinaFinPelvic.set(Number((e.target as HTMLInputElement).value))} title="Pelvic fin size" />
              <span class="tool-panel-value">{$piscinaFinPelvic}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select class="tool-panel-select" disabled={!$piscinaShowFinPelvic} value={$piscinaFinPelvicMode} onchange={(e) => piscinaFinPelvicMode.set((e.target as HTMLSelectElement).value as typeof $piscinaFinPelvicMode)} title="Pelvic fin generator profile">
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Adipose</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"><input type="checkbox" checked={$piscinaShowFinAdipose} onchange={(e) => piscinaShowFinAdipose.set((e.target as HTMLInputElement).checked)} />On</label>
              <input type="range" min="1" max="8" step="1" disabled={!$piscinaShowFinAdipose} value={$piscinaFinAdipose} oninput={(e) => piscinaFinAdipose.set(Number((e.target as HTMLInputElement).value))} title="Adipose fin size" />
              <span class="tool-panel-value">{$piscinaFinAdipose}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select class="tool-panel-select" disabled={!$piscinaShowFinAdipose} value={$piscinaFinAdiposeMode} onchange={(e) => piscinaFinAdiposeMode.set((e.target as HTMLSelectElement).value as typeof $piscinaFinAdiposeMode)} title="Adipose fin generator profile">
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p class="piscina-hint">
      Right-click reseeds the fish pattern while you shape it. Escape = pick another spot.
    </p>
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
{/if}

<style>
  .piscina-hint {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--text-color);
    opacity: 0.92;
  }

  .piscina-steps {
    margin: 0 0 0.5rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-color);
    opacity: 0.95;
  }

  .piscina-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    align-items: start;
  }

  .piscina-card {
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 0.28rem 0.32rem;
    display: flex;
    flex-direction: column;
    gap: 0.24rem;
    background: color-mix(in oklab, var(--bg-color) 86%, var(--text-color) 14%);
  }

  .piscina-card h4 {
    margin: 0;
    font-size: 0.69rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.86;
  }

  .piscina-card--fins {
    grid-column: 1 / -1;
  }

  .piscina-fin-groups {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.28rem;
  }

  .piscina-fin-group {
    border: 1px solid color-mix(in oklab, var(--border-color) 80%, var(--text-color) 20%);
    border-radius: 6px;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
    background: color-mix(in oklab, var(--bg-color) 90%, var(--text-color) 10%);
  }

  .piscina-fin-group h5 {
    margin: 0;
    font-size: 0.64rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .piscina-fin-row {
    display: grid;
    grid-template-columns: minmax(3.2rem, auto) minmax(0, 1fr) minmax(2.5rem, auto);
    align-items: center;
    gap: 0.25rem;
  }

  .piscina-fin-sub {
    font-size: 0.69rem;
    opacity: 0.82;
  }

  .piscina-fin-row input[type='range'] {
    min-width: 0;
  }

  .piscina-fin-row .tool-panel-value {
    text-align: right;
    min-width: 2.5rem;
  }

  .piscina-placement-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.2rem;
  }

  .piscina-placement-cell {
    padding: 0.1rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
  }

  .piscina-placement-cell .tool-panel-row {
    gap: 0.25rem;
  }

  .piscina-placement-cell .tool-panel-row input[type='range'] {
    min-width: 0;
    flex: 1;
  }

  .piscina-panel :global(.tool-panel-row--wide-label .tool-panel-label) {
    width: 4.5rem;
  }

  @media (max-width: 1200px) {
    .piscina-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .piscina-card--fins {
      grid-column: 1 / -1;
    }
    .piscina-fin-groups {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .piscina-grid {
      grid-template-columns: 1fr;
    }
    .piscina-card--fins {
      grid-column: span 1;
    }
    .piscina-fin-groups {
      grid-template-columns: 1fr;
    }
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
