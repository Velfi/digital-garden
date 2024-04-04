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
      if (story.startsWith('An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT')) {
        throw new Error('Vercel killed the function for running too long.');
      } else if (!story.includes('[')) {
        throw new Error(story);
      }

      blanks = getBlanks(story);
      if (blanks.length === 0) {
        throw new Error("Couldn't read any blanks in the generated story.");
      }

      filledBlanks = blanks.map(() => '');
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message + ' Please try generating another.');
      }
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
  <small
    ><p>
      <em
        >Vercel will time out the function if it runs too long. Also, this only works so long as I
        remember to fill up my <a href="https://console.anthropic.com/dashboard">Claude</a> credits.
        If it's broken and you want to try it, lmk and I'll drop some more money on it.</em
      >
    </p>
  </small>
</div>
<hr />
{#if isGenerating}
  <div>
    <p>Please be patient, generating your story now...</p>
    <p>This will take less than ten seconds (Vercel's free-tier timeout)</p>
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
</style>
