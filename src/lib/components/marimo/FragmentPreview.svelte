<script lang="ts">
  import { untrack } from 'svelte';
  import FragmentPreviewFlat from './FragmentPreviewFlat.svelte';
  import type { Facet } from '$lib/programming/marimo/facets';
  import {
    attachFragmentPreview,
    type FragmentPreviewHandle,
    type PreviewSubject
  } from '$lib/programming/marimo/previewScene';

  /**
   * One fragment on the chooser, drawn as the thing itself: the real surface
   * field, contoured like a map so the lumps and the torn face read at 96 px.
   * It turns slowly, because a still picture of a ball is the one view that
   * cannot say whether the far side is round.
   *
   * All three share a single WebGL context; see `previewScene.ts`. Where there
   * is none to be had, the flat drawing stands in.
   */

  interface Props {
    bias: number[];
    facets: Facet[];
    radiusMm: number;
    seed: number;
    /** Hold it still. The chooser passes the tank's resolved motion setting. */
    reducedMotion?: boolean;
  }

  let { bias, facets, radiusMm, seed, reducedMotion = false }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let flat = $state(false);
  let handle: FragmentPreviewHandle | null = null;

  const subject = $derived<PreviewSubject>({ seed, radiusMm, bias, facets });

  // Attach once per canvas. The subject is read untracked so that changing the
  // piece on offer cannot tear the context down and build it again — the second
  // effect hands the new one over instead.
  $effect(() => {
    const element = canvas;
    if (!element) return;

    const attached = untrack(() =>
      attachFragmentPreview(element, subject, { spin: !reducedMotion })
    );
    if (!attached) {
      flat = true;
      return;
    }

    handle = attached;
    return () => {
      handle = null;
      attached.dispose();
    };
  });

  $effect(() => {
    handle?.update(subject, { spin: !reducedMotion });
  });
</script>

{#if flat}
  <FragmentPreviewFlat {bias} {facets} {radiusMm} {seed} />
{:else}
  <!-- The label under it already says what it is; this is the picture. -->
  <canvas class="preview" bind:this={canvas} aria-hidden="true"></canvas>
{/if}

<style>
  .preview {
    display: block;
    width: 100%;
    aspect-ratio: 1;
  }
</style>
