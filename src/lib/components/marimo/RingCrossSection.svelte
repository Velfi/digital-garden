<script lang="ts">
  import type { RingRecord } from '$lib/programming/marimo/types';

  interface Props {
    rings: RingRecord[];
    radiusMm: number;
    vigor: number;
  }

  let { rings, radiusMm, vigor }: Props = $props();

  const SIZE = 120;
  const CENTRE = SIZE / 2;
  const MARGIN = 4;

  /** Ring colour: deep green when it formed in good health, pale brown when not. */
  function ringColour(v: number): string {
    const good = [0x3f, 0x6b, 0x2c];
    const bad = [0xa2, 0x8d, 0x5a];
    const c = good.map((g, i) => Math.round(bad[i] + (g - bad[i]) * v));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  const scale = $derived((CENTRE - MARGIN) / Math.max(radiusMm, 1));
  const outer = $derived(Math.max(radiusMm, 1) * scale);

  // Drawn outermost first so the inner rings paint on top of the outer ones.
  const drawn = $derived(
    [...rings]
      .sort((a, b) => b.r - a.r)
      .map((ring) => ({ r: ring.r * scale, fill: ringColour(ring.v) }))
  );
</script>

<svg
  class="cross-section"
  viewBox="0 0 {SIZE} {SIZE}"
  role="img"
  aria-label="Cross-section showing {rings.length} growth rings"
>
  <circle cx={CENTRE} cy={CENTRE} r={outer} fill={ringColour(vigor)} />
  {#each drawn as ring, i (i)}
    <circle cx={CENTRE} cy={CENTRE} r={ring.r} fill={ring.fill} />
  {/each}
  <circle
    cx={CENTRE}
    cy={CENTRE}
    r={outer}
    fill="none"
    stroke="var(--border-color)"
    stroke-width="1"
    opacity="0.6"
  />
</svg>

<style>
  .cross-section {
    display: block;
    width: 100%;
    max-width: 9rem;
    height: auto;
    margin: 0 auto;
  }
</style>
