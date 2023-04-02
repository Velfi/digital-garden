<script>
  import {
    hue,
    hueScale,
    spinnerSpeed,
    steps,
    wobbleAmount,
    wobbleSpeed,
    lineWidth,
    shouldClear
  } from './store';
</script>

<div class="span-columns">
  <h2 class="center">Command the Spinner!</h2>
</div>
<label for="spinnerSpeed">Spinner Speed</label>
<input
  name="spinnerSpeed"
  type="range"
  min="1"
  max="50"
  step="1"
  bind:value={$spinnerSpeed}
  title={String($spinnerSpeed)}
/>
<label for="steps">Steps</label>
<input
  name="steps"
  type="range"
  min="1"
  max="20"
  step="1"
  bind:value={$steps}
  title={String($steps)}
/>
<label for="wobbleSpeed">Wobble Speed</label>
<input
  name="wobbleSpeed"
  type="range"
  min="0"
  max="1000"
  step="1"
  bind:value={$wobbleSpeed}
  title={String($wobbleSpeed)}
/>
<label for="wobbleAmount">Wobble Amount</label>
<input
  name="wobbleAmount"
  type="range"
  min="0"
  max="100"
  step="0.01"
  bind:value={$wobbleAmount}
  title={String($wobbleAmount)}
/>
<label for="lineWidth">Line Width</label>
<input
  name="lineWidth"
  type="range"
  min="1"
  max="30"
  step="1"
  bind:value={$lineWidth}
  title={String($lineWidth)}
/>
<label for="hue">Hue</label>
<input name="hue" type="range" min="0" max="360" bind:value={$hue} title={String($hue)} />
<label for="hueScale">Hue Scale</label>
<input
  name="hueScale"
  type="range"
  min="1"
  max="120"
  step="1"
  bind:value={$hueScale}
  title={String($hueScale)}
/>

<label for="shouldClear">Clear</label>
<input
  name="shouldClear"
  type="checkbox"
  bind:checked={$shouldClear}
  title={String($shouldClear)}
/>

<style lang="scss">
  div.span-columns {
    grid-column: span 2;
  }

  h2 {
    font-size: 2rem;
    line-height: 1;
    margin-top: 0;
  }
</style>
