<script lang="ts">
  import Numeral from './Numeral.svelte';

  const allDigits = Array.from(Array(10000).keys()).map((n) => n.toString());
  const NUMBER_REGEX = /^\d{1,4}$/;

  let size = 120;
  let strokeWidth = 10;
  let strokeLinecap: 'round' | 'inherit' | 'butt' | 'square' = 'round';
  // Any value they type in the input field
  let value = '8148';
  //  The value of the input field, but only if it's a valid number
  $: digit = '8148';

  $: if (NUMBER_REGEX.test(value)) {
    console.log(value);
    digit = value;
  }

  function onClickRng(): void {
    value = Math.floor(Math.random() * 9999 + 1).toString();
  }
</script>

<svelte:head>
  <title>Cistercian Monk Numerals</title>
  <meta
    name="description"
    content="Cistercian Monk Numerals are a compact way to write numbers. They were developed by the Cistercian monastic order in the early thirteenth century. I wrote an SVG generator for them."
  />
  <meta name="keywords" content="cistercian, monk, numerals, svg, generator" />
</svelte:head>

<h1>Cistercian Monk Numerals</h1>

<p><a href="https://en.wikipedia.org/wiki/Cistercian_numerals">From Wikipedia</a>:</p>

<blockquote>
  <p>
    Cistercian numerals were developed by the Cistercian monastic order in the early thirteenth
    century. These numerals are more compact than Arabic or Roman numerals and can indicate any
    integer from 1 to 9,999 with a single glyph.
  </p>
  <p>
    The digits are based on a horizontal or vertical stave, and the position of the digit on the
    stave indicates its place value. The Cistercians abandoned the system in favor of Arabic
    numerals, but marginal use continued outside the order until the early twentieth century.
  </p>
  <p>
    The numerals were used for numbering pages, divisions of texts, lists, indexes, concordances,
    arguments in Easter tables, and the lines of a staff in musical notation.
  </p>
</blockquote>

<h2>Generate a numeral</h2>

<p>
  8148 is one of my favorites because it looks like a little bodybuilder. 3322 is also good because
  it looks like a little anchor. My wife thinks they look like the alien's digits from the movie
  <strong>Predator</strong>. Click on a numeral to save it as an SVG to your computer.
</p>

<div class="container">
  <div class="controls">
    <label for="number">Enter a number between 1 and 9999:</label>
    <input name="number" type="text" bind:value maxLength={4} size={4} tabIndex={0} />
    <button
      class="rng"
      type="button"
      title="Generate a random number"
      on:click={onClickRng}
      tabIndex={0}
    >
      🎲
    </button>
    <label for="stroke-width">Stroke width:</label>
    <input
      name="stroke-width"
      type="range"
      min={1}
      max={35}
      bind:value={strokeWidth}
      tabIndex={0}
    />
    <label for="stroke-linecap">Stroke linecap:</label>
    <select name="stroke-linecap" bind:value={strokeLinecap} tabIndex={0}>
      <option value="round">Round</option>
      <option value="square">Square</option>
      <option value="miter">Miter</option>
    </select>
  </div>
  {#if value === '1881'}
    <p class="anti-nazi">The one looks too much like a swastika for my tastes</p>
  {:else}
    <div class="number">
      <Numeral
        value={digit}
        {strokeLinecap}
        {strokeWidth}
        height={String(size * 1.25)}
        width={String(size)}
      />
    </div>
  {/if}
</div>

<h2>All of them at once</h2>

<p>Here are all the numerals from 1 to 9,999.</p>

<div class="all-numerals">
  {#each allDigits as d}
    <Numeral
      width={String(30)}
      height={String(30 * 1.25)}
      scale={0.25}
      value={d}
      strokeWidth={10}
    />
  {/each}
</div>

<style>
  div.container {
    display: grid;
    grid-template-columns: max-content auto;
    gap: 2rem;
    align-items: center;
  }

  .controls {
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .controls > input[name='number'] {
    text-align: center;
    height: 2rem;
  }

  .number {
    border-bottom: 2px solid currentColor;
    padding: 1rem 3rem;
    display: flex;
    justify-content: center;
  }

  .controls > input,
  .controls > select {
    margin-bottom: 1rem;
  }

  .rng {
    height: 2rem;
    position: absolute;
    right: 0;
    top: 1.5rem;
    cursor: pointer;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }

  .anti-nazi {
    width: 7rem;
    text-align: justify;
  }

  .all-numerals {
    display: flex;
    flex-wrap: wrap;
  }
</style>
