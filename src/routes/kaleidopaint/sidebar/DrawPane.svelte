<script lang="ts">
  import { onMount } from 'svelte';
  import {
    tool,
    color,
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
    loadedImage,
    imageStampSize,
    imageRotateWithSymmetry,
    imageConstrainToSection
  } from '../store';
  import {
    drawBrushPreview,
    type BrushShape as BrushShapeType,
    type BrushParams
  } from '../brushEngine';
  import ParamLabel from '../ParamLabel.svelte';

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
    source: 'Color source: plain color or uniform random from palette.'
  };

  const BRUSH_SHAPES: { value: BrushShapeType; label: string }[] = [
    { value: 'round', label: 'Round' },
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'ellipse', label: 'Ellipse' },
    { value: 'star', label: 'Star' },
    { value: 'hexagon', label: 'Hexagon' }
  ];

  let brushPreviewCanvas = $state<HTMLCanvasElement | null>(null);
  let imageFileInput = $state<HTMLInputElement | undefined>(undefined);

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

  $effect(() => {
    $brushSize;
    $brushShape;
    $brushAngle;
    $brushRatio;
    $color;
    $brushRotationMode;
    $brushRotationAngle;
    $brushMirrorH;
    $brushMirrorV;
    $tool;
    if ($tool !== 'paint') return;
    drawBrushPreviewToCanvas();
  });

  onMount(() => {
    if ($tool === 'paint') drawBrushPreviewToCanvas();
  });

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
</script>

<h2>Tools</h2>
<div class="tool-buttons">
  <button type="button" class:active={$tool === 'paint'} onclick={() => tool.set('paint')}>Brush</button>
  <button type="button" class:active={$tool === 'fill'} onclick={() => tool.set('fill')}>Fill</button>
  <button type="button" class:active={$tool === 'origin'} onclick={() => tool.set('origin')}>Origin</button>
  <button type="button" class:active={$tool === 'rotate'} onclick={() => tool.set('rotate')}>Rotate</button>
  <button type="button" class:active={$tool === 'eyedropper'} onclick={() => tool.set('eyedropper')}>
    Eyedropper
  </button>
  <button type="button" class:active={$tool === 'image'} onclick={() => tool.set('image')}>Image</button>
</div>

{#if $tool === 'image'}
  <h2>Image</h2>
  {#if $loadedImage}
    <div class="image-loaded">
      <span class="image-loaded-label">Image loaded</span>
      <button type="button" onclick={() => loadedImage.set(null)}>Clear</button>
    </div>
  {:else}
    <p class="image-hint">Load an image to stamp.</p>
  {/if}
  <input
    type="file"
    accept="image/*"
    style="display: none"
    bind:this={imageFileInput}
    onchange={handleImageFileChange}
  />
  <button type="button" onclick={() => imageFileInput?.click()}>
    {#if $loadedImage}Replace image{:else}Load image{/if}
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
        oninput={(e) => brushSpacing.set(Number((e.target as HTMLInputElement).value) / 100)}
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
          oninput={(e) => brushRatio.set(Number((e.target as HTMLInputElement).value) / 100)}
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
        oninput={(e) => brushOpacity.set(Number((e.target as HTMLInputElement).value) / 100)}
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
        oninput={(e) => brushFlow.set(Number((e.target as HTMLInputElement).value) / 100)}
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
        oninput={(e) => brushSoftness.set(Number((e.target as HTMLInputElement).value) / 100)}
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
        oninput={(e) => brushSharpness.set(Number((e.target as HTMLInputElement).value) / 100)}
      />
      <span class="value">{Math.round($brushSharpness * 100)}%</span>
    </label>
    <label class="brush-param">
      <ParamLabel
        label="Sharpness soften"
        tip="Softens sharpness thresholding to reduce jagged stepping."
        id="tip-sharpness-soften"
      />
      <input
        type="range"
        min="0"
        max="100"
        value={$brushSharpnessSoften * 100}
        oninput={(e) => brushSharpnessSoften.set(Number((e.target as HTMLInputElement).value) / 100)}
      />
      <span class="value">{Math.round($brushSharpnessSoften * 100)}%</span>
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
          oninput={(e) => brushScatterX.set(Number((e.target as HTMLInputElement).value) / 100)}
        />
      </label>
      <label class="brush-param">
        <ParamLabel label="Y" tip={BRUSH_TIPS['scatter-y']} id="tip-scatter-y" />
        <input
          type="range"
          min="0"
          max="100"
          value={$brushScatterY * 100}
          oninput={(e) => brushScatterY.set(Number((e.target as HTMLInputElement).value) / 100)}
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
  </div>
{/if}

<style>
  h3.brush-sub {
    font-size: 0.8rem;
    margin: 0.35rem 0 0.1rem 0;
    font-weight: 600;
  }

  .value {
    font-size: 0.9rem;
    margin-left: 0.5rem;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .image-loaded {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .image-loaded-label {
    font-size: 0.85rem;
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
  }

  .brush-params-grid .brush-param .value {
    justify-self: end;
    text-align: right;
  }

  .brush-params-grid .brush-param input[type='range'],
  .brush-params-grid .brush-param select {
    min-width: 0;
    width: 100%;
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
  }

  .brush-preview canvas {
    width: 100%;
    height: 100%;
  }

  .scatter-mirror-row {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
    gap: 2rem;
    min-width: 0;
    align-items: flex-start;
  }

  .scatter-section,
  .mirror-section {
    min-width: 0;
    overflow: hidden;
    contain: inline-size;
  }

  .scatter-mirror-row .brush-param {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .brush-param {
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .brush-param .value {
    justify-self: end;
    text-align: right;
  }

  .brush-param input[type='range'],
  .brush-param select {
    min-width: 0;
    width: 100%;
  }
</style>
