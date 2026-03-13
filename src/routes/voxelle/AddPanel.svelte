<script lang="ts">
  import {
    addPanelStore,
    addShapeAt,
    hexToInt,
    color,
    sidebarOpen,
    type StartShape
  } from './store';

  function handleDone() {
    const s = $addPanelStore;
    const size = Math.max(1, Math.min(256, Math.floor(s.size)));
    const rx = Math.max(0, Math.min(3, Math.floor(s.rotX))) & 3;
    const ry = Math.max(0, Math.min(3, Math.floor(s.rotY))) & 3;
    const rz = Math.max(0, Math.min(3, Math.floor(s.rotZ))) & 3;
    addShapeAt({
      position: [s.posX, s.posY, s.posZ],
      rotation: [rx, ry, rz],
      shape: s.shape,
      size,
      color: hexToInt($color)
    });
    addPanelStore.update((x) => ({ ...x, open: false }));
  }

  function handleCancel() {
    addPanelStore.update((x) => ({ ...x, open: false }));
  }

  function update<K extends keyof typeof $addPanelStore>(k: K, v: (typeof $addPanelStore)[K]) {
    addPanelStore.update((s) => ({ ...s, [k]: v }));
  }
</script>

{#if $addPanelStore.open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="add-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-panel-title"
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && handleCancel()}
  >
    <h3 id="add-panel-title">Add shape</h3>
    <div class="add-panel-row">
      <span class="add-panel-label">Pos</span>
      <input
        type="number"
        value={$addPanelStore.posX}
        oninput={(e) => update('posX', Number((e.target as HTMLInputElement).value))}
        title="X"
      />
      <input
        type="number"
        value={$addPanelStore.posY}
        oninput={(e) => update('posY', Number((e.target as HTMLInputElement).value))}
        title="Y"
      />
      <input
        type="number"
        value={$addPanelStore.posZ}
        oninput={(e) => update('posZ', Number((e.target as HTMLInputElement).value))}
        title="Z"
      />
    </div>
    <div class="add-panel-row">
      <span class="add-panel-label">Rot</span>
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$addPanelStore.rotX}
        oninput={(e) => update('rotX', Number((e.target as HTMLInputElement).value))}
        title="X (0–3 = 0°–270°)"
      />
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$addPanelStore.rotY}
        oninput={(e) => update('rotY', Number((e.target as HTMLInputElement).value))}
        title="Y"
      />
      <input
        type="number"
        min="0"
        max="3"
        step="1"
        value={$addPanelStore.rotZ}
        oninput={(e) => update('rotZ', Number((e.target as HTMLInputElement).value))}
        title="Z"
      />
    </div>
    <div class="add-panel-row">
      <span class="add-panel-label">Shape</span>
      <select
        value={$addPanelStore.shape}
        onchange={(e) => update('shape', (e.target as HTMLSelectElement).value as StartShape)}
      >
        <option value="cube">Cube</option>
        <option value="orb">Orb</option>
        <option value="cylinder">Cylinder</option>
        <option value="hollowCube">Hollow cube</option>
        <option value="plane">Plane</option>
      </select>
    </div>
    <div class="add-panel-row">
      <span class="add-panel-label">Size</span>
      <input
        type="number"
        min="1"
        max="256"
        step="1"
        value={$addPanelStore.size}
        oninput={(e) => update('size', Number((e.target as HTMLInputElement).value))}
      />
    </div>
    <div class="add-panel-buttons">
      <button type="button" onclick={handleDone}>Done</button>
      <button type="button" onclick={handleCancel}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .add-panel {
    position: fixed;
    bottom: 1rem;
    left: calc(1.5rem + 1rem);
    z-index: 100;
    background: var(--bg-color);
    color: var(--text-color);
    padding: 0.75rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 12rem;
    max-width: 16rem;
  }

  .add-panel.sidebar-open {
    left: calc(360px + 1rem);
  }

  .add-panel h3 {
    margin: 0 0 0.25rem 0;
    font-size: 0.95rem;
  }

  .add-panel-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .add-panel-label {
    flex-shrink: 0;
    width: 2.5rem;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .add-panel-row input[type='number'],
  .add-panel-row select {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.35rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
  }

  .add-panel-row input[type='number'] {
    width: 3rem;
  }

  .add-panel-row select {
    flex: 1;
  }

  .add-panel-buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .add-panel-buttons button {
    flex: 1;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-color);
    color: var(--text-color);
    cursor: pointer;
  }

  .add-panel-buttons button:hover {
    background: var(--block-quote-bg-color);
  }
</style>
