<script lang="ts">
  import {
    tool,
    symmetryEnabled,
    symmetryMode,
    symmetryFolds,
    symmetryOriginX,
    symmetryOriginY,
    symmetryRotation,
    color,
    secondaryColor,
    brushSize,
    brushShape,
    brushAngle,
    brushRatio,
    brushSpacing,
    brushOpacity,
    brushFlow,
    brushSoftness,
    brushSharpness,
    brushSharpnessSoften,
    brushScatterX,
    brushScatterY,
    brushMirrorH,
    brushMirrorV,
    brushRotationMode,
    brushRotationAngle,
    brushIsotropicSpacing,
    brushSource,
    brushMix,
    palette,
    canvasWidth,
    canvasHeight,
    canvasKey,
    showSymmetryPreview,
    brushRotateWithSymmetry,
    history,
    canUndo,
    canRedo,
    sidebarOpen,
    mosaicType,
    type Tool
  } from './store';
  import { onMount, tick } from 'svelte';
  import type { SymmetryMode } from './symmetry';
  import { MOSAIC_TYPES } from './symmetry';
  import {
    drawBrushPreview,
    type BrushShape as BrushShapeType,
    type BrushParams
  } from './brushEngine';
  import ParamLabel from './ParamLabel.svelte';

  const BRUSH_TIPS: Record<string, string> = {
    'angle-ellipse': 'Rotation of the ellipse shape in degrees.',
    ratio: 'Ellipse flatness: 1 = circle, lower = flatter oval.',
    spacing:
      'Distance between brush dabs as % of brush size. Lower = smoother strokes, higher = more dotted.',
    size: 'Diameter of the brush in pixels.',
    opacity: 'Maximum opacity of each dab. At 100%, paint is fully opaque.',
    flow: 'Opacity per dab; lower values build up gradually with overlapping strokes.',
    softness: 'Radial falloff from center: 0 = hard edge, 1 = soft gradient.',
    sharpness: 'Pixel-style threshold: 1 = hard pixel edge, 0 = softer transition.',
    'scatter-x': 'Random offset along the stroke direction.',
    'scatter-y': 'Random offset perpendicular to the stroke.',
    'mirror-h': 'Mirror the brush horizontally.',
    'mirror-v': 'Mirror the brush vertically.',
    rotation:
      'How the brush rotates: fixed angle, radially from symmetry origin, or along the stroke direction.',
    'angle-rotation': 'Fixed rotation in degrees when using fixed rotation mode.',
    'isotropic-spacing':
      'Use same spacing in all directions. When off, ellipse ratio affects spacing along the stroke.',
    source: 'Color source: plain color or uniform random from palette.',
    mix: 'Blend between foreground and background when using plain color.',
    foreground: 'Primary paint color.',
    background: 'Secondary color for mix and other effects.'
  };

  const BRUSH_SHAPES: { value: BrushShapeType; label: string }[] = [
    { value: 'round', label: 'Round' },
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'ellipse', label: 'Ellipse' },
    { value: 'star', label: 'Star' },
    { value: 'hexagon', label: 'Hexagon' }
  ];

  let brushPreviewCanvas: HTMLCanvasElement;

  function drawBrushPreviewToCanvas() {
    if ($tool !== 'paint' || !brushPreviewCanvas) return;
    const ctx = brushPreviewCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 60, 60);
    ctx.save();
    ctx.translate(30, 30);
    const previewParams: BrushParams = {
      size: $brushSize,
      shape: $brushShape,
      angle: $brushAngle,
      ratio: Math.max(0.1, Math.min(1, $brushRatio)),
      color: $color,
      rotationMode: $brushRotationMode,
      rotationAngle: $brushRotationAngle,
      mirrorH: $brushMirrorH,
      mirrorV: $brushMirrorV
    } as BrushParams;
    if ($brushRotationMode === 'origin' || $brushRotationMode === 'drawing') {
      (previewParams as BrushParams & { previewRotationRad?: number }).previewRotationRad =
        Math.PI / 4;
    }
    drawBrushPreview(ctx, previewParams, 'rgba(0,0,0,0.5)');
    ctx.restore();
  }

  $: ($brushSize,
    $brushShape,
    $brushAngle,
    $brushRatio,
    $color,
    $brushRotationMode,
    $brushRotationAngle,
    $brushMirrorH,
    $brushMirrorV,
    $tool,
    (() => {
      if ($tool !== 'paint') return;
      drawBrushPreviewToCanvas();
    })());

  onMount(() => {
    loadPaletteBySlug('resurrect-64');
    if ($tool === 'paint') drawBrushPreviewToCanvas();
  });

  const POPULAR_PALETTES: { name: string; slug: string }[] = [
    { name: 'Resurrect 64', slug: 'resurrect-64' },
    { name: 'Apollo', slug: 'apollo' },
    { name: 'Lospec500', slug: 'lospec500' },
    { name: 'CC-29', slug: 'cc-29' },
    { name: 'SLSO8', slug: 'slso8' }
  ];

  let lospecSlug = '';
  let loading = false;
  let loadError = '';

  async function loadPaletteBySlug(slug: string) {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return;
    loading = true;
    loadError = '';
    try {
      const res = await fetch(`/api/lospec/${encodeURIComponent(normalized)}`);
      const data = await res.json();
      if (!res.ok) {
        loadError = data.message || data.error || 'Failed to load palette';
        return;
      }
      const hexColors = (data.colors ?? []).map((c: string) => (c.startsWith('#') ? c : `#${c}`));
      palette.set(hexColors);
      if (hexColors.length) color.set(hexColors[0]);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to load palette';
    } finally {
      loading = false;
    }
  }

  function loadLospecPalette() {
    loadPaletteBySlug(lospecSlug);
  }

  let showNewCanvas = false;
  let newWidth = 800;
  let newHeight = 600;

  const linearFolds = [2, 4, 8];
  const polarFolds = [3, 4, 5, 6, 8, 12];

  function openNewCanvas() {
    newWidth = Math.max(100, Math.min(2000, Number($canvasWidth) || 800));
    newHeight = Math.max(100, Math.min(2000, Number($canvasHeight) || 600));
    showNewCanvas = true;
  }

  function createCanvas() {
    const width = Math.max(100, Math.min(2000, Math.round(Number(newWidth) || 800)));
    const height = Math.max(100, Math.min(2000, Math.round(Number(newHeight) || 600)));
    canvasWidth.set(width);
    canvasHeight.set(height);
    canvasKey.update((k) => k + 1);
    newWidth = width;
    newHeight = height;
    showNewCanvas = false;
  }

  function exportCanvas() {
    const canvas = document.getElementById('kaleido-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'kaleidopaint.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
</script>

<div class="sidebar-wrapper">
  <aside class="sidebar" class:collapsed={!$sidebarOpen}>
    <button
      type="button"
      class="collapse-btn"
      on:click={() => sidebarOpen.set(false)}
      title="Collapse sidebar"
      aria-label="Collapse sidebar"
    >
      ◀
    </button>
    <div class="sidebar-inner">
      <h2>Tools</h2>
      <div class="tool-group">
        <button
          type="button"
          class="tool"
          class:active={$tool === 'paint'}
          on:click={() => tool.set('paint')}
          title="Paint"
        >
          Brush
        </button>
        <button
          type="button"
          class="tool"
          class:active={$tool === 'fill'}
          on:click={() => tool.set('fill')}
          title="Fill"
        >
          Fill
        </button>
        <button
          type="button"
          class="tool"
          class:active={$tool === 'origin'}
          on:click={() => tool.set('origin')}
          title="Set symmetry origin"
        >
          Origin
        </button>
        <button
          type="button"
          class="tool"
          class:active={$tool === 'rotate'}
          on:click={() => tool.set('rotate')}
          title="Rotate symmetry"
        >
          Rotate
        </button>
        <button
          type="button"
          class="tool"
          class:active={$tool === 'eyedropper'}
          on:click={() => tool.set('eyedropper')}
          title="Pick color from canvas"
        >
          Eyedropper
        </button>
      </div>

      {#if $tool === 'paint'}
        <h2>Brush</h2>
        <label class="brush-param">
          <span>Shape</span>
          <select bind:value={$brushShape}>
            {#each BRUSH_SHAPES as s}
              <option value={s.value}>{s.label}</option>
            {/each}
          </select>
        </label>
        <div class="brush-preview">
          <canvas bind:this={brushPreviewCanvas} width={60} height={60} aria-hidden="true"></canvas>
        </div>
        <div class="brush-params-grid">
          <label class="brush-param">
            <ParamLabel label="Size" tip={BRUSH_TIPS.size} id="tip-size" />
            <input type="range" min="1" max="50" bind:value={$brushSize} />
            <span class="value">{$brushSize}px</span>
          </label>
          <label class="brush-param">
            <ParamLabel label="Spacing" tip={BRUSH_TIPS.spacing} id="tip-spacing" />
            <input
              type="range"
              min="10"
              max="500"
              value={$brushSpacing * 100}
              on:input={(e) => brushSpacing.set(Number((e.target as HTMLInputElement).value) / 100)}
            />
            <span class="value">{Math.round($brushSpacing * 100)}%</span>
          </label>
          {#if $brushShape === 'ellipse' || $brushShape === 'rectangle'}
            <label class="brush-param">
              <ParamLabel label="Angle" tip={BRUSH_TIPS['angle-ellipse']} id="tip-angle-ellipse" />
              <input type="range" min="0" max="360" bind:value={$brushAngle} />
              <span class="value">{$brushAngle}°</span>
            </label>
            <label class="brush-param">
              <ParamLabel label="Ratio" tip={BRUSH_TIPS.ratio} id="tip-ratio" />
              <input
                type="range"
                min="10"
                max="100"
                value={$brushRatio * 100}
                on:input={(e) => brushRatio.set(Number((e.target as HTMLInputElement).value) / 100)}
              />
              <span class="value">{Math.round($brushRatio * 100)}%</span>
            </label>
          {/if}

          <label class="brush-param">
            <ParamLabel label="Opacity" tip={BRUSH_TIPS.opacity} id="tip-opacity" />
            <input
              type="range"
              min="0"
              max="100"
              value={$brushOpacity * 100}
              on:input={(e) => brushOpacity.set(Number((e.target as HTMLInputElement).value) / 100)}
            />
            <span class="value">{Math.round($brushOpacity * 100)}%</span>
          </label>
          <label class="brush-param">
            <ParamLabel label="Flow" tip={BRUSH_TIPS.flow} id="tip-flow" />
            <input
              type="range"
              min="0"
              max="100"
              value={$brushFlow * 100}
              on:input={(e) => brushFlow.set(Number((e.target as HTMLInputElement).value) / 100)}
            />
            <span class="value">{Math.round($brushFlow * 100)}%</span>
          </label>
          <label class="brush-param">
            <ParamLabel label="Softness" tip={BRUSH_TIPS.softness} id="tip-softness" />
            <input
              type="range"
              min="0"
              max="100"
              value={$brushSoftness * 100}
              on:input={(e) =>
                brushSoftness.set(Number((e.target as HTMLInputElement).value) / 100)}
            />
            <span class="value">{Math.round($brushSoftness * 100)}%</span>
          </label>
          <label class="brush-param">
            <ParamLabel label="Sharpness" tip={BRUSH_TIPS.sharpness} id="tip-sharpness" />
            <input
              type="range"
              min="0"
              max="100"
              value={$brushSharpness * 100}
              on:input={(e) =>
                brushSharpness.set(Number((e.target as HTMLInputElement).value) / 100)}
            />
            <span class="value">{Math.round($brushSharpness * 100)}%</span>
          </label>
        </div>

        <div class="scatter-mirror-row">
          <div class="scatter-section">
            <h3 class="brush-sub">Scatter</h3>
            <label class="brush-param">
              <ParamLabel label="X" tip={BRUSH_TIPS['scatter-x']} id="tip-scatter-x" />
              <input
                type="range"
                min="0"
                max="100"
                value={$brushScatterX * 100}
                on:input={(e) =>
                  brushScatterX.set(Number((e.target as HTMLInputElement).value) / 100)}
              />
            </label>
            <label class="brush-param">
              <ParamLabel label="Y" tip={BRUSH_TIPS['scatter-y']} id="tip-scatter-y" />
              <input
                type="range"
                min="0"
                max="100"
                value={$brushScatterY * 100}
                on:input={(e) =>
                  brushScatterY.set(Number((e.target as HTMLInputElement).value) / 100)}
              />
            </label>
          </div>
          <div class="mirror-section">
            <h3 class="brush-sub">Mirror</h3>
            <div class="brush-toggles">
              <label class="toggle">
                <input type="checkbox" bind:checked={$brushMirrorH} />
                <ParamLabel label="H" tip={BRUSH_TIPS['mirror-h']} id="tip-mirror-h" />
              </label>
              <label class="toggle">
                <input type="checkbox" bind:checked={$brushMirrorV} />
                <ParamLabel label="V" tip={BRUSH_TIPS['mirror-v']} id="tip-mirror-v" />
              </label>
            </div>
          </div>
        </div>

        <h3 class="brush-sub">Rotation</h3>
        <label class="brush-param">
          <ParamLabel label="Mode" tip={BRUSH_TIPS.rotation} id="tip-rotation" />
          <select bind:value={$brushRotationMode}>
            <option value="fixed">Fixed</option>
            <option value="origin">Around origin</option>
            <option value="drawing">Drawing direction</option>
          </select>
        </label>
        {#if $brushRotationMode === 'fixed'}
          <label class="brush-param">
            <ParamLabel label="Angle" tip={BRUSH_TIPS['angle-rotation']} id="tip-angle-rotation" />
            <input type="range" min="0" max="360" bind:value={$brushRotationAngle} />
            <span class="value">{$brushRotationAngle}°</span>
          </label>
        {/if}

        <label class="toggle">
          <input type="checkbox" bind:checked={$brushIsotropicSpacing} />
          <ParamLabel
            label="Isotropic spacing"
            tip={BRUSH_TIPS['isotropic-spacing']}
            id="tip-isotropic"
          />
        </label>

        <h3 class="brush-sub">Source</h3>
        <div class="brush-params-grid">
          <label class="brush-param">
            <ParamLabel label="Color source" tip={BRUSH_TIPS.source} id="tip-source" />
            <select bind:value={$brushSource}>
              <option value="plain">Plain color</option>
              <option value="uniformRandom">Uniform random</option>
            </select>
          </label>
          {#if $brushSource === 'plain'}
            <label class="brush-param">
              <ParamLabel label="Mix (fg↔bg)" tip={BRUSH_TIPS.mix} id="tip-mix" />
              <input
                type="range"
                min="0"
                max="100"
                value={$brushMix * 100}
                on:input={(e) => brushMix.set(Number((e.target as HTMLInputElement).value) / 100)}
              />
              <span class="value">{Math.round($brushMix * 100)}%</span>
            </label>
          {/if}
        </div>
      {/if}

      <h2>Color</h2>
      <div class="brush-params-grid">
        <label class="brush-param">
          <ParamLabel label="Foreground" tip={BRUSH_TIPS.foreground} id="tip-foreground" />
          <input type="color" bind:value={$color} />
        </label>
        <label class="brush-param">
          <ParamLabel
            label="Background (for mix)"
            tip={BRUSH_TIPS.background}
            id="tip-background"
          />
          <input type="color" bind:value={$secondaryColor} />
        </label>
      </div>

      <h2>Lospec palette</h2>
      <p class="lospec-hint">
        <a href="https://lospec.com/palette-list" target="_blank" rel="noopener">Browse palettes</a> and
        enter a slug (e.g. greyt-bit, apollo)
      </p>
      <div class="popular-palettes">
        {#each POPULAR_PALETTES as p}
          <a
            href="https://lospec.com/palette-list/{p.slug}"
            class="palette-link"
            on:click|preventDefault={() => loadPaletteBySlug(p.slug)}
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
          on:keydown={(e) => e.key === 'Enter' && loadLospecPalette()}
          disabled={loading}
        />
        <button type="button" on:click={loadLospecPalette} disabled={loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>
      {#if loadError}
        <span class="load-error">{loadError}</span>
      {/if}
      {#if $palette.length > 0}
        <div class="palette-swatches">
          {#each $palette as swatch}
            <button
              type="button"
              class="swatch"
              class:active={swatch === $color}
              style="background-color: {swatch}"
              title={swatch}
              aria-label="Select color {swatch}"
              on:click={() => color.set(swatch)}
            ></button>
          {/each}
        </div>
      {/if}

      <h2>Symmetry</h2>
      <div class="symmetry-section">
        <label class="toggle">
          <input type="checkbox" bind:checked={$symmetryEnabled} />
          Symmetry on
          <select bind:value={$symmetryMode} disabled={!$symmetryEnabled}>
            <option value="linear">Linear</option>
            <option value="polar">Polar</option>
            <option value="mosaic">Mosaic</option>
          </select>
        </label>

        {#if $symmetryEnabled && $symmetryMode === 'linear'}
          <div class="folds">
            {#each linearFolds as n}
              <button
                type="button"
                class="fold"
                class:active={$symmetryFolds === n}
                on:click={() => symmetryFolds.set(n)}
              >
                {n}-fold
              </button>
            {/each}
          </div>
        {/if}
        {#if $symmetryEnabled && $symmetryMode === 'polar'}
          <div class="folds">
            {#each polarFolds as n}
              <button
                type="button"
                class="fold"
                class:active={$symmetryFolds === n}
                on:click={() => symmetryFolds.set(n)}
              >
                {n}-fold
              </button>
            {/each}
          </div>
        {/if}
        {#if $symmetryEnabled && $symmetryMode === 'mosaic'}
          <label class="brush-param">
            <span class="label">Pattern</span>
            <select bind:value={$mosaicType}>
              {#each MOSAIC_TYPES as { value, label }}
                <option {value}>{label}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if $symmetryEnabled && ($symmetryMode === 'linear' || $symmetryMode === 'polar' || $symmetryMode === 'mosaic')}
          <label class="brush-param">
            <ParamLabel
              label="Rotation"
              tip="Angle of the symmetry axis (linear) or first fold (polar)."
              id="tip-symmetry-rotation"
            />
            <input type="range" min="0" max="360" bind:value={$symmetryRotation} />
            <span class="value">{$symmetryRotation}°</span>
          </label>
          <button
            type="button"
            on:click={() => {
              symmetryOriginX.set(0.5);
              symmetryOriginY.set(0.5);
            }}
            title="Reset symmetry origin to center"
          >
            Center origin
          </button>
        {/if}

        <label class="toggle">
          <input type="checkbox" bind:checked={$showSymmetryPreview} />
          Show symmetry preview
        </label>
        {#if $symmetryEnabled && ($symmetryMode === 'linear' || $symmetryMode === 'polar' || $symmetryMode === 'mosaic')}
          <label class="toggle">
            <input type="checkbox" bind:checked={$brushRotateWithSymmetry} />
            Rotate brush with symmetry
          </label>
        {/if}
      </div>

      <h2>Canvas</h2>
      <div class="undo-redo">
        <button
          type="button"
          disabled={!$canUndo}
          on:click={() => history.undo()}
          title="Undo (Ctrl+Z / Cmd+Z)">Undo</button
        >
        <button
          type="button"
          disabled={!$canRedo}
          on:click={() => history.redo()}
          title="Redo (Ctrl+Shift+Z / Cmd+Y)">Redo</button
        >
      </div>
      <button type="button" on:click={openNewCanvas}>New canvas</button>
      <button type="button" on:click={exportCanvas}>Export PNG</button>
    </div>

    {#if showNewCanvas}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        on:click={(e) => e.target === e.currentTarget && (showNewCanvas = false)}
        on:keydown={(e) => e.key === 'Escape' && (showNewCanvas = false)}
      >
        <div class="modal">
          <h3>New canvas</h3>
          <label>
            Width
            <input type="number" min="100" max="2000" bind:value={newWidth} />
          </label>
          <label>
            Height
            <input type="number" min="100" max="2000" bind:value={newHeight} />
          </label>
          <button type="button" on:click={createCanvas}>Create</button>
          <button type="button" on:click={() => (showNewCanvas = false)}>Cancel</button>
        </div>
      </div>
    {/if}
  </aside>
  {#if !$sidebarOpen}
    <button
      type="button"
      class="expand-tab"
      on:click={() => sidebarOpen.set(true)}
      title="Expand sidebar"
      aria-label="Expand sidebar"
    >
      ▶
    </button>
  {/if}
</div>

<style lang="scss">
  .sidebar-wrapper {
    display: flex;
    flex-shrink: 0;
    align-items: stretch;
  }

  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 360px;
    min-width: 360px;
    flex-shrink: 0;
    padding: 0.5rem 0.75rem;
    max-height: calc(100vh - 6rem);
    overflow-y: auto;
    overflow-x: hidden;
    transition:
      width 0.2s ease,
      min-width 0.2s ease,
      padding 0.2s ease;

    &.collapsed {
      width: 0;
      min-width: 0;
      padding-left: 0;
      padding-right: 0;
      overflow: hidden;

      .collapse-btn,
      .sidebar-inner {
        opacity: 0;
        pointer-events: none;
      }
    }
  }

  .collapse-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    font-size: 0.75rem;
    line-height: 1;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;

    &:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  }

  .sidebar-inner {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }

  .expand-tab {
    width: 1.5rem;
    padding: 0.5rem 0.25rem;
    font-size: 0.75rem;
    line-height: 1;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-left: none;
    border-radius: 0 4px 4px 0;
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    writing-mode: vertical-rl;
    text-orientation: mixed;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  .sidebar h2 {
    font-size: 0.9rem;
    margin: 0.5rem 0 0.15rem 0;
    &:first-child {
      margin-top: 0;
    }
  }

  h3.brush-sub {
    font-size: 0.8rem;
    margin: 0.35rem 0 0.1rem 0;
    font-weight: 600;
  }

  .tool-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tool,
  .fold {
    &.active {
      font-weight: bold;
    }
  }

  .value {
    font-size: 0.9rem;
    margin-left: 0.5rem;
  }

  .symmetry-section {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
    align-items: start;

    .toggle {
      margin-top: 0;
    }
  }

  .folds {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.25rem;
    cursor: pointer;
  }

  input[type='color'] {
    width: 100%;
    height: 2rem;
    padding: 2px;
    cursor: pointer;
  }

  input[type='range'] {
    width: 100%;
  }

  .lospec-hint {
    font-size: 0.8rem;
    margin: 0;
    color: var(--text-color-muted, #666);
    a {
      color: var(--accent-color, #08c);
    }
  }

  .popular-palettes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    margin-bottom: 0.25rem;

    .palette-link {
      font-size: 0.85rem;
      color: var(--accent-color, #08c);
      &:hover {
        text-decoration: underline;
      }
    }
  }

  .lospec-loader {
    display: flex;
    gap: 0.25rem;
    input {
      flex: 1;
      padding: 0.25rem 0.5rem;
    }
  }

  .load-error {
    font-size: 0.8rem;
    color: var(--accent-color, #c44);
  }

  .palette-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin-top: 0.25rem;

    .swatch {
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 2px;
      cursor: pointer;

      &.active {
        outline: 2px solid var(--text-color);
        outline-offset: 1px;
      }
    }
  }

  .brush-params-grid {
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto;
    gap: 0.25rem 0.5rem;
    align-items: center;
  }

  .brush-params-grid .brush-param {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    gap: 0.5rem;
    font-size: 0.9rem;
    align-items: center;

    .value {
      justify-self: end;
      text-align: right;
    }

    input[type='range'],
    select {
      min-width: 0;
      width: 100%;
    }
  }

  .brush-preview {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #888;
    border-radius: 4px;
    overflow: hidden;

    canvas {
      width: 100%;
      height: 100%;
    }
  }

  .scatter-mirror-row {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
    gap: 2rem;
    min-width: 0;
    align-items: flex-start;

    .scatter-section,
    .mirror-section {
      min-width: 0;
      overflow: hidden;
      contain: inline-size;
    }

    .brush-param {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
  }

  .brush-param {
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;

    .value {
      justify-self: end;
      text-align: right;
    }

    input[type='range'],
    select {
      min-width: 0;
      width: 100%;
    }
  }

  .undo-redo {
    display: flex;
    gap: 0.5rem;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-color);
    color: var(--text-color);
    padding: 1.5rem;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    input[type='number'] {
      width: 8rem;
    }

    button {
      margin-right: 0.5rem;
    }
  }
</style>
