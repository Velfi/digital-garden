<script lang="ts">
  import {
    displayUnit,
    mmToDisplay,
    displayToMm,
    unitLabel,
    unitPrecision,
    displayStep
  } from '../store/units';

  // A slider that edits a millimeter value but displays in the user's chosen
  // unit. Min/max/step are specified in mm; the component converts on the fly.
  let {
    label,
    valueMm,
    minMm,
    maxMm,
    stepMm,
    onInputMm,
    hint
  }: {
    label: string;
    valueMm: number;
    minMm: number;
    maxMm: number;
    stepMm: number;
    onInputMm: (mm: number) => void;
    hint?: string;
  } = $props();

  let displayValue = $derived(mmToDisplay(valueMm, $displayUnit));
  let displayMin = $derived(mmToDisplay(minMm, $displayUnit));
  let displayMax = $derived(mmToDisplay(maxMm, $displayUnit));
  let step = $derived(displayStep(stepMm, $displayUnit));
  let precision = $derived(unitPrecision($displayUnit));
  let suffix = $derived(unitLabel($displayUnit));

  function handleInput(e: Event) {
    const raw = +(e.target as HTMLInputElement).value;
    onInputMm(displayToMm(raw, $displayUnit));
  }
</script>

<label class="sidebar-label">
  {label}
  {#if hint}<span class="hint">{hint}</span>{/if}
  <div class="slider-row">
    <input
      type="range"
      min={displayMin}
      max={displayMax}
      {step}
      value={displayValue}
      oninput={handleInput}
    />
    <span class="slider-value">{displayValue.toFixed(precision)} {suffix}</span>
  </div>
</label>

<style>
  .hint {
    display: block;
    font-size: 0.75rem;
    opacity: 0.7;
    margin-top: 0.1rem;
  }

  .slider-value {
    min-width: 4.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
