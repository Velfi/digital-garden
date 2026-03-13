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
    loadedImage,
    imageStampSize,
    imageRotateWithSymmetry,
    imageConstrainToSection,
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
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import LospecPalette from '$lib/components/LospecPalette.svelte';
  import UndoRedoButtons from '$lib/components/UndoRedoButtons.svelte';

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
    if ($tool === 'paint') drawBrushPreviewToCanvas();
  });

  let imageFileInput: HTMLInputElement | undefined;

  function handleImageFileChange() {
    const input = imageFileInput;
    if (!input?.files?.length) return;
    const file = input.files[0];
    if (!file?.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      loadedImage.set(img);
    };
    img.onerror = () => {
      loadedImage.set(null);
    };
    img.src = URL.createObjectURL(file);
    input.value = '';
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

<ArtSidebar open={sidebarOpen}>
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
    <button
      type="button"
      class="tool"
      class:active={$tool === 'image'}
      on:click={() => tool.set('image')}
      title="Stamp loaded image with symmetry"
    >
      Image
    </button>
  </div>

  {#if $tool === 'image'}
    <h2>Image</h2>
    {#if $loadedImage}
      <div class="image-loaded">
        <span class="image-loaded-label">Image loaded</span>
        <button type="button" on:click={() => loadedImage.set(null)}>Clear</button>
      </div>
    {:else}
      <p class="image-hint">Load an image to stamp.</p>
    {/if}
    <input
      type="file"
      accept="image/*"
      style="display: none"
      bind:this={imageFileInput}
      on:change={handleImageFileChange}
    />
    <button type="button" on:click={() => imageFileInput?.click()}>
      {#if $loadedImage}
        Replace image
      {:else}
        Load image
      {/if}
    </button>
    {#if $loadedImage}
      <label class="brush-param">
        <ParamLabel
          label="Stamp size"
          tip="Maximum dimension of the stamped image in pixels."
          id="tip-image-stamp-size"
        />
        <input type="range" min="50" max="400" bind:value={$imageStampSize} />
        <span class="value">{$imageStampSize}px</span>
      </label>
      <label class="toggle">
        <input type="checkbox" bind:checked={$imageRotateWithSymmetry} />
        <ParamLabel
          label="Rotate with symmetry"
          tip="Rotate each copy to match the symmetry (e.g. polar mandala effect)."
          id="tip-image-rotate"
        />
      </label>
      <label class="toggle">
        <input type="checkbox" bind:checked={$imageConstrainToSection} />
        <ParamLabel
          label="Constrain to section"
          tip="Clip the image to the symmetry section (wedge) boundary."
          id="tip-image-constrain"
        />
      </label>
    {/if}
  {/if}

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
          on:input={(e) => brushSoftness.set(Number((e.target as HTMLInputElement).value) / 100)}
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
          on:input={(e) => brushSharpness.set(Number((e.target as HTMLInputElement).value) / 100)}
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
            on:input={(e) => brushScatterX.set(Number((e.target as HTMLInputElement).value) / 100)}
          />
        </label>
        <label class="brush-param">
          <ParamLabel label="Y" tip={BRUSH_TIPS['scatter-y']} id="tip-scatter-y" />
          <input
            type="range"
            min="0"
            max="100"
            value={$brushScatterY * 100}
            on:input={(e) => brushScatterY.set(Number((e.target as HTMLInputElement).value) / 100)}
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
      <ParamLabel label="Background (for mix)" tip={BRUSH_TIPS.background} id="tip-background" />
      <input type="color" bind:value={$secondaryColor} />
    </label>
  </div>

  <LospecPalette {color} {palette} defaultSlug="resurrect-64" />

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
  <UndoRedoButtons {history} {canUndo} {canRedo} />
  <button type="button" on:click={openNewCanvas}>New canvas</button>
  <button type="button" on:click={exportCanvas}>Export PNG</button>

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
</ArtSidebar>

<style lang="scss">
  :global(.sidebar) h2 {
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

  .image-loaded {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;

    .image-loaded-label {
      font-size: 0.85rem;
    }
  }

  .image-hint {
    font-size: 0.8rem;
    margin: 0;
    color: var(--text-color-muted, #666);
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
