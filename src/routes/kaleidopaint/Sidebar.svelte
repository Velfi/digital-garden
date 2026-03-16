<script lang="ts">
  import '../voxelle/sidebar/shared.css';
  import { sidebarOpen, toolPane, modalRequest } from './store';
  import ArtSidebar from '$lib/components/ArtSidebar.svelte';
  import ColorPane from './sidebar/ColorPane.svelte';
  import DrawPane from './sidebar/DrawPane.svelte';
  import SymmetryPane from './sidebar/SymmetryPane.svelte';
  import NewCanvasModal from './sidebar/NewCanvasModal.svelte';
  import HelpModal from './sidebar/HelpModal.svelte';

  let showNewCanvas = $state(false);
  let showHelp = $state(false);
  let showStartup = $state(false);

  function exportCanvas() {
    const canvas = document.getElementById('kaleido-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'kaleidopaint.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  $effect(() => {
    const req = $modalRequest;
    if (req === 'newCanvas') {
      showNewCanvas = true;
      modalRequest.set(null);
    } else if (req === 'help') {
      showHelp = true;
      modalRequest.set(null);
    } else if (req === 'startup') {
      showStartup = true;
      modalRequest.set(null);
    } else if (req === 'exportPng') {
      exportCanvas();
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
        class:active={$toolPane === 'color'}
        aria-selected={$toolPane === 'color'}
        onclick={() => toolPane.set('color')}
      >
        Color
      </button>
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'draw'}
        aria-selected={$toolPane === 'draw'}
        onclick={() => toolPane.set('draw')}
      >
        Draw
      </button>
      <button
        type="button"
        role="tab"
        class:active={$toolPane === 'symmetry'}
        aria-selected={$toolPane === 'symmetry'}
        onclick={() => toolPane.set('symmetry')}
      >
        Symmetry
      </button>
    </div>
    {#if $toolPane === 'color'}
      <div role="tabpanel">
        <ColorPane />
      </div>
    {:else if $toolPane === 'draw'}
      <div role="tabpanel">
        <DrawPane />
      </div>
    {:else}
      <div role="tabpanel">
        <SymmetryPane />
      </div>
    {/if}
  </div>

  <NewCanvasModal bind:open={showNewCanvas} />
  <HelpModal bind:open={showHelp} />
  <HelpModal
    bind:open={showStartup}
    contentUrl="/kaleidopaint/STARTUP.md"
    title="Welcome to Kaleidopaint"
    showDontShowCheckbox={true}
  />
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

  .tab-bar button.active {
    background: var(--link-color);
    border-color: var(--link-color);
    color: var(--bg-color);
  }
</style>
