<script lang="ts">
  import {
    sidebarOpen,
    modalRequest,
    addPanelStore,
    voxels,
    encodeModelForUrl
  } from './store';
  import { nanoid } from 'nanoid';
  import { storeShareInIndexedDB } from './shareStorage';
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import ToolPicker from './sidebar/ToolPicker.svelte';
  import StrokeModePicker from './sidebar/StrokeModePicker.svelte';
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
  <ToolPicker />
  <StrokeModePicker />
  <ColorSection />
  <CameraSection />
  <SceneSection />
  <LightSection />
  <MaterialSection />
  <OriginSection />

  <ShareModal bind:open={showShareModal} {shareUrl} />
  <NewGridModal bind:open={showNewGridModal} />
</ArtSidebar>
