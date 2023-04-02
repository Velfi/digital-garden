<script lang="ts">
  import BuyButton from './BuyButton.svelte';

  export let name: string;
  export let purchaseLink: string;
  export let purchaseCta: string;
  export let purchasePrice: number;
</script>

<div>
  <p class="name">{name}</p>
  <BuyButton {purchaseCta} {purchaseLink} {purchasePrice} />
  <slot />
</div>

<style>
  .name {
    font-size: 1.3em;
    font-weight: bold;
    text-align: center;
    transform: perspective(60px) rotateX(15deg) scaleY(140%);
  }
</style>
