<script lang="ts">
  import Dialogue from '$lib/components/NewWaveParadise/DialogueWindow.svelte';
</script>

<svelte:head>
  <link
    href="https://fonts.googleapis.com/css2?family=Source+Serif+Pro&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<div class="container">
  <div class="explainer">
    <p>I like Disco Elysium</p>
  </div>
  <Dialogue />
</div>

<style lang="scss">
  .container {
    display: grid;
    grid-template-columns: auto 30rem;
  }
</style>
