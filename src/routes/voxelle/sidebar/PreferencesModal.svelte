<script lang="ts">
  import {
    loadPreferences,
    savePreferences,
    voxellePreferences,
    TONE_MAPPING_OPTIONS,
    type VoxellePreferences,
    type ToneMappingPreference,
    type RendererBackendPreference,
    type RayTraceBackendPreference
  } from '../store/index';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let prefs = $state<VoxellePreferences>(loadPreferences());
  let rendererBackendBeforeOpen: RendererBackendPreference | null = null;

  $effect(() => {
    if (open) {
      const loaded = loadPreferences();
      prefs = loaded;
      voxellePreferences.set(loaded);
      rendererBackendBeforeOpen = loaded.rendererBackend;
    }
  });

  function onMovementDeltaHintChange(checked: boolean) {
    prefs = { ...prefs, showMovementDeltaHint: checked };
    savePreferences(prefs);
  }

  function onDragDeltaHintChange(checked: boolean) {
    prefs = { ...prefs, showDragDeltaHint: checked };
    savePreferences(prefs);
  }

  function onFpsCounterChange(checked: boolean) {
    prefs = { ...prefs, showFpsCounter: checked };
    savePreferences(prefs);
  }

  function onToneMappingChange(value: ToneMappingPreference) {
    prefs = { ...prefs, toneMapping: value };
    savePreferences(prefs);
  }

  function onRayTraceBackendChange(value: RayTraceBackendPreference) {
    prefs = { ...prefs, rayTraceBackend: value };
    savePreferences(prefs);
  }

  function onRayTickBudgetChange(value: number) {
    const v = Math.min(32, Math.max(4, Math.round(value)));
    prefs = { ...prefs, rayTickBudgetMs: v };
    savePreferences(prefs);
  }

  function onRayMaxBufferDimChange(value: number) {
    const v = Math.min(1920, Math.max(512, Math.round(value)));
    prefs = { ...prefs, rayMaxBufferDim: v };
    savePreferences(prefs);
  }

  function onRayMaxTemporalChange(value: number) {
    const v = Math.min(64, Math.max(1, Math.round(value)));
    prefs = { ...prefs, rayMaxTemporalSamples: v };
    savePreferences(prefs);
  }

  function onRayShadowSamplesChange(value: number) {
    const v = Math.min(8, Math.max(1, Math.round(value)));
    prefs = { ...prefs, rayShadowSamples: v };
    savePreferences(prefs);
  }

  function onRendererBackendChange(value: RendererBackendPreference) {
    prefs = { ...prefs, rendererBackend: value };
    savePreferences(prefs);
    if (rendererBackendBeforeOpen !== null && value !== rendererBackendBeforeOpen) {
      if (
        typeof window !== 'undefined' &&
        window.confirm('Reload the page to switch the graphics backend?')
      ) {
        window.location.reload();
      }
    }
  }
</script>

{#if open}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="preferences-title"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal modal--preferences">
      <h3 id="preferences-title" class="modal--preferences-title">Preferences</h3>
      <div class="modal--preferences-scroll">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={prefs.showMovementDeltaHint}
          onchange={(e) => onMovementDeltaHintChange(e.currentTarget.checked)}
        />
        Show movement delta hint (Δx, Δy, Δz near cursor during strokes)
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={prefs.showDragDeltaHint}
          onchange={(e) => onDragDeltaHintChange(e.currentTarget.checked)}
        />
        Show selection move drag hint (line and delta at original position)
      </label>
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={prefs.showFpsCounter}
          onchange={(e) => onFpsCounterChange(e.currentTarget.checked)}
        />
        Show FPS counter (viewport overlay)
      </label>
      <label class="select-label">
        <span class="select-label-text">Graphics API</span>
        <select
          class="tone-mapping-select"
          value={prefs.rendererBackend}
          onchange={(e) =>
            onRendererBackendChange(e.currentTarget.value as RendererBackendPreference)}
        >
          <option value="auto">Auto (WebGPU if available)</option>
          <option value="webgpu">WebGPU</option>
          <option value="webgl">WebGL</option>
        </select>
        <span class="field-hint"
          >Changing this reloads the page. For GPU ray tracing in Chrome, pick WebGPU or Auto (not
          WebGL).</span
        >
      </label>
      <h4 class="prefs-section-title">Ray mode</h4>
      <p class="field-hint prefs-section-hint">
        Applies when View → Rendering is Ray. GPU path needs a WebGPU viewport and a compact voxel
        volume (dense grid). Huge bounding boxes use a hash layout and CPU progressive until the
        build is tighter. If GPU is ineligible, CPU progressive runs and the console explains once.
      </p>
      <label class="select-label">
        <span class="select-label-text">Ray trace backend</span>
        <select
          class="tone-mapping-select"
          value={prefs.rayTraceBackend}
          onchange={(e) =>
            onRayTraceBackendChange(e.currentTarget.value as RayTraceBackendPreference)}
        >
          <option value="gpu">GPU when eligible, else CPU progressive</option>
          <option value="cpu">CPU progressive only</option>
        </select>
        <span class="field-hint"
          >GPU: full-screen TSL trace in Chrome after WebGPU reload. CPU: always progressive (good
          for very large or sparse models).</span
        >
      </label>
      <label class="select-label">
        <span class="select-label-text">CPU ray budget per frame (ms)</span>
        <input
          type="number"
          class="tone-mapping-select"
          min="4"
          max="32"
          step="1"
          value={prefs.rayTickBudgetMs}
          onchange={(e) => onRayTickBudgetChange(Number(e.currentTarget.value))}
        />
      </label>
      <label class="select-label">
        <span class="select-label-text">Max ray buffer size (px)</span>
        <input
          type="number"
          class="tone-mapping-select"
          min="512"
          max="1920"
          step="64"
          value={prefs.rayMaxBufferDim}
          onchange={(e) => onRayMaxBufferDimChange(Number(e.currentTarget.value))}
        />
      </label>
      <label class="select-label">
        <span class="select-label-text">Temporal samples (CPU)</span>
        <input
          type="number"
          class="tone-mapping-select"
          min="1"
          max="64"
          step="1"
          value={prefs.rayMaxTemporalSamples}
          onchange={(e) => onRayMaxTemporalChange(Number(e.currentTarget.value))}
        />
      </label>
      <label class="select-label">
        <span class="select-label-text">Shadow rays (CPU fine pass)</span>
        <input
          type="number"
          class="tone-mapping-select"
          min="1"
          max="8"
          step="1"
          value={prefs.rayShadowSamples}
          onchange={(e) => onRayShadowSamplesChange(Number(e.currentTarget.value))}
        />
      </label>
      <label class="select-label">
        <span class="select-label-text">Viewport tone mapping</span>
        <select
          class="tone-mapping-select"
          value={prefs.toneMapping}
          onchange={(e) => onToneMappingChange(e.currentTarget.value as ToneMappingPreference)}
        >
          {#each TONE_MAPPING_OPTIONS as opt (opt.value)}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        </select>
      </label>
      </div>
      <div class="modal-buttons modal--preferences-footer">
        <button type="button" onclick={() => (open = false)}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal--preferences {
    min-width: min(90vw, 24rem);
    max-height: min(90dvh, 90vh);
    min-height: 0;
    overflow: hidden;
  }

  .modal--preferences-title {
    flex-shrink: 0;
    margin: 0;
  }

  .modal--preferences-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .modal--preferences-scroll .checkbox-label,
  .modal--preferences-scroll .select-label {
    margin-bottom: 0;
  }

  .modal--preferences-scroll .prefs-section-title {
    margin: 0;
  }

  .modal--preferences-scroll .prefs-section-hint {
    margin: 0;
  }

  .modal--preferences-footer {
    flex-shrink: 0;
  }

  .prefs-section-title {
    margin: 0.75rem 0 0.25rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .prefs-section-hint {
    margin: 0 0 0.5rem;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
    line-height: 1.35;
    cursor: pointer;
  }

  .checkbox-label input {
    margin-top: 0.15rem;
    flex-shrink: 0;
  }

  .select-label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.75rem;
    font-size: 0.9rem;
    line-height: 1.35;
  }

  .select-label-text {
    font-weight: 500;
  }

  .field-hint {
    font-size: 0.78rem;
    opacity: 0.85;
    line-height: 1.3;
  }

  .tone-mapping-select {
    padding: 0.35rem 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .modal-buttons button {
    padding: 0.35rem 0.75rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .modal-buttons button:hover {
    background: var(--block-quote-bg-color);
  }
</style>
