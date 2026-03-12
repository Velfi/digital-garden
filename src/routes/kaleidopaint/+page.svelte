<script lang="ts">
  import { canvasKey, canvasWidth, canvasHeight } from './store';
  import Sidebar from './Sidebar.svelte';
  import Canvas from './Canvas.svelte';
</script>

<svelte:head>
  <title>Kaleidopaint</title>
  <meta name="description" content="A web app for painting kaleidoscopic patterns." />
  <meta name="keywords" content="kaleidopaint, paint, art, web app" />
</svelte:head>

<h1>Kaleidopaint</h1>

<div class="app">
  <Sidebar />
  <div class="canvas-area">
    {#key $canvasKey}
      <Canvas width={$canvasWidth} height={$canvasHeight} />
    {/key}
  </div>
</div>

<style lang="scss">
  .app {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    margin-top: 1rem;
  }

  .canvas-area {
    flex: 1;
    min-width: 0;
    min-height: 400px;
    overflow: hidden;
    display: flex;
  }
</style>
