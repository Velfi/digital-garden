<script lang="ts">
  // The breeder's order slip — onboarding for a first arrival. Shown once,
  // over the tank, until a breed is chosen; the choice is stamped into the
  // pet itself (see `breeds.ts` vs the repaintable colourway in settings).
  import { BREEDS, randomBreed, type BreedId } from '$lib/programming/slime/breeds';

  interface Props {
    onChoose: (id: BreedId) => void;
  }

  let { onChoose }: Props = $props();
</script>

<div class="backdrop" role="presentation">
  <div class="slip" role="dialog" aria-modal="true" aria-label="Order your slime">
    <p class="stamp">✎ Order form</p>
    <h2>One slime, to order</h2>
    <p class="hint">
      Every slime ships as a dormant crust, so you won't see the colour until it wakes — the
      breeder asks now. Pick a breed, or leave the box unticked and be surprised.
    </p>

    <div class="breeds">
      {#each BREEDS as breed (breed.id)}
        <button type="button" class="breed" onclick={() => onChoose(breed.id)}>
          <span class="swatch" style:background={breed.swatch} aria-hidden="true"></span>
          <span class="text">
            {breed.label}
            <small>{breed.hint}</small>
          </span>
        </button>
      {/each}
    </div>

    <button type="button" class="surprise" onclick={() => onChoose(randomBreed().id)}>
      Surprise me — breeder's choice
    </button>

    <p class="hint footnote">
      The breeder keeps whispering about exotic strains — stripes, colours that pour into one
      another — but won't ship those yet.
    </p>
  </div>
</div>

<style lang="scss">
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.45);
  }

  /* The arrival note's paper, at desk size. */
  .slip {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    width: min(22rem, calc(100vw - 2rem));
    max-height: min(85dvh, calc(100dvh - 2rem));
    padding: 1.1rem 1.2rem 1.2rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 0.5rem;
    background: #f2ecd9;
    color: #3a3327;
    box-shadow: 0 0.6rem 1.8rem rgb(0 0 0 / 0.4);
    transform: rotate(-0.6deg);
  }

  .stamp {
    margin: 0;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .hint {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    opacity: 0.75;
  }

  .footnote {
    font-style: italic;
    opacity: 0.6;
  }

  .breeds {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .breed {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgb(58 51 39 / 0.25);
    border-radius: 0.45rem;
    background: rgb(255 255 255 / 0.35);
    color: inherit;
    text-align: left;
    font-size: 0.85rem;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: rgb(58 51 39 / 0.7);
      background: rgb(255 255 255 / 0.6);
    }

    .text {
      display: flex;
      flex-direction: column;
    }

    small {
      font-size: 0.72rem;
      opacity: 0.65;
    }
  }

  .swatch {
    flex: 0 0 auto;
    width: 1.15rem;
    height: 1.15rem;
    border: 1px solid rgb(58 51 39 / 0.3);
    border-radius: 50%;
  }

  .surprise {
    padding: 0.5rem 0.7rem;
    border: 1px dashed rgb(58 51 39 / 0.45);
    border-radius: 0.45rem;
    background: none;
    color: inherit;
    font-size: 0.82rem;
    font-style: italic;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: rgb(58 51 39 / 0.85);
      background: rgb(255 255 255 / 0.4);
    }
  }
</style>
