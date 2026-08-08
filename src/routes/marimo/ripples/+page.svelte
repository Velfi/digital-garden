<script lang="ts">
  import RippleBench from '$lib/components/marimo/RippleBench.svelte';

  // Dev-only, like the time-travel controls on the tank itself. It is a tuning
  // rig, not something to publish.
  const enabled = import.meta.env.DEV;
</script>

<svelte:head>
  <title>Ripple bench</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
  <header>
    <h1>Ripple bench</h1>
    <p>
      The jar's water surface on its own. <strong>underwater</strong> is the real viewing condition —
      looking up at water-to-air, where the ripples show as wobble in the rim of Snell's window and
      as distortion in the mirror beyond the critical angle. The checkerboard is a stand-in for the
      tank's reflection, because a straight grid makes the slope readable. Drag to orbit, scroll to
      zoom.
    </p>
  </header>

  {#if enabled}
    <RippleBench />
  {:else}
    <p>This bench only runs in development.</p>
  {/if}
</div>

<style lang="scss">
  .page {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 74rem;
    margin: 0 auto;
    padding: 1rem;
  }

  header {
    h1 {
      margin: 0;
    }

    p {
      margin: 0.35rem 0 0;
      max-width: 46rem;
      font-size: 0.92rem;
      line-height: 1.5;
      opacity: 0.85;
    }
  }
</style>
