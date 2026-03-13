<script lang="ts">
  import { tool, color, palette } from '../store';
  import LospecPalette from '$lib/components/LospecPalette.svelte';
</script>

<div class:dimmed={$tool === 'remove'}>
  <h2>Color</h2>
  <div class="color-row">
    <input
      id="color-picker"
      type="color"
      value={$color}
      oninput={(e) => color.set((e.target as HTMLInputElement).value)}
      disabled={$tool === 'remove'}
    />
    <input
      type="text"
      class="color-hex"
      value={$color}
      oninput={(e) => color.set((e.target as HTMLInputElement).value)}
    />
  </div>
  <LospecPalette {color} {palette} disabled={$tool === 'remove'} defaultSlug="resurrect-64" />
</div>

<style>

  .color-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  #color-picker {
    width: 2.5rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }

  #color-picker:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .color-hex {
    flex: 1;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    font-family: monospace;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }
</style>
