<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let choices: string[] = [];
  const dispatch = createEventDispatcher<{ choose: number }>();

  function choose(e: MouseEvent) {
    const target = e.target as HTMLElement;
    let choice: string | undefined;

    if (target.tagName === 'P') {
      const li = target.parentElement;
      choice = li?.dataset.choice;
    }

    if (target.tagName === 'LI') {
      choice = target.dataset.choice;
    }

    if (choice === undefined) {
      return;
    }

    dispatch('choose', parseInt(choice, 10));
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- TODO make this accessible -->
<ol class="choices" on:click={choose}>
  {#each choices as choice, i}
    <li data-choice={i}>
      &dash; <p>{choice}</p>
    </li>
  {/each}
</ol>

<style lang="scss">
  ol.choices {
    margin: 0;
    padding-left: 1.6rem;

    li {
      cursor: pointer;

      p {
        color: hsl(9, 70%, 60%);
        margin: 0;
        display: inline;
        text-indent: unset;

        &:hover {
          color: hsl(9, 70%, 80%);
        }
      }
    }
  }
</style>
