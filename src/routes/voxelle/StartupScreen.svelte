<script lang="ts">
  import { getSkipStartup, setSkipStartup } from './store/storage';
  import './sidebar/shared.css';

  const STARTUP_URL = '/voxelle/STARTUP.md';

  let {
    open = $bindable(false),
    contentUrl = STARTUP_URL,
    showDontShowCheckbox = true
  }: {
    open?: boolean;
    contentUrl?: string;
    showDontShowCheckbox?: boolean;
  } = $props();

  let content = $state('');
  let loading = $state(true);
  let dontShowAgain = $state(false);

  $effect(() => {
    if (open) {
      loading = true;
      content = '';
      dontShowAgain = getSkipStartup();
      fetch(contentUrl)
        .then((r) => (r.ok ? r.text() : 'Help content could not be loaded.'))
        .then(async (text) => {
          const { marked } = await import('marked');
          content = await marked.parse(text);
          loading = false;
        })
        .catch(() => {
          content = '<p>Help content could not be loaded.</p>';
          loading = false;
        });
    }
  });

  function handleClose() {
    if (showDontShowCheckbox && dontShowAgain) {
      setSkipStartup(true);
    }
    open = false;
  }
</script>

{#if open}
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="startup-title"
    tabindex="-1"
    onclick={(e) => e.target === e.currentTarget && handleClose()}
    onkeydown={(e) => e.key === 'Escape' && handleClose()}
  >
    <div class="modal modal--startup">
      <h3 id="startup-title">Welcome to Voxelle</h3>
      {#if loading}
        <p>Loading…</p>
      {:else}
        <div class="help-content" data-markdown-output>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -- markdown from marked() -->
          {@html content}
        </div>
      {/if}
      <div class="modal-footer">
        <button type="button" onclick={handleClose}>Got it</button>
        {#if showDontShowCheckbox}
          <label class="checkbox-label checkbox-label--right">
            <input type="checkbox" bind:checked={dontShowAgain} />
            Don't show this at next startup
          </label>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal--startup {
    max-width: min(90vw, 36rem);
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .help-content {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .help-content :global(h1) {
    font-size: 1.1rem;
    margin: 0.5rem 0 0.25rem 0;
  }

  .help-content :global(h2) {
    font-size: 1rem;
    margin: 0.75rem 0 0.25rem 0;
  }

  .help-content :global(h1:first-child) {
    margin-top: 0;
  }

  .help-content :global(p) {
    margin: 0.25rem 0;
  }

  .help-content :global(ul) {
    margin: 0.25rem 0;
    padding-left: 1.25rem;
  }

  .help-content :global(a) {
    color: var(--link-color);
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .checkbox-label--right {
    margin: 0;
    flex-direction: row;
  }
</style>
