<script lang="ts">
  import TriangleWavesViz from './triangle-waves/viz.svelte';
  import TriangleWavesCtrl from './triangle-waves/controls.svelte';
  import CircleScalesViz from './circle-scales/viz.svelte';
  import CircleScalesCtrl from './circle-scales/controls.svelte';
  import PsychedelicSpinnerViz from './psychedelic-spinner/viz.svelte';
  import PsychedelicSpinnerCtrl from './psychedelic-spinner/controls.svelte';

  const VISUALIZATIONS = ['Triangle Waves', 'Circle Scales', 'Psychedelic Spinner'];
  let visualization = VISUALIZATIONS[0];

  let height;
  let width;

  function onForward() {
    const currentIndex = VISUALIZATIONS.indexOf(visualization);
    const nextIndex = (currentIndex + 1) % VISUALIZATIONS.length;
    visualization = VISUALIZATIONS[nextIndex];
  }

  function onBack() {
    const currentIndex = VISUALIZATIONS.indexOf(visualization);
    const nextIndex = (currentIndex - 1 + VISUALIZATIONS.length) % VISUALIZATIONS.length;
    visualization = VISUALIZATIONS[nextIndex];
  }
</script>

<svelte:head>
  <title>On Colors</title>
  <meta
    name="description"
    content="A collection of color visualizations and links to color theory resources."
  />
  <meta name="keywords" content="color, visualization, interactive" />
</svelte:head>

<div class="nav">
  <h1>On Colors</h1>

  <div>
    <button type="button" on:click={onBack} title="Go back to the previous visualization"
      >&larr;</button
    >
    <h2>
      <em>{visualization}</em>
    </h2>
    <button type="button" on:click={onForward} title="Go forward to the next visualization"
      >&rarr;</button
    >
  </div>
</div>

<div class="visualization" bind:clientWidth={width} bind:clientHeight={height}>
  {#if visualization === 'Triangle Waves'}
    <TriangleWavesViz {height} {width} />
  {:else if visualization === 'Circle Scales'}
    <CircleScalesViz {height} {width} />
  {:else if visualization === 'Psychedelic Spinner'}
    <PsychedelicSpinnerViz {height} {width} />
  {/if}
</div>

<div class="controls">
  {#if visualization === 'Triangle Waves'}
    <TriangleWavesCtrl />
  {:else if visualization === 'Circle Scales'}
    <CircleScalesCtrl />
  {:else if visualization === 'Psychedelic Spinner'}
    <PsychedelicSpinnerCtrl />
  {/if}
</div>

<div class="info">
  <p>Colors are neat.</p>

  <ul>
    <li>
      <a href="https://programmingdesignsystems.com/color/perceptually-uniform-color-spaces/"
        >Perceptually uniform color spaces</a
      >
    </li>
    <li>
      <a
        href="https://www.brainpickings.org/2013/08/16/interaction-of-color-josef-albers-50th-anniversary/"
        >Josef Alber's "Interaction of Color"</a
      >
    </li>
    <li>
      <a href="https://blog.johnnovak.net/2016/09/21/what-every-coder-should-know-about-gamma/"
        >What every coder should know about gamma</a
      >
    </li>
  </ul>
</div>

<style lang="scss">
  h1,
  h2 {
    margin: 0;
    line-height: 1;
    font-size: 1.5rem;
  }

  div.nav {
    display: flex;
    align-items: center;
    padding-bottom: 1.5rem;
    justify-content: space-between;
    flex-wrap: wrap;
    background: linear-gradient(var(--bg-color) 80%, transparent);

    div {
      display: flex;

      h2 {
        width: 20rem;
        text-align: center;
      }

      button {
        width: 3rem;
        cursor: pointer;
      }
    }
  }

  div.visualization {
    height: 92vh;
    margin-top: -1rem;
    z-index: -1;
  }

  div.controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    max-width: 30rem;
    margin: 0 auto;
    background-color: rgba(0, 0, 0, 0.1);
    padding: 1rem;
    border-radius: 3px;
    margin-bottom: 1rem;
  }
</style>
