<script lang="ts">
  import SimControls from './SimControls.svelte';
  import {
    COLORWAYS,
    type MotionPreference,
    type SlimeFinish,
    type SlimeSettings
  } from '$lib/programming/slime/settings';
  import {
    LIGHT_SOURCES,
    ROOM_TONES,
    lightSourceById,
    roomToneById
  } from '$lib/programming/marimo/lighting';

  interface Props {
    settings: SlimeSettings;
    onChange: (settings: SlimeSettings) => void;
    onRestart: () => void;
    onClose: () => void;
  }

  let { settings, onChange, onRestart, onClose }: Props = $props();

  let confirmingRestart = $state(false);

  const motionOptions: Array<{ value: MotionPreference; label: string; hint: string }> = [
    { value: 'auto', label: 'Follow the system', hint: 'Reduce motion when the OS asks for it.' },
    { value: 'reduced', label: 'Reduced', hint: 'Gentle: no jiggle, soft landings.' },
    { value: 'full', label: 'Full', hint: 'The whole wobble.' }
  ];

  function chooseMotion(value: MotionPreference) {
    onChange({ ...settings, motion: value });
  }

  const finishOptions: Array<{ value: SlimeFinish; label: string; hint: string }> = [
    { value: 'jelly', label: 'Jelly', hint: 'Set sea-glass, the stock look.' },
    { value: 'glassy', label: 'Glassy', hint: 'Nearly clear — coloured water with a bright skin.' },
    { value: 'milky', label: 'Milky', hint: 'Dense and glowing, like an opal.' },
    { value: 'matte', label: 'Matte', hint: 'The wet shine gone. Gummy.' }
  ];

  function setSheen(key: 'micaSize' | 'micaAmount', event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) onChange({ ...settings, [key]: value });
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }

  const bulb = $derived(lightSourceById(settings.lightSource));
  const tone = $derived(roomToneById(settings.roomTone));
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}
>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Terrarium options">
    <h2>Options</h2>

    <fieldset>
      <legend>Motion</legend>
      {#each motionOptions as option (option.value)}
        <label>
          <input
            type="radio"
            name="motion"
            value={option.value}
            checked={settings.motion === option.value}
            onchange={() => chooseMotion(option.value)}
          />
          <span>
            {option.label}
            <small>{option.hint}</small>
          </span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Room</legend>
      <p class="hint">
        The same lamp either way. Lights on gives it warm cream walls to bounce off, so the box
        lifts and the shadow side of the slime fills in.
      </p>
      {#each ROOM_TONES as option (option.id)}
        <label>
          <input
            type="radio"
            name="slime-room-tone"
            checked={settings.roomTone === option.id}
            onchange={() => onChange({ ...settings, roomTone: option.id })}
          />
          <span>{option.label}</span>
        </label>
      {/each}
      <p class="hint hint--after">{tone.hint}</p>
    </fieldset>

    <fieldset>
      <legend>Light</legend>
      <p class="hint">One lamp hangs above the box, so this is every colour in the tank at once.</p>
      {#each [['dim', 'Dim'], ['normal', 'Normal'], ['bright', 'Bright']] as [value, label] (value)}
        <label>
          <input
            type="radio"
            name="slime-light-level"
            checked={settings.lightLevel === value}
            onchange={() =>
              onChange({ ...settings, lightLevel: value as SlimeSettings['lightLevel'] })}
          />
          <span>{label}</span>
        </label>
      {/each}

      <label class="field">
        <span>Bulb</span>
        <select
          value={settings.lightSource}
          onchange={(event) =>
            onChange({
              ...settings,
              lightSource: event.currentTarget.value as SlimeSettings['lightSource']
            })}
        >
          {#each LIGHT_SOURCES as source (source.id)}
            <option value={source.id}>{source.label} &middot; {source.kelvin}K</option>
          {/each}
        </select>
      </label>
      <p class="hint hint--after">{bulb.hint}</p>
    </fieldset>

    <fieldset>
      <legend>Goo</legend>
      {#if settings.debug}
        <p class="hint">In debug mode these live under the tank.</p>
      {:else}
        <SimControls {settings} {onChange} />
      {/if}
    </fieldset>

    <fieldset>
      <legend>Debug</legend>
      <label>
        <input
          type="checkbox"
          checked={settings.debug}
          onchange={(event) => onChange({ ...settings, debug: event.currentTarget.checked })}
        />
        <span>
          Debug mode
          <small>Sim controls under the tank, and a button to trigger emergence now.</small>
        </span>
      </label>
    </fieldset>

    <fieldset>
      <legend>Finish</legend>
      <p class="hint">
        The same body in a different pour. Mood and dryness still show through whichever it wears.
      </p>
      {#each finishOptions as option (option.value)}
        <label>
          <input
            type="radio"
            name="slime-finish"
            checked={settings.finish === option.value}
            onchange={() => onChange({ ...settings, finish: option.value })}
          />
          <span>
            {option.label}
            <small>{option.hint}</small>
          </span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Colour</legend>
      <p class="hint">
        A tint in the same jelly. It still pales when neglected and darkens fresh out of the crust.
      </p>
      {#each COLORWAYS as option (option.id)}
        <label>
          <input
            type="radio"
            name="slime-colorway"
            checked={settings.colorway === option.id}
            onchange={() => onChange({ ...settings, colorway: option.id })}
          />
          <span>
            {option.label}
            <small>{option.hint}</small>
          </span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Sheen</legend>
      <p class="hint">
        How much it shimmers is not a setting — sparkle is earned, a pinch of mica flakes at a
        time, from the tool drawer. These choose how the flakes it has earned read.
      </p>
      <label class="slider">
        <span>
          Flake size
          <small>Fine dust at the left, coarse glitter at the right. {settings.micaSize.toFixed(2)}</small>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.micaSize}
          oninput={(event) => setSheen('micaSize', event)}
        />
      </label>
      <label class="slider">
        <span>
          Flake amount
          <small>A few stray specks up to a dense suspension. {settings.micaAmount.toFixed(2)}</small>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.micaAmount}
          oninput={(event) => setSheen('micaAmount', event)}
        />
      </label>
    </fieldset>

    <div class="danger">
      {#if confirmingRestart}
        <p>
          Send this one back and take delivery of a new sclerotium? The one you have will be gone,
          and it may be quite old.
        </p>
        <div class="confirm-row">
          <button type="button" class="destructive" onclick={onRestart}>Yes, a new one</button>
          <button type="button" onclick={() => (confirmingRestart = false)}>Keep it</button>
        </div>
      {:else}
        <button type="button" onclick={() => (confirmingRestart = true)}>
          Order a new slime…
        </button>
      {/if}
    </div>

    <button type="button" class="close" onclick={onClose}>Close</button>
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

  .modal {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(22rem, calc(100vw - 2rem));
    max-height: min(85dvh, calc(100dvh - 2rem));
    padding: 1.2rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: var(--bg-color);
    color: var(--text-color);
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0.6rem 0.8rem 0.8rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
  }

  legend {
    padding: 0 0.3rem;
    font-size: 0.85rem;
    opacity: 0.8;
  }

  label {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    font-size: 0.9rem;
    cursor: pointer;

    span {
      display: flex;
      flex-direction: column;
    }

    small {
      font-size: 0.75rem;
      opacity: 0.65;
    }
  }

  .slider {
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;

    input[type='range'] {
      width: 100%;
      cursor: pointer;
    }
  }

  .hint {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
    opacity: 0.65;
  }

  .hint--after {
    font-style: italic;
  }

  .field {
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;

    select {
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 0.4rem;
      background: var(--bg-color);
      color: inherit;
      font-size: 0.85rem;
    }
  }

  .danger {
    p {
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
      line-height: 1.45;
    }
  }

  .confirm-row {
    display: flex;
    gap: 0.5rem;
  }

  button {
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: none;
    color: inherit;
    font-size: 0.85rem;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: var(--link-color);
    }
  }

  .destructive {
    border-color: #a04a3a;
    color: #c0604a;
  }
</style>
