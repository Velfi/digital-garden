<script lang="ts">
  import { mulberry32 } from '$lib/programming/marimo/rng';
  import { outlinePath, shapeOutline } from '$lib/programming/marimo/outline';
  import { shapeFrom, type Facet } from '$lib/programming/marimo/facets';
  import {
    FRAGMENT_MAX_RADIUS_MM,
    FRAGMENT_MIN_RADIUS_MM
  } from '$lib/programming/marimo/constants';

  /**
   * The fragment as a flat drawing: one slice through the shape, with a coat of
   * radial ticks.
   *
   * This is the fallback. `FragmentPreview` renders the real ball and only falls
   * back here when there is no WebGL context to be had — a chooser that showed
   * nothing would be a dead end, since it is the only way to get a marimo at
   * all. It reads the same shape field the shader does, so what it draws is the
   * actual silhouette rather than an impression of one.
   */

  interface Props {
    bias: number[];
    facets: Facet[];
    radiusMm: number;
    seed: number;
  }

  let { bias, facets, radiusMm, seed }: Props = $props();

  // Three of these share a page, so the gradient needs an id of its own.
  const uid = $props.id();
  const shadeId = `fragment-shade-${uid}`;

  const SIZE = 96;
  const CENTRE = SIZE / 2;
  /** Leaves room for the coat, which sticks out past the body. */
  const MAX_BODY_RADIUS = 32;
  const STRAND_COUNT = 130;
  const STRAND_LENGTH = 0.16;

  // The smallest fragment is drawn noticeably smaller than the largest, so the
  // three options are comparable at a glance, but not to true scale — a 6 mm
  // piece rendered against a 13 mm one at true scale is a dot.
  const drawnRadius = $derived.by(() => {
    const span = FRAGMENT_MAX_RADIUS_MM - FRAGMENT_MIN_RADIUS_MM;
    const t = span > 0 ? (radiusMm - FRAGMENT_MIN_RADIUS_MM) / span : 1;
    return MAX_BODY_RADIUS * (0.66 + 0.34 * Math.min(1, Math.max(0, t)));
  });

  const points = $derived(shapeOutline(shapeFrom(bias, facets), 120));
  const bodyPath = $derived(outlinePath(points, CENTRE, CENTRE, drawnRadius));

  /**
   * The filament coat, as one path of radial ticks.
   *
   * Seeded from the fragment's own seed so the piece you were shown is the piece
   * you get — the tank builds its strand jitter from the same number.
   */
  const coatPath = $derived.by(() => {
    const rand = mulberry32(seed);
    const segments: string[] = [];
    for (let i = 0; i < STRAND_COUNT; i++) {
      const point = points[Math.floor((i / STRAND_COUNT) * points.length)];
      const length = drawnRadius * STRAND_LENGTH * (0.45 + rand() * 0.85);
      // Lean each strand off pure radial, the way the shader does.
      const lean = (rand() - 0.5) * 0.5;
      const dx = point.nx - point.ny * lean;
      const dy = point.ny + point.nx * lean;

      const x0 = CENTRE + point.x * drawnRadius;
      const y0 = CENTRE + point.y * drawnRadius;
      segments.push(
        `M${x0.toFixed(2)},${y0.toFixed(2)}l${(dx * length).toFixed(2)},${(dy * length).toFixed(2)}`
      );
    }
    return segments.join('');
  });
</script>

<svg class="preview" viewBox="0 0 {SIZE} {SIZE}" role="presentation" aria-hidden="true">
  <path d={coatPath} stroke="#4e7c3a" stroke-width="0.9" stroke-linecap="round" fill="none" />
  <path d={bodyPath} fill="#3f6b2c" />
  <path d={bodyPath} fill="url(#{shadeId})" />
  <defs>
    <radialGradient id={shadeId} cx="0.36" cy="0.3" r="0.78">
      <stop offset="0" stop-color="#6f9a52" stop-opacity="0.55" />
      <stop offset="1" stop-color="#16301a" stop-opacity="0.5" />
    </radialGradient>
  </defs>
</svg>

<style>
  .preview {
    display: block;
    width: 100%;
    height: auto;
  }
</style>
