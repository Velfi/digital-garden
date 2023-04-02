<script lang="ts">
  export let xLabel: string;
  export let yLabel: string;
  export let min: number;
  export let max: number;
  export let step: number;
  export let value: { x: number; y: number };

  let linked = true;
  $: linkToggleTitle = linked ? 'Link these inputs' : 'Unlink these inputs';

  function onXInput(event: Event) {
    const input = event.target as HTMLInputElement;
    value.x = Number(input.value);

    if (linked) {
      value.y = value.x;
    }
  }

  function onYInput(event: Event) {
    const input = event.target as HTMLInputElement;
    value.y = Number(input.value);

    if (linked) {
      value.x = value.y;
    }
  }

  function toggleLink() {
    linked = !linked;
  }
</script>

<div>
  <label class="x" for={xLabel}>{xLabel}</label>
  <input
    class="x"
    name={xLabel}
    type="range"
    {min}
    {max}
    {step}
    bind:value={value.x}
    on:input={onXInput}
    title={String(value.x)}
  />
  <div class="link-vis top" class:linked>&nbsp;</div>
  <label class="y" for={yLabel}>{yLabel}</label>
  <input
    class="y"
    name={yLabel}
    type="range"
    {min}
    {max}
    {step}
    bind:value={value.y}
    on:input={onYInput}
    title={String(value.y)}
  />
  <div class="link-vis bot" class:linked>&nbsp;</div>
  <button type="button" title={linkToggleTitle} on:click={toggleLink}>
    {#if linked}
      🖇
    {:else}
      📎 📎
    {/if}
  </button>
</div>

<style lang="scss">
  div {
    display: grid;
    grid-template-areas:
      'xLabel xInput link-vis-top lock'
      'yLabel yInput link-vis-bot lock';
    grid-template-columns: max-content auto 1rem min-content;
    grid-template-rows: min-content min-content;
    align-items: center;
  }

  button {
    grid-area: lock;
    cursor: pointer;
    width: 3rem;
    height: 3rem;
    margin-left: 1rem;
  }

  input.x {
    grid-area: xInput;
  }

  input.y {
    grid-area: yInput;
  }

  input {
    margin: 0;
    border: none;
  }

  label {
    margin-right: 1rem;
  }

  label.x {
    grid-area: xLabel;
  }

  label.y {
    grid-area: yLabel;
  }

  .link-vis {
    border-style: solid;
  }

  .link-vis.top {
    grid-area: link-vis-top;
    border-width: 1px 1px 0 0;
    margin-top: 1px;
    border-image: linear-gradient(currentColor 60%, transparent 60%) 3;

    &.linked {
      border-image: linear-gradient(currentColor 100%, transparent) 3;
      border-width: 2px 2px 0 0;
      margin-top: 0;
    }
  }

  .link-vis.bot {
    grid-area: link-vis-bot;
    border-width: 0 1px 1px 0;
    margin-bottom: 1px;
    border-image: linear-gradient(0deg, currentColor 60%, transparent 60%) 3;

    &.linked {
      border-image: linear-gradient(0deg, currentColor 100%, transparent) 3;
      border-width: 0 2px 2px 0;
      margin-bottom: 0;
    }
  }
</style>
