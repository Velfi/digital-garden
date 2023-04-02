<script lang="ts">
  export let purchaseLink: string;
  export let purchaseCta: string;
  export let purchasePrice: number;
</script>

<a class="link-button" href={purchaseLink}>
  {purchaseCta} (${purchasePrice})
</a>

<style>
  a.link-button {
    padding: 1.4em 2em;
    cursor: pointer;
    background-color: #ffe8c3;
    border-color: #ffe8c3;
    border-radius: 3px;
    border: 1px solid;
    color: #253131;
    font-size: inherit;
    display: block;
    text-align: center;
    margin-bottom: 0.2rem;
    line-height: 1;
  }

  a.link-button:hover {
    text-decoration: inherit;
    color: #253131;
    background-color: #85ffb5;
  }

  a.link-button:active {
    background-color: #73c0a0;
  }

  :global(body.light-mode) a.link-button {
    color: #ffedcf;
    background-color: #253131;
  }

  :global(body.light-mode) a.link-button:hover {
    background-color: #0b834b;
  }

  :global(body.light-mode) a.link-button:active {
    background-color: #315746;
  }
</style>
