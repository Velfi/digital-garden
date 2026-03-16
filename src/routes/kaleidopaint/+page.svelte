<script lang="ts">
  import { onMount } from 'svelte';
  import { canvasKey, canvasWidth, canvasHeight } from './store';
  import { modalRequest, getSkipStartup } from './store';
  import Sidebar from './Sidebar.svelte';
  import Canvas from './Canvas.svelte';
  import MenuBar from './MenuBar.svelte';
  import ToolPanel from './ToolPanel.svelte';

  onMount(() => {
    if (!getSkipStartup()) {
      modalRequest.set('startup');
    }
  });
</script>

<svelte:head>
  <title>Kaleidopaint</title>
  <meta name="description" content="A web app for painting kaleidoscopic patterns." />
  <meta name="keywords" content="kaleidopaint, paint, art, web app" />
</svelte:head>

<div class="app">
  <header class="header">
    <h1>Kaleidopaint</h1>
    <MenuBar />
  </header>
  <div class="workspace">
    <Sidebar />
    <div class="canvas-area">
      {#key $canvasKey}
        <Canvas width={$canvasWidth} height={$canvasHeight} />
      {/key}
      <ToolPanel />
    </div>
  </div>
</div>

<style lang="scss">
  .app {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
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

  .workspace {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }

  .canvas-area {
    flex: 1;
    min-width: 0;
    min-height: 400px;
    overflow: hidden;
    display: flex;
    position: relative;
  }
</style>
