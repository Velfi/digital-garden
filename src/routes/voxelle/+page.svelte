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
    modalRequest,
    getSkipStartup,
    voxels,
    gridSize,
    focalLength,
    orthographic
  } from './store';

  let colorChangeMounted = false;
  $effect(() => {
    const newColor = $color;
    if (!colorChangeMounted) {
      colorChangeMounted = true;
      return;
    }
    const sel = untrack(() => get(selection));
    if (sel.size === 0) return;
    const colInt = hexToInt(newColor);
    updateVoxels((v) => {
      for (const key of sel.keys()) v.set(key, colInt);
    });
    selection.update((s) => {
      const next = new Map(s);
      for (const key of next.keys()) next.set(key, colInt);
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

  onMount(() => {
    if (browser) {
      window.addEventListener('beforeunload', saveToStorage);
      document.addEventListener('visibilitychange', onVisibilityChange);
      autosaveInterval = setInterval(saveToStorage, 20_000);
      if (!getSkipStartup() && webglSupported) {
        modalRequest.set('startup');
      }
    }
  });
  onDestroy(() => {
    if (browser) {
      window.removeEventListener('beforeunload', saveToStorage);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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

<div class="page">
  <header class="header">
    <h1>Voxelle</h1>
    <MenuBar />
  </header>
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
  <p>For my brother Otto</p>
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

  @media screen and (max-width: 600px) {
    .app {
      flex-direction: column;
    }
  }
</style>
