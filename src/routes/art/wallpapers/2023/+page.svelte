<script>
  import ZLH07694Small from '$lib/assets/images/wallpapers/2023/ZLH07694.png?w=650';
  import ZLH07704Small from '$lib/assets/images/wallpapers/2023/ZLH07704.png?w=650';
  import ZLH07747Small from '$lib/assets/images/wallpapers/2023/ZLH07747.png?w=650';
  import ZLH07763Small from '$lib/assets/images/wallpapers/2023/ZLH07763.png?w=650';
  import ZLH07773Small from '$lib/assets/images/wallpapers/2023/ZLH07773.png?w=650';
  import ZLH07814Small from '$lib/assets/images/wallpapers/2023/ZLH07814.png?w=650';
  import ZLH07820Small from '$lib/assets/images/wallpapers/2023/ZLH07820.png?w=650';
  import ZLH07872Small from '$lib/assets/images/wallpapers/2023/ZLH07872.png?w=650';
  import ZLH07882Small from '$lib/assets/images/wallpapers/2023/ZLH07882.png?w=650';
  import ZLH07891v1Small from '$lib/assets/images/wallpapers/2023/ZLH07891v1.png?w=650';
  import ZLH07978Small from '$lib/assets/images/wallpapers/2023/ZLH07978.png?w=650';
  import ZLH07996Small from '$lib/assets/images/wallpapers/2023/ZLH07996.png?w=650';
  import ZLH08032Small from '$lib/assets/images/wallpapers/2023/ZLH08032.png?w=650';

  import ZLH07694Full from '$lib/assets/images/wallpapers/2023/ZLH07694.png';
  import ZLH07704Full from '$lib/assets/images/wallpapers/2023/ZLH07704.png';
  import ZLH07747Full from '$lib/assets/images/wallpapers/2023/ZLH07747.png';
  import ZLH07763Full from '$lib/assets/images/wallpapers/2023/ZLH07763.png';
  import ZLH07773Full from '$lib/assets/images/wallpapers/2023/ZLH07773.png';
  import ZLH07814Full from '$lib/assets/images/wallpapers/2023/ZLH07814.png';
  import ZLH07820Full from '$lib/assets/images/wallpapers/2023/ZLH07820.png';
  import ZLH07872Full from '$lib/assets/images/wallpapers/2023/ZLH07872.png';
  import ZLH07882Full from '$lib/assets/images/wallpapers/2023/ZLH07882.png';
  import ZLH07891v1Full from '$lib/assets/images/wallpapers/2023/ZLH07891v1.png';
  import ZLH07978Full from '$lib/assets/images/wallpapers/2023/ZLH07978.png';
  import ZLH07996Full from '$lib/assets/images/wallpapers/2023/ZLH07996.png';
  import ZLH08032Full from '$lib/assets/images/wallpapers/2023/ZLH08032.png';

  import WallpaperGallery from '$lib/components/WallpaperGallery.svelte';
</script>

<svelte:head>
  <title>2023 Wallpapers</title>
  <meta
    name="description"
    content="Wallpapers made from my 2023 photos. The year isn't over yet, so this is still an ongoing project. I'll be adding more as I take them."
  />
  <meta name="keywords" content="wallpapers, 2023, photos" />
<h1>2023 Wallpapers</h1>

<p>
  Wallpapers made from my 2023 photos. The year isn't over yet, so this is still an ongoing project.
  I'll be adding more as I take them.
</p>

<WallpaperGallery
  images={[
    [ZLH07694Small, ZLH07694Full, 'A pond at Rosehill Cemetery, Chicago, IL'],
    [ZLH07704Small, ZLH07704Full, 'A road through Rosehill Cemetery, Chicago, IL'],
    [ZLH07747Small, ZLH07747Full, 'A red-breasted nuthatch, harassing a tree'],
    [ZLH07763Small, ZLH07763Full, 'Canada geese'],
    [ZLH07773Small, ZLH07773Full, 'A canada goose doing yoga'],
    [ZLH07814Small, ZLH07814Full, 'An exceptionally dark rock pigeon'],
    [ZLH07820Small, ZLH07820Full, 'Grass and steel plating'],
    [
      ZLH07872Small,
      ZLH07872Full,
      'Aqua: an 82-story mixed-use skyscraper in Lakeshore East, Chicago, IL'
    ],
    [ZLH07882Small, ZLH07882Full, 'The heart of the loop, Chicago, IL'],
    [ZLH07891v1Small, ZLH07891v1Full, 'A lizard on a palm tree'],
    [ZLH07978Small, ZLH07978Full, 'Stucco buildings silhouetted against the sunset'],
    [ZLH07996Small, ZLH07996Full, 'A lizard on a crape myrtle tree'],
    [ZLH08032Small, ZLH08032Full, 'A dwarf umbrella tree']
  ]}
/>
