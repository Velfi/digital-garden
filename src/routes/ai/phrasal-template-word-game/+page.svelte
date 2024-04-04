<script lang="ts">
  let selectedStoryType = 'current-events';
  let story: string | undefined;
  let blanks: string[] = [];
  let filledBlanks: string[] = [];
  let filledInStory: string | undefined;
  let isGenerating = false;

  async function generateANewStory() {
    isGenerating = true;
    try {
      const response = await fetch(
        `/api/phrasal-template-word-game?storyType=${selectedStoryType}`,
        {
          method: 'GET'
        }
      );

      story = await response.text();
      blanks = getBlanks(story);
      filledBlanks = blanks.map(() => '');
    } catch (error) {
      alert(
        'Failed to generate a new story. The server may be overloaded. Please try again later.'
      );
      reset();
    }

    isGenerating = false;
  }

  function getBlanks(story: string) {
    const regex = /\[(.*?)\]/g;
    const blanks = story.match(regex);
    return blanks ? blanks.map((blank: string) => blank.slice(1, -1)) : [];
  }

  function allBlanksFilled() {
    return filledBlanks.every((blank) => blank.trim() !== '');
  }

  function onSubmit(event: Event) {
    event.preventDefault();
    if (story != null && allBlanksFilled()) {
      filledInStory = filledBlanks.reduce((story, filledBlank) => {
        return story.replace(/\[(.*?)\]/, filledBlank);
      }, story);
    } else {
      alert('Please fill in all the blanks before submitting.');
    }
  }

  function reset() {
    story = undefined;
    blanks = [];
    filledBlanks = [];
    filledInStory = undefined;
  }
</script>

<svelte:head>
  <title>An AI-generated phrasal template word game</title>
  <meta
    name="description"
    content="In this post, I share a phrasal template word game that you can play with your friends. The game involves filling in blanks in a template with words or phrases to create a funny or interesting story."
  />
  <meta name="keywords" content="Claude, llm, ai, phrasal template, game, word game" />
</svelte:head>

<div>
  <h1>An AI-generated phrasal&nbsp;template word&nbsp;game</h1>

  <big
    ><p>
      Just before I went to sleep on the night of March 31,&nbsp;2024 I&nbsp;had&nbsp;an&nbsp;idea.
    </p></big
  >
  <p>
    You may be familiar with the concept of <a href="https://en.wikipedia.org/wiki/Phrasal_template"
      >phrasal template</a
    > <a href="https://en.wikipedia.org/wiki/Word_Games">word games</a>, but if not, here's a quick
    rundown:
  </p>

  <ol>
    <li>
      A phrasal template is a sentence with blanks that can be filled in with words or phrases.
    </li>
    <li>Players take turns filling in the blanks to create a funny or interesting story.</li>
    <li>The story is read aloud, and hilarity ensues.</li>
  </ol>

  <p>
    AIs are mostly useful for making stuff up, so they're a natural fit for generating such
    templates. I hope you enjoy the game.
  </p>
</div>
<hr />
{#if isGenerating}
  <div>
    <p>Please be patient, generating your story now...</p>
    <p>This can take 10+ seconds depending on the server load.</p>
  </div>
{:else if story}
  <div>
    {#if filledInStory}
      <p class="story">{filledInStory}</p>
      <button type="button" on:click={reset}>Play again</button>
    {:else}
      <p>Fill in the blanks to create a silly story.</p>
      <form class="blanks-form" autocomplete="off" on:submit={onSubmit} on:reset={reset}>
        {#each blanks as blank, i}
          <label class="blanks-label">
            {blank}
            <input type="text" bind:value={filledBlanks[i]} />
          </label>
        {/each}
        <button type="submit">Fill in the blanks</button>
      </form>
    {/if}
  </div>
{:else}
  <div>
    <label>
      Choose the kind of story to generate:
      <select class="storyType" bind:value={selectedStoryType}>
        <option value="ai">AI</option>
        <option value="anime">Anime</option>
        <option value="comedy">Comedy</option>
        <option value="current-events">Current Events</option>
        <option value="fantasy">Fantasy</option>
        <option value="horror">Horror</option>
        <option value="mystery">Mystery</option>
        <option value="romance">Romance</option>
        <option value="sci-fi">Sci-Fi</option>
        <option value="true-crime">True Crime</option>
      </select></label
    >
    <button type="button" on:click={generateANewStory}>Generate a new story</button>
  </div>
{/if}

<style lang="scss">
  .blanks-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .blanks-label {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  button[type='submit'] {
    grid-column: span 2;
  }

  p.story {
    font-size: 130%;
    line-height: 1.6;
  }

  .storyType {
    height: 1rem;
  }

  // button[disabled] {
  //   cursor: not-allowed;
  //   opacity: 0.5;
  // }
</style>
