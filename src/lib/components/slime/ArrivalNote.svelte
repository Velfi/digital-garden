<script lang="ts">
  // The card that comes in the box. Shown until the very first misting —
  // dismissal is doing the thing it asks, so it needs no stored flag.
</script>

<div class="arrival-note" role="note">
  <p class="stamp">✉ Delivered</p>
  <p>
    One slime, shipped dormant as a dried sclerotium on filter paper. It is unharmed and keeps for
    years in this state.
  </p>
  <p class="instruction">
    To wake it: mist it with the mister (tool drawer, top right) and keep it damp for about half an
    hour.
  </p>
</div>

<style lang="scss">
  .arrival-note {
    position: absolute;
    left: 0.9rem;
    /* Clear of the dev row that sits under the viewport in dev builds. */
    bottom: 3.2rem;
    max-width: 17rem;
    padding: 0.7rem 0.85rem;
    border-radius: 0.4rem;
    background: #f2ecd9;
    color: #3a3327;
    box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 0.35);
    transform: rotate(-1.6deg);
    font-size: 0.8rem;
    line-height: 1.45;

    p {
      margin: 0 0 0.4rem;

      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  .stamp {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.6;
  }

  .instruction {
    font-style: italic;
  }
</style>
