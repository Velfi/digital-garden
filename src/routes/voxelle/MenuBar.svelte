<script lang="ts">
  import {
    voxels,
    selection,
    selectionMode,
    tool,
    selectAll,
    deselectAll,
    invertSelection,
    growSelection,
    shrinkSelection,
    selectConnected,
    deselectVoxels,
    deselectEmptySpaces,
    encodeModelForUrl,
    modalRequest,
    gridSize,
    history,
    canUndo,
    canRedo,
    copySelection,
    cutSelection,
    pasteFromClipboard,
    hollowOut,
    saveToFile,
    loadFromFile
  } from './store';
  import { exportVoxelsToGltf } from './exportGltf';
  import type { SelectionMode } from './store';

  let fileOpen = $state(false);
  let editOpen = $state(false);
  let addOpen = $state(false);
  let selectionOpen = $state(false);
  let selectionMenuRef: HTMLDivElement;
  let fileMenuRef: HTMLDivElement;
  let editMenuRef: HTMLDivElement;
  let addMenuRef: HTMLDivElement;
  let fileInputRef: HTMLInputElement;

  function closeMenus() {
    fileOpen = false;
    editOpen = false;
    addOpen = false;
    selectionOpen = false;
  }

  function toggleFile() {
    editOpen = false;
    addOpen = false;
    selectionOpen = false;
    fileOpen = !fileOpen;
  }

  function toggleEdit() {
    fileOpen = false;
    addOpen = false;
    selectionOpen = false;
    editOpen = !editOpen;
  }

  function toggleAdd() {
    fileOpen = false;
    editOpen = false;
    selectionOpen = false;
    addOpen = !addOpen;
  }

  function toggleSelection() {
    fileOpen = false;
    editOpen = false;
    addOpen = false;
    selectionOpen = !selectionOpen;
  }

  function handleUndo() {
    history.undo();
    closeMenus();
  }

  function handleRedo() {
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

  function handleHollowOut() {
    hollowOut();
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
    if (file) {
      await loadFromFile(file);
      input.value = '';
    }
  }

  function handleAddShape() {
    modalRequest.set('add');
    closeMenus();
  }

  function handleExport() {
    exportVoxelsToGltf($voxels);
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

  function handleSelectConnected() {
    selectConnected();
    closeMenus();
  }

  function handleSelectByColor() {
    tool.set('selectByColor');
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

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as Node;
    if (
      selectionMenuRef &&
      !selectionMenuRef.contains(target) &&
      fileMenuRef &&
      !fileMenuRef.contains(target) &&
      editMenuRef &&
      !editMenuRef.contains(target) &&
      addMenuRef &&
      !addMenuRef.contains(target)
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
        <button type="button" role="menuitem" onclick={handleOpen}> Open… </button>
        <button type="button" role="menuitem" onclick={handleSave} disabled={$voxels.size === 0}>
          Save .voxelle
        </button>
        <div class="menu-separator" role="separator"></div>
        <button type="button" role="menuitem" onclick={handleNewGrid}> New grid </button>
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
        <button type="button" role="menuitem" onclick={handleCut} disabled={$selection.size === 0}>
          Cut
        </button>
        <button type="button" role="menuitem" onclick={handleCopy} disabled={$selection.size === 0}>
          Copy
        </button>
        <button type="button" role="menuitem" onclick={handlePaste}> Paste </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleHollowOut}
          disabled={$voxels.size === 0}
        >
          Hollow out
        </button>
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
          onclick={handleDeselectAll}
          disabled={$selection.size === 0}
        >
          Deselect All
        </button>
        <button type="button" role="menuitem" onclick={handleInvert} disabled={$voxels.size === 0}>
          Invert
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
        <div class="menu-separator" role="separator"></div>
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
        <button
          type="button"
          role="menuitem"
          onclick={handleSelectConnected}
          disabled={$selection.size === 0}
        >
          Select Connected
        </button>
        <div class="menu-separator" role="separator"></div>
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
