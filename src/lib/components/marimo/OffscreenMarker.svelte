<script lang="ts">
  import { mulberry32 } from '$lib/programming/marimo/rng';
  import { outlinePath, shapeOutline } from '$lib/programming/marimo/outline';
  import { shapeFrom } from '$lib/programming/marimo/facets';
  import type { OffscreenMarker } from '$lib/programming/marimo/offscreen';
  import type { MarimoState } from '$lib/programming/marimo/types';

  interface Props {
    marker: OffscreenMarker;
    state: MarimoState;
    /** Press: take hold of the marimo, and carry on as an ordinary drag. */
    onGrab: (event: PointerEvent) => void;
    /** Enter or space, which has no cursor for the marimo to come to. */
    onRecall: () => void;
  }

  let { marker, state, onGrab, onRecall }: Props = $props();

  // The embedded tank and the app can share a page, so the gradient needs an id
  // of its own — the same reason FragmentPreview takes one.
  const uid = $props.id();
  const shadeId = `offscreen-marker-shade-${uid}`;

  const SIZE = 96;
  const CENTRE = SIZE / 2;
  /**
   * Drawn the same size whatever the pet measures. This is a magnifier, not a
   * scale model — the whole point is that the real one is too far outside the
   * frame to judge, and a 6 mm fragment rendered to scale in here would be a dot.
   */
  const BODY_RADIUS = 34;
  const STRAND_COUNT = 110;
  const STRAND_LENGTH = 0.16;

  const points = $derived(shapeOutline(shapeFrom(state.bias, state.facets), 120));
  const bodyPath = $derived(outlinePath(points, CENTRE, CENTRE, BODY_RADIUS));

  /** The coat, as one path of radial ticks — the same trick FragmentPreview uses. */
  const coatPath = $derived.by(() => {
    // The pet's own seed, so the fuzz in here is the fuzz out there.
    const rand = mulberry32(state.seed);
    const segments: string[] = [];
    for (let i = 0; i < STRAND_COUNT; i++) {
      const point = points[Math.floor((i / STRAND_COUNT) * points.length)];
      const length = BODY_RADIUS * STRAND_LENGTH * (0.45 + rand() * 0.85);
      const lean = (rand() - 0.5) * 0.5;
      const dx = point.nx - point.ny * lean;
      const dy = point.ny + point.nx * lean;
      const x0 = CENTRE + point.x * BODY_RADIUS;
      const y0 = CENTRE + point.y * BODY_RADIUS;
      segments.push(
        `M${x0.toFixed(2)},${y0.toFixed(2)}l${(dx * length).toFixed(2)},${(dy * length).toFixed(2)}`
      );
    }
    return segments.join('');
  });

  /** Fully out of shot. Only then is it solid, and only then can it be clicked. */
  const gone = $derived(marker.hidden >= 1);

  // The layer is already inset by the marker's own reach, so clamped device
  // coordinates land the bubble flush inside the frame with nothing measured.
  const left = $derived((marker.ndcX * 0.5 + 0.5) * 100);
  const top = $derived((0.5 - marker.ndcY * 0.5) * 100);

  // Swelling out of nothing as it goes, so that by the time the last of the
  // marimo leaves the frame the thing that replaces it is already there.
  const opacity = $derived(0.15 + 0.85 * marker.hidden);
  const pop = $derived(0.7 + 0.3 * marker.hidden);
</script>

<div class="marker-layer">
  <div
    class="marker"
    class:gone
    style:left="{left}%"
    style:top="{top}%"
    style:--marker-opacity={opacity}
    style:--marker-pop={pop}
    style:--marker-angle="{marker.angleDeg}deg"
  >
    <div class="arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 4v16M5 11l7-7 7 7" />
      </svg>
    </div>

    <button
      type="button"
      onpointerdown={onGrab}
      onclick={(event) => {
        // A pointer press has already been handled on pointerdown, and comes
        // back through here afterwards with a detail of at least one. Zero is
        // the keyboard, which is the only case this branch is for.
        if (event.detail === 0) onRecall();
      }}
      title="Take hold of the marimo"
      tabindex={gone ? 0 : -1}
    >
      <span class="visually-hidden">Take hold of the marimo</span>
      <svg class="silhouette" viewBox="0 0 {SIZE} {SIZE}" aria-hidden="true" focusable="false">
        <path d={coatPath} stroke="#4e7c3a" stroke-width="1.6" stroke-linecap="round" fill="none" />
        <path d={bodyPath} fill="#3f6b2c" />
        <path d={bodyPath} fill="url(#{shadeId})" />
        <defs>
          <radialGradient id={shadeId} cx="0.36" cy="0.3" r="0.78">
            <stop offset="0" stop-color="#6f9a52" stop-opacity="0.55" />
            <stop offset="1" stop-color="#16301a" stop-opacity="0.5" />
          </radialGradient>
        </defs>
      </svg>
    </button>
  </div>
</div>

<style lang="scss">
  .marker-layer {
    position: absolute;
    /*
     * Inset by everything the marker sticks out by — half the bubble plus the
     * arrow beyond it. That is what lets the position be a plain percentage of
     * this box: device coordinates arrive already clamped to ±1, and ±1 then
     * lands the marker exactly flush inside the frame, with no element measured
     * and no layout read anywhere in the render loop.
     *
     * Half the bubble is 1.3rem; the arrow reaches another 1.14rem beyond that
     * at the far end of its stroke. Anything less and the arrowhead hangs off
     * the corner of the jar.
     */
    inset: 2.5rem;
    /* The canvas underneath captures pointers, and must keep getting them. */
    pointer-events: none;
  }

  .marker {
    position: absolute;
    width: 2.6rem;
    height: 2.6rem;
    /* Positioned every frame, so nothing here may transition. */
    transform: translate(-50%, -50%) scale(var(--marker-pop));
    opacity: var(--marker-opacity);
  }

  .arrow {
    position: absolute;
    inset: 0;
    /* Rotates about the bubble's centre, so the tail swings around it. */
    transform: rotate(var(--marker-angle));

    svg {
      position: absolute;
      left: 50%;
      top: 0;
      width: 0.95rem;
      height: 0.95rem;
      transform: translate(-50%, -80%);
      fill: none;
      stroke: #dcece6;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      filter: drop-shadow(0 0 0.15rem rgb(4 10 11 / 0.9));
    }
  }

  button {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 1px solid rgb(220 236 230 / 0.35);
    border-radius: 50%;
    background: rgb(4 10 11 / 0.72);
    color: #dcece6;
    overflow: hidden;
    /* Has to read against a lit cream room and an unlit near-black one alike. */
    box-shadow: 0 0 0 1px rgb(4 10 11 / 0.5);
    /*
     * Only clickable once the marimo is genuinely gone. A half-faded ghost that
     * swallowed a drag near the edge of the tank would be a real bug — the
     * viewport captures the pointer, and the drag it stole would be the one
     * trying to fish the marimo back out by hand.
     */
    pointer-events: none;
    cursor: grab;
  }

  .marker.gone button:active {
    cursor: grabbing;
  }

  .marker.gone button {
    pointer-events: auto;
  }

  button:hover,
  button:focus-visible {
    border-color: rgb(220 236 230 / 0.6);
  }

  .silhouette {
    display: block;
    width: 92%;
    height: 92%;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /*
   * A slow breath once it is fully out, which is the only state that lasts long
   * enough to read as one. Nothing moves during the fade-in — that is already
   * motion, and doubling it up just makes the edge of the frame busy.
   */
  .marker.gone .arrow svg {
    animation: reach 1.6s ease-in-out infinite;
  }

  @keyframes reach {
    0%,
    100% {
      transform: translate(-50%, -80%);
    }
    50% {
      transform: translate(-50%, -120%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .marker.gone .arrow svg {
      animation: none;
    }
  }
</style>
