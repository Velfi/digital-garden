<script lang="ts">
  import { onMount } from 'svelte';
  import { get, type Writable } from 'svelte/store';

  interface Props {
    color: Writable<string>;
    palette: Writable<string[]>;
    selectedColors?: Writable<string[]>;
    disabled?: boolean;
    defaultSlug?: string;
  }

  let { color, palette, selectedColors, disabled = false, defaultSlug }: Props = $props();

  onMount(() => {
    if (defaultSlug) loadPaletteBySlug(defaultSlug);
  });

  const POPULAR_PALETTES: { name: string; slug: string }[] = [
    { name: 'Resurrect 64', slug: 'resurrect-64' },
    { name: 'Apollo', slug: 'apollo' },
    { name: 'Lospec500', slug: 'lospec500' },
    { name: 'CC-29', slug: 'cc-29' },
    { name: 'SLSO8', slug: 'slso8' }
  ];

  let lospecSlug = $state('');
  let loading = $state(false);
  let loadError = $state('');

  // Drag-to-select range (only when selectedColors is provided)
  let paletteContainer = $state<HTMLDivElement | null>(null);
  let dragStartIndex = $state<number | null>(null);
  let isDragging = $state(false);
  let dragStartShiftKey = $state(false);

  async function loadPaletteBySlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return;
    loading = true;
    loadError = '';
    try {
      const res = await fetch(`/api/lospec/${encodeURIComponent(normalized)}`);
      const data = await res.json();
      if (!res.ok) {
        loadError =
          (data as { message?: string; error?: string }).message ??
          (data as { message?: string; error?: string }).error ??
          'Failed to load palette';
        return;
      }
      const hexColors = ((data as { colors?: string[] }).colors ?? []).map((c: string) =>
        c.startsWith('#') ? c : `#${c}`
      );
      palette.set(hexColors);
      if (hexColors.length) {
        color.set(hexColors[0]);
        if (selectedColors) selectedColors.set([hexColors[0]]);
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to load palette';
    } finally {
      loading = false;
    }
  }

  function loadLospecPalette() {
    loadPaletteBySlug(lospecSlug);
  }

  function handleSwatchClick(swatch: string, e: MouseEvent | { shiftKey?: boolean }) {
    if (selectedColors) {
      const sel = [...get(selectedColors)];
      if (e.shiftKey) {
        const i = sel.indexOf(swatch);
        if (i >= 0) {
          sel.splice(i, 1);
        } else {
          sel.push(swatch);
        }
        selectedColors.set(sel);
        if (sel.length > 0) color.set(sel[sel.length - 1]);
      } else {
        color.set(swatch);
        selectedColors.set([swatch]);
      }
    } else {
      color.set(swatch);
    }
  }

  function getSwatchIndexUnder(clientX: number, clientY: number): number | null {
    const el = document.elementFromPoint(clientX, clientY);
    const swatchEl = el?.closest?.('[data-swatch-index]');
    if (!swatchEl) return null;
    const raw = swatchEl.getAttribute('data-swatch-index');
    if (raw === null) return null;
    const idx = parseInt(raw, 10);
    return Number.isNaN(idx) ? null : idx;
  }

  function handlePalettePointerMove(e: PointerEvent) {
    if (dragStartIndex === null || disabled || !selectedColors || !paletteContainer) return;
    const currentIndex = getSwatchIndexUnder(e.clientX, e.clientY);
    if (currentIndex === null) return;
    const pal = get(palette);
    if (currentIndex < 0 || currentIndex >= pal.length) return;
    if (!isDragging && currentIndex === dragStartIndex) return;
    isDragging = true;
    const lo = Math.min(dragStartIndex, currentIndex);
    const hi = Math.max(dragStartIndex, currentIndex);
    const range = pal.slice(lo, hi + 1);
    if (dragStartShiftKey) {
      const existing = get(selectedColors);
      const combined = [...existing];
      for (const c of range) {
        if (!combined.includes(c)) combined.push(c);
      }
      selectedColors.set(combined);
    } else {
      selectedColors.set(range);
    }
    color.set(pal[currentIndex]);
  }

  function handlePalettePointerUp(e: PointerEvent) {
    if (dragStartIndex === null || !selectedColors) return;
    const pal = get(palette);
    if (!isDragging) {
      handleSwatchClick(pal[dragStartIndex], { shiftKey: dragStartShiftKey });
    } else if (dragStartShiftKey) {
      const currentIndex = getSwatchIndexUnder(e.clientX, e.clientY);
      if (currentIndex !== null && currentIndex >= 0 && currentIndex < pal.length) {
        const lo = Math.min(dragStartIndex, currentIndex);
        const hi = Math.max(dragStartIndex, currentIndex);
        const range = pal.slice(lo, hi + 1);
        const existing = get(selectedColors);
        const combined = [...existing];
        for (const c of range) {
          if (!combined.includes(c)) combined.push(c);
        }
        selectedColors.set(combined);
        color.set(pal[currentIndex]);
      }
    }
    dragStartIndex = null;
    isDragging = false;
  }
</script>

<h2>Lospec palette</h2>
<p class="lospec-hint">
  <a href="https://lospec.com/palette-list" target="_blank" rel="noopener">Browse palettes</a> and enter
  a slug (e.g. greyt-bit, apollo)
</p>
<div class="popular-palettes">
  {#each POPULAR_PALETTES as p (p.slug)}
    <a
      href="https://lospec.com/palette-list/{p.slug}"
      class="palette-link"
      onclick={(e) => {
        e.preventDefault();
        loadPaletteBySlug(p.slug);
      }}
    >
      {p.name}
    </a>
  {/each}
</div>
<div class="lospec-loader">
  <input
    type="text"
    placeholder="e.g. greyt-bit"
    bind:value={lospecSlug}
    onkeydown={(e) => e.key === 'Enter' && loadLospecPalette()}
    disabled={loading}
  />
  <button type="button" onclick={loadLospecPalette} disabled={loading}>
    {loading ? 'Loading…' : 'Load'}
  </button>
</div>
{#if loadError}
  <span class="load-error">{loadError}</span>
{/if}
{#if $palette.length > 0}
  {@const sel = selectedColors ? ($selectedColors ?? []) : []}
  <div
    class="palette-swatches"
    role="group"
    aria-label="Color palette swatches"
    bind:this={paletteContainer}
    onpointermove={selectedColors ? handlePalettePointerMove : undefined}
    onpointerup={selectedColors ? handlePalettePointerUp : undefined}
    onpointercancel={selectedColors ? handlePalettePointerUp : undefined}
  >
    {#each $palette as swatch, i (i)}
      <button
        type="button"
        class="swatch"
        class:active={selectedColors
          ? sel.length > 0
            ? sel.includes(swatch)
            : swatch === $color
          : swatch === $color}
        style="background-color: {swatch}"
        data-swatch-index={i}
        title="{swatch} — Shift+click to multi-select; drag to select range; shift+drag to add range"
        aria-label="Select color {swatch}"
        onpointerdown={(e) => {
          if (e.button !== 0 || disabled) return;
          e.stopPropagation();
          e.preventDefault();
          if (selectedColors && paletteContainer) {
            dragStartIndex = i;
            isDragging = false;
            dragStartShiftKey = e.shiftKey;
            paletteContainer.setPointerCapture(e.pointerId);
            if (!e.shiftKey) {
              color.set(swatch);
              selectedColors.set([swatch]);
            }
          } else {
            handleSwatchClick(swatch, e);
          }
        }}
        {disabled}
      ></button>
    {/each}
  </div>
  {#if selectedColors}
    <p class="palette-hint">
      Shift+click to multi-select; drag to select a range; shift+drag to add a range. Painting uses
      selected colors randomly.
    </p>
  {/if}
{/if}

<style>
  .lospec-hint {
    font-size: 0.8rem;
    margin: 0;
    color: var(--text-color-muted, #666);
  }
  .lospec-hint a {
    color: var(--link-color);
  }

  .popular-palettes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    margin-bottom: 0.25rem;
  }

  .palette-link {
    font-size: 0.85rem;
    color: var(--link-color);
  }
  .palette-link:hover {
    text-decoration: underline;
  }

  .lospec-loader {
    display: flex;
    gap: 0.25rem;
  }
  .lospec-loader input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .load-error {
    font-size: 0.8rem;
    color: #c44;
  }

  .palette-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: 0.25rem;
  }

  .palette-hint {
    font-size: 0.8rem;
    margin: 0.25rem 0 0;
    color: var(--text-color-muted, #666);
  }

  .swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 2px;
    cursor: pointer;
  }
  .swatch:hover:not(:disabled) {
    transform: scale(1.1);
  }
  .swatch.active {
    outline: 2px solid var(--text-color);
    outline-offset: 1px;
  }
  .swatch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
</style>
