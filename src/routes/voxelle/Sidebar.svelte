<script lang="ts">
  import './sidebar/shared.css';
  import {
    sidebarOpen,
    modalRequest,
    addPanelStore,
    voxels,
    tool,
    toolPane,
    lastDrawTool,
    encodeModelForUrl
  } from './store/index';
  import { nanoid } from 'nanoid';
  import { storeShareInIndexedDB } from './shareStorage';
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import ToolPicker from './sidebar/ToolPicker.svelte';
  import StrokeModePicker from './sidebar/StrokeModePicker.svelte';
  import ClayModePicker from './sidebar/ClayModePicker.svelte';
  import GeneratorPicker from './sidebar/GeneratorPicker.svelte';
  import SymmetrySection from './sidebar/SymmetrySection.svelte';
  import ColorSection from './sidebar/ColorSection.svelte';
  import CameraSection from './sidebar/CameraSection.svelte';
  import SceneSection from './sidebar/SceneSection.svelte';
  import LightSection from './sidebar/LightSection.svelte';
  import MaterialSection from './sidebar/MaterialSection.svelte';
  import OriginSection from './sidebar/OriginSection.svelte';
  import ShareModal from './sidebar/ShareModal.svelte';
  import NewGridModal from './sidebar/NewGridModal.svelte';
  import ExportGltfModal from './sidebar/ExportGltfModal.svelte';
  import PreferencesModal from './sidebar/PreferencesModal.svelte';
  import StartupScreen from './StartupScreen.svelte';

  const STARTUP_URL = '/voxelle/STARTUP.md';
  const HELP_URL = '/voxelle/HELP.md';

  let showShareModal = $state(false);
  let showNewGridModal = $state(false);
  let showExportGltfModal = $state(false);
  let showPreferencesModal = $state(false);
  let showStartupScreen = $state(false);
  let startupContentUrl = $state(STARTUP_URL);
  let shareUrl = $state('');

  async function openShareModal() {
    if ($voxels.size === 0) return;
    try {
      const encoded = await encodeModelForUrl();
      const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

      if (isLocalhost) {
        const id = nanoid(12);
        await storeShareInIndexedDB(id, encoded);
        shareUrl = `${window.location.origin}${window.location.pathname}?m=${id}`;
      } else {
        const res = await fetch('/api/voxelle/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: encoded })
        });
        if (res.ok) {
          const { id } = await res.json();
          shareUrl = `${window.location.origin}${window.location.pathname}?m=${id}`;
        }
      }
      showShareModal = true;
    } catch {
      // ignore
    }
  }

  function openNewGridModal() {
    showNewGridModal = true;
  }

  function openAddPanel() {
    addPanelStore.set({
      open: true,
      placementAnchorPending: true,
      posX: 0,
      posY: 0,
      posZ: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      shape: 'cube',
      size: 8
    });
  }

  $effect(() => {
    const req = $modalRequest;
    if (req === 'newGrid') {
      openNewGridModal();
      modalRequest.set(null);
    } else if (req === 'share') {
      openShareModal();
      modalRequest.set(null);
    } else if (req === 'add') {
      openAddPanel();
      modalRequest.set(null);
    } else if (req === 'exportGltf') {
      showExportGltfModal = true;
      modalRequest.set(null);
    } else if (req === 'preferences') {
      showPreferencesModal = true;
      modalRequest.set(null);
    } else if (req === 'help') {
      startupContentUrl = HELP_URL;
      showStartupScreen = true;
      modalRequest.set(null);
    } else if (req === 'startup') {
      startupContentUrl = STARTUP_URL;
      showStartupScreen = true;
      modalRequest.set(null);
    }
  });
</script>

<ArtSidebar open={sidebarOpen}>
  <div class="tool-panes">
    <div class="tab-bar" role="tablist">
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'hand'}
        aria-selected={$toolPane === 'hand'}
        onclick={() => {
          toolPane.set('hand');
          tool.set('hand');
        }}
      >
        ✋
      </button>
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'draw'}
        aria-selected={$toolPane === 'draw'}
        onclick={() => {
          toolPane.set('draw');
          tool.set(
            $lastDrawTool === 'fly' ||
              $lastDrawTool === 'clay' ||
              $lastDrawTool === 'hand' ||
              $lastDrawTool === 'rocks' ||
              $lastDrawTool === 'grass' ||
              $lastDrawTool === 'ashlar' ||
              $lastDrawTool === 'roof'
              ? 'remove'
              : $lastDrawTool
          );
        }}
      >
        Draw
      </button>
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'clay'}
        aria-selected={$toolPane === 'clay'}
        onclick={() => {
          toolPane.set('clay');
          tool.set('clay');
        }}
      >
        Clay
      </button>
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'generators'}
        aria-selected={$toolPane === 'generators'}
        onclick={() => {
          toolPane.set('generators');
          tool.set('rocks');
        }}
      >
        Generators
      </button>
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'fly'}
        aria-selected={$toolPane === 'fly'}
        onclick={() => {
          toolPane.set('fly');
          tool.set('fly');
        }}
      >
        Fly
      </button>
    </div>
    {#if $toolPane === 'draw'}
      <div role="tabpanel">
        <ToolPicker />
        <StrokeModePicker />
        <SymmetrySection />
      </div>
    {:else if $toolPane === 'clay'}
      <div role="tabpanel">
        <ClayModePicker />
        <SymmetrySection />
      </div>
    {:else if $toolPane === 'generators'}
      <div role="tabpanel">
        <GeneratorPicker />
        <SymmetrySection />
      </div>
    {:else if $toolPane === 'hand'}
      <div role="tabpanel" class="fly-tab">
        <p class="fly-hint">Drag anywhere on the canvas to orbit/pan without affecting voxels.</p>
      </div>
    {:else}
      <div role="tabpanel" class="fly-tab">
        <p class="fly-hint">
          Click the canvas to capture the pointer, then WASD to move, E/Q up/down, Shift for 1/8
          speed. Move mouse to look. Escape to exit.
        </p>
      </div>
    {/if}
  </div>
  <ColorSection />
  <MaterialSection />
  <CameraSection />
  <SceneSection />
  <LightSection />
  <OriginSection />

  <ShareModal bind:open={showShareModal} {shareUrl} />
  <NewGridModal bind:open={showNewGridModal} />
  <ExportGltfModal bind:open={showExportGltfModal} />
  <PreferencesModal bind:open={showPreferencesModal} />
  <StartupScreen
    bind:open={showStartupScreen}
    contentUrl={startupContentUrl}
    showDontShowCheckbox={startupContentUrl === STARTUP_URL}
  />
</ArtSidebar>

<style>
  .tool-panes {
    margin-bottom: 0.5rem;
  }

  .fly-tab {
    margin-top: 0.25rem;
  }

  .fly-hint {
    font-size: 0.85rem;
    color: var(--text-color);
    opacity: 0.85;
    margin: 0;
    line-height: 1.4;
  }

  .tab-bar {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .tab-bar button {
    flex: 1;
    padding: 0.4rem 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .tab-bar button:hover:not(.active) {
    background: var(--block-quote-bg-color);
  }

  .tab-bar button.active {
    background: var(--link-color);
    border-color: var(--link-color);
  }

  :global(body:not(.light-mode)) .tab-bar button.active {
    color: white;
    background: color-mix(in srgb, var(--link-color) 70%, black);
    border-color: color-mix(in srgb, var(--link-color) 70%, black);
  }

  :global(body.light-mode) .tab-bar button.active {
    color: var(--text-color);
    background: color-mix(in srgb, var(--link-color) 20%, var(--bg-color));
    border-color: var(--link-color);
  }
</style>
