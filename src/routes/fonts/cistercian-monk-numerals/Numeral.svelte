<script lang="ts">
  export let value: string;
  export let strokeLinecap: 'round' | 'inherit' | 'butt' | 'square' = 'round';
  export let strokeWidth: number;
  export let width = '3cm';
  export let height = '4cm';
  export let scale = 1;

  let svg: SVGSVGElement;

  $: paddedValue = value.padStart(4, '0');
  // $: [n1, n2, n3, n4] = paddedValue.split('');

  const MAG = [
    { x: -1, y: 1 }, // thousands
    { x: 1, y: 1 }, // hundreds
    { x: -1, y: -1 }, // tens
    { x: 1, y: -1 } // ones
  ];

  function save() {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `cistercian-monk-numeral-${value}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  {width}
  {height}
  stroke="currentColor"
  stroke-linejoin="round"
  stroke-linecap={strokeLinecap}
  stroke-width={strokeWidth}
  bind:this={svg}
  on:click={save}
  on:keypress={(e) => {
    if (e.key === 'Enter') {
      save();
    }
  }}
>
  <title>The number {value} represented as a Cistercian Monk numeral</title>
  <g transform="scale({scale} {scale})">
    {#if paddedValue !== '0000'}
      <line x1="1.5cm" x2="1.5cm" y1="0.5cm" y2="3.5cm" />
      {#each paddedValue.split('') as n, i}
        {#if n === '1' || n === '5' || n === '7' || n === '9'}
          <line
            x1="1.5cm"
            x2="{1.5 + MAG[i].x}cm"
            y1="{2 + MAG[i].y * 1.5}cm"
            y2="{2 + MAG[i].y * 1.5}cm"
          />
        {/if}
        {#if n === '2' || n === '8' || n === '9'}
          <line
            x1="1.5cm"
            x2="{1.5 + MAG[i].x}cm"
            y1="{2 + MAG[i].y * 0.5}cm"
            y2="{2 + MAG[i].y * 0.5}cm"
          />
        {/if}
        {#if n === '3'}
          <line
            x1="1.5cm"
            x2="{1.5 + MAG[i].x}cm"
            y1="{2 + MAG[i].y * 1.5}cm"
            y2="{2 + MAG[i].y * 0.5}cm"
          />
        {/if}
        {#if n === '4' || n === '5'}
          <line
            x1="1.5cm"
            x2="{1.5 + MAG[i].x}cm"
            y2="{2 + MAG[i].y * 1.5}cm"
            y1="{2 + MAG[i].y * 0.5}cm"
          />
        {/if}
        {#if n === '6' || n === '7' || n === '8' || n === '9'}
          <line
            x1="{1.5 + MAG[i].x}cm"
            x2="{1.5 + MAG[i].x}cm"
            y1="{2 + MAG[i].y * 1.5}cm"
            y2="{2 + MAG[i].y * 0.5}cm"
          />
        {/if}
      {/each}
    {:else}
      <rect x="1cm" y="0.5cm" width="1.5cm" height="2.5cm" rx="1.5cm" ry="1cm" fill="none" />
    {/if}
  </g>
</svg>

<style>
  svg {
    cursor: copy;
  }
</style>
