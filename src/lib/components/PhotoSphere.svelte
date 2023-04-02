<script lang="ts">
  import { Viewer } from '@photo-sphere-viewer/core';
  import '@photo-sphere-viewer/core/index.css';
  import { onDestroy, onMount } from 'svelte';

  export let panorama: string;
  export let caption: string;
  let container: HTMLDivElement;
  let viewer: Viewer;

  onMount(() => {
    viewer = new Viewer({
      container,
      panorama,
      caption,
      touchmoveTwoFingers: true,
      mousewheelCtrlKey: true
    });
  });

  onDestroy(() => {
    if (viewer) {
      viewer.destroy();
    }
  });
</script>

<div bind:this={container} />

<style>
  div {
    width: 100%;
    height: 30rem;
    margin-bottom: 2rem;
  }
</style>
