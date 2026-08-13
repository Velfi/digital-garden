<script lang="ts">
  import { untrack } from 'svelte';
  import {
    attachStonePreview,
    type StonePreviewHandle
  } from '$lib/programming/marimo/stonePreview';
  import { stoneKindById, stoneSurface, type Stone } from '$lib/programming/marimo/stones';

  /**
   * The picture on a sticker: the stone itself, rendered by the same material
   * the jar draws it with, so the sticker is not an illustration of the stone
   * but a photograph of it. See `stonePreview.ts` for the shared context.
   *
   * Where there is no WebGL, the outline stands in. It is traced off the same
   * surface function rather than drawn by hand, so even the fallback is the
   * shape of the stone you would get — just flat, and without the wet look.
   */

  interface Props {
    stone: Stone;
  }

  let { stone }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let flat = $state(false);
  let handle: StonePreviewHandle | null = null;

  $effect(() => {
    const element = canvas;
    if (!element) return;

    const attached = untrack(() => attachStonePreview(element, stone));
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
    handle?.update(stone);
  });

  /** The stone's outline seen from above, as an SVG path in a 100-unit box. */
  const outline = $derived.by(() => {
    const point: [number, number, number] = [0, 0, 0];
    const steps = 48;
    // Scaled off the widest the shape gets, so every fallback fills its box.
    let reach = 0;
    const points: [number, number][] = [];
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      stoneSurface(stone, Math.cos(angle), 0, Math.sin(angle), point);
      reach = Math.max(reach, Math.hypot(point[0], point[2]));
      points.push([point[0], point[2]]);
    }
    const scale = reach > 0 ? 44 / reach : 1;
    return (
      points
        .map(
          ([x, z], i) =>
            `${i === 0 ? 'M' : 'L'}${(50 + x * scale).toFixed(2)} ${(50 + z * scale).toFixed(2)}`
        )
        .join(' ') + ' Z'
    );
  });

  const kind = $derived(stoneKindById(stone.kind));
</script>

{#if flat}
  <svg class="preview" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <path
      d={outline}
      fill={`#${(kind?.colour ?? 0x777777).toString(16).padStart(6, '0')}`}
      stroke={`#${(kind?.vein ?? 0x999999).toString(16).padStart(6, '0')}`}
      stroke-width="1.5"
    />
  </svg>
{:else}
  <canvas class="preview" bind:this={canvas} aria-hidden="true"></canvas>
{/if}

<style>
  .preview {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    /* The die-cut border is drawn by the sheet; this is only the picture. */
    pointer-events: none;
  }
</style>
