<script lang="ts">
  import { get } from 'svelte/store';
  import {
    canUndo,
    canRedo,
    modalRequest,
    undo,
    redo,
    mode,
    selectedPathIds,
    simplifySelectedPaths,
    reverseSelectedPaths,
    copySelectedPaths,
    cutSelectedPaths,
    pastePaths,
    canPastePaths,
    document as docStore,
    loadDocument
  } from './store';
  import {
    deserializeBadgerFile,
    pickBadgerFile,
    saveBadgerFile as writeBadgerFile
  } from './badgerFile';

  async function openBadgerFile() {
    closeMenus();
    const picked = await pickBadgerFile();
    if (!picked) return;
    const result = deserializeBadgerFile(picked.text);
    if (result.ok === true) {
      loadDocument(result.document);
      return;
    }
    alert(`Couldn't open file: ${result.error}`);
  }

  async function saveBadgerFile() {
    closeMenus();
    await writeBadgerFile(get(docStore));
  }

  let fileOpen = $state(false);
  let editOpen = $state(false);
  let pathOpen = $state(false);
  let viewOpen = $state(false);
  let helpOpen = $state(false);
  let fileRef: HTMLDivElement;
  let editRef: HTMLDivElement;
  let pathRef: HTMLDivElement;
  let viewRef: HTMLDivElement;
  let helpRef: HTMLDivElement;

  function closeMenus() {
    fileOpen = editOpen = pathOpen = viewOpen = helpOpen = false;
  }
  function toggleFile() {
    fileOpen = !fileOpen;
    editOpen = pathOpen = viewOpen = helpOpen = false;
  }
  function toggleEdit() {
    editOpen = !editOpen;
    fileOpen = pathOpen = viewOpen = helpOpen = false;
  }
  function togglePath() {
    pathOpen = !pathOpen;
    fileOpen = editOpen = viewOpen = helpOpen = false;
  }
  function toggleView() {
    viewOpen = !viewOpen;
    fileOpen = editOpen = pathOpen = helpOpen = false;
  }
  function toggleHelp() {
    helpOpen = !helpOpen;
    fileOpen = editOpen = pathOpen = viewOpen = false;
  }

  function handleClickOutside(e: MouseEvent) {
    const t = e.target as Node;
    if (
      fileRef &&
      !fileRef.contains(t) &&
      editRef &&
      !editRef.contains(t) &&
      pathRef &&
      !pathRef.contains(t) &&
      viewRef &&
      !viewRef.contains(t) &&
      helpRef &&
      !helpRef.contains(t)
    ) {
      closeMenus();
    }
  }

</script>

<svelte:window onclick={handleClickOutside} />

<div class="menubar" role="menubar">
  <div class="menu-item" bind:this={fileRef}>
    <button class="menu-trigger" class:active={fileOpen} onclick={toggleFile}>File</button>
    {#if fileOpen}
      <div class="dropdown">
        <button
          onclick={() => {
            modalRequest.set('newBadge');
            closeMenus();
          }}>New badge…</button
        >
        <button onclick={openBadgerFile}>Open badge…</button>
        <button onclick={saveBadgerFile}>Save badge…</button>
        <div class="dropdown-sep"></div>
        <button
          onclick={() => {
            modalRequest.set('exportPng');
            closeMenus();
          }}>Export PNG</button
        >
        <button
          onclick={() => {
            modalRequest.set('exportSvg');
            closeMenus();
          }}>Export SVG</button
        >
        <button
          onclick={() => {
            modalRequest.set('exportGlb');
            closeMenus();
          }}>Export GLB</button
        >
        <button
          onclick={() => {
            modalRequest.set('exportTextures');
            closeMenus();
          }}>Export as textures</button
        >
        <button
          onclick={() => {
            modalRequest.set('share');
            closeMenus();
          }}>Share…</button
        >
      </div>
    {/if}
  </div>

  <div class="menu-item" bind:this={editRef}>
    <button class="menu-trigger" class:active={editOpen} onclick={toggleEdit}>Edit</button>
    {#if editOpen}
      <div class="dropdown">
        <button
          onclick={() => {
            undo();
            closeMenus();
          }}
          disabled={!$canUndo}>Undo</button
        >
        <button
          onclick={() => {
            redo();
            closeMenus();
          }}
          disabled={!$canRedo}>Redo</button
        >
        <div class="dropdown-sep"></div>
        <button
          disabled={$selectedPathIds.size === 0}
          onclick={() => {
            cutSelectedPaths();
            closeMenus();
          }}>Cut</button
        >
        <button
          disabled={$selectedPathIds.size === 0}
          onclick={() => {
            copySelectedPaths();
            closeMenus();
          }}>Copy</button
        >
        <button
          disabled={!$canPastePaths}
          onclick={() => {
            pastePaths();
            closeMenus();
          }}>Paste</button
        >
        <div class="dropdown-sep"></div>
        <button
          onclick={() => {
            modalRequest.set('options');
            closeMenus();
          }}>Options…</button
        >
      </div>
    {/if}
  </div>

  <div class="menu-item" bind:this={pathRef}>
    <button class="menu-trigger" class:active={pathOpen} onclick={togglePath}>Path</button>
    {#if pathOpen}
      <div class="dropdown">
        <button
          disabled={$selectedPathIds.size === 0}
          onclick={() => {
            simplifySelectedPaths();
            closeMenus();
          }}>Simplify</button
        >
        <button
          disabled={$selectedPathIds.size === 0}
          onclick={() => {
            reverseSelectedPaths();
            closeMenus();
          }}>Reverse</button
        >
      </div>
    {/if}
  </div>

  <div class="menu-item" bind:this={viewRef}>
    <button class="menu-trigger" class:active={viewOpen} onclick={toggleView}>View</button>
    {#if viewOpen}
      <div class="dropdown">
        <button
          onclick={() => {
            mode.set('metal');
            closeMenus();
          }}>Metal mode</button
        >
        <button
          onclick={() => {
            mode.set('colors');
            closeMenus();
          }}>Colors mode</button
        >
        <button
          onclick={() => {
            mode.set('render');
            closeMenus();
          }}>Render mode</button
        >
      </div>
    {/if}
  </div>

  <div class="menu-item" bind:this={helpRef}>
    <button class="menu-trigger" class:active={helpOpen} onclick={toggleHelp}>Help</button>
    {#if helpOpen}
      <div class="dropdown">
        <button
          onclick={() => {
            modalRequest.set('help');
            closeMenus();
          }}>Show help</button
        >
        <button
          onclick={() => {
            modalRequest.set('startup');
            closeMenus();
          }}>Show startup</button
        >
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

  .dropdown-sep {
    height: 1px;
    margin: 0.25rem 0.1rem;
    background: var(--border-color);
  }
</style>
