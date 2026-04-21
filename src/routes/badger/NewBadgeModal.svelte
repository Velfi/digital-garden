<script lang="ts">
  import { document as docStore, resetDocument, updateDocument } from './store';
  import {
    displayUnit,
    mmToDisplay,
    displayToMm,
    unitLabel,
    unitPrecision
  } from './store/units';

  let { open = $bindable(false) } = $props();

  // Width/height are stored in mm. The modal shows/edits in the user's preferred
  // unit; we convert at the boundary.
  let w = $state(30);
  let h = $state(30);
  let shape = $state<'circle' | 'shield' | 'rect' | 'empty'>('circle');

  let displayW = $derived(mmToDisplay(w, $displayUnit));
  let displayH = $derived(mmToDisplay(h, $displayUnit));
  let inputStep = $derived($displayUnit === 'mm' ? 1 : 0.05);
  let inputMin = $derived($displayUnit === 'mm' ? 5 : 0.25);
  let inputMax = $derived($displayUnit === 'mm' ? 120 : 5);

  $effect(() => {
    if (!open) return;
    w = $docStore.canvas.width;
    h = $docStore.canvas.height;
  });

  function onWidthInput(e: Event) {
    const v = +(e.target as HTMLInputElement).value;
    if (Number.isFinite(v)) w = displayToMm(v, $displayUnit);
  }

  function onHeightInput(e: Event) {
    const v = +(e.target as HTMLInputElement).value;
    if (Number.isFinite(v)) h = displayToMm(v, $displayUnit);
  }

  function create() {
    resetDocument(w, h);
    if (shape === 'empty') {
      open = false;
      return;
    }
    const cx = w / 2;
    const cy = h / 2;
    updateDocument((d) => {
      if (shape === 'circle') {
        const r = Math.min(w, h) * 0.45;
        const steps = 48;
        const nodes: Array<{ type: 'line'; to: { x: number; y: number } }> = [];
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          nodes.push({ type: 'line', to: { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) } });
        }
        d.metal.paths = [
          {
            id: `p_${Math.random().toString(36).slice(2, 10)}`,
            kind: 'shape',
            closed: true,
            start: { x: cx + r, y: cy },
            nodes,
            strokeWidth: 0.2
          }
        ];
      } else if (shape === 'shield') {
        const hw = Math.min(w, h) * 0.4;
        const hh = Math.min(w, h) * 0.48;
        const start = { x: cx - hw, y: cy - hh };
        const pts = [
          { x: cx + hw, y: cy - hh },
          { x: cx + hw, y: cy + hh * 0.3 },
          { x: cx, y: cy + hh },
          { x: cx - hw, y: cy + hh * 0.3 }
        ];
        d.metal.paths = [
          {
            id: `p_${Math.random().toString(36).slice(2, 10)}`,
            kind: 'shape',
            closed: true,
            start,
            nodes: pts.map((p) => ({ type: 'line' as const, to: p })),
            strokeWidth: 0.2
          }
        ];
      } else {
        const hw = Math.min(w, h) * 0.42;
        const hh = Math.min(w, h) * 0.42;
        const x1 = cx - hw,
          y1 = cy - hh,
          x2 = cx + hw,
          y2 = cy + hh;
        d.metal.paths = [
          {
            id: `p_${Math.random().toString(36).slice(2, 10)}`,
            kind: 'shape',
            closed: true,
            start: { x: x1, y: y1 },
            nodes: [
              { type: 'line', to: { x: x2, y: y1 } },
              { type: 'line', to: { x: x2, y: y2 } },
              { type: 'line', to: { x: x1, y: y2 } }
            ],
            strokeWidth: 0.2
          }
        ];
      }
    });
    open = false;
  }
</script>

{#if open}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && (open = false)}
    onkeydown={(e) => e.key === 'Escape' && (open = false)}
  >
    <div class="modal">
      <h3>New badge</h3>
      <label>
        Width ({unitLabel($displayUnit)})
        <input
          type="number"
          min={inputMin}
          max={inputMax}
          step={inputStep}
          value={displayW.toFixed(unitPrecision($displayUnit))}
          oninput={onWidthInput}
        />
      </label>
      <label>
        Height ({unitLabel($displayUnit)})
        <input
          type="number"
          min={inputMin}
          max={inputMax}
          step={inputStep}
          value={displayH.toFixed(unitPrecision($displayUnit))}
          oninput={onHeightInput}
        />
      </label>
      <label>
        Starting shape
        <select bind:value={shape}>
          <option value="circle">Circle outline</option>
          <option value="shield">Shield outline</option>
          <option value="rect">Rectangle outline</option>
          <option value="empty">Empty canvas</option>
        </select>
      </label>
      <p class="warn">
        Creating a new badge replaces the current one and clears history.
      </p>
      <div class="modal-buttons">
        <button type="button" onclick={create}>Create</button>
        <button type="button" onclick={() => (open = false)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .warn {
    font-size: 0.8rem;
    color: #c97a2d;
    margin: 0;
  }
</style>
