<script>
  import FlowerStampPhoto from '$lib/assets/images/wooden-stamps/flower.jpg?w=650&imagetools';
  import PeacockStampPhoto from '$lib/assets/images/wooden-stamps/peacock.jpg?w=650&imagetools';
  import HorseStampPhoto from '$lib/assets/images/wooden-stamps/horse.jpg?w=650&imagetools';
  import VinesStampPhoto from '$lib/assets/images/wooden-stamps/vines.jpg?w=650&imagetools';

  import VinesStampRough from './VinesStampRough.svelte';
  import PeacockStamp from './PeacockStamp.svelte';
  import HorseStamp from './HorseStamp.svelte';
  import FlowerStampRough from './FlowerStampRough.svelte';
  import FlowerStampRefined from './FlowerStampRefined.svelte';
</script>

<svelte:head>
  <title>Antique stamps converted to SVG</title>
  <meta
    name="description"
    content="My mother sent me some antique wooden stamps a little while back. I don't stamp things so they just sat on my curio shelf for the longest time. But then I thought of turning them into SVGs."
  />
  <meta name="keywords" content="wooden stamps, svg, svelte" />
</svelte:head>

<h1>Antique stamps converted to SVG</h1>

My mother sent me some antique wooden stamps a little while back. I don't stamp things so they just
sat on my curio shelf for the longest time. But then I thought of turning them into SVGs.

<h2>The flower</h2>

<img src={FlowerStampPhoto} alt="a wooden flower stamp" />

<div class="flowers">
  <div>
    <FlowerStampRefined />
    <p>
      <a href="/images/wooden-stamps/flower-refined.svg"> download refined version </a>
    </p>
  </div>

  <div>
    <FlowerStampRough />
    <p>
      <a href="/images/wooden-stamps/flower-rough.svg">download rough version</a>
    </p>
  </div>
</div>

<h2>The peacock</h2>

<img src={PeacockStampPhoto} alt="a wooden peacock stamp" />
<PeacockStamp />

<p>
  <a href="/images/wooden-stamps/peacock.svg">download</a>
</p>

<h2>The horse</h2>

<img src={HorseStampPhoto} alt="a wooden horse stamp" />
<HorseStamp />

<p>
  <a href="/images/wooden-stamps/horse.svg">download</a>
</p>

<h2>The vines</h2>

<img src={VinesStampPhoto} alt="a wooden vines stamp" />

<!-- There are two so the tiling of the stamp is more apparent -->
<div>
  <VinesStampRough /><VinesStampRough />
</div>

<p>
  <a href="/images/wooden-stamps/vines-rough.svg">download rough version</a>
</p>

<style lang="scss">
  img + div {
    margin-top: 1rem;
  }

  .flowers {
    display: flex;
    flex-direction: row;
    justify-content: space-around;

    div {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
  }
</style>
