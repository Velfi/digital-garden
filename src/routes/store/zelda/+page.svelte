<script lang="ts">
  import Product from '$lib/components/Store/Product.svelte';
  import ThumbnailGallery from '$lib/components/Store/ThumbnailGallery.svelte';
  import { productInfo as set1 } from './set1';
  import { productInfo as set2 } from './set2';
  import { productInfo as set6 } from './set6';
  import { productInfo as set7 } from './set7';

  interface ProductInfo {
    images: string[];
    name: string;
    purchaseLink: string;
    purchaseCta: string;
    purchaseContents: string;
    description: string;
  }

  // In dollars
  const STICKER_PACK_PRICE = 15;
  const PRODUCTS: ProductInfo[] = [set1, set2, set6, set7];
</script>

<svelte:head>
  <title>Zelda's Store</title>
  <meta
    name="description"
    content="Zelda's personal store. She sells stickers."
  />
  <meta name="keywords" content="zelda, store, stickers" />
</svelte:head>

<h1>Zelda's Store</h1>

<blockquote>
  <p>
    <strong>A note from Zelda:</strong> I kept things simple when coding this store up meaning you
    can only purchase stickers from one set per transaction (although you can adjust the quantity on
    the checkout page.) If you hate this, send an email to <strong>store</strong> <em>at</em>
    <strong>zeldas</strong> <em>dot</em> <strong>page</strong> and we'll figure something out.
  </p>
</blockquote>

<p>
  Thanks for checking out my personal store. I ship all stickers using USPS to anywhere in the US
  and they should take 1-2 weeks to arrive <strong
    >(shipping costs are included in the price.)</strong
  >
  I print, laminate, and cut the stickers myself. They may fade if left outside for a long time and the
  laminate may not protect against all liquids. The stickers are shown on my cutting mat which has a
  1-inch grid to give you an idea of the size. If you feel like I did you dirty at any point, send an
  email with your order info and your grievance to <strong>store</strong> <em>at</em>
  <strong>zeldas</strong> <em>dot</em> <strong>page</strong>.
</p>

<div>
  {#each PRODUCTS as { name, purchaseLink, purchaseCta, purchaseContents, images, description }}
    <Product {name} {purchaseLink} {purchaseCta} purchasePrice={STICKER_PACK_PRICE}>
      <ThumbnailGallery {images} />
      <p class="purchase-contents">Includes {purchaseContents}</p>
      {@html description}
    </Product>
  {/each}
</div>

<p><em>All designs copyright IF YOU KNOW, YOU KNOW L.L.C. 2023</em></p>

<style>
  .purchase-contents {
    font-size: 0.9rem;
    font-style: italic;
    margin-bottom: 0.3rem;
  }

  div {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: max-content;
    max-width: 45rem;
    margin: 0 auto;
  }

  @media screen and (max-width: 500px) {
    div {
      grid-template-columns: auto;
    }
  }
</style>
