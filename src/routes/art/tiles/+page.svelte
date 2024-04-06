<script>
  import PerspectiveGrid from './Tiles.svelte';

  let examples = [
    'bloop',
    'fettucine',
    'croupier',
    'shamshir',

    'conglomerate',
    'stonefruit',
    'futurism',
    'verdigris',

    'metropolis',
    'interface',
    'bizarre',
    'coastline'
  ];
</script>

<svelte:head>
  <title>Tiles</title>
  <meta
    name="description"
    content="I was watching the Ross's Game Dungeon episode on Echo and it inspired me to make a generator for this pattern. Tiling patterns are neat and I hope to someday add more tiles and make them interactive as well."
  />
  <meta name="keywords" content="tiles, svg" />
</svelte:head>

<h1>Tiles</h1>
<p>
  I was watching the <a href="https://www.youtube.com/channel/UCJ6KZTTnkE-s2XFJJmoTAkw"
    >Ross's Game Dungeon</a
  >
  episode on <a href="https://www.youtube.com/watch?v=1zZaRH00Q54">Echo</a> and it inspired me to make
  a generator for this pattern. Tiling patterns are neat and I hope to someday add more tiles and make
  them interactive as well.
</p>

<p><em>Does this pattern have a name?</em></p>

<div>
  {#each examples as _example}
    <PerspectiveGrid />
  {/each}
</div>

<style>
  div {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-items: center;
  }
</style>
