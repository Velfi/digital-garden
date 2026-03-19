<script lang="ts">
  import { voxels } from '../store/index';
  import { exportVoxelsToGltf } from '../exportGltf';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let filename = $state('voxelle');
  let greedyRemesh = $state(false);

  $effect(() => {
    if (open) {
      filename = 'voxelle';
      greedyRemesh = false;
    }
  });

  async function handleExport() {
    if ($voxels.size === 0) return;
    await exportVoxelsToGltf($voxels, filename, { greedyRemesh });
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
    <div class="modal modal--export-gltf">
      <h3>Save as GLTF</h3>
      <label>
        Filename
        <input type="text" bind:value={filename} placeholder="voxelle" class="filename-input" />
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={greedyRemesh} />
        Greedy remesh (fewer triangles, merged faces)
      </label>
      <div class="modal-buttons">
        <button type="button" onclick={handleExport} disabled={$voxels.size === 0}> Export </button>
        <button type="button" onclick={() => (open = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal--export-gltf {
    min-width: min(90vw, 28rem);
  }

  .filename-input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }
</style>
