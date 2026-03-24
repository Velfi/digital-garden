<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, onDestroy, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import Sidebar from './Sidebar.svelte';
  import VoxelCanvas from './VoxelCanvas.svelte';
  import MenuBar from './MenuBar.svelte';
  import AddPanel from './AddPanel.svelte';
  import {
    history,
    saveToStorage,
    selectAll,
    color,
    selection,
    updateVoxels,
    hexToInt,
    voxelMaterial,
    modalRequest,
    getSkipStartup,
    autosaveError,
    voxels,
    gridSize,
    focalLength,
    orthographic,
    deleteSelectedVoxels,
    hideSelectedVoxels,
    unhideAllVoxels
  } from './store/index';

  let colorChangeMounted = false;
  $effect(() => {
    const newColor = $color;
    if (!colorChangeMounted) {
      colorChangeMounted = true;
      return;
    }
    const sel = untrack(() => get(selection));
    if (sel.size === 0) return;
    const colInt = hexToInt(newColor) & 0xffffff;
    const mat = untrack(() => get(voxelMaterial));
    const vx = { color: colInt, material: mat };
    updateVoxels((v) => {
      for (const key of sel.keys()) {
        if (v.has(key)) v.set(key, vx);
      }
    });
    selection.update((s) => {
      const next = new Map(s);
      for (const key of next.keys()) next.set(key, vx);
      return next;
    });
  });

  function isWebGLSupported(): boolean {
    if (!browser || typeof document === 'undefined') return true;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
      return !!gl;
    } catch {
      return false;
    }
  }

  let webglSupported = $state(true);
  if (browser) webglSupported = isWebGLSupported();

  let autosaveInterval: ReturnType<typeof setInterval> | undefined;
  const FULLSCREEN_UI_IDLE_MS = 2500;
  let isFullscreen = $state(false);
  let fullscreenUiVisible = $state(true);
  let fullscreenUiHideTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearFullscreenUiHideTimeout() {
    if (fullscreenUiHideTimeout != null) {
      clearTimeout(fullscreenUiHideTimeout);
      fullscreenUiHideTimeout = null;
    }
  }

  function scheduleFullscreenUiHide() {
    clearFullscreenUiHideTimeout();
    if (!isFullscreen) return;
    fullscreenUiHideTimeout = setTimeout(() => {
      fullscreenUiVisible = false;
      fullscreenUiHideTimeout = null;
    }, FULLSCREEN_UI_IDLE_MS);
  }

  function onFullscreenUiActivity() {
    if (!isFullscreen) return;
    fullscreenUiVisible = true;
    scheduleFullscreenUiHide();
  }

  function onFullscreenChange() {
    isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
      fullscreenUiVisible = true;
      scheduleFullscreenUiHide();
    } else {
      fullscreenUiVisible = true;
      clearFullscreenUiHideTimeout();
    }
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    saveToStorage();
    e.preventDefault();
    e.returnValue = '';
  }

  onMount(() => {
    if (browser) {
      window.addEventListener('beforeunload', onBeforeUnload);
      document.addEventListener('visibilitychange', onVisibilityChange);
      document.addEventListener('fullscreenchange', onFullscreenChange);
      window.addEventListener('pointermove', onFullscreenUiActivity, { passive: true });
      window.addEventListener('pointerdown', onFullscreenUiActivity, { passive: true });
      window.addEventListener('wheel', onFullscreenUiActivity, { passive: true });
      window.addEventListener('keydown', onFullscreenUiActivity);
      window.addEventListener('touchstart', onFullscreenUiActivity, { passive: true });
      autosaveInterval = setInterval(saveToStorage, 20_000);
      onFullscreenChange();
      if (!getSkipStartup() && webglSupported) {
        modalRequest.set('startup');
      }
    }
  });
  onDestroy(() => {
    if (browser) {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('pointermove', onFullscreenUiActivity);
      window.removeEventListener('pointerdown', onFullscreenUiActivity);
      window.removeEventListener('wheel', onFullscreenUiActivity);
      window.removeEventListener('keydown', onFullscreenUiActivity);
      window.removeEventListener('touchstart', onFullscreenUiActivity);
      clearFullscreenUiHideTimeout();
      if (autosaveInterval) clearInterval(autosaveInterval);
    }
  });

  function onVisibilityChange() {
    if (document.hidden) saveToStorage();
  }

  // Debounced save 2.5s after last change to persisted state
  $effect(() => {
    if (!browser) return;
    $voxels;
    $gridSize;
    $focalLength;
    $orthographic;
    const t = setTimeout(saveToStorage, 2500);
    return () => clearTimeout(t);
  });
</script>

<svelte:head>
  <title>Voxelle – Voxel Sculpting</title>
  <meta
    name="description"
    content="A 3D voxel sculpting tool. Chip away or add voxels to create sculptures."
  />
</svelte:head>

<div class="page" class:fullscreen-ui-hidden={isFullscreen && !fullscreenUiVisible}>
  <header class="header">
    <h1>Voxelle</h1>
    <MenuBar />
  </header>
  {#if $autosaveError}
    <div class="autosave-alert" role="alert">
      <p><strong>Autosave failed: {$autosaveError}</strong></p>
      <p>Your work may be lost if you refresh or close the tab.</p>
      <p>Use File → Save now to download a <code>.voxelle</code> backup. Free browser storage, close private browsing, or allow site data, then try again.</p>
    </div>
  {/if}
  {#if webglSupported}
    <div class="app">
      <Sidebar />
      <VoxelCanvas />
    </div>
    <AddPanel />
  {:else}
    <div class="webgl-alert" role="alert">
      <p><strong>Your browser doesn't support WebGL.</strong></p>
      <p>WebGL lets websites draw 3D graphics. This app needs it to run.</p>
      <p>Try updating your browser, or use another browser that supports WebGL.</p>
    </div>
  {/if}
  <p style="margin: 0">For my brother Otto</p>
</div>

<svelte:window
  on:keydown={(e) => {
    const target = document.activeElement;
    const isInput =
      target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
    if (isInput) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        history.redo();
      } else {
        history.undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      e.stopPropagation();
      history.redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      e.stopPropagation();
      selectAll();
    } else if (
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      e.code === 'KeyX' &&
      get(selection).size > 0
    ) {
      e.preventDefault();
      e.stopPropagation();
      deleteSelectedVoxels();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'KeyH') {
      if (get(selection).size === 0) return;
      e.preventDefault();
      e.stopPropagation();
      hideSelectedVoxels();
    } else if (!e.ctrlKey && !e.metaKey && e.altKey && e.code === 'KeyH') {
      e.preventDefault();
      e.stopPropagation();
      unhideAllVoxels();
    }
  }}
/>

<style>
  .page {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 4rem);
    margin-top: 1rem;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .app {
    display: flex;
    flex: 1;
    gap: 1rem;
    align-items: stretch;
    min-height: 0;
  }

  .webgl-alert {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.5rem;
    background: var(--color-surface-1, #f5f5f5);
    border: 1px solid var(--color-border, #ddd);
    border-radius: 0.5rem;
    max-width: 32rem;
  }

  .webgl-alert p {
    margin: 0;
  }

  .autosave-alert {
    padding: 0.75rem 1rem;
    margin-bottom: 0.5rem;
    background: var(--bg-color);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    max-width: 40rem;
  }

  .autosave-alert p {
    margin: 0 0 0.25rem 0;
  }

  .autosave-alert p:last-child {
    margin-bottom: 0;
  }

  .autosave-alert code {
    font-size: 0.9em;
    color: var(--text-color);
  }

  @media screen and (max-width: 600px) {
    .app {
      flex-direction: column;
    }
  }

  .page :global(.header),
  .page :global(.sidebar-wrapper),
  .page :global(.add-panel),
  .page :global(.menubar),
  .page :global(.tool-panel),
  .page :global(.selection-panel),
  .page :global(.zoom-controls),
  .page :global(.fly-hint),
  .page :global(.orbit-gizmo),
  .page :global(.depth-slider-container),
  .page :global(.polygon-actions),
  .page :global(.cuboid-done-btn),
  .page :global(.delta-display),
  .page > p {
    transition: opacity 0.2s ease;
  }

  .page.fullscreen-ui-hidden :global(.header),
  .page.fullscreen-ui-hidden :global(.sidebar-wrapper),
  .page.fullscreen-ui-hidden :global(.add-panel),
  .page.fullscreen-ui-hidden :global(.menubar),
  .page.fullscreen-ui-hidden :global(.tool-panel),
  .page.fullscreen-ui-hidden :global(.selection-panel),
  .page.fullscreen-ui-hidden :global(.zoom-controls),
  .page.fullscreen-ui-hidden :global(.fly-hint),
  .page.fullscreen-ui-hidden :global(.orbit-gizmo),
  .page.fullscreen-ui-hidden :global(.depth-slider-container),
  .page.fullscreen-ui-hidden :global(.polygon-actions),
  .page.fullscreen-ui-hidden :global(.cuboid-done-btn),
  .page.fullscreen-ui-hidden :global(.delta-display),
  .page.fullscreen-ui-hidden > p {
    opacity: 0;
    pointer-events: none;
  }
</style>
