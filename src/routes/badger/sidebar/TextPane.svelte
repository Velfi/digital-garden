<script lang="ts">
  import {
    document as docStore,
    selectedTextId,
    activeTextFontId,
    activeTextFontLabel,
    activeTextSizeMm,
    activeTextMode,
    activeTextStrokeWidth,
    updateText,
    deleteText
  } from '../store';
  import {
    fontLibrary,
    canAccessSystemFonts,
    loadSystemFonts,
    addUploadedFont,
    ensureFontLoaded,
    deleteUploadedFont,
    getLoadedFont,
    fontLoadTick
  } from '../store/fontLibrary';
  import type { TextMode } from '../store/types';
  import DimensionSlider from './DimensionSlider.svelte';

  let systemScanStatus = $state<'idle' | 'loading' | 'ready' | 'unsupported' | 'error'>(
    canAccessSystemFonts() ? 'idle' : 'unsupported'
  );
  let systemScanError = $state<string | null>(null);
  let uploadInput: HTMLInputElement | undefined = $state();

  let selected = $derived(
    $selectedTextId
      ? $docStore.metal.texts.find((t) => t.id === $selectedTextId) ?? null
      : null
  );

  // When an existing text is selected, its props become the active defaults
  // so they carry to the next placement. Also, when the user picks a font via
  // the dropdown below, that font's bytes load lazily.
  async function pickFont(id: string) {
    const entry = $fontLibrary.find((e) => e.id === id);
    if (!entry) return;
    activeTextFontId.set(id);
    activeTextFontLabel.set(entry.label);
    try {
      await ensureFontLoaded(id);
    } catch (err) {
      console.error('[badger] font load failed', err);
    }
    if (selected) updateText(selected.id, (t) => {
      t.fontId = id;
      t.fontLabel = entry.label;
    });
  }

  async function scanSystemFonts() {
    systemScanStatus = 'loading';
    systemScanError = null;
    try {
      await loadSystemFonts();
      systemScanStatus = 'ready';
    } catch (err) {
      systemScanStatus = 'error';
      systemScanError = err instanceof Error ? err.message : String(err);
    }
  }

  async function onUploadFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const id = await addUploadedFont(file);
      pickFont(id);
    } catch (err) {
      console.error('[badger] font upload failed', err);
      alert('Could not parse that font file.');
    }
    input.value = '';
  }

  function onModeChange(mode: TextMode) {
    activeTextMode.set(mode);
    if (selected) updateText(selected.id, (t) => (t.mode = mode));
  }

  function onSizeChange(v: number) {
    activeTextSizeMm.set(v);
    if (selected) updateText(selected.id, (t) => (t.sizeMm = v));
  }

  function onStrokeChange(v: number) {
    activeTextStrokeWidth.set(v);
    if (selected) updateText(selected.id, (t) => (t.strokeWidth = v));
  }

  let fontLoaded = $derived(
    (void $fontLoadTick, $activeTextFontId ? !!getLoadedFont($activeTextFontId) : false)
  );
</script>

<h2>Text</h2>

<div class="font-picker">
  <label class="sidebar-label" for="badger-font-select">Font</label>
  <select
    id="badger-font-select"
    value={$activeTextFontId ?? ''}
    onchange={(e) => pickFont((e.target as HTMLSelectElement).value)}
  >
    <option value="" disabled>{$fontLibrary.length === 0 ? 'No fonts loaded' : 'Pick a font…'}</option>
    {#each $fontLibrary as f (f.id)}
      <option value={f.id}>{f.label}{f.source === 'upload' ? ' (uploaded)' : ''}</option>
    {/each}
  </select>
  {#if $activeTextFontId && !fontLoaded}
    <p class="hint warn">Font bytes loading…</p>
  {/if}
</div>

<div class="font-actions">
  {#if systemScanStatus === 'unsupported'}
    <p class="hint">
      System fonts aren't available in this browser. Upload a .ttf or .otf file to use it.
    </p>
  {:else}
    <button
      type="button"
      onclick={scanSystemFonts}
      disabled={systemScanStatus === 'loading'}
    >
      {systemScanStatus === 'loading' ? 'Loading…' : 'Browse system fonts…'}
    </button>
    {#if systemScanStatus === 'error' && systemScanError}
      <p class="hint warn">{systemScanError}</p>
    {/if}
  {/if}
  <input
    bind:this={uploadInput}
    type="file"
    accept=".ttf,.otf,.woff,.woff2,font/*"
    style="display:none"
    onchange={onUploadFile}
  />
  <button type="button" onclick={() => uploadInput?.click()}>Upload font…</button>
</div>

<label class="sidebar-label" for="badger-text-mode">Mode</label>
<div class="mode-row">
  <label class="radio-option">
    <input
      type="radio"
      name="badger-text-mode"
      value="filled"
      checked={(selected?.mode ?? $activeTextMode) === 'filled'}
      onchange={() => onModeChange('filled')}
    />
    Filled
  </label>
  <label class="radio-option">
    <input
      type="radio"
      name="badger-text-mode"
      value="outline"
      checked={(selected?.mode ?? $activeTextMode) === 'outline'}
      onchange={() => onModeChange('outline')}
    />
    Outline
  </label>
</div>

<DimensionSlider
  label="Size"
  hint="Em height in mm."
  valueMm={selected?.sizeMm ?? $activeTextSizeMm}
  minMm={1}
  maxMm={100}
  stepMm={0.5}
  onInputMm={onSizeChange}
/>

{#if (selected?.mode ?? $activeTextMode) === 'outline'}
  <DimensionSlider
    label="Outline stroke"
    hint="Wall thickness tracing each glyph."
    valueMm={selected?.strokeWidth ?? $activeTextStrokeWidth}
    minMm={0.1}
    maxMm={3}
    stepMm={0.05}
    onInputMm={onStrokeChange}
  />
{/if}

{#if selected}
  <button type="button" class="delete" onclick={() => deleteText(selected!.id)}>
    Delete text
  </button>
{:else}
  <p class="hint">
    {#if !$activeTextFontId}
      Pick a font, then click the canvas to place text. Type to edit, Escape to commit.
    {:else}
      Click the canvas to place text. Type to edit, Escape or Enter to commit.
    {/if}
  </p>
{/if}

{#if $docStore.metal.texts.length > 0}
  <h3>Text layers ({$docStore.metal.texts.length})</h3>
  <ul class="text-list">
    {#each $docStore.metal.texts as t (t.id)}
      <li class:selected={$selectedTextId === t.id}>
        <button type="button" class="text-label" onclick={() => selectedTextId.set(t.id)}>
          <span class="text-preview">{t.text || '(empty)'}</span>
          <span class="text-meta">{t.mode} · {t.sizeMm}mm · {t.fontLabel}</span>
        </button>
        <button type="button" title="Delete" onclick={() => deleteText(t.id)}>×</button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .font-picker {
    margin-bottom: 0.5rem;
  }
  .font-picker select {
    width: 100%;
    padding: 0.3rem;
    font-size: 0.85rem;
    background: var(--bg-color);
    color: inherit;
    border: 1px solid var(--border-color);
    border-radius: 3px;
  }
  .font-actions {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin-bottom: 0.5rem;
  }
  .font-actions button {
    padding: 0.3rem 0.5rem;
    font-size: 0.8rem;
    background: var(--bg-color);
    color: inherit;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    cursor: pointer;
  }
  .font-actions button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }
  .font-actions button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .mode-row {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.4rem;
  }
  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .hint {
    font-size: 0.78rem;
    opacity: 0.85;
    margin: 0.2rem 0 0.4rem;
    line-height: 1.35;
  }
  .hint.warn {
    color: #c36;
  }
  .delete {
    margin-top: 0.4rem;
    padding: 0.3rem 0.5rem;
    border: 1px solid #a33;
    background: transparent;
    color: inherit;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .delete:hover {
    background: rgba(200, 60, 60, 0.15);
  }
  .text-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .text-list li {
    display: flex;
    gap: 0.2rem;
    align-items: center;
    padding: 0.2rem 0.3rem;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-color);
    font-size: 0.8rem;
  }
  .text-list li.selected {
    border-color: var(--link-color);
  }
  .text-label {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    color: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.05rem;
  }
  .text-preview {
    font-weight: 600;
  }
  .text-meta {
    font-size: 0.7rem;
    opacity: 0.75;
  }
  .text-list button:not(.text-label) {
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 2px;
    color: inherit;
    cursor: pointer;
    padding: 0.1rem 0.3rem;
    font-size: 0.75rem;
  }
  h3 {
    margin: 0.5rem 0 0.2rem;
    font-size: 0.9rem;
  }
</style>
