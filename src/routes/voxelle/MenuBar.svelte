<script lang="ts">
  const VOXELLE_FIT_CAMERA_ON_PROJECT_OPEN_EVENT = 'voxelle:fit-camera-on-project-open';

  import { get } from 'svelte/store';
  import {
    voxels,
    selection,
    hasHiddenVoxels,
    selectionMode,
    tool,
    toolPane,
    lastDrawTool,
    selectAll,
    deselectAll,
    invertSelection,
    growSelection,
    shrinkSelection,
    deselectInnerVoxels,
    selectConnected,
    hideSelectedVoxels,
    unhideAllVoxels,
    deselectVoxels,
    deselectEmptySpaces,
    modalRequest,
    markUndoRedoGestureStart,
    history,
    canUndo,
    canRedo,
    copySelection,
    cutSelection,
    deleteSelectedVoxels,
    pasteFromClipboard,
    hollowOut,
    scaleProjectUniform,
    rotateProjectByAngle,
    mirrorProjectAcrossAxis,
    applySelectionMirrorAcrossAxisInStroke,
    runVoxelStroke,
    applySelectionRotationRadiansInStroke,
    applySelectionScaleInStroke,
    saveToFile,
    loadFromFile,
    importImageFromFile,
    LARGE_PROJECT_OPEN_VOXEL_THRESHOLD,
    beginProjectOpenLoading,
    updateProjectOpenLoadingProgress,
    completeProjectOpenLoading,
    renderingMode,
    activeRendererIsWebGPU,
    orthographic,
    showGrid
  } from './store/index';
  import type { SelectionMode, RenderingMode } from './store/index';

  let fileOpen = $state(false);
  let editOpen = $state(false);
  let viewOpen = $state(false);
  let addOpen = $state(false);
  let voxelsOpen = $state(false);
  let selectionOpen = $state(false);
  let helpOpen = $state(false);
  let voxelsMenuRef: HTMLDivElement;
  let selectionMenuRef: HTMLDivElement;
  let fileMenuRef: HTMLDivElement;
  let editMenuRef: HTMLDivElement;
  let viewMenuRef: HTMLDivElement;
  let addMenuRef: HTMLDivElement;
  let helpMenuRef: HTMLDivElement;
  let fileInputRef: HTMLInputElement;
  let imageInputRef: HTMLInputElement;

  $effect(() => {
    if ($activeRendererIsWebGPU === false && $renderingMode === 'ray') {
      renderingMode.set('greedy');
    }
  });

  function setRenderingMode(mode: RenderingMode) {
    renderingMode.set(mode);
    closeMenus();
  }

  function setOrthographic(on: boolean) {
    orthographic.set(on);
    closeMenus();
  }

  function setShowGrid(on: boolean) {
    showGrid.set(on);
    closeMenus();
  }

  function closeMenus() {
    fileOpen = false;
    editOpen = false;
    viewOpen = false;
    addOpen = false;
    voxelsOpen = false;
    selectionOpen = false;
    helpOpen = false;
  }

  function toggleFile() {
    editOpen = false;
    viewOpen = false;
    addOpen = false;
    voxelsOpen = false;
    selectionOpen = false;
    helpOpen = false;
    fileOpen = !fileOpen;
  }

  function toggleEdit() {
    fileOpen = false;
    viewOpen = false;
    addOpen = false;
    voxelsOpen = false;
    selectionOpen = false;
    helpOpen = false;
    editOpen = !editOpen;
  }

  function toggleView() {
    fileOpen = false;
    editOpen = false;
    addOpen = false;
    voxelsOpen = false;
    selectionOpen = false;
    helpOpen = false;
    viewOpen = !viewOpen;
  }

  function toggleAdd() {
    fileOpen = false;
    editOpen = false;
    viewOpen = false;
    voxelsOpen = false;
    selectionOpen = false;
    helpOpen = false;
    addOpen = !addOpen;
  }

  function toggleVoxels() {
    fileOpen = false;
    editOpen = false;
    viewOpen = false;
    addOpen = false;
    selectionOpen = false;
    helpOpen = false;
    voxelsOpen = !voxelsOpen;
  }

  function toggleSelection() {
    fileOpen = false;
    editOpen = false;
    viewOpen = false;
    addOpen = false;
    voxelsOpen = false;
    helpOpen = false;
    selectionOpen = !selectionOpen;
  }

  function toggleHelp() {
    fileOpen = false;
    editOpen = false;
    viewOpen = false;
    addOpen = false;
    voxelsOpen = false;
    selectionOpen = false;
    helpOpen = !helpOpen;
  }

  function handleUndo() {
    markUndoRedoGestureStart('undo');
    history.undo();
    closeMenus();
  }

  function handleRedo() {
    markUndoRedoGestureStart('redo');
    history.redo();
    closeMenus();
  }

  async function handleCut() {
    await cutSelection();
    closeMenus();
  }

  async function handleCopy() {
    await copySelection();
    closeMenus();
  }

  async function handlePaste() {
    await pasteFromClipboard();
    closeMenus();
  }

  function handleStampBook() {
    modalRequest.set('stampBook');
    closeMenus();
  }

  function handleProjectStats() {
    modalRequest.set('projectStats');
    closeMenus();
  }

  function handleDeleteSelected() {
    deleteSelectedVoxels();
    closeMenus();
  }

  function handleHollowOut() {
    hollowOut();
    closeMenus();
  }

  /** Selection if any voxels are selected; otherwise whole project (needs voxels). */
  function handleRotateDegreesPrompt() {
    if (get(voxels).size === 0 && get(selection).size === 0) return;
    const axisText = window.prompt('Rotate axis (X, Y, or Z)', 'Y');
    if (!axisText) return;
    const axisKey = axisText.trim().toUpperCase();
    const axis: 0 | 1 | 2 | null =
      axisKey === 'X' ? 0 : axisKey === 'Y' ? 1 : axisKey === 'Z' ? 2 : null;
    if (axis === null) return;
    const degText = window.prompt('Degrees (any number, can be fractional)', '15');
    if (!degText) return;
    const deg = Number(degText);
    if (!Number.isFinite(deg)) return;
    const rad = (deg * Math.PI) / 180;
    if (get(selection).size > 0) {
      runVoxelStroke(() => {
        applySelectionRotationRadiansInStroke(axis, rad);
      });
    } else {
      rotateProjectByAngle(axis, rad);
    }
    closeMenus();
  }

  function mirrorAcrossAxis(axis: 0 | 1 | 2) {
    if (get(selection).size > 0) {
      runVoxelStroke(() => {
        applySelectionMirrorAcrossAxisInStroke(axis);
      });
    } else {
      mirrorProjectAcrossAxis(axis);
    }
  }

  function handleMirrorAcrossX() {
    if (get(voxels).size === 0 && get(selection).size === 0) return;
    mirrorAcrossAxis(0);
    closeMenus();
  }

  function handleMirrorAcrossY() {
    if (get(voxels).size === 0 && get(selection).size === 0) return;
    mirrorAcrossAxis(1);
    closeMenus();
  }

  function handleMirrorAcrossZ() {
    if (get(voxels).size === 0 && get(selection).size === 0) return;
    mirrorAcrossAxis(2);
    closeMenus();
  }

  function handleScaleByFactorPrompt() {
    if (get(voxels).size === 0 && get(selection).size === 0) return;
    const scaleText = window.prompt('Uniform scale (>0, can be fractional)', '1.25');
    if (!scaleText) return;
    const s = Number(scaleText);
    if (!Number.isFinite(s) || s <= 0) return;
    if (get(selection).size > 0) {
      runVoxelStroke(() => {
        applySelectionScaleInStroke(s);
      });
    } else {
      scaleProjectUniform(s);
    }
    closeMenus();
  }

  async function handleShare() {
    if ($voxels.size === 0) return;
    modalRequest.set('share');
    closeMenus();
  }

  function handleNewGrid() {
    modalRequest.set('newGrid');
    closeMenus();
  }

  function handlePreferences() {
    modalRequest.set('preferences');
    closeMenus();
  }

  function handleOpen() {
    fileInputRef?.click();
    closeMenus();
  }

  async function handleSave() {
    await saveToFile('voxelle.voxelle');
    closeMenus();
  }

  async function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const shouldTrackOpen = file.size >= 1_000_000;
    if (shouldTrackOpen) {
      beginProjectOpenLoading('Reading project file…');
      updateProjectOpenLoadingProgress(0.12);
    }
    try {
      const ok = await loadFromFile(file);
      if (!ok) {
        if (shouldTrackOpen) completeProjectOpenLoading();
        alert('Could not load file. The file may be corrupted or not a valid .voxelle file.');
      } else if (typeof window !== 'undefined') {
        if ($voxels.size >= LARGE_PROJECT_OPEN_VOXEL_THRESHOLD) {
          beginProjectOpenLoading('Opening project…');
          updateProjectOpenLoadingProgress(0.28, 'Preparing scene…');
        } else if (shouldTrackOpen) {
          completeProjectOpenLoading();
        }
        window.dispatchEvent(new Event(VOXELLE_FIT_CAMERA_ON_PROJECT_OPEN_EVENT));
      }
    } catch (err) {
      if (shouldTrackOpen) completeProjectOpenLoading();
      alert(`Failed to load file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function handleImportImage() {
    imageInputRef?.click();
    closeMenus();
  }

  async function handleImageChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await importImageFromFile(file);
      input.value = '';
    }
  }

  function handleAddShape() {
    modalRequest.set('add');
    closeMenus();
  }

  function handleExport() {
    modalRequest.set('exportGltf');
    closeMenus();
  }

  function handleSelectAll() {
    selectAll();
    closeMenus();
  }

  function handleDeselectAll() {
    deselectAll();
    closeMenus();
  }

  function handleInvert() {
    invertSelection();
    closeMenus();
  }

  function handleGrow() {
    growSelection();
    closeMenus();
  }

  function handleShrink() {
    shrinkSelection();
    closeMenus();
  }

  function handleDeselectInnerVoxels() {
    deselectInnerVoxels();
    closeMenus();
  }

  function handleSelectConnected() {
    selectConnected();
    closeMenus();
  }

  function handleHideSelected() {
    hideSelectedVoxels();
    closeMenus();
  }

  function handleUnhideAll() {
    unhideAllVoxels();
    closeMenus();
  }

  function handleSelectByColor() {
    tool.set('selectByColor');
    toolPane.set('draw');
    lastDrawTool.set('selectByColor');
    closeMenus();
  }

  function handleSelectCoplanarFaces() {
    tool.set('selectCoplanar');
    toolPane.set('draw');
    lastDrawTool.set('selectCoplanar');
    closeMenus();
  }

  function handleSelectCoplanarEmpty() {
    tool.set('selectCoplanarEmpty');
    toolPane.set('draw');
    lastDrawTool.set('selectCoplanarEmpty');
    closeMenus();
  }

  function handleDeselectVoxels() {
    deselectVoxels();
    closeMenus();
  }

  function handleDeselectEmptySpaces() {
    deselectEmptySpaces();
    closeMenus();
  }

  function setSelectionMode(mode: SelectionMode) {
    selectionMode.set(mode);
  }

  function handleShowHelp() {
    modalRequest.set('help');
    closeMenus();
  }

  function handleShowStartupScreen() {
    modalRequest.set('startup');
    closeMenus();
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as Node;
    if (
      selectionMenuRef &&
      !selectionMenuRef.contains(target) &&
      fileMenuRef &&
      !fileMenuRef.contains(target) &&
      editMenuRef &&
      !editMenuRef.contains(target) &&
      viewMenuRef &&
      !viewMenuRef.contains(target) &&
      addMenuRef &&
      !addMenuRef.contains(target) &&
      voxelsMenuRef &&
      !voxelsMenuRef.contains(target) &&
      helpMenuRef &&
      !helpMenuRef.contains(target)
    ) {
      closeMenus();
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<input
  type="file"
  accept=".voxelle"
  class="hidden-input"
  bind:this={fileInputRef}
  onchange={handleFileChange}
  aria-hidden="true"
  tabindex="-1"
/>
<input
  type="file"
  accept="image/*"
  class="hidden-input"
  bind:this={imageInputRef}
  onchange={handleImageChange}
  aria-hidden="true"
  tabindex="-1"
/>

<div class="menubar" role="menubar" tabindex="0">
  <div class="menu-item" role="none" bind:this={fileMenuRef}>
    <button
      type="button"
      class="menu-trigger"
      class:active={fileOpen}
      onclick={toggleFile}
      aria-haspopup="menu"
      aria-expanded={fileOpen}
    >
      File
    </button>
    {#if fileOpen}
      <div class="dropdown" role="menu">
        <button type="button" role="menuitem" onclick={handleNewGrid}> New project </button>
        <button type="button" role="menuitem" onclick={handleOpen}> Open… </button>
        <button type="button" role="menuitem" onclick={handleSave} disabled={$voxels.size === 0}>
          Save .voxelle
        </button>
        <button type="button" role="menuitem" onclick={handlePreferences}> Preferences… </button>
        <div class="menu-separator" role="separator"></div>
        <span class="menu-label">Import / Export</span>
        <button type="button" role="menuitem" onclick={handleImportImage}> Import image… </button>
        <button type="button" role="menuitem" onclick={handleShare} disabled={$voxels.size === 0}>
          Share link
        </button>
        <button type="button" role="menuitem" onclick={handleExport} disabled={$voxels.size === 0}>
          Save as GLTF
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" role="none" bind:this={editMenuRef}>
    <button
      type="button"
      class="menu-trigger"
      class:active={editOpen}
      onclick={toggleEdit}
      aria-haspopup="menu"
      aria-expanded={editOpen}
    >
      Edit
    </button>
    {#if editOpen}
      <div class="dropdown" role="menu">
        <button
          type="button"
          role="menuitem"
          onclick={handleUndo}
          disabled={!$canUndo}
          title="Ctrl+Z"
        >
          Undo
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleRedo}
          disabled={!$canRedo}
          title="Ctrl+Shift+Z"
        >
          Redo
        </button>
        <div class="menu-separator" role="separator"></div>
        <button type="button" role="menuitem" onclick={handleCopy} disabled={$selection.size === 0}>
          Copy
        </button>
        <button type="button" role="menuitem" onclick={handleCut} disabled={$selection.size === 0}>
          Cut
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleDeleteSelected}
          disabled={$selection.size === 0}
          title="X"
        >
          Delete selected
        </button>
        <button type="button" role="menuitem" onclick={handlePaste}> Paste </button>
        <div class="menu-separator" role="separator"></div>
      </div>
    {/if}
  </div>

  <div class="menu-item" role="none" bind:this={viewMenuRef}>
    <button
      type="button"
      class="menu-trigger"
      class:active={viewOpen}
      onclick={toggleView}
      aria-haspopup="menu"
      aria-expanded={viewOpen}
    >
      View
    </button>
    {#if viewOpen}
      <div class="dropdown" role="menu">
        <span class="menu-label">Rendering</span>
        <button
          type="button"
          role="menuitem"
          class:checked={$renderingMode === 'greedy'}
          onclick={() => setRenderingMode('greedy')}
        >
          Blocky (greedy mesh)
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={$renderingMode === 'marchingCubes'}
          onclick={() => setRenderingMode('marchingCubes')}
        >
          Smooth (marching cubes)
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={$renderingMode === 'dualContour'}
          onclick={() => setRenderingMode('dualContour')}
        >
          Smooth (dual contouring)
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={$renderingMode === 'ray'}
          disabled={$activeRendererIsWebGPU !== true}
          title={$activeRendererIsWebGPU !== true
            ? 'Ray mode requires WebGPU (Preferences → Graphics API → Auto or WebGPU, then reload)'
            : undefined}
          onclick={() => setRenderingMode('ray')}
        >
          Ray (WebGPU)
        </button>
        <div class="menu-separator" role="separator"></div>
        <span class="menu-label">Projection</span>
        <button
          type="button"
          role="menuitem"
          class:checked={!$orthographic}
          onclick={() => setOrthographic(false)}
        >
          Perspective
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={$orthographic}
          onclick={() => setOrthographic(true)}
        >
          Orthographic
        </button>
        <div class="menu-separator" role="separator"></div>
        <span class="menu-label">Borders</span>
        <button
          type="button"
          role="menuitem"
          class:checked={$showGrid}
          onclick={() => setShowGrid(true)}
        >
          Show borders
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={!$showGrid}
          onclick={() => setShowGrid(false)}
        >
          Hide borders
        </button>
        <div class="menu-separator" role="separator"></div>
        <button type="button" role="menuitem" onclick={handleStampBook}> Stamp book… </button>
        <button type="button" role="menuitem" onclick={handleProjectStats}> Project stats… </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" role="none" bind:this={addMenuRef}>
    <button
      type="button"
      class="menu-trigger"
      class:active={addOpen}
      onclick={toggleAdd}
      aria-haspopup="menu"
      aria-expanded={addOpen}
    >
      Add
    </button>
    {#if addOpen}
      <div class="dropdown" role="menu">
        <button type="button" role="menuitem" onclick={handleAddShape}> Add shape… </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" role="none" bind:this={voxelsMenuRef}>
    <button
      type="button"
      class="menu-trigger"
      class:active={voxelsOpen}
      onclick={toggleVoxels}
      aria-haspopup="menu"
      aria-expanded={voxelsOpen}
    >
      Voxels
    </button>
    {#if voxelsOpen}
      <div class="dropdown" role="menu">
        <button
          type="button"
          role="menuitem"
          onclick={handleHideSelected}
          disabled={$selection.size === 0}
          title="Hide selected voxels; hidden voxels are excluded from editing until unhidden"
        >
          Hide selected
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleUnhideAll}
          disabled={!$hasHiddenVoxels}
        >
          Unhide all
        </button>
        <div class="menu-separator" role="separator"></div>
        <button
          type="button"
          role="menuitem"
          onclick={handleHollowOut}
          disabled={$voxels.size === 0}
        >
          Hollow out
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleScaleByFactorPrompt}
          disabled={$voxels.size === 0 && $selection.size === 0}
          title="With a selection: scale selected voxels around selection center. Otherwise: scale the whole model around model center."
        >
          Scale by factor…
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleRotateDegreesPrompt}
          disabled={$voxels.size === 0 && $selection.size === 0}
          title="With a selection: rotate selected voxels around selection center. Otherwise: rotate the whole model around model center."
        >
          Rotate by degrees…
        </button>
        <div class="menu-separator" role="separator"></div>
        <span class="menu-label">Mirror</span>
        <button
          type="button"
          role="menuitem"
          onclick={handleMirrorAcrossX}
          disabled={$voxels.size === 0 && $selection.size === 0}
          title="With a selection: mirror the selection across the YZ plane through selection center. Otherwise: mirror the whole model across the plane through model center."
        >
          Across X (YZ plane)
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleMirrorAcrossY}
          disabled={$voxels.size === 0 && $selection.size === 0}
          title="With a selection: mirror the selection across the XZ plane through selection center. Otherwise: mirror the whole model across the plane through model center."
        >
          Across Y (XZ plane)
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleMirrorAcrossZ}
          disabled={$voxels.size === 0 && $selection.size === 0}
          title="With a selection: mirror the selection across the XY plane through selection center. Otherwise: mirror the whole model across the plane through model center."
        >
          Across Z (XY plane)
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" role="none" bind:this={selectionMenuRef}>
    <button
      type="button"
      class="menu-trigger"
      class:active={selectionOpen}
      onclick={toggleSelection}
      aria-haspopup="menu"
      aria-expanded={selectionOpen}
    >
      Selection
    </button>
    {#if selectionOpen}
      <div class="dropdown" role="menu">
        <span class="menu-label">Select</span>
        <button
          type="button"
          role="menuitem"
          onclick={handleSelectAll}
          disabled={$voxels.size === 0}
        >
          Select All
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleSelectByColor}
          disabled={$voxels.size === 0}
          title="Click a voxel to select all voxels of that color"
        >
          Select by color
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleSelectConnected}
          disabled={$selection.size === 0}
        >
          Select Connected
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleSelectCoplanarFaces}
          disabled={$voxels.size === 0}
          title="Click a voxel to select all connected voxels in that face's plane"
        >
          Select coplanar faces
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleSelectCoplanarEmpty}
          disabled={$voxels.size === 0}
          title="Click the face pointing into a hole to select connected empty voxels in that plane (use Punch to cut the same void elsewhere)"
        >
          Select coplanar void
        </button>
        <div class="menu-separator" role="separator"></div>
        <span class="menu-label">Modify</span>
        <button type="button" role="menuitem" onclick={handleGrow} disabled={$selection.size === 0}>
          Grow
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleShrink}
          disabled={$selection.size === 0}
        >
          Shrink
        </button>
        <button type="button" role="menuitem" onclick={handleInvert} disabled={$voxels.size === 0}>
          Invert
        </button>
        <div class="menu-separator" role="separator"></div>
        <span class="menu-label">Deselect</span>
        <button
          type="button"
          role="menuitem"
          onclick={handleDeselectAll}
          disabled={$selection.size === 0}
        >
          Deselect All
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleDeselectInnerVoxels}
          disabled={$selection.size === 0}
          title="Deselect voxels that are surrounded on all 6 sides by selected voxels"
        >
          Deselect inner voxels
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleDeselectVoxels}
          disabled={$selection.size === 0}
          title="Remove voxel positions from selection"
        >
          Deselect voxels
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleDeselectEmptySpaces}
          disabled={$selection.size === 0}
          title="Remove orphaned entries (positions without voxels)"
        >
          Deselect empty spaces
        </button>
        <div class="menu-separator" role="separator"></div>
        <span class="menu-label">Selection mode</span>
        <button
          type="button"
          role="menuitem"
          class:checked={$selectionMode === 'replace'}
          onclick={() => setSelectionMode('replace')}
        >
          Replace
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={$selectionMode === 'add'}
          onclick={() => setSelectionMode('add')}
        >
          Add to selection
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={$selectionMode === 'subtract'}
          onclick={() => setSelectionMode('subtract')}
        >
          Subtract from selection
        </button>
        <button
          type="button"
          role="menuitem"
          class:checked={$selectionMode === 'intersect'}
          onclick={() => setSelectionMode('intersect')}
        >
          Intersect with selection
        </button>
      </div>
    {/if}
  </div>

  <div class="menu-item" role="none" bind:this={helpMenuRef}>
    <button
      type="button"
      class="menu-trigger"
      class:active={helpOpen}
      onclick={toggleHelp}
      aria-haspopup="menu"
      aria-expanded={helpOpen}
    >
      Help
    </button>
    {#if helpOpen}
      <div class="dropdown" role="menu">
        <button type="button" role="menuitem" onclick={handleShowHelp}> Show help </button>
        <button type="button" role="menuitem" onclick={handleShowStartupScreen}>
          Show startup screen
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .menubar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0 0.5rem;
    background: var(--block-quote-bg-color);
    border: 1px solid var(--border-color);
    border-radius: 4px 4px 0 0;
    min-height: 2rem;
  }

  .menu-item {
    position: relative;
  }

  .menu-trigger {
    padding: 0.25rem 0.5rem;
    font-size: 0.9rem;
    background: transparent;
    border: none;
    color: var(--text-color);
    cursor: pointer;
    border-radius: 2px;
  }

  .menu-trigger:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .menu-trigger.active {
    background: rgba(255, 255, 255, 0.15);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 2px;
    min-width: 11rem;
    padding: 0.25rem;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .dropdown button {
    display: block;
    width: 100%;
    padding: 0.35rem 0.75rem;
    font-size: 0.85rem;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text-color);
    cursor: pointer;
    border-radius: 2px;
  }

  .dropdown button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }

  .dropdown button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dropdown button.checked {
    background: var(--link-color);
    color: var(--bg-color);
  }

  .dropdown button.checked:hover {
    background: var(--link-color);
    opacity: 0.9;
  }

  .menu-separator {
    height: 1px;
    margin: 0.25rem 0;
    background: var(--border-color);
  }

  .menu-label {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-color);
    opacity: 0.7;
  }

  .hidden-input {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
</style>
