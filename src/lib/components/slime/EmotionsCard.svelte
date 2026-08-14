<!--
  A little field guide to the pet's moods — the emotion system (emotion.ts)
  explained in plain words. A collapsed card so the side menu stays quiet;
  <details> gives the toggle for free, keyboard and all.
-->
<details class="emotions-card">
  <summary>How it feels</summary>
  <div class="body">
    <p>
      Care sets its mood: damp and fed means content, dry or hungry means glum. Interaction
      excites it; being left alone calms it.
    </p>
    <ul>
      <li><strong>Content:</strong> colorful and glossy, eyes wide and high. It wanders the box. No action needed.</li>
      <li><strong>Glum:</strong> pale and dull, eyes drooping. It stays put. Usually means it needs misting or food.</li>
      <li><strong>Excited:</strong> skin ripples, it stares, and it hurries to food. Caused by pokes, sprays, meals, or being carried.</li>
      <li><strong>Calm:</strong> still and glassy, with slow blinks. Its resting state.</li>
    </ul>
  </div>
</details>

<style lang="scss">
  .emotions-card {
    padding: 0.7rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: var(--block-quote-bg-color);
    color: var(--text-color);
  }

  summary {
    font-size: 0.88rem;
    cursor: pointer;
    user-select: none;
    opacity: 0.85;

    &:hover,
    &:focus-visible {
      opacity: 1;
    }
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.6rem;
    font-size: 0.8rem;
    line-height: 1.5;
    opacity: 0.8;
  }

  p {
    margin: 0;
  }

  ul {
    margin: 0;
    padding-left: 1.1rem;
  }
</style>
