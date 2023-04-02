<script>
  import ZLH03822Small from '$lib/assets/images/wallpapers/2022/ZLH03822.png?w=650';
  import ZLH03843Small from '$lib/assets/images/wallpapers/2022/ZLH03843.png?w=650';
  import ZLH03850Small from '$lib/assets/images/wallpapers/2022/ZLH03850.png?w=650';
  import ZLH04841Small from '$lib/assets/images/wallpapers/2022/ZLH04841.png?w=650';
  import ZLH04872Small from '$lib/assets/images/wallpapers/2022/ZLH04872.png?w=650';
  import ZLH06630Small from '$lib/assets/images/wallpapers/2022/ZLH06630.png?w=650';
  import ZLH07304v1Small from '$lib/assets/images/wallpapers/2022/ZLH07304v1.png?w=650';
  import ZLH07317v1Small from '$lib/assets/images/wallpapers/2022/ZLH07317v1.png?w=650';
  import ZLH07346Small from '$lib/assets/images/wallpapers/2022/ZLH07346.png?w=650';
  import ZLH07364v1Small from '$lib/assets/images/wallpapers/2022/ZLH07364v1.png?w=650';
  import ZLH07377v1Small from '$lib/assets/images/wallpapers/2022/ZLH07377v1.png?w=650';
  import ZLH07395Small from '$lib/assets/images/wallpapers/2022/ZLH07395.png?w=650';
  import ZLH07422Small from '$lib/assets/images/wallpapers/2022/ZLH07422.png?w=650';
  import ZLH07450v1Small from '$lib/assets/images/wallpapers/2022/ZLH07450v1.png?w=650';
  import ZLH07492Small from '$lib/assets/images/wallpapers/2022/ZLH07492.png?w=650';
  import ZLH07561Small from '$lib/assets/images/wallpapers/2022/ZLH07561.png?w=650';
  import ZLH07563Small from '$lib/assets/images/wallpapers/2022/ZLH07563.png?w=650';

  import ZLH03822Full from '$lib/assets/images/wallpapers/2022/ZLH03822.png';
  import ZLH03843Full from '$lib/assets/images/wallpapers/2022/ZLH03843.png';
  import ZLH03850Full from '$lib/assets/images/wallpapers/2022/ZLH03850.png';
  import ZLH04841Full from '$lib/assets/images/wallpapers/2022/ZLH04841.png';
  import ZLH04872Full from '$lib/assets/images/wallpapers/2022/ZLH04872.png';
  import ZLH06630Full from '$lib/assets/images/wallpapers/2022/ZLH06630.png';
  import ZLH07304v1Full from '$lib/assets/images/wallpapers/2022/ZLH07304v1.png';
  import ZLH07317v1Full from '$lib/assets/images/wallpapers/2022/ZLH07317v1.png';
  import ZLH07346Full from '$lib/assets/images/wallpapers/2022/ZLH07346.png';
  import ZLH07364v1Full from '$lib/assets/images/wallpapers/2022/ZLH07364v1.png';
  import ZLH07377v1Full from '$lib/assets/images/wallpapers/2022/ZLH07377v1.png';
  import ZLH07395Full from '$lib/assets/images/wallpapers/2022/ZLH07395.png';
  import ZLH07422Full from '$lib/assets/images/wallpapers/2022/ZLH07422.png';
  import ZLH07450v1Full from '$lib/assets/images/wallpapers/2022/ZLH07450v1.png';
  import ZLH07492Full from '$lib/assets/images/wallpapers/2022/ZLH07492.png';
  import ZLH07561Full from '$lib/assets/images/wallpapers/2022/ZLH07561.png';
  import ZLH07563Full from '$lib/assets/images/wallpapers/2022/ZLH07563.png';

  import WallpaperGallery from '$lib/components/WallpaperGallery.svelte';
</script>

<svelt:head>
  <title>2022 Wallpapers</title>
  <meta name="description" content="Wallpapers I made from photos I took in 2022." />
  <meta name="keywords" content="wallpapers, photos, 2022" />
</svelt:head>

<h1>2022 Wallpapers</h1>

<p>
  Here are some wallpapers I made from my 2022 photos. Thanks to the Field Museum's
  <a
    href="https://fieldguides.fieldmuseum.org/sites/default/files/rapid-color-guides-pdfs/593_usa_chicago_summer_birds.pdf"
    >"Common Summer Birds of Chicago" guide (PDF)</a
  > for helping me identify the birds in the photos.
</p>

<WallpaperGallery
  images={[
    [ZLH03822Small, ZLH03822Full, 'A snowy Chicago Alley near Foster and Ravenswood'],
    [ZLH03843Small, ZLH03843Full, 'Snow on a juniper bush'],
    [ZLH03850Small, ZLH03850Full, 'The intersection of Paulina and Catalpa, in the snow'],
    [ZLH04841Small, ZLH04841Full, 'Common grackles hunting for insects'],
    [ZLH04872Small, ZLH04872Full, 'Conifers against the sky'],
    [ZLH06630Small, ZLH06630Full, 'A view of navy pier from near the Shedd Aquarium'],
    [ZLH07304v1Small, ZLH07304v1Full, 'A northern cardinal (female)'],
    [ZLH07317v1Small, ZLH07317v1Full, 'A squirrel, eating'],
    [ZLH07346Small, ZLH07346Full, 'A black-capped chickadee at the Montrose Point Bird Sanctuary'],
    [ZLH07364v1Small, ZLH07364v1Full, 'A gull, just off Montrose Point'],
    [ZLH07377v1Small, ZLH07377v1Full, 'A leaning fence post at the Montrose Point Bird Sanctuary'],
    [ZLH07395Small, ZLH07395Full, 'A path at the Montrose Point Bird Sanctuary'],
    [ZLH07422Small, ZLH07422Full, 'A goldfinch bathing in a creek'],
    [ZLH07450v1Small, ZLH07450v1Full, 'A pair of finches (male and female) stopping for a drink'],
    [ZLH07492Small, ZLH07492Full, 'A house finch (male)'],
    [ZLH07561Small, ZLH07561Full, 'A section of the Skokie Lagoons, as seen from Erickson Woods'],
    [ZLH07563Small, ZLH07563Full, 'The Erickson Woods, seen from across a section of the lagoon']
  ]}
/>
