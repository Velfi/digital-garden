<script lang="ts">
  import {
    sidebarOpen,
    modalRequest,
    addPanelStore,
    voxels,
    tool,
    toolPane,
    lastDrawTool,
    encodeModelForUrl
  } from './store';
  import { nanoid } from 'nanoid';
  import { storeShareInIndexedDB } from './shareStorage';
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import ToolPicker from './sidebar/ToolPicker.svelte';
  import StrokeModePicker from './sidebar/StrokeModePicker.svelte';
  import ClayModePicker from './sidebar/ClayModePicker.svelte';
  import ColorSection from './sidebar/ColorSection.svelte';
  import CameraSection from './sidebar/CameraSection.svelte';
  import SceneSection from './sidebar/SceneSection.svelte';
  import LightSection from './sidebar/LightSection.svelte';
  import MaterialSection from './sidebar/MaterialSection.svelte';
  import OriginSection from './sidebar/OriginSection.svelte';
  import ShareModal from './sidebar/ShareModal.svelte';
  import NewGridModal from './sidebar/NewGridModal.svelte';

  let showShareModal = $state(false);
  let showNewGridModal = $state(false);
  let shareUrl = $state('');

  async function openShareModal() {
    if ($voxels.size === 0) return;
    try {
      const encoded = await encodeModelForUrl();
      const isLocalhost =
        typeof window !== 'undefined' && window.location.hostname === 'localhost';

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
    }
  });
</script>

<ArtSidebar open={sidebarOpen}>
  <div class="tool-panes">
    <div class="tab-bar" role="tablist">
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'draw'}
        aria-selected={$toolPane === 'draw'}
        onclick={() => {
          toolPane.set('draw');
          tool.set($lastDrawTool);
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
    </div>
    {#if $toolPane === 'draw'}
      <div role="tabpanel">
        <ToolPicker />
        <StrokeModePicker />
      </div>
    {:else}
      <div role="tabpanel">
        <ClayModePicker />
      </div>
    {/if}
  </div>
  <ColorSection />
  <CameraSection />
  <SceneSection />
  <LightSection />
  <MaterialSection />
  <OriginSection />

  <ShareModal bind:open={showShareModal} {shareUrl} />
  <NewGridModal bind:open={showNewGridModal} />
</ArtSidebar>

<style>
  .tool-panes {
    margin-bottom: 0.5rem;
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
