<script lang="ts">
  import { tool, ashlarSize, ashlarRoughness, ashlarThickness } from '../store/index';
</script>

{#if $tool === 'ashlar'}
  <section class="tool-panel-section" aria-label="Ashlar">
    <div class="tool-panel-row">
      <span class="tool-panel-label">Size</span>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        value={$ashlarSize}
        oninput={(e) => ashlarSize.set(Number((e.target as HTMLInputElement).value))}
        title="Block scale (1–20 voxels per dimension)"
      />
      <span class="tool-panel-value">{$ashlarSize}</span>
    </div>
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Roughness</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round($ashlarRoughness * 100)}
        oninput={(e) => ashlarRoughness.set(Number((e.target as HTMLInputElement).value) / 100)}
        title="Edge irregularity (0–100%)"
      />
      <span class="tool-panel-value">{Math.round($ashlarRoughness * 100)}%</span>
    </div>
    <div class="tool-panel-row tool-panel-row--wide-label">
      <span class="tool-panel-label">Thickness</span>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        value={$ashlarThickness}
        oninput={(e) => ashlarThickness.set(Number((e.target as HTMLInputElement).value))}
        title="Depth along surface normal (1–20 voxels); thin walls"
      />
      <span class="tool-panel-value">{$ashlarThickness}</span>
    </div>
  </section>
{/if}
