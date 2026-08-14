<script lang="ts">
  import {
    GRADE_MAX,
    GRADE_MIN,
    HUE_MAX,
    HUE_MIN,
    TUNING_MAX,
    TUNING_MIN,
    type SlimeSettings
  } from '$lib/programming/slime/settings';

  interface Props {
    settings: SlimeSettings;
    onChange: (settings: SlimeSettings) => void;
  }

  let { settings, onChange }: Props = $props();

  function setTuning(
    key: 'viscosity' | 'pressure' | 'shape' | 'hue' | 'saturation' | 'lightness',
    event: Event
  ) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) onChange({ ...settings, [key]: value });
  }
</script>

<label class="slider">
  <span>
    Viscosity
    <small>Watery at the left, syrup at the right. ×{settings.viscosity.toFixed(2)}</small>
  </span>
  <input
    type="range"
    min={TUNING_MIN}
    max={TUNING_MAX}
    step="0.05"
    value={settings.viscosity}
    oninput={(event) => setTuning('viscosity', event)}
  />
</label>
<label class="slider">
  <span>
    Pressure
    <small>How firmly a crowd pushes apart. ×{settings.pressure.toFixed(2)}</small>
  </span>
  <input
    type="range"
    min={TUNING_MIN}
    max={TUNING_MAX}
    step="0.05"
    value={settings.pressure}
    oninput={(event) => setTuning('pressure', event)}
  />
</label>
<label class="slider">
  <span>
    Shape memory
    <small>How hard it insists on being an orb; 0 is a puddle. ×{settings.shape.toFixed(2)}</small>
  </span>
  <input
    type="range"
    min={TUNING_MIN}
    max={TUNING_MAX}
    step="0.05"
    value={settings.shape}
    oninput={(event) => setTuning('shape', event)}
  />
</label>
<label class="slider">
  <span>
    Hue
    <small>Degrees away from stock sea-glass; 0 is home. {settings.hue.toFixed(0)}°</small>
  </span>
  <input
    type="range"
    min={HUE_MIN}
    max={HUE_MAX}
    step="1"
    value={settings.hue}
    oninput={(event) => setTuning('hue', event)}
  />
</label>
<label class="slider">
  <span>
    Saturation
    <small>Grey at the left, lurid at the right. ×{settings.saturation.toFixed(2)}</small>
  </span>
  <input
    type="range"
    min={GRADE_MIN}
    max={GRADE_MAX}
    step="0.05"
    value={settings.saturation}
    oninput={(event) => setTuning('saturation', event)}
  />
</label>
<label class="slider">
  <span>
    Lightness
    <small>Dark at the left, washed out at the right. ×{settings.lightness.toFixed(2)}</small>
  </span>
  <input
    type="range"
    min={GRADE_MIN}
    max={GRADE_MAX}
    step="0.05"
    value={settings.lightness}
    oninput={(event) => setTuning('lightness', event)}
  />
</label>

<style lang="scss">
  .slider {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
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

    input[type='range'] {
      width: 100%;
      cursor: pointer;
    }
  }
</style>
