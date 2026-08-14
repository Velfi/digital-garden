<script lang="ts">
  import type { SlimeTool } from '$lib/programming/slime/slimeScene';

  interface Props {
    tool: SlimeTool;
    /** Some pane could use a squeegee — puts a nudge dot on the drawer. */
    grimy: boolean;
    /** Awake and hungry enough that the oats are worth offering. */
    canFeed: boolean;
    /** A flake is already out — falling, luring, being eaten, or moldering. */
    feeding: boolean;
    /** The flake out there went moldy and wants clicking away. */
    moldy: boolean;
    /** Still a crust: no mouth, no oats. */
    dormant: boolean;
    /** Awake and not yet at full pearl — mica flakes would take. */
    canSparkle: boolean;
    /** The play ball is already out in the tank. */
    ballOut: boolean;
    onSelect: (tool: SlimeTool) => void;
    /** Toss the ball in / put it away — a toggle, not a held tool. */
    onToggleBall: () => void;
  }

  let {
    tool,
    grimy,
    canFeed,
    feeding,
    moldy,
    dormant,
    canSparkle,
    ballOut,
    onSelect,
    onToggleBall
  }: Props = $props();
  let open = $state(false);

  const oatsDisabled = $derived(!canFeed || feeding);
  const oatsTitle = $derived(
    moldy
      ? 'The oat is moldy — click it to remove it'
      : feeding
        ? 'A flake is already out'
        : canFeed
          ? 'Drop flakes where you click'
          : 'Not hungry right now'
  );

  const micaTitle = $derived(
    canSparkle ? 'Sprinkle mica flakes where you click' : 'Fully sparkly — no more mica will take'
  );

  const ballTitle = $derived(
    ballOut
      ? 'Put the ball away — or click it in the tank to bounce it'
      : 'Toss a ball in for it to play with'
  );

  function choose(next: SlimeTool) {
    onSelect(next);
    open = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) open = false;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="tool-drawer" class:open>
  <button
    type="button"
    class="tab"
    title="Tool drawer"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="visually-hidden">Tool drawer</span>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="9" width="18" height="11" rx="1.5" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
      <path d="M3 14h18" />
      <path d="M10.5 14v2.2h3V14" />
    </svg>
    {#if grimy && tool !== 'squeegee'}
      <span class="nudge" title="The glass could use a wipe"></span>
    {/if}
  </button>

  {#if open}
    <div class="tray" role="group" aria-label="Tools">
      <button
        type="button"
        class:active={tool === 'hand'}
        aria-pressed={tool === 'hand'}
        onclick={() => choose('hand')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V12m0-3a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.7-2.3L5 15.8a1.7 1.7 0 0 1 2.6-2.2L8 14"
          />
        </svg>
        Hand
      </button>
      {#if !dormant}
        <button
          type="button"
          class:active={tool === 'pet'}
          aria-pressed={tool === 'pet'}
          title="Stroke it gently — it loves this"
          onclick={() => choose('pet')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <!-- A hand smoothing over a small mound, a heart floating up. -->
            <path d="M4 18c2.5-3.2 6-5 9-5" />
            <path d="M13 13c2.6 0 5.4 1.6 7 5" />
            <path d="M4 20h16" />
            <path
              d="M15.5 4.8c.6-1 2-1.2 2.7-.4.7-.8 2.1-.6 2.7.4.5.9.2 1.9-.6 2.7l-2.1 2-2.1-2c-.8-.8-1.1-1.8-.6-2.7z"
            />
          </svg>
          Pet
        </button>
      {/if}
      <button
        type="button"
        class:active={tool === 'mister'}
        aria-pressed={tool === 'mister'}
        title="Mist where you click"
        onclick={() => choose('mister')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 10h6l-1 11H10L9 10z" />
          <path d="M10.5 10V7h3v3" />
          <path d="M10 4.5h5.5v2.5" />
          <path d="M15.5 5.5H18" />
          <path d="M20 3.6l.01 0M21 5.9l.01 0M20.2 8.1l.01 0" />
        </svg>
        Mister
      </button>
      {#if !dormant}
        <button
          type="button"
          class:active={tool === 'oats'}
          aria-pressed={tool === 'oats'}
          disabled={oatsDisabled}
          title={oatsTitle}
          onclick={() => choose('oats')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <ellipse cx="8.5" cy="16.5" rx="2.6" ry="1.9" transform="rotate(-24 8.5 16.5)" />
            <ellipse cx="15.5" cy="17" rx="2.6" ry="1.9" transform="rotate(18 15.5 17)" />
            <ellipse cx="12" cy="11.5" rx="2.6" ry="1.9" transform="rotate(-8 12 11.5)" />
            <path d="M12 9.5V6.2m0 0c1.6-.3 2.4-1.2 2.6-2.7-1.7-.1-2.7.7-2.6 2.7z" />
          </svg>
          Oat flakes
        </button>
        <button
          type="button"
          class:active={tool === 'mica'}
          aria-pressed={tool === 'mica'}
          disabled={!canSparkle}
          title={micaTitle}
          onclick={() => choose('mica')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <!-- A shaker jar tipped over a drift of glinting specks. -->
            <path d="M8.5 4.5h7v3h-7z" />
            <path d="M9.5 7.5h5l.7 6.5h-6.4l.7-6.5z" />
            <path d="M10.3 17.5l.01 0M13.7 18.6l.01 0M12 20.8l.01 0" />
            <path d="M17.5 17l.9.9m0-.9l-.9.9M6 19l.9.9m0-.9l-.9.9" />
          </svg>
          Mica flakes
        </button>
        <button
          type="button"
          class:active={ballOut}
          aria-pressed={ballOut}
          title={ballTitle}
          onclick={() => {
            onToggleBall();
            open = false;
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <!-- A beach ball: circle with two panel seams. -->
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a11 11 0 0 1 0 16M12 4a11 11 0 0 0 0 16" />
          </svg>
          Ball
        </button>
      {/if}
      <button
        type="button"
        class:active={tool === 'squeegee'}
        aria-pressed={tool === 'squeegee'}
        onclick={() => choose('squeegee')}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 15h16" />
          <path d="M5 15v3M19 15v3" />
          <path d="M10 15v-2h4v2" />
          <path d="M12 13V4" />
        </svg>
        Squeegee
      </button>
    </div>
  {/if}
</div>

<style lang="scss">
  .tool-drawer {
    position: absolute;
    top: 0.55rem;
    right: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    align-items: flex-end;
  }

  .tab {
    position: relative;
    display: grid;
    place-items: center;
    width: 1.85rem;
    height: 1.85rem;
    padding: 0;
    border: 0;
    border-radius: 0.35rem;
    background: rgb(4 10 11 / 0.72);
    color: #dcece6;
    cursor: pointer;
    opacity: 0.75;
    transition: opacity 0.15s ease;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }

    svg {
      width: 1.05rem;
      height: 1.05rem;
    }
  }

  .open .tab {
    opacity: 1;
  }

  .nudge {
    position: absolute;
    top: -0.15rem;
    right: -0.15rem;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #a8b86a;
    box-shadow: 0 0 0 2px rgb(4 10 11 / 0.72);
  }

  .tray {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.3rem;
    border-radius: 0.45rem;
    background: rgb(4 10 11 / 0.82);

    button {
      display: flex;
      gap: 0.45rem;
      align-items: center;
      padding: 0.3rem 0.55rem;
      border: 1px solid transparent;
      border-radius: 0.35rem;
      background: none;
      color: #dcece6;
      font-size: 0.8rem;
      cursor: pointer;

      &:hover:not(:disabled),
      &:focus-visible:not(:disabled) {
        border-color: rgb(220 236 230 / 0.4);
      }

      &.active {
        border-color: rgb(220 236 230 / 0.7);
        background: rgb(220 236 230 / 0.12);
      }

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }

      svg {
        width: 0.95rem;
        height: 0.95rem;
      }
    }
  }

  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
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
