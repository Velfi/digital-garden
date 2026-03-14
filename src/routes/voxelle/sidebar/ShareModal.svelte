<script lang="ts">
  let { open = $bindable(false), shareUrl = '' }: { open?: boolean; shareUrl?: string } = $props();

  function selectOnMount(node: HTMLInputElement) {
    node?.focus();
    node?.select();
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
    <div class="modal modal--share">
      <h3>Share link</h3>
      <label>
        Copy this URL to share your model
        <input type="text" readonly value={shareUrl} use:selectOnMount class="share-url-input" />
      </label>
      <div class="modal-buttons">
        <button type="button" onclick={() => (open = false)}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal--share {
    min-width: min(90vw, 36rem);
  }

  .share-url-input {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }
</style>
