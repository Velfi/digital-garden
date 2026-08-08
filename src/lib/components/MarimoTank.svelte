<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import CarePanel from './marimo/CarePanel.svelte';
  import FragmentChooser from './marimo/FragmentChooser.svelte';
  import OffscreenMarkerBadge from './marimo/OffscreenMarker.svelte';
  import OptionsModal from './marimo/OptionsModal.svelte';
  import { createMarimoScene, type MarimoScene } from '$lib/programming/marimo/marimoScene';
  import { resolveLighting, roomToneById } from '$lib/programming/marimo/lighting';
  import { describeAbsence, describePet } from '$lib/programming/marimo/careDescription';
  import {
    loadSettings,
    resolveReducedMotion,
    saveSettings,
    type MarimoSettings
  } from '$lib/programming/marimo/settings';
  import {
    makeFragments,
    marimoFromFragment,
    randomFragment,
    type FragmentStarter
  } from '$lib/programming/marimo/fragments';
  import { clearMarimo, readMarimo } from '$lib/programming/marimo/persist';
  import type { OffscreenMarker } from '$lib/programming/marimo/offscreen';
  import type { MarimoState } from '$lib/programming/marimo/types';

  interface Props {
    /** 'full' is the app at /marimo; 'ambient' is the smaller one in the post. */
    variant?: 'full' | 'ambient';
    showPanel?: boolean;
    showDevTools?: boolean;
  }

  let { variant = 'full', showPanel = variant === 'full', showDevTools = false }: Props = $props();

  let wrap = $state<HTMLDivElement>();
  let container = $state<HTMLDivElement>();
  let webglSupported = $state(true);
  let fullscreenAvailable = $state(false);
  let isFullscreen = $state(false);
  let scene: MarimoScene | null = null;
  let resizeObserver: ResizeObserver | null = null;

  let snapshot = $state<MarimoState | null>(null);
  let canChangeWater = $state(false);
  let busy = $state(false);
  let absenceLine = $state<string | null>(null);
  let holding = $state(false);
  /** Non-null once the marimo has started to leave the frame. */
  let offscreen = $state<OffscreenMarker | null>(null);
  let fpsText = $state('  --');
  /** Non-null while the visitor is picking a fragment to start from. */
  let fragments = $state<FragmentStarter[] | null>(null);
  let optionsOpen = $state(false);
  let settings = $state<MarimoSettings>(loadSettings());
  let systemPrefersReduced = $state(false);

  let rafId = 0;
  let loopRunning = false;
  let lastUiPaint = 0;

  /** Long enough for the grab spring, which is roughly critically damped at 3 Hz. */
  const RECALL_HOLD_MS = 450;
  let recallTimer: ReturnType<typeof setTimeout> | undefined;

  const devEnabled = $derived(showDevTools && import.meta.env.DEV);

  const lightsOn = $derived(settings.roomTone === 'cream');
  /**
   * What sits behind the canvas: the frame's own background, and the letterbox
   * in fullscreen. It has to follow the room, or turning the lights on leaves a
   * black surround around a cream tank until the first frame lands.
   */
  const backdrop = $derived(roomToneById(settings.roomTone).backdrop);

  // Safari only picked up the unprefixed element fullscreen API in 16.4, and
  // iOS has never had it at all — hence the fallbacks and the availability check
  // that keeps the button from appearing where it could not do anything.
  type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  type WebkitDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitFullscreenEnabled?: boolean;
    webkitExitFullscreen?: () => Promise<void> | void;
  };

  function currentFullscreenElement(): Element | null {
    const doc = document as WebkitDocument;
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  }

  async function toggleFullscreen() {
    const doc = document as WebkitDocument;
    const element = wrap as WebkitElement | undefined;
    if (!element) return;
    try {
      if (currentFullscreenElement()) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else {
        await element.webkitRequestFullscreen?.();
      }
    } catch {
      // The browser can refuse (permissions policy, untrusted gesture). The
      // fullscreenchange listener keeps our flag honest either way.
    }
  }

  function pointerNdc(event: PointerEvent): [number, number] {
    const rect = container!.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2
    ];
  }

  /**
   * Reach out and take hold of a marimo that has left the frame.
   *
   * The press lands on the marker, but the capture goes on the viewport — which
   * already knows how to carry a drag, and unlike the marker is still there a
   * moment later, once the marimo is back in shot and the marker has gone. From
   * the scene's point of view this is an ordinary grab that happened to start
   * somewhere the ball was not.
   */
  function grabFromMarker(event: PointerEvent) {
    if (!container || !scene) return;
    container.setPointerCapture(event.pointerId);
    const [nx, ny] = pointerNdc(event);
    scene.grabAt(nx, ny);
  }

  /**
   * The same, for a keyboard press, which has no cursor for the marimo to come
   * to. It gets held at the marker's own position for about as long as the grab
   * spring needs to bring it there, and then let go.
   */
  function recallFromMarker() {
    if (!scene || !offscreen) return;
    scene.grabAt(offscreen.ndcX, offscreen.ndcY);
    clearTimeout(recallTimer);
    recallTimer = setTimeout(() => scene?.pointerUp(), RECALL_HOLD_MS);
  }

  function frame(now: number) {
    if (!loopRunning || !scene) return;

    const result = scene.render(now);

    // Cheap enough to reflect every frame, and it is direct pointer feedback.
    if (result.grabbing !== holding) holding = result.grabbing;

    // Also every frame, for the same reason: a marker on the quarter-second
    // clock below would point at where the marimo used to be. The test skips
    // the assignment on the overwhelmingly common frame where the pet is in
    // shot and was in shot last time, so nothing reactive runs at all.
    if (result.offscreen || offscreen) offscreen = result.offscreen;

    // The rest of the UI only needs a few updates a second.
    if (now - lastUiPaint >= 250) {
      lastUiPaint = now;
      snapshot = { ...result.state, rings: [...result.state.rings] };
      canChangeWater = result.canChangeWater;
      busy = result.waterChanging;
      fpsText = Math.min(999, Math.max(0, result.displayFps)).toFixed(0).padStart(3, ' ');
    }

    rafId = requestAnimationFrame(frame);
  }

  function startRenderLoop() {
    if (loopRunning) return;
    loopRunning = true;
    lastUiPaint = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopRenderLoop() {
    loopRunning = false;
    cancelAnimationFrame(rafId);
  }

  function timeTravel(ms: number) {
    const result = scene?.timeTravel(ms);
    if (result) absenceLine = describeAbsence(result.elapsedSec, result.ventCount);
  }

  /**
   * Stand up the tank. `startWith` is only for a pet that has just been chosen —
   * an existing one is left to the scene to load, so it goes through catch-up
   * rather than being treated as newly hatched.
   */
  function startScene(startWith?: MarimoState) {
    if (!browser || !container || scene) return;
    try {
      scene = createMarimoScene(container, {
        variant,
        reducedMotion: resolveReducedMotion(settings, systemPrefersReduced),
        detail: settings.detail,
        lighting: resolveLighting(settings),
        startWith
      });
      scene.resize();

      const arrival = scene.takeArrivalResult();
      if (arrival) absenceLine = describeAbsence(arrival.elapsedSec, arrival.ventCount);

      resizeObserver = new ResizeObserver(() => scene?.resize());
      resizeObserver.observe(container);
      startRenderLoop();
    } catch {
      webglSupported = false;
    }
  }

  function stopScene() {
    stopRenderLoop();
    clearTimeout(recallTimer);
    resizeObserver?.disconnect();
    resizeObserver = null;
    scene?.dispose();
    scene = null;
    snapshot = null;
    offscreen = null;
  }

  function chooseFragment(fragment: FragmentStarter) {
    fragments = null;
    startScene(marimoFromFragment(fragment, Date.now()));
  }

  /**
   * Throw the pet away and go back to the chooser.
   *
   * Only ever reached through the options modal — through the confirm, or
   * unguarded from the dev drawer. There is no undo, and the pet may be months
   * old.
   */
  function restart() {
    optionsOpen = false;
    stopScene();
    clearMarimo();
    absenceLine = null;
    fragments = makeFragments();
  }

  /**
   * Apply a settings change.
   *
   * Motion and light are live; detail is not, because the filament buffers are
   * built once and never rebuilt. Rebuilding is safe: `stopScene` disposes,
   * which flushes the pet, and `startScene` with no argument reads it straight
   * back.
   */
  function applySettings(next: MarimoSettings) {
    const rebuild = next.detail !== settings.detail;
    settings = next;
    saveSettings(settings);

    if (rebuild) {
      stopScene();
      startScene();
      return;
    }
    scene?.setReducedMotion(resolveReducedMotion(settings, systemPrefersReduced));
    scene?.setLighting(resolveLighting(settings));
  }

  /** The light switch. Nothing is rebuilt: the room is uniforms all the way down. */
  function toggleLights() {
    applySettings({ ...settings, roomTone: lightsOn ? 'dark' : 'cream' });
  }

  onMount(() => {
    if (!browser || !container) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopRenderLoop();
        scene?.flush();
      } else if (scene) {
        startRenderLoop();
      }
    };
    const onPageHide = () => scene?.flush();
    // Covers the Escape key and the browser's own fullscreen chrome, not just
    // our button.
    const onFullscreenChange = () => {
      isFullscreen = currentFullscreenElement() === wrap;
    };

    // Tracked rather than read once, so a visitor on `auto` who turns the system
    // setting on mid-session gets what they asked for without a reload.
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    systemPrefersReduced = motionQuery?.matches ?? false;
    const onMotionChange = () => {
      systemPrefersReduced = motionQuery?.matches ?? false;
      scene?.setReducedMotion(resolveReducedMotion(settings, systemPrefersReduced));
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    motionQuery?.addEventListener('change', onMotionChange);

    const doc = document as WebkitDocument;
    fullscreenAvailable = Boolean(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
    onFullscreenChange();

    // A first-time visitor picks what to start from. The ambient tank in the
    // post gets one at random instead — it is illustrating the thing, not
    // handing anyone a pet to name.
    const existing = readMarimo();
    if (existing) {
      startScene();
    } else if (variant === 'full') {
      fragments = makeFragments();
    } else {
      startScene(marimoFromFragment(randomFragment(), Date.now()));
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      motionQuery?.removeEventListener('change', onMotionChange);
      stopScene();
    };
  });
</script>

<div class="marimo-tank" class:ambient={variant === 'ambient'} style:--tank-backdrop={backdrop}>
  {#if !webglSupported}
    <p class="fallback">This jar needs WebGL, which is not available in this browser.</p>
  {:else}
    <div class="viewport-wrap" class:fullscreen={isFullscreen} bind:this={wrap}>
      <div
        class="viewport"
        class:holding
        bind:this={container}
        role="application"
        aria-label="A marimo moss ball in a jar of water"
        onpointerdown={(event) => {
          if (!container || !scene) return;
          container.setPointerCapture(event.pointerId);
          const [nx, ny] = pointerNdc(event);
          scene.pointerDown(nx, ny, event.button === 2 || event.shiftKey);
        }}
        onpointermove={(event) => {
          if (!container || !scene) return;
          if (event.buttons === 0) return;
          const [nx, ny] = pointerNdc(event);
          scene.pointerMove(nx, ny);
        }}
        onpointerup={() => scene?.pointerUp()}
        onpointercancel={() => scene?.pointerUp()}
        oncontextmenu={(event) => event.preventDefault()}
      ></div>

      <!--
        Ahead of the chrome in the markup, so the tools and the readout stack
        over it without anything having to claim a z-index.
      -->
      {#if offscreen && snapshot}
        <OffscreenMarkerBadge
          marker={offscreen}
          state={snapshot}
          onGrab={grabFromMarker}
          onRecall={recallFromMarker}
        />
      {/if}

      <!--
        One row, so the buttons keep their spacing however many of them there
        are — fullscreen is absent on iOS, and options only exists on the app.
      -->
      <div class="tools">
        {#if fullscreenAvailable}
          <button
            type="button"
            onclick={toggleFullscreen}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <span class="visually-hidden">{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {#if isFullscreen}
                <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
              {:else}
                <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
              {/if}
            </svg>
          </button>
        {/if}

        {#if variant === 'full'}
          <button
            type="button"
            onclick={toggleLights}
            aria-pressed={lightsOn}
            title={lightsOn ? 'Turn the lights off' : 'Turn the lights on'}
          >
            <span class="visually-hidden">
              {lightsOn ? 'Turn the lights off' : 'Turn the lights on'}
            </span>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {#if lightsOn}
                <!-- Lights on, so the switch offers the dark room back. -->
                <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z" />
              {:else}
                <circle cx="12" cy="12" r="4" />
                <path
                  d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
                />
              {/if}
            </svg>
          </button>

          <button type="button" onclick={() => (optionsOpen = true)} title="Options">
            <span class="visually-hidden">Options</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="3.2" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
          </button>
        {/if}
      </div>

      {#if variant === 'full' && settings.showFps}
        <div class="fps" aria-hidden="true">
          <span class="fps-label">FPS</span><span class="fps-value">{fpsText}</span>
        </div>
      {/if}

      {#if variant === 'ambient'}
        <a class="visit" href={resolve('/marimo')}>Visit the tank &rarr;</a>
      {/if}
    </div>

    {#if fragments}
      <FragmentChooser
        {fragments}
        onChoose={chooseFragment}
        reducedMotion={resolveReducedMotion(settings, systemPrefersReduced)}
      />
    {/if}

    {#if optionsOpen}
      <OptionsModal
        {settings}
        petSummary={snapshot ? describePet(snapshot, Date.now()) : null}
        devTools={devEnabled}
        onChange={applySettings}
        onTimeTravel={timeTravel}
        onRestart={restart}
        onClose={() => (optionsOpen = false)}
      />
    {/if}

    {#if showPanel && snapshot}
      <CarePanel
        state={snapshot}
        {canChangeWater}
        {busy}
        {absenceLine}
        onWaterChange={() => scene?.waterChange()}
        onTumble={() => scene?.tumble()}
        onStir={() => scene?.stir()}
        onDismissAbsence={() => (absenceLine = null)}
      />
    {/if}
  {/if}
</div>

<style lang="scss">
  .marimo-tank {
    display: grid;
    gap: 1rem;
    margin: 0 0 2rem;

    @media (min-width: 46rem) {
      grid-template-columns: minmax(0, 1fr) minmax(13rem, 17rem);
      align-items: start;
    }
  }

  .marimo-tank.ambient {
    grid-template-columns: minmax(0, 1fr);
  }

  .viewport-wrap {
    position: relative;
  }

  /*
   * The class is driven by the fullscreenchange listener rather than a
   * `:fullscreen` selector, so the prefixed and unprefixed pseudo-classes do
   * not have to be written out twice (one unknown selector would void the
   * whole list).
   */
  .viewport-wrap.fullscreen {
    width: 100%;
    height: 100%;
    background: var(--tank-backdrop);

    /* Edge to edge: no jar shape, no frame, no rounded corners on a screen. */
    .viewport {
      height: 100%;
      aspect-ratio: auto;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }

    /* A link out of the page is the wrong thing to offer mid-immersion. */
    .visit {
      display: none;
    }
  }

  .viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 5;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    overflow: hidden;
    background: var(--tank-backdrop);
    box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.3);
    cursor: grab;
    touch-action: none;

    :global(canvas) {
      display: block;
      width: 100%;
      height: 100%;
    }
  }

  .viewport.holding {
    cursor: grabbing;
  }

  .ambient .viewport {
    aspect-ratio: 16 / 10;
  }

  .tools {
    position: absolute;
    top: 0.55rem;
    left: 0.65rem;
    display: flex;
    gap: 0.35rem;

    button {
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
    }

    svg {
      width: 1.05rem;
      height: 1.05rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
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

  .fps {
    position: absolute;
    top: 0.55rem;
    right: 0.65rem;
    display: flex;
    gap: 0.35rem;
    align-items: baseline;
    padding: 0.2rem 0.45rem;
    border-radius: 0.35rem;
    background: rgb(4 10 11 / 0.72);
    color: #9fb3ac;
    font-size: 0.72rem;
    line-height: 1;
    pointer-events: none;
    user-select: none;
  }

  .fps-value {
    display: inline-block;
    width: 3ch;
    font-family: 'Fira Code', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: #dcece6;
  }

  .visit {
    position: absolute;
    right: 0.7rem;
    bottom: 0.7rem;
    padding: 0.3rem 0.6rem;
    border-radius: 0.35rem;
    background: rgb(4 10 11 / 0.78);
    font-size: 0.82rem;
    text-decoration: none;
  }

  .fallback {
    margin: 0;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
  }
</style>
