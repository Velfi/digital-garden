<script lang="ts">
  import MarimoTank from '$lib/components/MarimoTank.svelte';
  import { resolve } from '$app/paths';
</script>

<svelte:head>
  <title>Marimomono: a marimo simulator</title>
  <meta
    name="description"
    content="A simulated marimo moss ball in a jar. It grows on real time, floats when it fills with oxygen, and goes flat on one side if you never turn it over."
  />
  <meta
    name="keywords"
    content="marimo, moss ball, aegagropila, three.js, webgl, simulation, pet"
  />
</svelte:head>

<div class="page">
  <header class="header">
    <h1>Marimomono: <span class="subtitle">a marimo simulator</span></h1>
    <p>
      A moss ball in a jar. It keeps its own time &mdash; leave and come back tomorrow, or next
      month, and it will have carried on without you just fine. It might miss you, however.
      <a href={resolve('/programming/marimo-moss-ball')}>How it works</a>.
    </p>
  </header>

  <div class="workspace">
    <MarimoTank variant="full" showDevTools />
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
