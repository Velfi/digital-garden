<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import {
    DEFAULT_RIPPLE_SIM,
    RIPPLE_CFL_LIMIT,
    RIPPLE_CELL,
    RIPPLE_COLS,
    RIPPLE_ROWS,
    cflNumber,
    type RippleSimParams
  } from '$lib/programming/marimo/rippleSim';
  import {
    createRippleBench,
    type BenchMode,
    type RippleBench
  } from '$lib/programming/marimo/rippleBench';

  interface Slider {
    key: keyof RippleSimParams;
    label: string;
    min: number;
    max: number;
    step: number;
    hint: string;
  }

  // Four numbers now instead of thirteen. The shape of the water is no longer
  // something to be dialled in — it is what the simulation does — so what is
  // left is only how fast waves cross it, how long they last, and how hard the
  // room and the stir push.
  const SLIDERS: Slider[] = [
    {
      key: 'speedMmPerSec',
      label: 'wave speed',
      min: 10,
      max: 140,
      step: 1,
      hint: 'mm/s — watch the Courant number'
    },
    { key: 'decaySec', label: 'settle time', min: 0.3, max: 20, step: 0.1, hint: 'seconds to 1/e' },
    {
      key: 'viscosity',
      label: 'viscosity',
      min: 0,
      max: 0.06,
      step: 0.001,
      hint: 'short ripples die first'
    },
    { key: 'reliefScale', label: 'relief', min: 0, max: 3, step: 0.05, hint: 'how deep it is drawn' }
  ];

  const MODES: { value: BenchMode; label: string }[] = [
    { value: 'surface', label: 'underwater' },
    { value: 'above', label: 'from above' },
    { value: 'normals', label: 'normals' },
    { value: 'height', label: 'height' },
    { value: 'slope', label: 'slope' }
  ];

  let container = $state<HTMLDivElement>();
  let bench: RippleBench | null = null;
  let webglSupported = $state(true);

  let params = $state<RippleSimParams>({ ...DEFAULT_RIPPLE_SIM });
  let mode = $state<BenchMode>('surface');
  let agitation = $state(0.5);
  let fouling = $state(0);
  let paused = $state(false);
  let copied = $state(false);

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let rafId = 0;

  // The number that matters most and is least obvious from the slider. An
  // explicit wave equation is stable below 1/sqrt(2) and produces a screenful of
  // NaN above it, so this is not a quality setting — it is the edge of the cliff.
  const courant = $derived(cflNumber(params));
  const unstable = $derived(courant >= RIPPLE_CFL_LIMIT);
  const gridMm = $derived(RIPPLE_CELL * 1000);

  const source = $derived(
    `export const DEFAULT_RIPPLE_SIM: RippleSimParams = {\n` +
      SLIDERS.map((s) => `  ${s.key}: ${params[s.key]}`).join(',\n') +
      `\n};`
  );

  $effect(() => {
    // Spread so every field is read, and so the effect re-runs on any of them.
    bench?.setParams({ ...params });
  });
  $effect(() => bench?.setMode(mode));
  $effect(() => bench?.setAgitation(agitation));
  $effect(() => bench?.setFouling(fouling));
  $effect(() => bench?.setPaused(paused));

  async function copySource() {
    await navigator.clipboard.writeText(source);
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }

  onMount(() => {
    if (!browser || !container) return;

    let observer: ResizeObserver | null = null;

    try {
      bench = createRippleBench(container, params);
      bench.resize();
      observer = new ResizeObserver(() => bench?.resize());
      observer.observe(container);

      const frame = (now: number) => {
        bench?.render(now);
        rafId = requestAnimationFrame(frame);
      };
      rafId = requestAnimationFrame(frame);
    } catch {
      webglSupported = false;
    }

    return () => {
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      bench?.dispose();
      bench = null;
    };
  });
</script>

<div class="bench">
  <div class="stage">
    {#if webglSupported}
      <div
        class="viewport"
        bind:this={container}
        role="application"
        aria-label="Water ripple preview"
        onpointerdown={(event) => {
          dragging = true;
          lastX = event.clientX;
          lastY = event.clientY;
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        }}
        onpointermove={(event) => {
          if (!dragging || !container) return;
          const rect = container.getBoundingClientRect();
          bench?.orbit((event.clientX - lastX) / rect.width, (event.clientY - lastY) / rect.height);
          lastX = event.clientX;
          lastY = event.clientY;
        }}
        onpointerup={() => (dragging = false)}
        onpointercancel={() => (dragging = false)}
        onwheel={(event) => {
          event.preventDefault();
          bench?.zoom(event.deltaY);
        }}
      ></div>

      <div class="modes">
        {#each MODES as option (option.value)}
          <button
            type="button"
            class:active={mode === option.value}
            onclick={() => (mode = option.value)}
          >
            {option.label}
          </button>
        {/each}
        <button type="button" onclick={() => bench?.resetView()}>reset view</button>
      </div>
    {:else}
      <p class="fallback">This bench needs WebGL, which is not available in this browser.</p>
    {/if}
  </div>

  <div class="controls">
    <div class="scene-row">
      <label>
        <span>stir</span>
        <input type="range" min="0" max="1" step="0.01" bind:value={agitation} />
        <output>{agitation.toFixed(2)}</output>
      </label>
      <label>
        <span>fouling</span>
        <input type="range" min="0" max="1" step="0.01" bind:value={fouling} />
        <output>{fouling.toFixed(2)}</output>
      </label>
      <button type="button" onclick={() => (paused = !paused)}>{paused ? 'play' : 'pause'}</button>
      <button type="button" onclick={() => bench?.burst()}>pop a bubble</button>
      <button type="button" onclick={() => bench?.reset()}>still water</button>
    </div>

    <p class="readout" class:warn={unstable}>
      Courant {courant.toFixed(3)} of {RIPPLE_CFL_LIMIT.toFixed(3)} · {RIPPLE_COLS} × {RIPPLE_ROWS} grid
      at {gridMm.toFixed(2)} mm
      {#if unstable}<strong> — over the limit, this will blow up</strong>{/if}
    </p>

    <div class="sliders">
      {#each SLIDERS as slider (slider.key)}
        <label>
          <span class="name">{slider.label}</span>
          <input
            type="range"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            bind:value={params[slider.key]}
          />
          <output>{params[slider.key]}</output>
          <span class="hint">{slider.hint}</span>
        </label>
      {/each}
    </div>

    <div class="actions">
      <button type="button" onclick={() => (params = { ...DEFAULT_RIPPLE_SIM })}>reset</button>
      <button type="button" onclick={copySource}>{copied ? 'copied' : 'copy as TS'}</button>
    </div>

    <pre class="source">{source}</pre>
  </div>
</div>

<style lang="scss">
  .bench {
    display: grid;
    gap: 1rem;

    @media (min-width: 60rem) {
      grid-template-columns: minmax(0, 1fr) 22rem;
      align-items: start;
    }
  }

  .viewport {
    width: 100%;
    aspect-ratio: 4 / 3;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    overflow: hidden;
    background: #0b1113;
    cursor: grab;
    touch-action: none;

    :global(canvas) {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.5rem;

    button {
      padding: 0.25rem 0.55rem;
      font-size: 0.78rem;
      cursor: pointer;
    }

    button.active {
      outline: 2px solid currentColor;
    }
  }

  .controls {
    display: grid;
    gap: 0.7rem;
    font-size: 0.78rem;
  }

  .scene-row {
    display: grid;
    gap: 0.3rem;

    button {
      justify-self: start;
      padding: 0.2rem 0.5rem;
      font-size: 0.78rem;
      cursor: pointer;
    }
  }

  .readout {
    margin: 0;
    padding: 0.35rem 0.5rem;
    border-radius: 0.35rem;
    background: rgb(255 255 255 / 0.05);
    font-variant-numeric: tabular-nums;
  }

  .readout.warn {
    background: rgb(220 120 60 / 0.18);
  }

  .sliders {
    display: grid;
    gap: 0.25rem;
  }

  label {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 3.2rem;
    gap: 0.4rem;
    align-items: center;
  }

  .sliders label {
    grid-template-columns: 5.5rem minmax(0, 1fr) 3.2rem;
    grid-template-areas: 'name input value' '. hint hint';
  }

  .name {
    grid-area: name;
  }

  .hint {
    grid-area: hint;
    font-size: 0.68rem;
    opacity: 0.5;
  }

  .sliders input {
    grid-area: input;
  }

  .sliders output {
    grid-area: value;
  }

  input[type='range'] {
    width: 100%;
    min-width: 0;
  }

  output {
    font-family: 'Fira Code', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .actions {
    display: flex;
    gap: 0.35rem;

    button {
      padding: 0.25rem 0.55rem;
      font-size: 0.78rem;
      cursor: pointer;
    }
  }

  .source {
    margin: 0;
    padding: 0.55rem;
    border-radius: 0.4rem;
    background: rgb(0 0 0 / 0.32);
    font-size: 0.7rem;
    line-height: 1.45;
    overflow-x: auto;
  }

  .fallback {
    margin: 0;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
  }
</style>
