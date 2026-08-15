<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { resolve } from '$app/paths';
  import ArrivalNote from './slime/ArrivalNote.svelte';
  import BreedPicker from './slime/BreedPicker.svelte';
  import CarePanel from './slime/CarePanel.svelte';
  import EmotionsCard from './slime/EmotionsCard.svelte';
  import OptionsModal from './slime/OptionsModal.svelte';
  import SimControls from './slime/SimControls.svelte';
  import ToolDrawer from './slime/ToolDrawer.svelte';
  import {
    createSlimeScene,
    type SlimeScene,
    type SlimeTool
  } from '$lib/programming/slime/slimeScene';
  import { describeAbsence } from '$lib/programming/slime/careDescription';
  import { breedById, type BreedId } from '$lib/programming/slime/breeds';
  import { clearSlime } from '$lib/programming/slime/persist';
  import {
    effectiveHue,
    loadSettings,
    resolveReducedMotion,
    saveSettings,
    type SlimeSettings
  } from '$lib/programming/slime/settings';
  import { resolveLighting } from '$lib/programming/marimo/lighting';
  import { loadJolt } from '$lib/programming/marimo/joltWorld';
  import type { SlimeState } from '$lib/programming/slime/types';

  interface Props {
    /** 'full' is the app at /slime; 'ambient' is the smaller one for a post. */
    variant?: 'full' | 'ambient';
    showPanel?: boolean;
    showDevTools?: boolean;
  }

  let { variant = 'full', showPanel = variant === 'full', showDevTools = false }: Props = $props();

  let container = $state<HTMLDivElement>();
  let webglSupported = $state(true);
  let scene: SlimeScene | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let viewObserver: IntersectionObserver | null = null;

  let snapshot = $state<SlimeState | null>(null);
  let canFeed = $state(false);
  let holding = $state(false);
  let absenceLine = $state<string | null>(null);
  let fpsText = $state('  --');
  let tool = $state<SlimeTool>('hand');
  let grimeWorst = $state(0);
  let moldy = $state(false);
  let canSparkle = $state(false);
  let ballOut = $state(false);

  let rafId = 0;
  let loopRunning = false;
  let lastUiPaint = 0;

  let systemPrefersReduced = $state(false);
  let settings = $state<SlimeSettings>(loadSettings());
  let optionsOpen = $state(false);

  const devEnabled = $derived(showDevTools && import.meta.env.DEV);
  /** An arrival still in its box: dormant, never revived, never misted. */
  const firstArrival = $derived(
    snapshot?.stage === 'sclerotium' && snapshot.revivals === 0 && snapshot.lastMistAt === 0
  );
  /**
   * Onboarding: the order form comes before the delivery. A first arrival
   * with no breed on record (which includes pets from before the breeder
   * kept records, if they were never woken) picks one — then the arrival
   * note takes over until the first misting.
   * The ambient embed never opens the form — a full-screen modal has no
   * business in the middle of a post; the order gets placed at /slime.
   */
  const showBreedPicker = $derived(firstArrival && snapshot?.breed == null && variant === 'full');
  const showArrivalNote = $derived(
    firstArrival && (snapshot?.breed != null || variant === 'ambient')
  );

  const lightsOn = $derived(settings.roomTone === 'cream');

  function applySettings(next: SlimeSettings) {
    settings = next;
    saveSettings(settings);
    scene?.setReducedMotion(resolveReducedMotion(settings, systemPrefersReduced));
    scene?.setTuning(settings.viscosity, settings.pressure, settings.shape);
    scene?.setMicaLook(settings.micaSize, settings.micaAmount);
    scene?.setColorGrade(effectiveHue(settings), settings.saturation, settings.lightness);
    scene?.setFinish(settings.finish);
    scene?.setLighting(resolveLighting(settings));
  }

  /** The wall switch — the same one the marimo's tank chrome has. */
  function toggleLights() {
    applySettings({ ...settings, roomTone: lightsOn ? 'dark' : 'cream' });
  }

  /**
   * Send the pet back and take delivery of a fresh sclerotium. Only ever
   * reached through the modal's confirm; there is no undo, and the pet may be
   * months old.
   */
  function restart() {
    optionsOpen = false;
    stopScene();
    clearSlime();
    absenceLine = null;
    startScene();
  }

  /**
   * The order form's answer: stamp the breed into the pet, and dress the
   * settings' colourway to match so the whole existing tint path applies it.
   * (The colourway stays repaintable later — a costume over the pedigree.)
   */
  function chooseBreed(id: BreedId) {
    scene?.setBreed(id);
    if (snapshot) snapshot = { ...snapshot, breed: id };
    applySettings({ ...settings, colorway: breedById(id).colorway });
  }

  function selectTool(next: SlimeTool) {
    tool = next;
    scene?.setTool(next);
  }

  // The oats stay in hand as long as the player likes — sprinkling is
  // never rationed; hunger gates the eating, not the pantry.

  // The shaker: at full pearl (or over a crust) it goes back in
  // the drawer on its own.
  $effect(() => {
    if (tool === 'mica' && !canSparkle) selectTool('hand');
  });

  // A crust feels nothing, so there is nothing to pet: the hand comes back.
  $effect(() => {
    if (tool === 'pet' && snapshot?.stage === 'sclerotium') selectTool('hand');
  });


  function pointerNdc(event: PointerEvent): [number, number] {
    const rect = container!.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2
    ];
  }

  function frame(now: number) {
    if (!loopRunning || !scene) return;

    const result = scene.render(now);
    if (result.grabbing !== holding) holding = result.grabbing;

    // The rest of the UI only needs a few updates a second.
    if (now - lastUiPaint >= 250) {
      lastUiPaint = now;
      snapshot = result.state;
      canFeed = result.canFeed;
      moldy = result.moldy;
      grimeWorst = result.grimeWorst;
      canSparkle = result.canSparkle;
      ballOut = result.ballOut;
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
    if (!scene) return;
    const result = scene.timeTravel(ms);
    const after = scene.render(performance.now());
    snapshot = after.state;
    absenceLine = describeAbsence(result, after.state);
  }

  /** Debug: skip the soak and start the hatch now. Only offered over a crust. */
  function emergeNow() {
    if (!scene) return;
    scene.emerge();
    snapshot = scene.render(performance.now()).state;
  }

  /** Debug: skip the drought and curl back up into a sclerotium now. */
  function recrustNow() {
    if (!scene) return;
    scene.recrust();
    snapshot = scene.render(performance.now()).state;
  }

  /** The physics engine, loaded once and shared with any marimo on the page. */
  let physics: Awaited<ReturnType<typeof loadJolt>> | null = null;

  async function startScene() {
    if (!browser) return;
    const jolt = (physics ??= await loadJolt());
    if (!container || scene) return;

    try {
      scene = createSlimeScene(container, {
        jolt,
        variant,
        reducedMotion: resolveReducedMotion(settings, systemPrefersReduced)
      });
      scene.resize();
      scene.setTuning(settings.viscosity, settings.pressure, settings.shape);
      scene.setMicaLook(settings.micaSize, settings.micaAmount);
      scene.setColorGrade(effectiveHue(settings), settings.saturation, settings.lightness);
      scene.setFinish(settings.finish);
      scene.setLighting(resolveLighting(settings));
      // A fresh scene starts empty-handed; keep the drawer honest about it.
      tool = 'hand';

      const arrival = scene.takeArrivalResult();
      const first = scene.render(performance.now());
      snapshot = first.state;
      if (arrival) absenceLine = describeAbsence(arrival, first.state);

      resizeObserver = new ResizeObserver(() => scene?.resize());
      resizeObserver.observe(container);

      // Whether the tank is meaningfully on screen — the ambient variant can
      // sit below the fold of a post with the tab happily visible. While it
      // is not, the scene holds the hatch so nobody misses their slime
      // waking up; 40% of the tank counts as watching.
      viewObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          scene?.setWitnessed(entry.intersectionRatio >= 0.4);
        },
        { threshold: [0, 0.4] }
      );
      viewObserver.observe(container);
      startRenderLoop();
    } catch {
      webglSupported = false;
    }
  }

  function stopScene() {
    stopRenderLoop();
    resizeObserver?.disconnect();
    resizeObserver = null;
    viewObserver?.disconnect();
    viewObserver = null;
    scene?.dispose();
    scene = null;
    snapshot = null;
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

    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    systemPrefersReduced = motionQuery?.matches ?? false;
    const onMotionChange = () => {
      systemPrefersReduced = motionQuery?.matches ?? false;
      scene?.setReducedMotion(resolveReducedMotion(settings, systemPrefersReduced));
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    motionQuery?.addEventListener('change', onMotionChange);

    startScene();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      motionQuery?.removeEventListener('change', onMotionChange);
      stopScene();
    };
  });
</script>

<div class="slime-terrarium" class:ambient={variant === 'ambient'}>
  {#if !webglSupported}
    <p class="fallback">This terrarium needs WebGL, which is not available in this browser.</p>
  {:else}
    <div class="terrarium-column">
      <div
        class="viewport"
        class:holding
        class:tool-aimed={tool !== 'hand' && tool !== 'pet'}
        bind:this={container}
        role="application"
        aria-label="A pet slime in a glass terrarium"
        onpointerdown={(event) => {
          if (!container || !scene) return;
          container.setPointerCapture(event.pointerId);
          const [nx, ny] = pointerNdc(event);
          scene.pointerDown(nx, ny, event.button === 2 || event.shiftKey);
        }}
        onpointermove={(event) => {
          if (!container || !scene) return;
          // Hover moves go through too: the eyes follow the pointer whether
          // or not it is pressing anything.
          const [nx, ny] = pointerNdc(event);
          scene.pointerMove(nx, ny);
        }}
        onpointerup={() => scene?.pointerUp()}
        onpointercancel={() => scene?.pointerUp()}
        oncontextmenu={(event) => event.preventDefault()}
      ></div>

      {#if showBreedPicker}
        <BreedPicker onChoose={chooseBreed} />
      {:else if showArrivalNote}
        <ArrivalNote />
      {/if}

      {#if variant === 'full'}
        <ToolDrawer
          {tool}
          grimy={grimeWorst > 0.08}
          {canFeed}
          {moldy}
          dormant={snapshot?.stage === 'sclerotium'}
          {canSparkle}
          {ballOut}
          onSelect={selectTool}
          onToggleBall={() => scene?.toggleBall()}
        />
        <div class="tools">
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
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              />
            </svg>
          </button>
        </div>
      {/if}

      {#if devEnabled}
        <div class="dev-row">
          <span class="fps" aria-hidden="true">
            <span class="fps-label">FPS</span><span class="fps-value">{fpsText}</span>
          </span>
          <button type="button" onclick={() => timeTravel(6 * 3600 * 1000)}>+6h</button>
          <button type="button" onclick={() => timeTravel(2 * 86400 * 1000)}>+2d</button>
          <button type="button" onclick={() => timeTravel(7 * 86400 * 1000)}>+7d</button>
        </div>
      {/if}

      {#if variant === 'full' && settings.debug}
        <div class="debug-panel">
          <div class="debug-head">
            <span class="debug-title">Debug</span>
            <button
              type="button"
              onclick={emergeNow}
              disabled={snapshot?.stage !== 'sclerotium'}
              title={snapshot?.stage === 'sclerotium'
                ? 'Skip the soak and start the hatch now'
                : 'Only a dormant crust can emerge'}
            >
              Trigger emergence
            </button>
            <button
              type="button"
              onclick={recrustNow}
              disabled={snapshot?.stage === 'sclerotium'}
              title={snapshot?.stage === 'sclerotium'
                ? 'Already a dormant crust'
                : 'Skip the drought and curl back up into a sclerotium now'}
            >
              Back to sclerotium
            </button>
          </div>
          <SimControls {settings} onChange={applySettings} />
        </div>
      {/if}

      {#if variant === 'ambient'}
        <a class="visit" href={resolve('/slime')}>Visit the terrarium &rarr;</a>
      {/if}
    </div>

    {#if showPanel && snapshot}
      <div class="side-column">
        <CarePanel
          state={snapshot}
          {moldy}
          {absenceLine}
          onDismissAbsence={() => (absenceLine = null)}
        />
        <EmotionsCard />
      </div>
    {/if}

    {#if optionsOpen}
      <OptionsModal
        {settings}
        onChange={applySettings}
        onRestart={restart}
        onClose={() => (optionsOpen = false)}
      />
    {/if}
  {/if}
</div>

<style lang="scss">
  .slime-terrarium {
    display: grid;
    gap: 1rem;
    margin: 0 0 2rem;

    @media (min-width: 46rem) {
      grid-template-columns: minmax(0, 1fr) minmax(13rem, 17rem);
      align-items: start;
    }
  }

  .slime-terrarium.ambient {
    grid-template-columns: minmax(0, 1fr);
  }

  .side-column {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .terrarium-column {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }

  .viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    overflow: hidden;
    background: #101214;
    box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 0.3);
    cursor: grab;
    touch-action: none;

    :global(canvas) {
      display: block;
      width: 100%;
      height: 100%;
    }

    /* A quiet photographic vignette over the glass. */
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(115% 100% at 50% 42%, transparent 55%, rgb(4 8 5 / 0.38) 100%);
    }
  }

  .viewport.holding {
    cursor: grabbing;
  }

  .viewport.tool-aimed {
    cursor: crosshair;
  }

  .ambient .viewport {
    aspect-ratio: 16 / 10;
  }

  .tools {
    position: absolute;
    top: 0.55rem;
    left: 0.65rem;

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

  .dev-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;

    button {
      padding: 0.15rem 0.5rem;
      border: 1px solid var(--border-color);
      border-radius: 0.35rem;
      background: none;
      color: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }
  }

  .fps {
    display: inline-flex;
    gap: 0.35rem;
    align-items: baseline;
    padding: 0.2rem 0.45rem;
    border-radius: 0.35rem;
    background: rgb(4 10 11 / 0.72);
    color: #9fb3ac;
    font-size: 0.72rem;
    line-height: 1;
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

  .debug-panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem 0.8rem;
    border: 1px dashed var(--border-color);
    border-radius: 0.5rem;
  }

  .debug-head {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    justify-content: space-between;

    button {
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--border-color);
      border-radius: 0.35rem;
      background: none;
      color: inherit;
      font-size: 0.8rem;
      cursor: pointer;

      &:hover:not(:disabled),
      &:focus-visible {
        border-color: var(--link-color);
      }

      &:disabled {
        opacity: 0.45;
        cursor: default;
      }
    }
  }

  .debug-title {
    font-size: 0.8rem;
    opacity: 0.7;
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
