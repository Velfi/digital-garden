<script lang="ts">
  import FragmentPreview from './FragmentPreview.svelte';
  import type { FragmentStarter } from '$lib/programming/marimo/fragments';

  interface Props {
    fragments: FragmentStarter[];
    onChoose: (fragment: FragmentStarter) => void;
    /** Passed straight to the previews, which turn on their own otherwise. */
    reducedMotion?: boolean;
  }

  let { fragments, onChoose, reducedMotion = false }: Props = $props();

  let dialog = $state<HTMLDialogElement>();

  /**
   * Take a piece, having closed the dialog first.
   *
   * Closing rather than leaving the component to be unmounted is what hands
   * focus back to the page instead of dropping it on the document body.
   */
  function choose(fragment: FragmentStarter) {
    dialog?.close();
    onChoose(fragment);
  }

  /**
   * Dismissing without choosing takes the first one.
   *
   * There is no way to be here and not end up with a marimo, so a modal you
   * cannot escape would be a trap for no gain. Escape means "just give me one",
   * not "cancel".
   */
  function dismiss() {
    if (fragments.length > 0) choose(fragments[0]);
  }

  $effect(() => {
    // `showModal` is the whole reason this is a <dialog>: it puts the page
    // behind into the inert state and takes over the focus trap and Escape,
    // none of which a div with `aria-modal` on it actually does. It also lands
    // focus on the first focusable descendant, which here is the first
    // fragment's button — where this used to put it by hand.
    if (dialog && !dialog.open) dialog.showModal();
  });
</script>

<dialog
  class="overlay"
  bind:this={dialog}
  aria-labelledby="fragment-chooser-title"
  oncancel={(event) => {
    // Escape arrives as `cancel`. Taken over so it still means "just give me
    // one" rather than closing the chooser on nothing and leaving no marimo.
    event.preventDefault();
    dismiss();
  }}
  onclick={(event) => event.target === event.currentTarget && dismiss()}
>
  <div class="chooser">
    <h2 id="fragment-chooser-title">Start a marimo</h2>
    <p class="intro">
      Marimo are grown from fragments torn off a larger ball. Here are three: one that came away
      cleanly, one knocked about, one badly torn. They will all get there in the end &mdash; a lumpy
      one just wants more turning.
    </p>

    <ul class="options">
      {#each fragments as fragment (fragment.seed)}
        <li>
          <button type="button" onclick={() => choose(fragment)}>
            <FragmentPreview
              bias={fragment.bias}
              facets={fragment.facets}
              radiusMm={fragment.radiusMm}
              seed={fragment.seed}
              {reducedMotion}
            />
            <span class="label">{fragment.label}</span>
          </button>
        </li>
      {/each}
    </ul>

    <p class="footnote">Whichever you take is yours; the jar keeps it from here.</p>
  </div>
</dialog>

<style lang="scss">
  /*
   * The dialog element is the overlay rather than the panel: it fills the
   * viewport and centres the panel inside itself, so a click that lands on it
   * and not on the panel is a click outside. No z-index, because a dialog
   * opened with `showModal` is in the top layer and stacking contexts on the
   * page below cannot reach it.
   */
  .overlay {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 1rem;
    border: 0;
    background: transparent;

    /* The UA hides a closed dialog, and this must not undo that. */
    display: none;

    &[open] {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  /* The dim goes behind the whole top layer, which is why it is not on .overlay. */
  .overlay::backdrop {
    background: rgb(4 10 11 / 0.72);
  }

  .chooser {
    width: min(100%, 34rem);
    max-height: 90vh;
    max-height: 90dvh;
    overflow-y: auto;
    padding: 1.25rem;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: var(--bg-color);
    color: var(--text-color);

    h2 {
      margin: 0;
      font-size: 1.15rem;
    }
  }

  .intro {
    margin: 0.4rem 0 1rem;
    font-size: 0.88rem;
    line-height: 1.5;
    opacity: 0.85;
  }

  .options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;

    @media (max-width: 26rem) {
      grid-template-columns: minmax(0, 1fr);
    }

    button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      width: 100%;
      padding: 0.7rem 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 0.6rem;
      background: rgb(255 255 255 / 0.03);
      color: inherit;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        border-color: var(--link-color);
        background: rgb(255 255 255 / 0.07);
      }
    }
  }

  .label {
    font-size: 0.76rem;
    line-height: 1.35;
    text-align: center;
    opacity: 0.8;
  }

  .footnote {
    margin: 1rem 0 0;
    font-size: 0.76rem;
    line-height: 1.45;
    opacity: 0.6;
  }
</style>
