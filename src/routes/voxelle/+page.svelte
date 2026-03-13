<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import VoxelCanvas from './VoxelCanvas.svelte';
  import MenuBar from './MenuBar.svelte';
  import AddPanel from './AddPanel.svelte';
  import { history, saveToStorage, selectAll } from './store';

  onMount(() => {
    if (browser) window.addEventListener('beforeunload', saveToStorage);
  });
  onDestroy(() => {
    if (browser) window.removeEventListener('beforeunload', saveToStorage);
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
  <div class="app">
    <Sidebar />
    <VoxelCanvas />
  </div>
  <AddPanel />
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
      if (e.shiftKey) {
        history.redo();
      } else {
        history.undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      history.redo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectAll();
    }
  }}
/>

<style>
  .page {
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 6rem);
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

  @media screen and (max-width: 600px) {
    .app {
      flex-direction: column;
    }
  }
</style>
