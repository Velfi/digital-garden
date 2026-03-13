<script lang="ts">
  import {
    gridSize,
    tool,
    strokeMode,
    fillSelectDiagonals,
    fillRespectsColor,
    color,
    palette,
    selection,
    planeAxis,
    lightAngle,
    lightElevation,
    lightColor,
    ambientIntensity,
    enableShadows,
    enableAO,
    backgroundColor,
    enableSky,
    showGrid,
    focalLength,
    orthographic,
    roughness,
    metalness,
    envMapIntensity,
    sidebarOpen,
    resetCanvas,
    voxels,
    encodeModelForUrl,
    centerOriginOnObject,
    centerOriginOnSelection,
    shiftVoxelsAndSelection,
    modalRequest,
    addPanelStore,
    type StartShape
  } from './store';
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import LospecPalette from '$lib/components/LospecPalette.svelte';

  let showNewGrid = $state(false);
  let newGridSize = $state<number>(32);
  let newGridShape = $state<StartShape>('cube');
  let showShareModal = $state(false);
  let shareUrl = $state('');
  let shiftX = $state(0);
  let shiftY = $state(0);
  let shiftZ = $state(0);

  function selectOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  async function openShareModal() {
    if ($voxels.size === 0) return;
    try {
      const encoded = await encodeModelForUrl();
      shareUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}#m=${encoded}`
          : '';
      showShareModal = true;
    } catch {
      // ignore
    }
  }

  function openNewGrid() {
    newGridSize = $gridSize;
    showNewGrid = true;
  }

  function createGrid() {
    const size = Math.max(1, Math.floor(newGridSize));
    gridSize.set(size);
    resetCanvas(size, newGridShape);
    newGridSize = size;
    showNewGrid = false;
  }

  function openAddPanel() {
    addPanelStore.set({
      open: true,
      posX: 0,
      posY: 0,
      posZ: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      shape: 'cube',
      size: 8
    });
  }

  $effect(() => {
    const req = $modalRequest;
    if (req === 'newGrid') {
      openNewGrid();
      modalRequest.set(null);
    } else if (req === 'share') {
      openShareModal();
      modalRequest.set(null);
    } else if (req === 'add') {
      openAddPanel();
      modalRequest.set(null);
    }
  });
</script>

<ArtSidebar open={sidebarOpen}>
  <h2>Tool</h2>
  <div class="tool-buttons">
    <button
      type="button"
      class:active={$tool === 'remove'}
      onclick={() => tool.set('remove')}
      title="Remove voxels"
    >
      Remove
    </button>
    <button
      type="button"
      class:active={$tool === 'add'}
      onclick={() => tool.set('add')}
      title="Place voxels"
    >
      Voxel
    </button>
    <button
      type="button"
      class:active={$tool === 'paint'}
      onclick={() => tool.set('paint')}
      title="Paint voxels"
    >
      Paint
    </button>
    <button
      type="button"
      class:active={$tool === 'select'}
      onclick={() => tool.set('select')}
      title="Select voxels for stamping"
    >
      Select
    </button>
    <button
      type="button"
      class:active={$tool === 'stamp'}
      onclick={() => tool.set('stamp')}
      title="Place a copy of the selection"
      disabled={$selection.size === 0}
    >
      Stamp
    </button>
    <button
      type="button"
      class:active={$tool === 'eyedropper'}
      onclick={() => tool.set('eyedropper')}
      title="Pick color from voxel"
    >
      Eyedropper
    </button>
    <button
      type="button"
      class:active={$tool === 'fly'}
      onclick={() => tool.set('fly')}
      title="Fly camera (WASD, click+drag to look)"
    >
      Fly
    </button>
  </div>
  <div class="stroke-mode" role="group" aria-labelledby="stroke-label">
    <span id="stroke-label" class="stroke-label">Selection method</span>
    <div class="stroke-buttons">
      <button
        type="button"
        class:active={$strokeMode === 'line'}
        onclick={() => strokeMode.set('line')}
        title="Draw lines (axis-aligned)"
      >
        Line
      </button>
      <button
        type="button"
        class:active={$strokeMode === 'plane'}
        onclick={() => strokeMode.set('plane')}
        title="Fill whole plane (Alt+scroll to cycle orientation)"
      >
        Plane
      </button>
      <button
        type="button"
        class:active={$strokeMode === 'cuboid'}
        onclick={() => strokeMode.set('cuboid')}
        title="Drag to set plane (Alt+scroll to cycle), scroll for depth, click or Done to apply"
      >
        Cuboid
      </button>
      <button
        type="button"
        class:active={$strokeMode === 'polygon'}
        onclick={() => strokeMode.set('polygon')}
        title="Click to place points, Done to fill convex hull"
      >
        Polygon
      </button>
      <button
        type="button"
        class:active={$strokeMode === 'fill'}
        onclick={() => strokeMode.set('fill')}
        title="Click voxel to select (Select) or flood-fill paint (Paint) connected same-color region"
      >
        Fill
      </button>
    </div>
    {#if $strokeMode === 'fill'}
      <div class="stroke-buttons" role="group" aria-label="Fill options">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={$fillSelectDiagonals}
            onchange={(e) => fillSelectDiagonals.set((e.target as HTMLInputElement).checked)}
          />
          Include diagonals
        </label>
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={$fillRespectsColor}
            onchange={(e) => fillRespectsColor.set((e.target as HTMLInputElement).checked)}
          />
          Same color only
        </label>
      </div>
    {/if}
    {#if $strokeMode === 'plane' || $strokeMode === 'cuboid'}
      <div class="stroke-buttons plane-axis" role="group" aria-label="Plane axis">
        <button
          type="button"
          class:active={$planeAxis === 'auto'}
          onclick={() => planeAxis.set('auto')}
          title="Auto: use clicked face"
        >
          Auto
        </button>
        <button
          type="button"
          class:active={$planeAxis === 0}
          onclick={() => planeAxis.set(0)}
          title="Vertical plane (YZ)"
        >
          X
        </button>
        <button
          type="button"
          class:active={$planeAxis === 1}
          onclick={() => planeAxis.set(1)}
          title="Horizontal plane (XZ)"
        >
          Y
        </button>
        <button
          type="button"
          class:active={$planeAxis === 2}
          onclick={() => planeAxis.set(2)}
          title="Vertical plane (XY)"
        >
          Z
        </button>
      </div>
    {/if}
  </div>

  <div class:dimmed={$tool === 'remove'}>
    <h2>Color</h2>
    <div class="color-row">
      <input
        id="color-picker"
        type="color"
        value={$color}
        oninput={(e) => color.set((e.target as HTMLInputElement).value)}
        disabled={$tool === 'remove'}
      />
      <input
        type="text"
        class="color-hex"
        value={$color}
        oninput={(e) => color.set((e.target as HTMLInputElement).value)}
      />
    </div>
    <LospecPalette {color} {palette} disabled={$tool === 'remove'} defaultSlug="resurrect-64" />
  </div>

  <h2>Camera</h2>
  <div class="light-control">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={$orthographic}
        onchange={(e) => orthographic.set((e.target as HTMLInputElement).checked)}
      />
      Orthographic view
    </label>
  </div>
  {#if !$orthographic}
    <div class="light-control">
      <label for="focal-length">Focal length</label>
      <div class="slider-row">
        <input
          id="focal-length"
          type="range"
          min="15"
          max="200"
          value={$focalLength}
          oninput={(e) => focalLength.set(Number((e.target as HTMLInputElement).value))}
        />
        <span class="slider-value">{$focalLength} mm</span>
      </div>
    </div>
  {/if}

  <h2>Scene</h2>
  <div class="light-control">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={$showGrid}
        onchange={(e) => showGrid.set((e.target as HTMLInputElement).checked)}
      />
      Show borders
    </label>
  </div>
  <div class="light-control">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={$enableSky}
        onchange={(e) => enableSky.set((e.target as HTMLInputElement).checked)}
      />
      Sky & horizon
    </label>
  </div>
  <div class="light-control" class:dimmed={$enableSky}>
    <label for="background-color">Background</label>
    <input
      id="background-color"
      type="color"
      value={$backgroundColor}
      oninput={(e) => backgroundColor.set((e.target as HTMLInputElement).value)}
      disabled={$enableSky}
    />
  </div>
  <h2>Light</h2>
  <div class="light-control">
    <label for="ambient-intensity">Ambient</label>
    <div class="slider-row">
      <input
        id="ambient-intensity"
        type="range"
        min="0"
        max="1.5"
        step="0.1"
        value={$ambientIntensity}
        oninput={(e) => ambientIntensity.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="slider-value">{$ambientIntensity.toFixed(1)}</span>
    </div>
  </div>
  <div class="light-control">
    <label for="light-color">Color</label>
    <input
      id="light-color"
      type="color"
      value={$lightColor}
      oninput={(e) => lightColor.set((e.target as HTMLInputElement).value)}
    />
  </div>
  <div class="light-control">
    <label for="light-angle">Angle</label>
    <div class="slider-row">
      <input
        id="light-angle"
        type="range"
        min="0"
        max="360"
        value={$lightAngle}
        oninput={(e) => lightAngle.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="slider-value">{$lightAngle}°</span>
    </div>
  </div>
  <div class="light-control">
    <label for="light-elevation">Elevation</label>
    <div class="slider-row">
      <input
        id="light-elevation"
        type="range"
        min="5"
        max="90"
        value={$lightElevation}
        oninput={(e) => lightElevation.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="slider-value">{$lightElevation}°</span>
    </div>
  </div>
  <div class="light-control">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={$enableShadows}
        onchange={(e) => enableShadows.set((e.target as HTMLInputElement).checked)}
      />
      Shadows
    </label>
  </div>
  <div class="light-control">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={$enableAO}
        onchange={(e) => enableAO.set((e.target as HTMLInputElement).checked)}
      />
      Ambient occlusion
    </label>
  </div>

  <h2>Material (PBR)</h2>
  <div class="light-control">
    <label for="roughness">Roughness</label>
    <div class="slider-row">
      <input
        id="roughness"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={$roughness}
        oninput={(e) => roughness.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="slider-value">{$roughness.toFixed(2)}</span>
    </div>
  </div>
  <div class="light-control">
    <label for="metalness">Metalness</label>
    <div class="slider-row">
      <input
        id="metalness"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={$metalness}
        oninput={(e) => metalness.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="slider-value">{$metalness.toFixed(2)}</span>
    </div>
  </div>
  <div class="light-control">
    <label for="env-map-intensity">Env reflections</label>
    <div class="slider-row">
      <input
        id="env-map-intensity"
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={$envMapIntensity}
        oninput={(e) => envMapIntensity.set(Number((e.target as HTMLInputElement).value))}
      />
      <span class="slider-value">{$envMapIntensity.toFixed(1)}</span>
    </div>
  </div>

  <h2>Origin</h2>
  <p class="origin-hint">Move all voxels so the origin lands at the center or a selected point.</p>
  <div class="origin-buttons">
    <button
      type="button"
      onclick={() => centerOriginOnObject()}
      disabled={$voxels.size === 0}
      title="Move voxels so object center is at origin"
    >
      Center
    </button>
    <button
      type="button"
      onclick={() => centerOriginOnSelection()}
      disabled={$selection.size === 0}
      title="Move voxels so selection center is at origin"
    >
      To selection
    </button>
  </div>
  <div class="origin-inputs">
    <label for="shift-x">Shift X</label>
    <input id="shift-x" type="number" bind:value={shiftX} title="Move all voxels by this amount" />
    <label for="shift-y">Shift Y</label>
    <input id="shift-y" type="number" bind:value={shiftY} />
    <label for="shift-z">Shift Z</label>
    <input id="shift-z" type="number" bind:value={shiftZ} />
  </div>
  <button
    type="button"
    class="shift-apply"
    onclick={() => shiftVoxelsAndSelection(shiftX, shiftY, shiftZ)}
    disabled={$voxels.size === 0}
    title="Apply shift to all voxels and selection"
  >
    Apply shift
  </button>

  {#if showShareModal}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.target === e.currentTarget && (showShareModal = false)}
      onkeydown={(e) => e.key === 'Escape' && (showShareModal = false)}
    >
      <div class="modal modal--share">
        <h3>Share link</h3>
        <label>
          Copy this URL to share your model
          <input type="text" readonly value={shareUrl} use:selectOnMount class="share-url-input" />
        </label>
        <div class="modal-buttons">
          <button type="button" onclick={() => (showShareModal = false)}>Done</button>
        </div>
      </div>
    </div>
  {/if}
  {#if showNewGrid}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.target === e.currentTarget && (showNewGrid = false)}
      onkeydown={(e) => e.key === 'Escape' && (showNewGrid = false)}
    >
      <div class="modal">
        <h3>New grid</h3>
        <label>
          Grid size (1–256)
          <input type="number" min="1" max="256" step="1" bind:value={newGridSize} />
        </label>
        <label>
          Starting shape
          <select bind:value={newGridShape}>
            <option value="cube">Cube</option>
            <option value="orb">Orb</option>
            <option value="cylinder">Cylinder</option>
            <option value="hollowCube">Hollow cube</option>
            <option value="empty">Empty</option>
          </select>
        </label>
        <div class="modal-buttons">
          <button type="button" onclick={createGrid}>Create</button>
          <button type="button" onclick={() => (showNewGrid = false)}>Cancel</button>
        </div>
      </div>
    </div>
  {/if}
</ArtSidebar>

<style>
  .dimmed {
    opacity: 0.6;
  }

  label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .tool-buttons {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }

  .tool-buttons button {
    flex: 1;
    min-width: 4rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .tool-buttons button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .tool-buttons button.active {
    background: var(--link-color);
    color: var(--bg-color);
    border-color: var(--link-color);
  }

  .origin-hint {
    font-size: 0.8rem;
    opacity: 0.8;
    margin: -0.25rem 0 0.5rem 0;
  }

  .origin-buttons {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .origin-buttons button {
    flex: 1;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .origin-buttons button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .origin-buttons button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .origin-inputs {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.25rem 0.5rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .origin-inputs label {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .origin-inputs input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .shift-apply {
    margin-top: 0.25rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .shift-apply:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .shift-apply:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .stroke-mode {
    margin-bottom: 0.5rem;
  }

  .stroke-label {
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .light-control {
    margin-bottom: 1rem;
  }

  .light-control label {
    display: block;
    margin-bottom: 0.25rem;
  }

  .checkbox-label {
    display: flex !important;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .light-control input[type='color'] {
    width: 100%;
    height: 2rem;
    padding: 2px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    background: var(--bg-color);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .slider-row input[type='range'] {
    flex: 1;
    accent-color: var(--link-color);
  }

  .slider-value {
    font-size: 0.85rem;
    opacity: 0.8;
    min-width: 2.5rem;
  }

  .stroke-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .stroke-buttons button {
    flex: 1;
    min-width: 4rem;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .stroke-buttons button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .stroke-buttons button.active {
    background: var(--link-color);
    color: var(--bg-color);
    border-color: var(--link-color);
  }

  .color-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  #color-picker {
    width: 2.5rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }

  #color-picker:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .color-hex {
    flex: 1;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
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
  }

  .modal--share {
    min-width: min(90vw, 36rem);
  }

  .modal label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .modal input[type='number'],
  .modal select {
    width: 100%;
    margin-bottom: 0;
    padding: 0.35rem 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .share-url-input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .modal-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .modal-buttons button {
    margin-right: 0;
  }
</style>
