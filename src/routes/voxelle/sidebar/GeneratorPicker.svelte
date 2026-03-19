<script lang="ts">
  import { tool } from '../store/index';
</script>

<h2>Generators</h2>
<div class="tool-buttons">
  <button
    type="button"
    class:active={$tool === 'rocks'}
    onclick={() => tool.set('rocks')}
    title="Place procedural rocks"
  >
    Rocks
  </button>
  <button
    type="button"
    class:active={$tool === 'grass'}
    onclick={() => tool.set('grass')}
    title="Paint grass or fuzz on surface"
  >
    Grass
  </button>
  <button
    type="button"
    class:active={$tool === 'ashlar'}
    onclick={() => tool.set('ashlar')}
    title="Place rough stone blocks for walls. Right-click to regenerate block."
  >
    Ashlar
  </button>
</div>

<style>
  .tool-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .tool-buttons button {
    padding: 0.4rem 0.6rem;
    font-size: 0.9rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }
  .tool-buttons button:hover:not(:disabled) {
    background: var(--block-quote-bg-color);
  }
  .tool-buttons button.active {
    background: var(--link-color);
    border-color: var(--link-color);
  }
  :global(body:not(.light-mode)) .tool-buttons button.active {
    color: white;
    background: color-mix(in srgb, var(--link-color) 70%, black);
    border-color: color-mix(in srgb, var(--link-color) 70%, black);
  }
  :global(body.light-mode) .tool-buttons button.active {
    color: var(--text-color);
    background: color-mix(in srgb, var(--link-color) 20%, var(--bg-color));
    border-color: var(--link-color);
  }
  h2 {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
    color: var(--text-color);
  }
</style>
