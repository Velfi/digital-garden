<script lang="ts">
  import { history, canUndo, canRedo, modalRequest } from './store';

  let fileOpen = $state(false);
  let editOpen = $state(false);
  let helpOpen = $state(false);
  let fileMenuRef: HTMLDivElement;
  let editMenuRef: HTMLDivElement;
  let helpMenuRef: HTMLDivElement;

  function closeMenus() {
    fileOpen = false;
    editOpen = false;
    helpOpen = false;
  }

  function toggleFile() {
    fileOpen = !fileOpen;
    editOpen = false;
    helpOpen = false;
  }

  function toggleEdit() {
    fileOpen = false;
    editOpen = !editOpen;
    helpOpen = false;
  }

  function toggleHelp() {
    fileOpen = false;
    editOpen = false;
    helpOpen = !helpOpen;
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as Node;
    if (
      fileMenuRef &&
      !fileMenuRef.contains(target) &&
      editMenuRef &&
      !editMenuRef.contains(target) &&
      helpMenuRef &&
      !helpMenuRef.contains(target)
    ) {
      closeMenus();
    }
  }

  function requestNewCanvas() {
    modalRequest.set('newCanvas');
    closeMenus();
  }

  function requestExportPng() {
    modalRequest.set('exportPng');
    closeMenus();
  }

  function showHelp() {
    modalRequest.set('help');
    closeMenus();
  }

  function showStartup() {
    modalRequest.set('startup');
    closeMenus();
  }

  function handleUndo() {
    history.undo();
    closeMenus();
  }

  function handleRedo() {
    history.redo();
    closeMenus();
  }

</script>

<svelte:window onclick={handleClickOutside} />

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
        <button type="button" role="menuitem" onclick={requestNewCanvas}>New canvas</button>
        <button type="button" role="menuitem" onclick={requestExportPng}>Export PNG</button>
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
        <button type="button" role="menuitem" onclick={handleUndo} disabled={!$canUndo} title="Cmd/Ctrl+Z">
          Undo
        </button>
        <button
          type="button"
          role="menuitem"
          onclick={handleRedo}
          disabled={!$canRedo}
          title="Cmd/Ctrl+Shift+Z"
        >
          Redo
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
        <button type="button" role="menuitem" onclick={showHelp}>Show help</button>
        <button type="button" role="menuitem" onclick={showStartup}>Show startup screen</button>
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

</style>
