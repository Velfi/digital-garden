<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import {
    mode,
    modalRequest,
    document as docStore,
    cells,
    undo,
    redo,
    metalTool,
    colorsTool,
    getSkipStartup,
    pickKind,
    copySelectedPaths,
    cutSelectedPaths,
    pastePaths,
    editingTextId
  } from './store';
  import MetalCanvas from './MetalCanvas.svelte';
  import ColorsCanvas from './ColorsCanvas.svelte';
  import RenderCanvas from './RenderCanvas.svelte';
  import MenuBar from './MenuBar.svelte';
  import Sidebar from './Sidebar.svelte';
  import NewBadgeModal from './NewBadgeModal.svelte';
  import HelpModal from './HelpModal.svelte';
  import ShareModal from './ShareModal.svelte';
  import OptionsModal from './OptionsModal.svelte';
  import { downloadSvg } from './exportSvg';
  import { downloadTextures } from './exportTextures';
  import { nanoid } from 'nanoid';
  import { upload } from '@vercel/blob/client';
  import { storeShareInIndexedDB, getShareFromIndexedDB } from './shareStorage';
  import { validateBadgeDocument } from './store/validate';
  import { restoreUploadedFonts } from './store/fontLibrary';

  let showNewBadge = $state(false);
  let showHelp = $state(false);
  let showStartup = $state(false);
  let showShare = $state(false);
  let showOptions = $state(false);
  let shareUrl = $state('');

  // Matches the server-side MAX_SHARE_BYTES cap in api/badger/share/upload.
  // Kept as a client-side second line of defense — the blob store enforces
  // the upload limit, but a tampered/legacy blob could still be larger than
  // we want to pull into memory and JSON.parse.
  const MAX_SHARE_BYTES = 4 * 1024 * 1024;

  async function loadSharedBadgeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('m');
    if (!id) return;
    // Only accept the same shape the server accepts so a crafted URL can't
    // steer us at an unexpected path.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return;
    const isLocalhost = window.location.hostname === 'localhost';
    let json: string | null = null;
    if (isLocalhost) {
      try {
        json = await getShareFromIndexedDB(id);
      } catch {
        /* ignore */
      }
    }
    if (!json) {
      try {
        const res = await fetch(`/api/badger/model/${id}`);
        if (res.ok) {
          const len = Number(res.headers.get('content-length'));
          if (Number.isFinite(len) && len > MAX_SHARE_BYTES) return;
          const text = await res.text();
          if (text.length > MAX_SHARE_BYTES) return;
          json = text;
        }
      } catch {
        /* ignore */
      }
    }
    if (!json) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return;
    }
    const doc = validateBadgeDocument(parsed);
    if (doc) docStore.set(doc);
  }

  async function openShareModal() {
    try {
      const doc = get(docStore);
      const json = JSON.stringify(doc);
      const id = nanoid(12);
      const isLocalhost = window.location.hostname === 'localhost';
      if (isLocalhost) {
        await storeShareInIndexedDB(id, json);
      } else {
        const body = new Blob([json], { type: 'application/json' });
        await upload(`badger/${id}`, body, {
          access: 'public',
          handleUploadUrl: '/api/badger/share/upload',
          contentType: 'application/json'
        });
      }
      shareUrl = `${window.location.origin}${window.location.pathname}?m=${id}`;
      showShare = true;
    } catch (e) {
      console.error('[badger] share failed', e);
    }
  }

  onMount(() => {
    loadSharedBadgeFromUrl();
    // Rehydrate uploaded-font bytes from IndexedDB. System-font handles
    // don't survive reload on non-Chromium browsers, so they get a fresh
    // "Browse system fonts" button — but uploaded fonts come back automatically.
    restoreUploadedFonts().catch(() => {
      /* ignore — library stays empty, user can re-upload */
    });
    if (!getSkipStartup()) showStartup = true;
  });

  $effect(() => {
    const req = $modalRequest;
    if (req === 'newBadge') {
      showNewBadge = true;
      modalRequest.set(null);
    } else if (req === 'help') {
      showHelp = true;
      modalRequest.set(null);
    } else if (req === 'startup') {
      showStartup = true;
      modalRequest.set(null);
    } else if (req === 'exportSvg') {
      downloadSvg(get(docStore), get(cells));
      modalRequest.set(null);
    } else if (req === 'exportTextures') {
      downloadTextures(get(docStore), get(cells));
      modalRequest.set(null);
    } else if (req === 'share') {
      openShareModal();
      modalRequest.set(null);
    } else if (req === 'options') {
      showOptions = true;
      modalRequest.set(null);
    }
    // exportPng and exportGlb are handled inside RenderCanvas when mode === 'render'.
    // If user asks for them while not in render mode, flip the mode first.
    if (req === 'exportPng' || req === 'exportGlb') {
      if (get(mode) !== 'render') mode.set('render');
    }
  });

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const inInput =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT');
    if (inInput) return;
    // While typing in a text element on the canvas, the MetalCanvas handles
    // its own keyboard. Suppress global shortcuts so keys like 'v' don't flip
    // the tool mid-word. Undo/redo and mode keys still route through here
    // after commit (MetalCanvas commits before calling preventDefault).
    if ($editingTextId) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    // Clipboard — only meaningful in metal mode where path selection lives.
    if ((e.ctrlKey || e.metaKey) && $mode === 'metal') {
      const k = e.key.toLowerCase();
      if (k === 'c') {
        if (copySelectedPaths()) e.preventDefault();
        return;
      }
      if (k === 'x') {
        if (cutSelectedPaths()) e.preventDefault();
        return;
      }
      if (k === 'v') {
        if (pastePaths()) e.preventDefault();
        return;
      }
    }
    // mode shortcuts
    if (e.key === '1') mode.set('metal');
    else if (e.key === '2') mode.set('colors');
    else if (e.key === '3') mode.set('render');
    // metal tool shortcuts
    if ($mode === 'metal') {
      if (e.key === 'v') metalTool.set('select');
      else if (e.key === 'h') metalTool.set('grab');
      else if (e.key === 'p') metalTool.set('pen');
      else if (e.key === 'n') metalTool.set('pencil');
      else if (e.key === 'l') metalTool.set('line');
      else if (e.key === 'r') metalTool.set('rect');
      else if (e.key === 'e') metalTool.set('ellipse');
      else if (e.key === 'g') metalTool.set('polygon');
      else if (e.key === 't') metalTool.set('trim');
      else if (e.key === 'w') metalTool.set('text');
      // kind shortcuts (apply to selection, or set default)
      else if (e.key === 's') pickKind('shape');
      else if (e.key === 'x') pickKind('cutout');
    }
    if ($mode === 'colors') {
      if (e.key === 'f') colorsTool.set('fill');
      else if (e.key === 'i') colorsTool.set('eyedropper');
    }
  }
</script>

<svelte:head>
  <title>Badger</title>
  <meta name="description" content="A web app for designing enamel badges." />
  <meta name="keywords" content="badger, enamel, badge, design, svg, 3d" />
</svelte:head>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header class="header">
    <h1>Badger</h1>
    <MenuBar />
    <div class="mode-switch" role="tablist" aria-label="Badge mode">
      <button
        type="button"
        role="tab"
        class:active={$mode === 'metal'}
        aria-selected={$mode === 'metal'}
        onclick={() => mode.set('metal')}
      >
        Metal
      </button>
      <button
        type="button"
        role="tab"
        class:active={$mode === 'colors'}
        aria-selected={$mode === 'colors'}
        onclick={() => mode.set('colors')}
      >
        Colors
      </button>
      <button
        type="button"
        role="tab"
        class:active={$mode === 'render'}
        aria-selected={$mode === 'render'}
        onclick={() => mode.set('render')}
      >
        Render
      </button>
    </div>
  </header>

  <div class="workspace">
    <Sidebar />
    <div class="canvas-area">
      {#if $mode === 'metal'}
        <MetalCanvas />
      {:else if $mode === 'colors'}
        <ColorsCanvas />
      {:else}
        <RenderCanvas />
      {/if}
    </div>
  </div>
</div>

<NewBadgeModal bind:open={showNewBadge} />
<HelpModal bind:open={showHelp} />
<HelpModal bind:open={showStartup} showDontShowCheckbox={true} title="Welcome to Badger" />
<ShareModal bind:open={showShare} {shareUrl} />
<OptionsModal bind:open={showOptions} />

<style lang="scss">
  .app {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
    min-height: calc(100vh - 4rem);
    min-height: calc(100dvh - 4rem);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .mode-switch {
    display: flex;
    gap: 0;
    margin-left: auto;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    overflow: hidden;
  }

  .mode-switch button {
    padding: 0.35rem 0.9rem;
    border: none;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .mode-switch button:not(:last-child) {
    border-right: 1px solid var(--border-color);
  }

  .mode-switch button.active {
    background: var(--link-color);
    color: var(--bg-color);
  }

  .workspace {
    display: flex;
    gap: 1rem;
    align-items: stretch;
    flex: 1 1 0;
    min-height: 0;
    height: 0;
  }

  .canvas-area {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
  }
</style>
