<script lang="ts">
  import { bakedDocument, cells } from '../store';
  import { runChecks } from '../topology/manufacturing';

  // Run checks against the baked doc so text-derived paths participate in
  // thin-wall / self-intersect / outline checks the same as authored paths.
  let warnings = $derived.by(() => runChecks($bakedDocument, $cells));
</script>

<h2>Manufacturing checks</h2>
{#if warnings.length === 0}
  <p class="ok">No issues detected.</p>
{:else}
  <ul class="warning-list">
    {#each warnings as w, i (i)}
      <li class="warn-{w.kind}">
        <strong>{w.kind.replace('-', ' ')}</strong>
        <span>{w.message}</span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .ok {
    color: #2e8a3e;
    font-size: 0.9rem;
  }

  .warning-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .warning-list li {
    padding: 0.35rem 0.5rem;
    border-left: 3px solid;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 0 4px 4px 0;
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .warn-thin-wall,
  .warn-small-cell {
    border-color: #e0a82d;
  }

  .warn-self-intersect,
  .warn-no-outline {
    border-color: #e25f3a;
  }

  strong {
    text-transform: capitalize;
    font-size: 0.8rem;
  }
</style>
