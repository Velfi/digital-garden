<script lang="ts">
  import StonePreview from './StonePreview.svelte';
  import { FRAME_FILL } from '$lib/programming/marimo/stonePreview';
  import { STONE_MAX_IN_TANK } from '$lib/programming/marimo/constants';
  import {
    STONE_KINDS,
    STONE_SIZES,
    stoneDiameterMm,
    stoneKindById,
    type PlacedStone,
    type Stone,
    type StoneSize
  } from '$lib/programming/marimo/stones';

  /**
   * The box of stuff: a sheet of stickers you peel stones off.
   *
   * A tray rather than a modal, and that is the whole design. A modal dialog
   * puts the page behind it inert, which is exactly wrong here — the jar behind
   * is the drop target, and a sticker has to be draggable *into* it. So this
   * sits directly under the glass instead, close enough that a drag is a short
   * trip and outside the frame so that it covers no part of the jar. Inside the
   * frame was tried and is worse: the gravel is the bottom of the picture, and
   * a tray over it hides exactly what a visitor is aiming at.
   *
   * The drag itself is pointer events rather than HTML5 drag-and-drop. Native
   * dragging cannot follow a pointer smoothly, cannot be tilted, has no useful
   * touch story, and hands the drop a `dataTransfer` string when what is wanted
   * is a stone — none of which is worth the accessibility it would provide, and
   * it does not provide any, because the keyboard path here is a plain button
   * press on the same element.
   *
   * The three controls above the stickers are the three things about a rock a
   * visitor can actually have an opinion about. Colour and size are chosen;
   * shape is not, because there is no vocabulary for it that anyone would want
   * to use — so shape gets a reroll instead, which is the honest interface for
   * "not that one, another one".
   */

  interface Props {
    /** The four shapes currently on offer, all of the chosen rock and size. */
    sheet: Stone[];
    /** Which rock is selected. A `StoneKind` id. */
    kind: string;
    /** Which size is selected. */
    size: StoneSize;
    /** What is already in the jar, so it can be taken back out. */
    inTank: PlacedStone[];
    onKind: (kind: string) => void;
    onSize: (size: StoneSize) => void;
    /** Redraw all four shapes. */
    onReroll: () => void;
    /**
     * Let a stone go. `clientX`/`clientY` are where the pointer was; `radiusPx`
     * is how big the sticker's stone looked on screen at that moment, which is
     * where the pop starts from. A press with no pointer passes null.
     */
    onPlace: (stone: Stone, clientX: number, clientY: number, radiusPx: number | null) => boolean;
    onRemove: (id: number) => void;
    onClose: () => void;
    /** Whether a drop at this point would land in the water. */
    isOverTank: (clientX: number, clientY: number) => boolean;
    reducedMotion?: boolean;
  }

  let {
    sheet,
    kind,
    size,
    inTank,
    onKind,
    onSize,
    onReroll,
    onPlace,
    onRemove,
    onClose,
    isOverTank,
    reducedMotion = false
  }: Props = $props();

  /** How wide a sticker's picture is drawn, CSS pixels. Mirrored in the styles. */
  const STICKER_PX = 78;
  /** The one in hand is lifted off the paper and reads a little larger. */
  const HELD_PX = 96;

  /** The sticker being dragged, if any. */
  let held = $state<{ stone: Stone; x: number; y: number; tilt: number } | null>(null);
  let heldOverTank = $state(false);
  let tray = $state<HTMLElement>();
  let pointerId = -1;
  let lastX = 0;
  /** How far the pointer has travelled since the press, in CSS pixels. */
  let travelled = 0;

  /** Under this, a press and release is a tap and the stone goes in anyway. */
  const TAP_SLOP_PX = 6;

  const full = $derived(inTank.length >= STONE_MAX_IN_TANK);
  const chosen = $derived(stoneKindById(kind) ?? STONE_KINDS[0]);

  /** `#rrggbb` for a kind's body colour, for the swatch. */
  function swatch(colour: number): string {
    return `#${colour.toString(16).padStart(6, '0')}`;
  }

  /**
   * Whether letting go here would drop the stone in the water.
   *
   * The tray is inside the tank's frame, so "over the tank" is not the same
   * question as "inside the viewport" — the paper is in the way, and a sticker
   * let go over its own sheet has not been dropped anywhere. Cut the tray out
   * of the target rather than moving it out of the frame, because being right
   * next to the water is the point of a tray.
   */
  function overWater(clientX: number, clientY: number): boolean {
    if (!isOverTank(clientX, clientY)) return false;
    const rect = tray?.getBoundingClientRect();
    if (!rect) return true;
    return (
      clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom
    );
  }

  /**
   * The stone's radius on screen inside a sticker of `size` pixels.
   *
   * The preview rig frames every stone to the same fraction of its box, which
   * is what makes this knowable without measuring anything: the picture is
   * `FRAME_FILL` of the box across, so the stone's radius is half of that.
   */
  function stoneRadiusPx(size: number): number {
    return (size * FRAME_FILL) / 2;
  }

  function startDrag(event: PointerEvent, stone: Stone) {
    if (full) return;
    // Only the primary button drags; a right-click on the sheet is a right-click.
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointerId = event.pointerId;
    lastX = event.clientX;
    travelled = 0;
    held = { stone, x: event.clientX, y: event.clientY, tilt: 0 };
    heldOverTank = overWater(event.clientX, event.clientY);
  }

  function moveDrag(event: PointerEvent) {
    if (!held || event.pointerId !== pointerId) return;
    // Lean into the direction of travel, the way a card held between two fingers
    // does. Clamped, and decayed toward upright when the pointer stops.
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    travelled += Math.abs(dx) + Math.abs(event.clientY - held.y);
    const tilt = Math.max(-14, Math.min(14, held.tilt * 0.7 + dx * 0.9));
    held = { stone: held.stone, x: event.clientX, y: event.clientY, tilt };
    heldOverTank = overWater(event.clientX, event.clientY);
  }

  function endDrag(event: PointerEvent) {
    if (!held || event.pointerId !== pointerId) return;
    const dropped = held;
    const tapped = travelled < TAP_SLOP_PX;
    held = null;
    pointerId = -1;

    if (overWater(event.clientX, event.clientY)) {
      onPlace(dropped.stone, event.clientX, event.clientY, stoneRadiusPx(HELD_PX));
      return;
    }

    // A press that went nowhere is a tap, and a tap on a sticker means "put this
    // one in" — over the middle of the jar, since nothing was aimed at.
    if (tapped) {
      onPlace(dropped.stone, 0, 0, stoneRadiusPx(STICKER_PX));
      return;
    }

    // Anywhere else is a change of mind. Nothing is placed and nothing is said
    // about it: the sticker is back on the sheet, which is where it was all
    // along — the one on the paper never went anywhere, it only went pale.
  }

  function cancelDrag() {
    held = null;
    pointerId = -1;
  }

  /**
   * The keyboard path. There is no pointer, so there is no aim: the stone goes
   * in over the middle of the jar. It still falls, still splashes and still
   * pops — the sticker it came from is on screen at a known size, and that is
   * all the pop needs.
   *
   * A click with a positive `detail` came from a pointer, and the pointer path
   * has already dealt with it — as a drop if it landed in the water, as a tap
   * if it went nowhere. Acting on it here as well would place two stones.
   */
  function place(stone: Stone, event: MouseEvent) {
    if (event.detail > 0) return;
    onPlace(stone, 0, 0, stoneRadiusPx(STICKER_PX));
  }

  /**
   * Whether this is the sticker currently in hand.
   *
   * By kind and seed rather than by object identity: `held` is reactive state,
   * so what it holds is a proxy of the stone and never `===` the plain object
   * the sheet is iterating. Two stones with the same kind and seed are the same
   * stone anyway — that is the whole premise of `makeStone`.
   */
  function isHeld(stone: Stone): boolean {
    return held?.stone.kind === stone.kind && held?.stone.seed === stone.seed;
  }

  /**
   * What goes under a sticker.
   *
   * Only the size. The name is above the row, where it belongs now that all
   * four stickers are the same rock — repeating it four times would be four
   * chances to read the same word and none to tell the shapes apart.
   */
  function caption(stone: Stone): string {
    return `${stoneDiameterMm(stone).toFixed(0)} mm`;
  }
</script>

<svelte:window
  onpointermove={moveDrag}
  onpointerup={endDrag}
  onpointercancel={cancelDrag}
  onblur={cancelDrag}
/>

<section class="box" class:reduced={reducedMotion} aria-label="Box of stuff" bind:this={tray}>
  <header>
    <h2>Box of stuff</h2>
    <p class="hint">
      {#if full}
        The jar holds {STONE_MAX_IN_TANK}. Take one out first.
      {:else}
        Peel one off and drop it in the water.
      {/if}
    </p>
    <button type="button" class="close" onclick={onClose} title="Close the box">
      <span class="visually-hidden">Close the box</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </header>

  <div class="controls">
    <fieldset class="colours">
      <legend>Rock</legend>
      {#each STONE_KINDS as option (option.id)}
        <button
          type="button"
          class="swatch"
          class:chosen={option.id === kind}
          style:--swatch={swatch(option.colour)}
          style:--swatch-vein={swatch(option.vein)}
          aria-pressed={option.id === kind}
          title={option.name}
          onclick={() => onKind(option.id)}
        >
          <span class="visually-hidden">{option.name}</span>
        </button>
      {/each}
    </fieldset>

    <fieldset class="sizes">
      <legend>Size</legend>
      {#each STONE_SIZES as option (option.id)}
        <button
          type="button"
          class="size"
          class:chosen={option.id === size}
          aria-pressed={option.id === size}
          onclick={() => onSize(option.id)}
        >
          {option.label}
        </button>
      {/each}
    </fieldset>

    <button type="button" class="reroll" onclick={onReroll} title="Draw four more">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 5v6h-6" />
      </svg>
      Reroll
    </button>
  </div>

  <p class="chosen-name">{chosen.name}</p>

  <ul class="sheet">
    <!--
      Keyed by the slot, not the stone. Four stickers of one rock share a kind
      and the sheet is redrawn under them constantly — but slot two is always
      slot two, so the canvas and its preview entry survive a reroll and simply
      repaint instead of being torn down and rebuilt.
    -->
    {#each sheet as stone, index (index)}
      <li>
        <button
          type="button"
          class="sticker"
          class:lifted={isHeld(stone)}
          style:--tilt="{((index % 3) - 1) * 2.4}deg"
          disabled={full}
          onpointerdown={(event) => startDrag(event, stone)}
          onclick={(event) => place(stone, event)}
        >
          <span class="die-cut">
            <StonePreview {stone} />
          </span>
          <span class="label">{caption(stone)}</span>
        </button>
      </li>
    {/each}
  </ul>

  {#if inTank.length > 0}
    <div class="tank-list">
      <span class="tank-label">In the jar</span>
      <ul>
        {#each inTank as placed (placed.id)}
          <li>
            <button
              type="button"
              class="chip"
              onclick={() => onRemove(placed.id)}
              title="Take it out"
            >
              <span class="chip-swatch">
                <StonePreview stone={placed.stone} />
              </span>
              <span>{stoneKindById(placed.stone.kind)?.name ?? 'Stone'}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<!--
  The sticker in hand. Fixed to the viewport and outside the tray's own stacking
  context, so it can be carried over the glass rather than clipped at the edge
  of the paper it came from.
-->
{#if held}
  <div
    class="held"
    class:over={heldOverTank}
    style:left="{held.x}px"
    style:top="{held.y}px"
    style:--tilt="{held.tilt}deg"
    style:--held-size="{HELD_PX}px"
    aria-hidden="true"
  >
    <span class="die-cut">
      <StonePreview stone={held.stone} />
    </span>
  </div>
{/if}

<style lang="scss">
  .box {
    padding: 0.6rem 0.7rem 0.7rem;
    border-radius: 0.6rem;
    /*
     * Backing paper. Warm off-white with a faint halftone, because a sticker
     * sheet is a printed object and printed white is never the screen's white.
     */
    background-color: #f2ede2;
    background-image:
      radial-gradient(circle at 30% 20%, rgb(255 255 255 / 0.9), transparent 60%),
      repeating-linear-gradient(45deg, rgb(0 0 0 / 0.028) 0 2px, transparent 2px 5px);
    color: #2a2721;
    box-shadow:
      0 -0.15rem 0 rgb(0 0 0 / 0.06) inset,
      0 1rem 2rem rgb(0 0 0 / 0.45);
    animation: slide-up 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }

  .box.reduced {
    animation: none;
  }

  @keyframes slide-up {
    from {
      transform: translateY(0.8rem);
      opacity: 0;
    }
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.5rem;

    h2 {
      margin: 0;
      font-size: 0.85rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
  }

  .hint {
    flex: 1;
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.65;
  }

  .close {
    display: grid;
    place-items: center;
    width: 1.3rem;
    height: 1.3rem;
    padding: 0;
    border: 0;
    border-radius: 0.25rem;
    background: rgb(0 0 0 / 0.06);
    color: inherit;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: rgb(0 0 0 / 0.14);
    }

    svg {
      width: 0.8rem;
      height: 0.8rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
    }
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-bottom: 0.45rem;
  }

  fieldset {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    border: 0;

    legend {
      /*
       * Floated rather than laid out: a legend is a box of its own in the
       * normal flow and will not sit on the same line as its own controls,
       * which is the one thing wanted here.
       */
      float: left;
      margin-right: 0.4rem;
      padding: 0;
      font-size: 0.6rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.5;
    }
  }

  .swatch {
    width: 1.15rem;
    height: 1.15rem;
    padding: 0;
    border: 1px solid rgb(0 0 0 / 0.2);
    border-radius: 50%;
    /* The vein colour shows as a sliver, so two rocks of a colour still differ. */
    background: linear-gradient(135deg, var(--swatch) 58%, var(--swatch-vein) 58%);
    cursor: pointer;
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease;

    &:hover,
    &:focus-visible {
      transform: scale(1.15);
    }
  }

  .swatch.chosen {
    /* A ring outside the swatch, so the colour itself is never overpainted. */
    box-shadow:
      0 0 0 0.09rem #f2ede2,
      0 0 0 0.17rem #2a2721;
  }

  .size {
    padding: 0.12rem 0.4rem;
    border: 1px solid rgb(0 0 0 / 0.16);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.5);
    color: inherit;
    font-size: 0.66rem;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: rgb(0 0 0 / 0.4);
    }
  }

  .size.chosen {
    background: #2a2721;
    border-color: #2a2721;
    color: #f2ede2;
  }

  .reroll {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: auto;
    padding: 0.14rem 0.45rem;
    border: 1px solid rgb(0 0 0 / 0.16);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.5);
    color: inherit;
    font-size: 0.66rem;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: rgb(0 0 0 / 0.4);
    }

    svg {
      width: 0.75rem;
      height: 0.75rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }

  .chosen-name {
    margin: 0 0 0.35rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .sheet {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(4.6rem, 1fr));
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sticker {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    width: 100%;
    padding: 0.15rem;
    border: 0;
    background: none;
    color: inherit;
    cursor: grab;
    touch-action: none;
    transform: rotate(var(--tilt));
    transition:
      transform 0.16s ease,
      filter 0.16s ease;

    &:hover:not(:disabled),
    &:focus-visible {
      transform: rotate(0deg) translateY(-0.12rem) scale(1.06);
      filter: drop-shadow(0 0.25rem 0.35rem rgb(0 0 0 / 0.35));
    }

    &:disabled {
      cursor: default;
      opacity: 0.4;
    }
  }

  /* The sticker itself: the picture, inside a white die-cut border. */
  .die-cut {
    display: block;
    width: 100%;
    padding: 0.16rem;
    border-radius: 50%;
    background: #fbfaf6;
    /*
     * A die-cut sticker's border is not a ring drawn round it — it is the paper
     * showing past the edge of the print, so it follows the shape and picks up
     * the same light. A drop shadow off the white disc is the closest thing a
     * round picture can get to that without an alpha silhouette.
     */
    box-shadow:
      0 0.08rem 0.18rem rgb(0 0 0 / 0.28),
      0 0 0 0.04rem rgb(0 0 0 / 0.06);
  }

  .sticker.lifted {
    /* It is in hand; what is left on the paper is the space it came out of. */
    opacity: 0.25;
    filter: none;
  }

  .label {
    font-size: 0.58rem;
    line-height: 1.15;
    text-align: center;
    opacity: 0.72;
  }

  .tank-list {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.55rem;
    padding-top: 0.45rem;
    border-top: 1px dashed rgb(0 0 0 / 0.18);

    ul {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
  }

  .tank-label {
    flex: none;
    font-size: 0.62rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    opacity: 0.55;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.22rem;
    padding: 0.1rem 0.3rem 0.1rem 0.1rem;
    border: 1px solid rgb(0 0 0 / 0.12);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.6);
    color: inherit;
    font-size: 0.62rem;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: #fff;
      border-color: rgb(0 0 0 / 0.3);
    }

    svg {
      width: 0.6rem;
      height: 0.6rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 3;
      stroke-linecap: round;
      opacity: 0.5;
    }
  }

  .chip-swatch {
    display: block;
    width: 1.1rem;
    border-radius: 50%;
    background: #fbfaf6;
  }

  .held {
    position: fixed;
    z-index: 30;
    width: var(--held-size);
    /* Centred under the pointer, lifted a little so the fingers are not on it. */
    transform: translate(-50%, -58%) rotate(var(--tilt)) scale(1.04);
    pointer-events: none;
    filter: drop-shadow(0 0.6rem 0.7rem rgb(0 0 0 / 0.5));
    transition: filter 0.15s ease;
  }

  .held.over {
    /* Over the water: it is about to become a stone, and it knows. */
    filter: drop-shadow(0 0.3rem 0.5rem rgb(0 0 0 / 0.5))
      drop-shadow(0 0 0.6rem rgb(150 220 255 / 0.55));
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
</style>
