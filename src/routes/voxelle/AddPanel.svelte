<script lang="ts">
  import {
    addPanelStore,
    addShapeAt,
    clampQuarterTurn,
    closeAddPanel,
    getPaintColorResolver,
    placePastePatternAt,
    sidebarOpen,
    MAX_GRID_SIZE,
    type StartShape
  } from './store/index';

  const ADD_SHAPE_MAX_SIZE = Math.min(1024, MAX_GRID_SIZE);

  function handleDone() {
    const s = $addPanelStore;
    const rx = clampQuarterTurn(s.rotX);
    const ry = clampQuarterTurn(s.rotY);
    const rz = clampQuarterTurn(s.rotZ);
    if (s.mode === 'paste' && s.pasteEntries && s.pasteEntries.length > 0) {
      placePastePatternAt([s.posX, s.posY, s.posZ], [rx, ry, rz], s.pasteEntries);
    } else {
      const size = Math.max(1, Math.min(ADD_SHAPE_MAX_SIZE, Math.floor(s.size)));
      addShapeAt({
        position: [s.posX, s.posY, s.posZ],
        rotation: [rx, ry, rz],
        shape: s.shape,
        size,
        getVoxel: getPaintColorResolver(),
        overwriteIntersecting: s.overwriteIntersecting
      });
    }
    closeAddPanel();
  }

  function handleCancel() {
    closeAddPanel();
  }

  function update<K extends keyof typeof $addPanelStore>(k: K, v: (typeof $addPanelStore)[K]) {
    addPanelStore.update((s) => ({ ...s, [k]: v }));
  }
</script>

{#if $addPanelStore.open}
  <div
    class="add-panel"
    class:sidebar-open={$sidebarOpen}
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-panel-title"
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && handleCancel()}
  >
    <h3 id="add-panel-title">{$addPanelStore.mode === 'paste' ? 'Place paste' : 'Add shape'}</h3>
    <p class="add-panel-hint">
      {#if $addPanelStore.mode === 'paste'}
        Ghost preview until Done. Drag RGB axes to move. Wheel: <kbd>Shift</kbd> / <kbd>Alt</kbd> /
        <kbd>Shift</kbd>+<kbd>Alt</kbd> rotate X / Y / Z (90° steps). Mirror symmetry applies on Done.
      {:else}
        Ghost preview only until Done. Drag RGB axes to move. Wheel: <kbd>Ctrl</kbd> size,
        <kbd>Shift</kbd>/<kbd>Alt</kbd>/<kbd>Shift</kbd>+<kbd>Alt</kbd> rotate X / Y / Z (90° steps).
      {/if}
    </p>
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
    {#if $addPanelStore.mode === 'shape'}
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
          <option value="circle">Circle</option>
        </select>
      </div>
      <div class="add-panel-row">
        <span class="add-panel-label">Size</span>
        <input
          type="number"
          min="1"
          max={ADD_SHAPE_MAX_SIZE}
          step="1"
          value={$addPanelStore.size}
          oninput={(e) => update('size', Number((e.target as HTMLInputElement).value))}
        />
      </div>
      <div class="add-panel-row add-panel-row-toggle">
        <label class="add-panel-toggle-label">
          <input
            type="checkbox"
            checked={$addPanelStore.overwriteIntersecting}
            onchange={(e) =>
              update('overwriteIntersecting', (e.target as HTMLInputElement).checked)}
          />
          Overwrite existing voxels
        </label>
      </div>
    {/if}
    <div class="add-panel-buttons">
      <button type="button" onclick={handleDone}>Done</button>
      <button type="button" onclick={handleCancel}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .add-panel-hint {
    font-size: 0.75rem;
    opacity: 0.85;
    margin: 0 0 0.75rem;
    line-height: 1.35;
  }

  .add-panel-hint kbd {
    font-size: 0.7rem;
    padding: 0.05em 0.35em;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  }

  .add-panel-row select {
    flex: 1;
  }

  .add-panel-row-toggle {
    align-items: center;
  }

  .add-panel-toggle-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    cursor: pointer;
    user-select: none;
  }
</style>
