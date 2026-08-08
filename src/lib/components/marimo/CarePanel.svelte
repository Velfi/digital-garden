<script lang="ts">
  import RingCrossSection from './RingCrossSection.svelte';
  import { describeCondition, describeSize } from '$lib/programming/marimo/careDescription';
  import type { MarimoState } from '$lib/programming/marimo/types';

  interface Props {
    state: MarimoState;
    canChangeWater: boolean;
    busy: boolean;
    absenceLine: string | null;
    onWaterChange: () => void;
    onTumble: () => void;
    onStir: () => void;
    onDismissAbsence: () => void;
  }

  let {
    state,
    canChangeWater,
    busy,
    absenceLine,
    onWaterChange,
    onTumble,
    onStir,
    onDismissAbsence
  }: Props = $props();

  const clauses = $derived(describeCondition(state));
  const size = $derived(describeSize(state));
  const born = $derived(
    new Date(state.bornAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  );
</script>

<aside class="care-panel">
  {#if absenceLine}
    <p class="absence">
      {absenceLine}
      <button class="dismiss" type="button" onclick={onDismissAbsence} aria-label="Dismiss"
        >×</button
      >
    </p>
  {/if}

  <p class="condition">
    {#each clauses as clause (clause)}
      <span>{clause}</span>
    {/each}
  </p>

  <RingCrossSection rings={state.rings} radiusMm={state.radiusMm} vigor={state.vigor} />
  <p class="caption">Hatched {born} &middot; {size}</p>

  <div class="actions">
    <button type="button" onclick={onWaterChange} disabled={!canChangeWater || busy}>
      Change the water
    </button>
    <button type="button" onclick={onTumble} disabled={busy}>Turn it over</button>
    <button type="button" onclick={onStir} disabled={busy}>Stir the water</button>
  </div>

  {#if !canChangeWater && !busy}
    <p class="hint">The water is still, clear.</p>
  {/if}

  <ul class="hint">
    <li>Drag the water to stir it.</li>
    <li>Drag the marimo to roll it &mdash; repeated turning keeps a marimo round.</li>
    <li>Press and hold to squeeze the trapped air out.</li>
    <li>Right-drag to change your point of view.</li>
  </ul>
</aside>

<style lang="scss">
  .care-panel {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: var(--block-quote-bg-color);
    color: var(--text-color);
  }

  .absence {
    position: relative;
    margin: 0;
    padding: 0.5rem 1.6rem 0.5rem 0.65rem;
    border-left: 3px solid var(--yellow-color);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .dismiss {
    position: absolute;
    top: 0.15rem;
    right: 0.15rem;
    padding: 0 0.35rem;
    border: none;
    background: none;
    font-size: 1rem;
    line-height: 1.2;
    cursor: pointer;
  }

  .condition {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .caption {
    margin: 0;
    font-size: 0.8rem;
    text-align: center;
    opacity: 0.75;
  }

  .actions {
    display: grid;
    gap: 0.4rem;

    button {
      width: 100%;
      padding: 0.45rem 0.6rem;
      font-size: 0.85rem;
      cursor: pointer;

      &:disabled {
        opacity: 0.45;
        cursor: default;
      }
    }
  }

  .hint {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    opacity: 0.7;
  }

  ul.hint {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 1.1rem;
  }
</style>
