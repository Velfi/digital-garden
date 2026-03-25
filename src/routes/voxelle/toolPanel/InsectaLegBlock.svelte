<script lang="ts">
  import type { Writable } from 'svelte/store';
  import type { ArticulatedLeg2 } from '../store/generators/articulatedLeg';

  function tarsusTri(leg: ArticulatedLeg2): [number, number, number] {
    return leg.tarsus ? [leg.tarsus[0], leg.tarsus[1], leg.tarsus[2]] : [0, 0, 0];
  }

  let { title, legStore }: { title: string; legStore: Writable<ArticulatedLeg2> } = $props();

  function patch(p: Partial<ArticulatedLeg2>) {
    legStore.update((l) => ({ ...l, ...p }));
  }

  function setKnee(i: 0 | 1 | 2, v: number) {
    legStore.update((l) => {
      const k: [number, number, number] = [l.knee[0], l.knee[1], l.knee[2]];
      k[i] = v;
      return { ...l, knee: k };
    });
  }

  function setFoot(i: 0 | 1 | 2, v: number) {
    legStore.update((l) => {
      const ft: [number, number, number] = [l.foot[0], l.foot[1], l.foot[2]];
      ft[i] = v;
      return { ...l, foot: ft };
    });
  }

  function setTarsus(i: 0 | 1 | 2, v: number) {
    legStore.update((l) => {
      const base = l.tarsus ?? ([0, 0, 0] as [number, number, number]);
      const t: [number, number, number] = [base[0], base[1], base[2]];
      t[i] = v;
      const allZero = t[0] === 0 && t[1] === 0 && t[2] === 0;
      return { ...l, ...(allZero ? { tarsus: undefined } : { tarsus: t }) };
    });
  }

</script>

<div class="insecta-leg-block">
  <h5>{title}</h5>
  <label class="tool-panel-check"
    ><input
      type="checkbox"
      checked={$legStore.enabled}
      onchange={(e) => patch({ enabled: (e.target as HTMLInputElement).checked })}
    />On</label
  >
  <p class="insecta-leg-hint" title="Body frame: f = head→abdomen, s = lateral (mirrored), u = off face">
    Hip U/V · knee = femur · foot = tibia · tar = optional segment on the ground (+f along substrate)
  </p>
  <div class="tool-panel-row">
    <span class="tool-panel-label">Hip U</span>
    <input
      type="range"
      min="-8"
      max="8"
      step="1"
      value={$legStore.hipU}
      disabled={!$legStore.enabled}
      oninput={(e) => patch({ hipU: Number((e.target as HTMLInputElement).value) })}
    />
    <span class="tool-panel-value">{$legStore.hipU}</span>
  </div>
  <div class="tool-panel-row">
    <span class="tool-panel-label">Hip V</span>
    <input
      type="range"
      min="-8"
      max="8"
      step="1"
      value={$legStore.hipV}
      disabled={!$legStore.enabled}
      oninput={(e) => patch({ hipV: Number((e.target as HTMLInputElement).value) })}
    />
    <span class="tool-panel-value">{$legStore.hipV}</span>
  </div>
  <div class="tool-panel-row tool-panel-row--tri">
    <span class="tool-panel-label">Knee</span>
    <span class="insecta-tri">
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={$legStore.knee[0]}
        disabled={!$legStore.enabled}
        title="Knee Δf"
        oninput={(e) => setKnee(0, Number((e.target as HTMLInputElement).value))}
      />
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={$legStore.knee[1]}
        disabled={!$legStore.enabled}
        title="Knee Δs (right leg)"
        oninput={(e) => setKnee(1, Number((e.target as HTMLInputElement).value))}
      />
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={$legStore.knee[2]}
        disabled={!$legStore.enabled}
        title="Knee Δu"
        oninput={(e) => setKnee(2, Number((e.target as HTMLInputElement).value))}
      />
    </span>
    <span class="tool-panel-value insecta-tri-val"
      >{$legStore.knee[0]},{$legStore.knee[1]},{$legStore.knee[2]}</span
    >
  </div>
  <div class="tool-panel-row tool-panel-row--tri">
    <span class="tool-panel-label">Foot</span>
    <span class="insecta-tri">
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={$legStore.foot[0]}
        disabled={!$legStore.enabled}
        title="Foot Δf"
        oninput={(e) => setFoot(0, Number((e.target as HTMLInputElement).value))}
      />
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={$legStore.foot[1]}
        disabled={!$legStore.enabled}
        title="Foot Δs"
        oninput={(e) => setFoot(1, Number((e.target as HTMLInputElement).value))}
      />
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={$legStore.foot[2]}
        disabled={!$legStore.enabled}
        title="Foot Δu (toward substrate)"
        oninput={(e) => setFoot(2, Number((e.target as HTMLInputElement).value))}
      />
    </span>
    <span class="tool-panel-value insecta-tri-val"
      >{$legStore.foot[0]},{$legStore.foot[1]},{$legStore.foot[2]}</span
    >
  </div>
  <div class="tool-panel-row tool-panel-row--tri">
    <span class="tool-panel-label">Tar</span>
    <span class="insecta-tri">
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={tarsusTri($legStore)[0]}
        disabled={!$legStore.enabled}
        title="Tarsus Δf (along body / ground)"
        oninput={(e) => setTarsus(0, Number((e.target as HTMLInputElement).value))}
      />
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={tarsusTri($legStore)[1]}
        disabled={!$legStore.enabled}
        title="Tarsus Δs"
        oninput={(e) => setTarsus(1, Number((e.target as HTMLInputElement).value))}
      />
      <input
        type="range"
        min="-24"
        max="24"
        step="1"
        value={tarsusTri($legStore)[2]}
        disabled={!$legStore.enabled}
        title="Tarsus Δu (slight −u hugs floor)"
        oninput={(e) => setTarsus(2, Number((e.target as HTMLInputElement).value))}
      />
    </span>
    <span class="tool-panel-value insecta-tri-val"
      >{tarsusTri($legStore)[0]},{tarsusTri($legStore)[1]},{tarsusTri($legStore)[2]}</span
    >
  </div>
  <label class="tool-panel-check tool-panel-check--sub"
    ><input
      type="checkbox"
      checked={$legStore.femurRib ?? false}
      disabled={!$legStore.enabled}
      onchange={(e) => patch({ femurRib: (e.target as HTMLInputElement).checked })}
    />Thick femur (+1 voxel lateral)</label
  >
</div>

<style>
  .insecta-leg-block {
    border: 1px solid color-mix(in oklab, var(--border-color) 80%, var(--text-color) 20%);
    border-radius: 6px;
    padding: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: color-mix(in oklab, var(--bg-color) 90%, var(--text-color) 10%);
  }

  .insecta-leg-block h5 {
    margin: 0;
    font-size: 0.64rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .insecta-leg-hint {
    margin: 0.15rem 0 0.35rem;
    font-size: 0.72rem;
    line-height: 1.25;
    opacity: 0.82;
    grid-column: 1 / -1;
  }
  .tool-panel-row--tri {
    align-items: flex-start;
  }
  .insecta-tri {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 0;
  }
  .insecta-tri input[type='range'] {
    width: 100%;
  }
  .insecta-tri-val {
    font-size: 0.75rem;
    max-width: 4.2rem;
    text-align: right;
  }
  .tool-panel-check--sub {
    grid-column: 1 / -1;
    margin-top: 0.15rem;
    font-size: 0.8rem;
  }
</style>
