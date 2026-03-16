<script lang="ts">
  import { canvasWidth, canvasHeight, canvasKey } from '../store';

  let { open = $bindable(false) } = $props();

  let newWidth = $state<number>(800);
  let newHeight = $state<number>(600);

  $effect(() => {
    if (!open) return;
    newWidth = Math.max(100, Math.min(2000, Number($canvasWidth) || 800));
    newHeight = Math.max(100, Math.min(2000, Number($canvasHeight) || 600));
  });

  function createCanvas() {
    const width = Math.max(100, Math.min(2000, Math.round(Number(newWidth) || 800)));
    const height = Math.max(100, Math.min(2000, Math.round(Number(newHeight) || 600)));
    canvasWidth.set(width);
    canvasHeight.set(height);
    canvasKey.update((k) => k + 1);
    open = false;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal">
      <h3>New canvas</h3>
      <label>
        Width
        <input type="number" min="100" max="2000" bind:value={newWidth} />
      </label>
      <label>
        Height
        <input type="number" min="100" max="2000" bind:value={newHeight} />
      </label>
      <div class="modal-buttons">
        <button type="button" onclick={createCanvas}>Create</button>
        <button type="button" onclick={() => (open = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
