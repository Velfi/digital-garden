<script lang="ts">
  import {
    LIGHT_SOURCES,
    ROOM_TONES,
    lightSourceById,
    roomToneById
  } from '$lib/programming/marimo/lighting';
  import type { MarimoSettings } from '$lib/programming/marimo/settings';

  interface Props {
    settings: MarimoSettings;
    /** Size and age of the pet a restart would throw away, or null if there is none. */
    petSummary: string | null;
    /** Whether to offer the dev drawer. Off outside development. */
    devTools?: boolean;
    onChange: (settings: MarimoSettings) => void;
    onTimeTravel: (ms: number) => void;
    onRestart: () => void;
    onClose: () => void;
  }

  let {
    settings,
    petSummary,
    devTools = false,
    onChange,
    onTimeTravel,
    onRestart,
    onClose
  }: Props = $props();

  const TIME_JUMPS: [label: string, ms: number][] = [
    ['+1h', 3_600_000],
    ['+6h', 21_600_000],
    ['+1d', 86_400_000],
    ['+1w', 604_800_000],
    ['+1mo', 2_592_000_000],
    ['+1y', 31_536_000_000]
  ];

  /**
   * The confirm and the dev drawer are further faces of this dialog rather than
   * dialogs of their own.
   *
   * Stacking a modal on a modal muddles which Escape does what, and the confirm
   * needs the room anyway — the point of asking is to say what is about to be
   * lost, which takes a sentence.
   */
  let face = $state<'options' | 'confirm' | 'drawer'>('options');
  let dialog = $state<HTMLDialogElement>();

  const bulb = $derived(lightSourceById(settings.lightSource));
  const tone = $derived(roomToneById(settings.roomTone));

  function update(patch: Partial<MarimoSettings>) {
    onChange({ ...settings, ...patch });
  }

  /**
   * Hand back to the caller, having closed the dialog first.
   *
   * Closing rather than merely letting the component be unmounted is what
   * returns focus to the button that opened it. Unmounting an open dialog drops
   * it out of the top layer without ever restoring focus, so whoever pressed
   * Options with the keyboard would be left back at the top of the document.
   */
  function leave(action: () => void) {
    dialog?.close();
    action();
  }

  function back() {
    // Backing out of a face should not also close the options, or a mis-click
    // on Restart costs you your place.
    if (face !== 'options') {
      face = 'options';
      return;
    }
    leave(onClose);
  }

  $effect(() => {
    // Reading `face` is what re-runs this on the face change, so focus follows
    // rather than being left on a button that no longer exists.
    const current = face;

    // `showModal` is the whole reason this is a <dialog>: it puts the page
    // behind into the inert state and takes over the focus trap and Escape,
    // none of which a div with `aria-modal` on it actually does. Only ever
    // mounted open, so this runs once and the guard is for the re-runs above.
    if (dialog && !dialog.open) dialog.showModal();

    // The confirm takes focus on "Keep it" — first in the DOM, and the safe
    // one. The other two take it on the dialog itself rather than on the first
    // control, where an arrow key would change a setting, or a stray Enter
    // would jump the pet a year, before it had been read. That last part is
    // also why `showModal`'s own choice is overridden here: left alone it
    // focuses the first focusable descendant, which is exactly the radio button
    // an arrow key must not be sitting on.
    const target =
      current === 'confirm' ? dialog?.querySelector<HTMLElement>('.row button') : dialog;
    target?.focus();
  });
</script>

<dialog
  class="overlay"
  bind:this={dialog}
  aria-labelledby="marimo-options-title"
  tabindex="-1"
  oncancel={(event) => {
    // Escape arrives as `cancel`. Taken over so it steps back a face at a time
    // like the buttons do, instead of closing the whole dialog from the confirm.
    event.preventDefault();
    back();
  }}
  onclick={(event) => event.target === event.currentTarget && back()}
>
  <div class="options">
    {#if face === 'confirm'}
      <h2 id="marimo-options-title">Start again?</h2>
      <p class="warning">
        {#if petSummary}
          Your marimo &mdash; {petSummary} &mdash; will be gone, and you will pick a new fragment to start
          from. There is no way back to this one.
        {:else}
          You will pick a new fragment to start from.
        {/if}
      </p>
      <div class="row">
        <button type="button" onclick={() => (face = 'options')}>Keep it</button>
        <button type="button" class="danger" onclick={() => leave(onRestart)}>Start again</button>
      </div>
    {:else if face === 'drawer'}
      <h2 id="marimo-options-title">Time travel</h2>
      <p class="warning">
        A jump runs the same catch-up an absence would, and the pet keeps it &mdash; there is no way
        back to where it was.
      </p>
      <div class="jumps">
        {#each TIME_JUMPS as [label, ms] (label)}
          <button type="button" onclick={() => onTimeTravel(ms)}>{label}</button>
        {/each}
      </div>
      <div class="row row--split">
        <!-- The same call the confirm face makes, minus the confirm. -->
        <button type="button" class="danger" onclick={() => leave(onRestart)}>Restart</button>
        <button type="button" onclick={() => (face = 'options')}>Back</button>
      </div>
    {:else}
      <h2 id="marimo-options-title">Options</h2>

      <fieldset>
        <legend>Motion</legend>
        <p class="hint">
          Damping settles the water and quiets the coat. The marimo grows on its own clock either
          way.
        </p>
        {#each [['auto', 'Follow my system setting'], ['full', 'Full motion'], ['reduced', 'Reduced motion']] as [value, label] (value)}
          <label>
            <input
              type="radio"
              name="marimo-motion"
              checked={settings.motion === value}
              onchange={() => update({ motion: value as MarimoSettings['motion'] })}
            />
            {label}
          </label>
        {/each}
      </fieldset>

      <fieldset>
        <legend>Detail</legend>
        <p class="hint">
          The coat is drawn one strand at a time. Fewer of them costs some velvet and buys back
          frames on a slower machine.
        </p>
        {#each [['full', 'Full coat'], ['reduced', 'Fewer strands']] as [value, label] (value)}
          <label>
            <input
              type="radio"
              name="marimo-detail"
              checked={settings.detail === value}
              onchange={() => update({ detail: value as MarimoSettings['detail'] })}
            />
            {label}
          </label>
        {/each}
      </fieldset>

      <fieldset>
        <legend>Room</legend>
        <p class="hint">
          The same lamp either way. Lights on gives it warm cream walls to bounce off, so the water
          lifts and the shadow side of the marimo fills in.
        </p>
        {#each ROOM_TONES as option (option.id)}
          <label>
            <input
              type="radio"
              name="marimo-room-tone"
              checked={settings.roomTone === option.id}
              onchange={() => update({ roomTone: option.id })}
            />
            {option.label}
          </label>
        {/each}
        <p class="hint hint--after">{tone.hint}</p>
      </fieldset>

      <fieldset>
        <legend>Light</legend>
        <p class="hint">
          One lamp hangs above the jar, so this is every colour in the tank at once.
        </p>
        {#each [['dim', 'Dim'], ['normal', 'Normal'], ['bright', 'Bright']] as [value, label] (value)}
          <label>
            <input
              type="radio"
              name="marimo-light-level"
              checked={settings.lightLevel === value}
              onchange={() => update({ lightLevel: value as MarimoSettings['lightLevel'] })}
            />
            {label}
          </label>
        {/each}

        <label class="field">
          <span>Bulb</span>
          <select
            value={settings.lightSource}
            onchange={(event) =>
              update({ lightSource: event.currentTarget.value as MarimoSettings['lightSource'] })}
          >
            {#each LIGHT_SOURCES as source (source.id)}
              <option value={source.id}>{source.label} &middot; {source.kelvin}K</option>
            {/each}
          </select>
        </label>
        <p class="hint hint--after">{bulb.hint}</p>
      </fieldset>

      <fieldset>
        <legend>Readout</legend>
        <label>
          <input
            type="checkbox"
            checked={settings.showFps}
            onchange={(event) => update({ showFps: event.currentTarget.checked })}
          />
          Show the frame counter
        </label>
      </fieldset>

      {#if devTools}
        <fieldset>
          <legend>Dev</legend>
          <p class="hint">Only here in development.</p>
          <button type="button" class="drawer-open" onclick={() => (face = 'drawer')}>
            Time travel&hellip;
          </button>
        </fieldset>
      {/if}

      <div class="row row--split">
        <button type="button" class="danger" onclick={() => (face = 'confirm')}>
          Start again&hellip;
        </button>
        <button type="button" onclick={() => leave(onClose)}>Done</button>
      </div>
    {/if}
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

  .options {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    width: min(100%, 26rem);
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

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0;
    padding: 0.6rem 0.8rem 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 0.4rem;

    legend {
      padding: 0 0.3rem;
      font-size: 0.85rem;
      font-weight: 600;
    }

    label {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      cursor: pointer;
    }
  }

  .hint {
    margin: 0 0 0.35rem;
    font-size: 0.78rem;
    line-height: 1.4;
    opacity: 0.72;
  }

  /* The bulb's own line sits under the menu it describes, not above it. */
  .hint--after {
    margin: 0.1rem 0 0;
  }

  /*
   * A label with a control beside it rather than in front of it, so the menu
   * can take the width it needs without the radios above going ragged.
   */
  .field {
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.3rem;

    select {
      flex: 0 1 auto;
      min-width: 0;
      padding: 0.15rem 0.25rem;
      border: 1px solid var(--border-color);
      border-radius: 0.3rem;
      background: var(--bg-color);
      color: inherit;
      font: inherit;
      font-size: 0.85rem;
    }
  }

  .warning {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  /* Pulls the drawer open from inside a fieldset of its own, so it reads as a
     way through rather than as another setting. */
  .drawer-open {
    align-self: flex-start;
    padding: 0.3rem 0.6rem;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .jumps {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;

    button {
      padding: 0.3rem 0.6rem;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }
  }

  .row {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;

    button {
      padding: 0.4rem 0.75rem;
      font-size: 0.85rem;
      cursor: pointer;
    }
  }

  .row--split {
    justify-content: space-between;
  }

  /*
   * There is no red in the palette, and the destructive action wants one. These
   * two are picked against the two backgrounds directly — the light theme is a
   * warm cream, which a red light enough to read on dark teal disappears into.
   * Keyed off the body class the layout already toggles, not a media query.
   */
  .danger {
    color: #ff9b86;
  }

  :global(body.light-mode) .danger {
    color: #a3321f;
  }
</style>
