<script lang="ts">
  import {
    tool,
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
    type FishSpeciesId
  } from '../store/index';

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
</script>

{#if $tool === 'piscina'}
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
                oninput={(e) =>
                  piscinaAnchorOffsetU.set(Number((e.target as HTMLInputElement).value))}
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
                oninput={(e) =>
                  piscinaAnchorOffsetV.set(Number((e.target as HTMLInputElement).value))}
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
              <label class="tool-panel-check"
                ><input
                  type="checkbox"
                  checked={$piscinaShowFinDorsal}
                  onchange={(e) => piscinaShowFinDorsal.set((e.target as HTMLInputElement).checked)}
                />On</label
              >
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                disabled={!$piscinaShowFinDorsal}
                value={$piscinaFinDorsal}
                oninput={(e) => piscinaFinDorsal.set(Number((e.target as HTMLInputElement).value))}
                title="Dorsal fin size"
              />
              <span class="tool-panel-value">{$piscinaFinDorsal}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select
                class="tool-panel-select"
                disabled={!$piscinaShowFinDorsal}
                value={$piscinaFinDorsalMode}
                onchange={(e) =>
                  piscinaFinDorsalMode.set(
                    (e.target as HTMLSelectElement).value as typeof $piscinaFinDorsalMode
                  )}
                title="Dorsal fin shape profile"
              >
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Length</span>
              <input
                type="range"
                min="50"
                max="250"
                step="1"
                disabled={!$piscinaShowFinDorsal}
                value={Math.round($piscinaFinDorsalLength * 100)}
                oninput={(e) =>
                  piscinaFinDorsalLength.set(Number((e.target as HTMLInputElement).value) / 100)}
                title="Dorsal fin front-to-back length (%)"
              />
              <span class="tool-panel-value">{Math.round($piscinaFinDorsalLength * 100)}%</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Position</span>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                disabled={!$piscinaShowFinDorsal}
                value={Math.round($piscinaFinDorsalPosition * 100)}
                oninput={(e) =>
                  piscinaFinDorsalPosition.set(Number((e.target as HTMLInputElement).value) / 100)}
                title="Dorsal fin position along body (% headward/tailward)"
              />
              <span class="tool-panel-value">{Math.round($piscinaFinDorsalPosition * 100)}%</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Pitch</span>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                disabled={!$piscinaShowFinDorsal}
                value={$piscinaFinDorsalPitch}
                oninput={(e) =>
                  piscinaFinDorsalPitch.set(Number((e.target as HTMLInputElement).value))}
                title="Dorsal fin pitch (°)"
              />
              <span class="tool-panel-value">{$piscinaFinDorsalPitch}°</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Sweep</span>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                disabled={!$piscinaShowFinDorsal}
                value={$piscinaFinDorsalSweep}
                oninput={(e) =>
                  piscinaFinDorsalSweep.set(Number((e.target as HTMLInputElement).value))}
                title="Dorsal fin sweep (°)"
              />
              <span class="tool-panel-value">{$piscinaFinDorsalSweep}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Anal</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"
                ><input
                  type="checkbox"
                  checked={$piscinaShowFinAnal}
                  onchange={(e) => piscinaShowFinAnal.set((e.target as HTMLInputElement).checked)}
                />On</label
              >
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                disabled={!$piscinaShowFinAnal}
                value={$piscinaFinAnal}
                oninput={(e) => piscinaFinAnal.set(Number((e.target as HTMLInputElement).value))}
                title="Anal fin size"
              />
              <span class="tool-panel-value">{$piscinaFinAnal}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select
                class="tool-panel-select"
                disabled={!$piscinaShowFinAnal}
                value={$piscinaFinAnalMode}
                onchange={(e) =>
                  piscinaFinAnalMode.set(
                    (e.target as HTMLSelectElement).value as typeof $piscinaFinAnalMode
                  )}
                title="Anal fin shape profile"
              >
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Length</span>
              <input
                type="range"
                min="50"
                max="250"
                step="1"
                disabled={!$piscinaShowFinAnal}
                value={Math.round($piscinaFinAnalLength * 100)}
                oninput={(e) =>
                  piscinaFinAnalLength.set(Number((e.target as HTMLInputElement).value) / 100)}
                title="Anal fin front-to-back length (%)"
              />
              <span class="tool-panel-value">{Math.round($piscinaFinAnalLength * 100)}%</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Pitch</span>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                disabled={!$piscinaShowFinAnal}
                value={$piscinaFinAnalPitch}
                oninput={(e) =>
                  piscinaFinAnalPitch.set(Number((e.target as HTMLInputElement).value))}
                title="Anal fin pitch (°)"
              />
              <span class="tool-panel-value">{$piscinaFinAnalPitch}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Caudal</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"
                ><input
                  type="checkbox"
                  checked={$piscinaShowFinCaudal}
                  onchange={(e) => piscinaShowFinCaudal.set((e.target as HTMLInputElement).checked)}
                />On</label
              >
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                disabled={!$piscinaShowFinCaudal}
                value={$piscinaFinCaudal}
                oninput={(e) => piscinaFinCaudal.set(Number((e.target as HTMLInputElement).value))}
                title="Caudal fin size"
              />
              <span class="tool-panel-value">{$piscinaFinCaudal}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Tail</span>
              <select
                class="tool-panel-select"
                disabled={!$piscinaShowFinCaudal}
                value={$piscinaFinCaudalMode}
                onchange={(e) =>
                  piscinaFinCaudalMode.set(
                    (e.target as HTMLSelectElement).value as typeof $piscinaFinCaudalMode
                  )}
                title="Caudal tail silhouette (species default uses each preset’s tail)"
              >
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
              <input
                type="range"
                min="0"
                max="45"
                step="1"
                disabled={!$piscinaShowFinCaudal}
                value={$piscinaFinCaudalSpread}
                oninput={(e) =>
                  piscinaFinCaudalSpread.set(Number((e.target as HTMLInputElement).value))}
                title="Caudal fin spread (°)"
              />
              <span class="tool-panel-value">{$piscinaFinCaudalSpread}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Pectoral</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"
                ><input
                  type="checkbox"
                  checked={$piscinaShowFinPectoral}
                  onchange={(e) =>
                    piscinaShowFinPectoral.set((e.target as HTMLInputElement).checked)}
                />On</label
              >
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                disabled={!$piscinaShowFinPectoral}
                value={$piscinaFinPectoral}
                oninput={(e) =>
                  piscinaFinPectoral.set(Number((e.target as HTMLInputElement).value))}
                title="Pectoral fin size"
              />
              <span class="tool-panel-value">{$piscinaFinPectoral}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select
                class="tool-panel-select"
                disabled={!$piscinaShowFinPectoral}
                value={$piscinaFinPectoralMode}
                onchange={(e) =>
                  piscinaFinPectoralMode.set(
                    (e.target as HTMLSelectElement).value as typeof $piscinaFinPectoralMode
                  )}
                title="Pectoral fin generator profile"
              >
                <option value="pointed">Pointed</option>
                <option value="rounded">Rounded</option>
                <option value="ribbon">Ribbon</option>
              </select>
              <span class="tool-panel-value"></span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Cant</span>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                disabled={!$piscinaShowFinPectoral}
                value={$piscinaFinPectoralCant}
                oninput={(e) =>
                  piscinaFinPectoralCant.set(Number((e.target as HTMLInputElement).value))}
                title="Pectoral cant (°)"
              />
              <span class="tool-panel-value">{$piscinaFinPectoralCant}°</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Sweep</span>
              <input
                type="range"
                min="-45"
                max="45"
                step="1"
                disabled={!$piscinaShowFinPectoral}
                value={$piscinaFinPectoralSweep}
                oninput={(e) =>
                  piscinaFinPectoralSweep.set(Number((e.target as HTMLInputElement).value))}
                title="Pectoral sweep (°)"
              />
              <span class="tool-panel-value">{$piscinaFinPectoralSweep}°</span>
            </div>
          </div>

          <div class="piscina-fin-group">
            <h5>Pelvic</h5>
            <div class="piscina-fin-row">
              <label class="tool-panel-check"
                ><input
                  type="checkbox"
                  checked={$piscinaShowFinPelvic}
                  onchange={(e) => piscinaShowFinPelvic.set((e.target as HTMLInputElement).checked)}
                />On</label
              >
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                disabled={!$piscinaShowFinPelvic}
                value={$piscinaFinPelvic}
                oninput={(e) => piscinaFinPelvic.set(Number((e.target as HTMLInputElement).value))}
                title="Pelvic fin size"
              />
              <span class="tool-panel-value">{$piscinaFinPelvic}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select
                class="tool-panel-select"
                disabled={!$piscinaShowFinPelvic}
                value={$piscinaFinPelvicMode}
                onchange={(e) =>
                  piscinaFinPelvicMode.set(
                    (e.target as HTMLSelectElement).value as typeof $piscinaFinPelvicMode
                  )}
                title="Pelvic fin generator profile"
              >
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
              <label class="tool-panel-check"
                ><input
                  type="checkbox"
                  checked={$piscinaShowFinAdipose}
                  onchange={(e) =>
                    piscinaShowFinAdipose.set((e.target as HTMLInputElement).checked)}
                />On</label
              >
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                disabled={!$piscinaShowFinAdipose}
                value={$piscinaFinAdipose}
                oninput={(e) => piscinaFinAdipose.set(Number((e.target as HTMLInputElement).value))}
                title="Adipose fin size"
              />
              <span class="tool-panel-value">{$piscinaFinAdipose}</span>
            </div>
            <div class="piscina-fin-row">
              <span class="piscina-fin-sub">Shape</span>
              <select
                class="tool-panel-select"
                disabled={!$piscinaShowFinAdipose}
                value={$piscinaFinAdiposeMode}
                onchange={(e) =>
                  piscinaFinAdiposeMode.set(
                    (e.target as HTMLSelectElement).value as typeof $piscinaFinAdiposeMode
                  )}
                title="Adipose fin generator profile"
              >
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
</style>
