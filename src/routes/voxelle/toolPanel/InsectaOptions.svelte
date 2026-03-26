<script lang="ts">
  import InsectaLegBlock from './InsectaLegBlock.svelte';
  import {
    tool,
    insectaSpecies,
    insectaTotalLength,
    insectaHeadRatio,
    insectaThoraxRatio,
    insectaAbdomenRatio,
    insectaBodyHalfWidth,
    insectaBodyHalfHeight,
    insectaAbdomenTaper,
    insectaHeadShape,
    insectaAnchorOffsetU,
    insectaAnchorOffsetV,
    insectaBodyYaw,
    insectaBodyArch,
    insectaLegFront,
    insectaLegMid,
    insectaLegHind,
    cloneArticulatedLeg2,
    insectaAntennaLength,
    insectaAntennaSpread,
    insectaAntennaPitch,
    insectaAntennaRoot,
    insectaMandibleLength,
    insectaMandibleSpread,
    insectaMandibleForward,
    insectaWingShape,
    insectaShowWingFore,
    insectaWingForeLength,
    insectaWingForeWidth,
    insectaWingForeSpread,
    insectaWingForeForwardCant,
    insectaWingForePitch,
    insectaWingForeOffset,
    insectaShowWingHind,
    insectaWingHindLength,
    insectaWingHindWidth,
    insectaWingHindSpread,
    insectaWingHindPitch,
    insectaWingHindOffset,
    INSECTA_SPECIES_DEFAULTS,
    type InsectaSpeciesId
  } from '../store/index';

  function applyInsectaPreset(id: InsectaSpeciesId) {
    const n = INSECTA_SPECIES_DEFAULTS[id];
    insectaSpecies.set(id);
    insectaTotalLength.set(n.totalLength);
    insectaHeadRatio.set(n.headRatio);
    insectaThoraxRatio.set(n.thoraxRatio);
    insectaAbdomenRatio.set(n.abdomenRatio);
    insectaBodyHalfWidth.set(n.bodyHalfWidth);
    insectaBodyHalfHeight.set(n.bodyHalfHeight);
    insectaAbdomenTaper.set(n.abdomenTaper);
    insectaHeadShape.set(n.headShape);
    insectaAnchorOffsetU.set(n.anchorOffsetU);
    insectaAnchorOffsetV.set(n.anchorOffsetV);
    insectaBodyYaw.set(n.bodyYaw);
    insectaBodyArch.set(n.bodyArch);
    insectaLegFront.set(cloneArticulatedLeg2(n.legFront));
    insectaLegMid.set(cloneArticulatedLeg2(n.legMid));
    insectaLegHind.set(cloneArticulatedLeg2(n.legHind));
    insectaAntennaLength.set(n.antennaLength);
    insectaAntennaSpread.set(n.antennaSpread);
    insectaAntennaPitch.set(n.antennaPitch);
    insectaAntennaRoot.set(n.antennaRoot);
    insectaMandibleLength.set(n.mandibleLength);
    insectaMandibleSpread.set(n.mandibleSpread);
    insectaMandibleForward.set(n.mandibleForward);
    insectaWingShape.set(n.wingShape);
    insectaShowWingFore.set(n.showWingFore);
    insectaWingForeLength.set(n.wingForeLength);
    insectaWingForeWidth.set(n.wingForeWidth);
    insectaWingForeSpread.set(n.wingForeSpread);
    insectaWingForeForwardCant.set(n.wingForeForwardCant);
    insectaWingForePitch.set(n.wingForePitch);
    insectaWingForeOffset.set(n.wingForeOffset);
    insectaShowWingHind.set(n.showWingHind);
    insectaWingHindLength.set(n.wingHindLength);
    insectaWingHindWidth.set(n.wingHindWidth);
    insectaWingHindSpread.set(n.wingHindSpread);
    insectaWingHindPitch.set(n.wingHindPitch);
    insectaWingHindOffset.set(n.wingHindOffset);
  }
</script>

{#if $tool === 'insecta'}
  <section class="tool-panel-section insecta-panel" aria-label="Insecta">
    <p class="insecta-steps">
      1. Click a face to anchor the insect.<br />
      2. Adjust body segments and appendages below.<br />
      3. Tap Done on the canvas (or press Enter) to place.
    </p>
    <div class="insecta-grid">
      <div class="insecta-card">
        <h4>Body</h4>
        <div class="tool-panel-row tool-panel-row--wide-label">
          <span class="tool-panel-label">Preset</span>
          <select
            class="tool-panel-select"
            value={$insectaSpecies}
            onchange={(e) =>
              applyInsectaPreset((e.target as HTMLSelectElement).value as InsectaSpeciesId)}
            title="Species silhouette defaults"
          >
            <option value="bee">Bee</option>
            <option value="dragonfly">Dragonfly</option>
            <option value="grasshopper">Grasshopper</option>
            <option value="fly">Fly</option>
            <option value="junebug">Junebug</option>
          </select>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Length</span>
          <input
            type="range"
            min="12"
            max="72"
            step="1"
            value={$insectaTotalLength}
            oninput={(e) => insectaTotalLength.set(Number((e.target as HTMLInputElement).value))}
            title="Total body length"
          />
          <span class="tool-panel-value">{$insectaTotalLength}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Head %</span>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={$insectaHeadRatio}
            oninput={(e) => insectaHeadRatio.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaHeadRatio}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Thorax %</span>
          <input
            type="range"
            min="5"
            max="50"
            step="1"
            value={$insectaThoraxRatio}
            oninput={(e) => insectaThoraxRatio.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaThoraxRatio}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Abdomen %</span>
          <input
            type="range"
            min="10"
            max="75"
            step="1"
            value={$insectaAbdomenRatio}
            oninput={(e) => insectaAbdomenRatio.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaAbdomenRatio}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Width</span>
          <input
            type="range"
            min="1"
            max="12"
            step="1"
            value={$insectaBodyHalfWidth}
            oninput={(e) => insectaBodyHalfWidth.set(Number((e.target as HTMLInputElement).value))}
            title="Half-width (lateral)"
          />
          <span class="tool-panel-value">{$insectaBodyHalfWidth}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Height</span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={$insectaBodyHalfHeight}
            oninput={(e) => insectaBodyHalfHeight.set(Number((e.target as HTMLInputElement).value))}
            title="Half-height (dorsal)"
          />
          <span class="tool-panel-value">{$insectaBodyHalfHeight}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Taper</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round($insectaAbdomenTaper * 100)}
            oninput={(e) =>
              insectaAbdomenTaper.set(Number((e.target as HTMLInputElement).value) / 100)}
            title="Abdomen taper"
          />
          <span class="tool-panel-value">{Math.round($insectaAbdomenTaper * 100)}%</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Head shape</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={$insectaHeadShape}
            oninput={(e) => insectaHeadShape.set(Number((e.target as HTMLInputElement).value))}
            title="0 = squarish, 100 = narrow snout / triangular"
          />
          <span class="tool-panel-value">{$insectaHeadShape}</span>
        </div>
      </div>

      <div class="insecta-card">
        <h4>Placement</h4>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Slide U</span>
          <input
            type="range"
            min="-24"
            max="24"
            step="1"
            value={$insectaAnchorOffsetU}
            oninput={(e) => insectaAnchorOffsetU.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaAnchorOffsetU}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Slide V</span>
          <input
            type="range"
            min="-24"
            max="24"
            step="1"
            value={$insectaAnchorOffsetV}
            oninput={(e) => insectaAnchorOffsetV.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaAnchorOffsetV}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Yaw</span>
          <input
            type="range"
            min="-45"
            max="45"
            step="1"
            value={$insectaBodyYaw}
            oninput={(e) => insectaBodyYaw.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaBodyYaw}°</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Arch</span>
          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            value={Math.round($insectaBodyArch * 100)}
            oninput={(e) => insectaBodyArch.set(Number((e.target as HTMLInputElement).value) / 100)}
          />
          <span class="tool-panel-value">{Math.round($insectaBodyArch * 100)}</span>
        </div>
      </div>

      <div class="insecta-card insecta-card--appendages">
        <h4>Legs (pairs)</h4>
        <p class="insecta-leg-intro">
          Each pair is mirrored. Offsets are in the body frame (same as placement slide U/V): hip on
          the thorax, then knee and foot as f,s,u steps — strong negative u reaches toward the
          substrate. Hip U: positive = toward tail, negative = toward head.
        </p>
        <div class="insecta-leg-grid">
          <InsectaLegBlock title="Front" legStore={insectaLegFront} />
          <InsectaLegBlock title="Mid" legStore={insectaLegMid} />
          <InsectaLegBlock title="Hind" legStore={insectaLegHind} />
        </div>
      </div>

      <div class="insecta-card">
        <h4>Head parts</h4>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Ant len</span>
          <input
            type="range"
            min="0"
            max="32"
            step="1"
            value={$insectaAntennaLength}
            oninput={(e) => insectaAntennaLength.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaAntennaLength}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Ant spr</span>
          <input
            type="range"
            min="0"
            max="45"
            step="1"
            value={$insectaAntennaSpread}
            oninput={(e) => insectaAntennaSpread.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaAntennaSpread}°</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Ant pit</span>
          <input
            type="range"
            min="0"
            max="80"
            step="1"
            value={$insectaAntennaPitch}
            oninput={(e) => insectaAntennaPitch.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaAntennaPitch}°</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Ant root</span>
          <input
            type="range"
            min="0"
            max="12"
            step="1"
            value={$insectaAntennaRoot}
            oninput={(e) => insectaAntennaRoot.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaAntennaRoot}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Mand len</span>
          <input
            type="range"
            min="0"
            max="8"
            step="1"
            value={$insectaMandibleLength}
            oninput={(e) => insectaMandibleLength.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaMandibleLength}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Mand spr</span>
          <input
            type="range"
            min="0"
            max="25"
            step="1"
            value={$insectaMandibleSpread}
            oninput={(e) => insectaMandibleSpread.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaMandibleSpread}</span>
        </div>
        <div class="tool-panel-row">
          <span class="tool-panel-label">Mand fwd</span>
          <input
            type="range"
            min="0"
            max="6"
            step="1"
            value={$insectaMandibleForward}
            oninput={(e) =>
              insectaMandibleForward.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaMandibleForward}</span>
        </div>
      </div>

      <div class="insecta-card insecta-card--wings">
        <h4>Wings</h4>
        <div
          class="tool-panel-row tool-panel-row--wide-label"
          title="0 = rectangular outline, 100 = tapered ellipse toward wing tip (both pairs)"
        >
          <span class="tool-panel-label">Shape</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={$insectaWingShape}
            oninput={(e) => insectaWingShape.set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="tool-panel-value">{$insectaWingShape}</span>
        </div>
        <div class="insecta-wing-pair">
          <h5>Fore</h5>
          <label class="tool-panel-check"
            ><input
              type="checkbox"
              checked={$insectaShowWingFore}
              onchange={(e) => insectaShowWingFore.set((e.target as HTMLInputElement).checked)}
            />On</label
          >
          <div class="tool-panel-row">
            <span class="tool-panel-label">Len</span>
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              disabled={!$insectaShowWingFore}
              value={$insectaWingForeLength}
              oninput={(e) =>
                insectaWingForeLength.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingForeLength}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Wid</span>
            <input
              type="range"
              min="0"
              max="12"
              step="1"
              disabled={!$insectaShowWingFore}
              value={$insectaWingForeWidth}
              oninput={(e) =>
                insectaWingForeWidth.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingForeWidth}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Spr</span>
            <input
              type="range"
              min="0"
              max="90"
              step="1"
              disabled={!$insectaShowWingFore}
              value={$insectaWingForeSpread}
              oninput={(e) =>
                insectaWingForeSpread.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingForeSpread}°</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Fwd</span>
            <input
              type="range"
              min="0"
              max="35"
              step="1"
              disabled={!$insectaShowWingFore}
              value={$insectaWingForeForwardCant}
              oninput={(e) =>
                insectaWingForeForwardCant.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingForeForwardCant}°</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Pit</span>
            <input
              type="range"
              min="0"
              max="45"
              step="1"
              disabled={!$insectaShowWingFore}
              value={$insectaWingForePitch}
              oninput={(e) =>
                insectaWingForePitch.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingForePitch}°</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Off</span>
            <input
              type="range"
              min="-8"
              max="8"
              step="1"
              disabled={!$insectaShowWingFore}
              value={$insectaWingForeOffset}
              oninput={(e) =>
                insectaWingForeOffset.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingForeOffset}</span>
          </div>
        </div>
        <div class="insecta-wing-pair">
          <h5>Hind</h5>
          <label class="tool-panel-check"
            ><input
              type="checkbox"
              checked={$insectaShowWingHind}
              onchange={(e) => insectaShowWingHind.set((e.target as HTMLInputElement).checked)}
            />On</label
          >
          <div class="tool-panel-row">
            <span class="tool-panel-label">Len</span>
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              disabled={!$insectaShowWingHind}
              value={$insectaWingHindLength}
              oninput={(e) =>
                insectaWingHindLength.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingHindLength}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Wid</span>
            <input
              type="range"
              min="0"
              max="12"
              step="1"
              disabled={!$insectaShowWingHind}
              value={$insectaWingHindWidth}
              oninput={(e) =>
                insectaWingHindWidth.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingHindWidth}</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Spr</span>
            <input
              type="range"
              min="0"
              max="90"
              step="1"
              disabled={!$insectaShowWingHind}
              value={$insectaWingHindSpread}
              oninput={(e) =>
                insectaWingHindSpread.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingHindSpread}°</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Pit</span>
            <input
              type="range"
              min="0"
              max="45"
              step="1"
              disabled={!$insectaShowWingHind}
              value={$insectaWingHindPitch}
              oninput={(e) =>
                insectaWingHindPitch.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingHindPitch}°</span>
          </div>
          <div class="tool-panel-row">
            <span class="tool-panel-label">Off</span>
            <input
              type="range"
              min="-8"
              max="8"
              step="1"
              disabled={!$insectaShowWingHind}
              value={$insectaWingHindOffset}
              oninput={(e) =>
                insectaWingHindOffset.set(Number((e.target as HTMLInputElement).value))}
            />
            <span class="tool-panel-value">{$insectaWingHindOffset}</span>
          </div>
        </div>
      </div>
    </div>
    <p class="insecta-hint">
      Right-click reseeds detail while shaping. Escape = pick another face.
    </p>
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

  .insecta-hint {
    margin: 0.35rem 0 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: var(--text-color);
    opacity: 0.92;
  }

  .insecta-steps {
    margin: 0 0 0.5rem;
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-color);
    opacity: 0.95;
  }

  .insecta-leg-intro {
    margin: 0 0 0.35rem;
    font-size: 0.75rem;
    line-height: 1.4;
    opacity: 0.88;
  }

  /* Three top cards (Body | Placement | Head); full-width Legs + Wings below — not 4 cols with a dead lane. */
  .insecta-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
    align-items: start;
  }

  .insecta-card {
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 0.28rem 0.32rem;
    display: flex;
    flex-direction: column;
    gap: 0.22rem;
    background: color-mix(in oklab, var(--bg-color) 86%, var(--text-color) 14%);
  }

  .insecta-card h4 {
    margin: 0;
    font-size: 0.69rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.86;
  }

  .insecta-card--appendages,
  .insecta-card--wings {
    grid-column: 1 / -1;
  }

  .insecta-leg-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .insecta-wing-pair {
    display: grid;
    grid-template-columns: minmax(2.5rem, auto) repeat(2, minmax(0, 1fr));
    gap: 0.25rem 0.4rem;
    align-items: center;
    margin-bottom: 0.35rem;
  }

  .insecta-wing-pair h5 {
    margin: 0;
    font-size: 0.64rem;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .insecta-wing-pair .tool-panel-check {
    grid-column: 1;
  }

  .insecta-wing-pair .tool-panel-row {
    grid-column: span 1;
  }

  @media (max-width: 1200px) {
    .insecta-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .insecta-grid {
      grid-template-columns: 1fr;
    }
    .insecta-leg-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
