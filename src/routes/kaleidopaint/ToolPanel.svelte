<script lang="ts">
  import {
    tool,
    sidebarOpen,
    imageStampSize,
    loadedImage,
    imageRotateWithSymmetry,
    imageConstrainToSection
  } from './store';
  const show = $derived($tool === 'image' && !!$loadedImage);
</script>

{#if show}
  <div
    class="tool-panel add-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    aria-modal="false"
    aria-label="Tool options"
    tabindex="-1"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
  >
    {#if $tool === 'image' && $loadedImage}
      <h3>Image quick options</h3>
      <div class="add-panel-row">
        <span class="add-panel-label">Size</span>
        <input type="range" min="50" max="400" bind:value={$imageStampSize} />
        <span class="slider-value">{$imageStampSize}px</span>
      </div>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={$imageRotateWithSymmetry} />
        Rotate with symmetry
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={$imageConstrainToSection} />
        Constrain to section
      </label>
    {/if}
  </div>
{/if}

<style>
  .tool-panel {
    bottom: 1rem;
    left: 1rem;
    right: auto;
    min-width: 14rem;
    max-width: 18rem;
  }

  .tool-panel.sidebar-open {
    left: calc(360px + 1rem);
  }
</style>
