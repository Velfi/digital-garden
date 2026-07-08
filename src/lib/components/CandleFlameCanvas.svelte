<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import {
    createCandleScene,
    type CandleScene,
    type FlameResolution
  } from '$lib/programming/candle-flame/candleScene';

  let container = $state<HTMLDivElement>();
  let webglSupported = $state(true);
  let scene: CandleScene | null = null;
  let dragging = false;
  let resizeObserver: ResizeObserver | null = null;

  let windX = $state(0);
  let windY = $state(0);
  let windStrength = $state(0.45);
  let turbulence = $state(0.75);
  let flameHeight = $state(0.34);
  let flameResolution = $state<FlameResolution>(2);
  let wireframe = $state(false);

  let fpsText = $state('  --');
  let simText = $state('');
  let lastFpsPaint = 0;
  let rafId = 0;
  let loopRunning = false;

  function pushParams() {
    scene?.setParams({ windX, windY, windStrength, turbulence, flameHeight, exposure: 2.25 });
  }

  $effect(() => {
    windX;
    windY;
    windStrength;
    turbulence;
    flameHeight;
    pushParams();
  });

  $effect(() => {
    const resolution = flameResolution;
    scene?.setFlameResolution(resolution);
  });

  $effect(() => {
    const w = wireframe;
    scene?.setWireframe(w);
  });

  function setWindFromPointer(event: PointerEvent) {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    windX = Math.max(-1, Math.min(1, x));
    windY = Math.max(-0.4, Math.min(0.8, y * 0.45));
  }

  function formatFps(fps: number): string {
    return Math.min(999, Math.max(0, fps)).toFixed(0).padStart(3, ' ');
  }

  function frame(now: number) {
    if (!loopRunning) return;

    if (scene) {
      const { displayFps, simHz } = scene.render(now);
      if (now - lastFpsPaint >= 250) {
        fpsText = formatFps(displayFps);
        simText = formatFps(simHz);
        lastFpsPaint = now;
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  function startRenderLoop() {
    if (loopRunning) return;
    loopRunning = true;
    lastFpsPaint = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopRenderLoop() {
    loopRunning = false;
    cancelAnimationFrame(rafId);
  }

  onMount(() => {
    if (!browser || !container) return;

    const onVisibilityChange = () => {
      if (document.hidden) stopRenderLoop();
      else if (scene) startRenderLoop();
    };

    try {
      scene = createCandleScene(container, flameResolution);
      pushParams();
      resizeObserver = new ResizeObserver(() => scene?.resize());
      resizeObserver.observe(container);
      document.addEventListener('visibilitychange', onVisibilityChange);
      startRenderLoop();
    } catch {
      webglSupported = false;
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopRenderLoop();
      resizeObserver?.disconnect();
      scene?.dispose();
      scene = null;
    };
  });
</script>

<div class="candle-flame">
  {#if !webglSupported}
    <p class="fallback">WebGL is not available in this browser.</p>
  {:else}
    <div class="viewport-wrap">
      <div
        class="viewport"
        bind:this={container}
        aria-label="Procedural candle flame"
        role="img"
        onpointerdown={(event) => {
          dragging = true;
          container?.setPointerCapture(event.pointerId);
          setWindFromPointer(event);
        }}
        onpointermove={(event) => {
          if (dragging) setWindFromPointer(event);
        }}
        onpointerup={() => {
          dragging = false;
        }}
        onpointercancel={() => {
          dragging = false;
        }}
      ></div>
      <div class="fps" aria-live="polite" aria-label="Frames per second">
        <span class="fps-label">FPS</span>
        <span class="fps-value">{fpsText}</span>
        {#if simText}
          <span class="fps-label sim">SIM</span>
          <span class="fps-value sim">{simText}</span>
        {/if}
      </div>
    </div>

    <aside class="panel">
      <p class="hint">Drag in the viewport to set wind direction.</p>

      <label class="toggle">
        <input type="checkbox" bind:checked={wireframe} />
        Wireframe
      </label>

      <fieldset class="resolution">
        <legend>Flame resolution</legend>
        <div class="resolution-options">
          {#each [1, 2, 4, 8] as mult (mult)}
            <label class="resolution-option">
              <input type="radio" bind:group={flameResolution} value={mult} />
              {mult}x
            </label>
          {/each}
        </div>
      </fieldset>

      <label>
        Wind X
        <input type="range" min="-1" max="1" step="0.01" bind:value={windX} />
      </label>
      <label>
        Wind Y
        <input type="range" min="-0.4" max="0.8" step="0.01" bind:value={windY} />
      </label>
      <label>
        Wind strength
        <input type="range" min="0" max="2" step="0.01" bind:value={windStrength} />
      </label>
      <label>
        Turbulence
        <input type="range" min="0" max="2" step="0.01" bind:value={turbulence} />
      </label>
      <label>
        Flame height
        <input type="range" min="0.22" max="0.38" step="0.01" bind:value={flameHeight} />
      </label>
    </aside>
  {/if}
</div>

<style lang="scss">
  .candle-flame {
    display: grid;
    gap: 1rem;
    margin: 0 0 2rem;

    @media (min-width: 42rem) {
      grid-template-columns: minmax(0, 1fr) minmax(13rem, 16rem);
      align-items: start;
    }
  }

  .viewport-wrap {
    position: relative;
  }

  .viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    border: 1px solid rgb(255 212 128 / 0.22);
    border-radius: 0.75rem;
    overflow: hidden;
    background: #121018;
    box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.35);
    cursor: crosshair;

    :global(canvas) {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  .fps {
    position: absolute;
    top: 0.55rem;
    right: 0.65rem;
    display: flex;
    gap: 0.35rem;
    align-items: baseline;
    padding: 0.2rem 0.45rem;
    border-radius: 0.35rem;
    background: rgb(8 6 7 / 0.72);
    color: #c9bba3;
    font-size: 0.72rem;
    line-height: 1;
    pointer-events: none;
    user-select: none;
  }

  .fps-label {
    color: #8f8270;

    &.sim {
      margin-left: 0.25rem;
    }
  }

  .fps-value {
    display: inline-block;
    width: 3ch;
    font-family: 'Fira Code', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: #efe6d2;

    &.sim {
      color: #d4b88a;
    }
  }

  .panel {
    padding: 1rem;
    border: 1px solid rgb(255 212 128 / 0.22);
    border-radius: 0.75rem;
    background: rgb(10 7 9 / 0.72);
    color: #d9ccb3;
  }

  .hint {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: #a99e8d;
    line-height: 1.45;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0 0 0.85rem;
    font-size: 0.85rem;
    cursor: pointer;

    input {
      accent-color: #f1a333;
      margin: 0;
    }
  }

  .resolution {
    margin: 0 0 0.85rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid rgb(255 212 128 / 0.14);
    border-radius: 0.5rem;

    legend {
      padding: 0 0.25rem;
      font-size: 0.85rem;
      color: #d9ccb3;
    }
  }

  .resolution-options {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.35rem;
  }

  .resolution-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    margin: 0;
    font-size: 0.82rem;
    cursor: pointer;

    input {
      accent-color: #f1a333;
      margin: 0;
    }
  }

  label {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    gap: 0.65rem;
    align-items: center;
    margin: 0.55rem 0;
    font-size: 0.85rem;
  }

  input[type='range'] {
    width: 100%;
    accent-color: #f1a333;
    padding: 0;
    border: none;
  }

  .fallback {
    margin: 0;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
  }
</style>
