<script lang="ts">
  import {
    describeSlime,
    fullnessNote,
    spraysRemaining
  } from '$lib/programming/slime/careDescription';
  import type { SlimeState } from '$lib/programming/slime/types';

  interface Props {
    state: SlimeState;
    /** An uneaten oat has gone moldy in the box. */
    moldy: boolean;
    absenceLine: string | null;
    onDismissAbsence: () => void;
  }

  let { state, moldy, absenceLine, onDismissAbsence }: Props = $props();

  const condition = $derived(describeSlime(state));
  const fullness = $derived(fullnessNote(state));
  const dormant = $derived(state.stage === 'sclerotium');
  const arrived = $derived(
    new Date(state.bornAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
  );
  const sprays = $derived(spraysRemaining(state));
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

  <p class="condition">{condition}</p>

  {#if dormant}
    <div class="meter" role="img" aria-label="Revival progress {Math.round(state.revival * 100)}%">
      <span class="meter-label">soak</span>
      <span class="bar"><span class="fill soak" style:width="{state.revival * 100}%"></span></span>
    </div>
    <p class="caption">
      {#if state.revival > 0.02}
        Roughly {sprays}
        {sprays === 1 ? 'misting' : 'mistings'} to go. Progress pauses while it is dry.
      {:else}
        Arrived {arrived}.
      {/if}
    </p>
  {:else}
    <div class="meter" role="img" aria-label="Moisture {Math.round(state.moisture * 100)}%">
      <span class="meter-label">damp</span>
      <span class="bar"><span class="fill damp" style:width="{state.moisture * 100}%"></span></span>
    </div>
    <div class="meter" role="img" aria-label="Fullness {Math.round(state.satiety * 100)}%">
      <span class="meter-label">fed</span>
      <span class="bar"><span class="fill fed" style:width="{state.satiety * 100}%"></span></span>
    </div>
    <p class="caption">Arrived {arrived} &middot; {state.radiusMm.toFixed(1)} mm across</p>
  {/if}

  {#if moldy}
    <p class="chore">An oat flake has gone moldy. Click it to remove it.</p>
  {/if}

  {#if fullness && !dormant}
    <p class="hint">{fullness}</p>
  {/if}

  <ul class="hint">
    {#if dormant}
      <li>
        Mist it with the mister (tool drawer, top right). The soak only counts while it is damp,
        so re-mist when it dries.
      </li>
      <li>It cannot die while dormant.</li>
    {:else}
      <li>Tools &mdash; mister, oats, squeegee &mdash; are in the tool drawer, top right.</li>
      <li>Mist it every day or two; it dries out and goes dormant if left dry.</li>
      <li>Feed it oat flakes when it is hungry.</li>
      <li>Press and hold to squish it; drag to pick it up.</li>
      <li>It leaves trails on the glass as it climbs &mdash; the squeegee wipes them off.</li>
    {/if}
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
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .meter {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }

  .meter-label {
    width: 3rem;
    font-size: 0.78rem;
    text-align: right;
    opacity: 0.75;
  }

  .bar {
    flex: 1;
    height: 0.5rem;
    border-radius: 0.25rem;
    background: rgb(128 128 128 / 0.18);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: 0.25rem;
    transition: width 0.6s ease;
  }

  .fill.soak {
    background: #9c8a5c;
  }

  .fill.damp {
    background: #6aa8b8;
  }

  .fill.fed {
    background: #a8b86a;
  }

  .caption {
    margin: 0;
    font-size: 0.8rem;
    text-align: center;
    opacity: 0.75;
  }

  .chore {
    margin: 0;
    padding: 0.4rem 0.65rem;
    border-left: 3px solid #7d9c5c;
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .hint {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.8rem;
    line-height: 1.5;
    opacity: 0.7;
  }

  p.hint {
    padding-left: 0;
  }
</style>
