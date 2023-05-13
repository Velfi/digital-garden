<script lang="ts">
  import encyclopedia from './Portrait_encyclopedia.png?w=200&imagetools';
  import { createEventDispatcher } from 'svelte';
  import Choices from './DialogChoices.svelte';
  import DialogueEntry from './DialogueElement.svelte';

  const dispatch = createEventDispatcher<{ choose: number }>();
  const choices = [
    '"The collection includes NACRA &ndash; an opioid antagonist."',
    '"You seem to have, among other things, Preptide."',
    `"That's all as far as that goes, then."`
  ];
</script>

<div class="disco-dialogue-outer">
  <div class="portrait">
    <img src={encyclopedia} alt="Encyclopedia" />
  </div>
  <div class="disco-dialogue-inner">
    <DialogueEntry
      subject="authority"
      skillCheck={{ difficulty: 'Easy', result: 'Success' }}
      subjectClass="psyche"
    >
      Technically, possession of narcotics is legal in Revachol. But you should still reprimand her.
    </DialogueEntry>

    <DialogueEntry subject="YOU" subjectClass="pc">
      "It was quite impressive. How did you manage to amass such a horde?"
    </DialogueEntry>

    <DialogueEntry subject="KLAASJE (MISS ORANJE DICSO DANCER)">
      "With money, sir." She takes a drag. "It's not exactly the Antistar-sized caboodle I intend
      for it to be one day, but it's getting there."
    </DialogueEntry>

    <DialogueEntry
      subject="encyclopedia"
      skillCheck={{ difficulty: 'Medium', result: 'Success' }}
      subjectClass="intellect"
      >The Antistar is (or was) a Vespertine rock and roll star, who liked to do drugs. He did so
      many drugs he eventually mutated -- into a corpse.
    </DialogueEntry>

    <Choices {choices} on:choose={({ detail }) => dispatch('choose', detail)} />
  </div>
</div>

<style lang="scss">
  .disco-dialogue-outer {
    position: relative;
    border-left: 1rem solid #a4a4a4;
    border-right: 1.1rem solid #a4a4a4;
    line-height: 1.3;
    margin-top: -1.6rem;

    .portrait img {
      position: absolute;
      left: -9rem;
      top: 6rem;
      margin: 0;
      max-width: unset;
      padding: 0.9rem 0.7rem 1rem 0.7rem;
      background-color: #212120;
      width: 10rem;
    }

    &:after {
      content: '';
      width: 27.93rem;
      height: 3rem;
      position: absolute;
      bottom: -2rem;
      left: -1rem;
      border-left: 1rem solid #a4a4a4;
      border-right: 1.1rem solid #a4a4a4;
      border-bottom: 0.6rem solid rgb(82, 82, 96);
      transform: skewY(6deg);
      background-color: rgba($color: #000, $alpha: 0.9);
    }
  }

  .disco-dialogue-inner {
    padding: 6rem 4rem 5rem 3rem;
    color: rgba($color: #fdf6e6, $alpha: 0.95);
    background-color: rgba($color: #000, $alpha: 0.9);
    font-family: 'Source Serif Pro', serif;
    height: 42rem;
    overflow-y: scroll;
  }
</style>
