<script lang="ts">
  import SlimeTerrarium from '$lib/components/SlimeTerrarium.svelte';
</script>

<svelte:head>
  <title>Pet slime: a soft-body slime terrarium</title>
  <meta
    name="description"
    content="A soft-body slime in a glass terrarium. It arrives dormant; mist it to wake it, keep it damp, and feed it oat flakes."
  />
  <meta
    name="keywords"
    content="slime, pet, physarum, slime mold, soft body, jolt, three.js, webgl, simulation"
  />
</svelte:head>

<div class="page">
  <header class="header">
    <h1>Pet slime: <span class="subtitle">a slime terrarium</span></h1>
    <p>
      Your very own slime, in a glass box. Arrives dormant &mdash; just mist to wake! Keep damp,
      feed oat flakes, watch it grow. Forgot to mist? No worries &mdash; it only sleeps, never dies.
    </p>
  </header>

  <div class="workspace">
    <SlimeTerrarium variant="full" showDevTools />
  </div>
</div>

<style lang="scss">
  .page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 62rem;
    margin: 0 auto;
    padding: 1rem;
    min-height: calc(100vh - 4rem);
    min-height: calc(100dvh - 4rem);
  }

  .header {
    h1 {
      margin: 0;

      // the only break opportunity is the space after the colon, so the title
      // splits there first rather than mid-subtitle
      .subtitle {
        white-space: nowrap;
      }
    }

    p {
      margin: 0.35rem 0 0;
      max-width: 44rem;
      font-size: 0.92rem;
      line-height: 1.5;
      opacity: 0.85;
    }
  }

  .workspace {
    flex: 1 1 0;
    min-height: 0;
  }
</style>
