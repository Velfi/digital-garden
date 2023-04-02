<div class="grid">
  <slot />
</div>

<style>
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: max-content;
    margin: 1rem 0;
  }

  @media screen and (max-width: 500px) {
    .grid {
      grid-template-columns: auto;
    }
  }
</style>
