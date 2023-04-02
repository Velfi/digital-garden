<script>
  const width = 810;
  const height = (width * 9) / 16;
</script>

<svelte:head>
  <title>Habanera For Two Flutes And A Cello</title>
  <meta name="description" content="'Habanera For Two Flutes And A Cello' is a song I wrote" />
  <meta name="keywords" content="music, habanera, flute, cello" />
</svelte:head>

<h1>Habanera For Two Flutes And A Cello</h1>

<p>Watch/listen on <a href="https://www.youtube.com/watch?v=nvmLN5ABwf8">YouTube</a></p>

<div class="embed">
  <iframe
    {width}
    {height}
    src="https://www.youtube-nocookie.com/embed/nvmLN5ABwf8"
    title="YouTube video player"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
  />
</div>

<blockquote>
  <p>
    <strong><em>Contradanza</em></strong> (also called <em>contradanza criolla</em>, <em>danza</em>,
    <em>danza criolla</em>, or <strong><em>habanera</em></strong>) is the Spanish and
    Spanish-American version of the contradanse, which was an internationally popular style of music
    and dance in the 18th century, derived from the English country dance and adopted at the court
    of France. Contradanza was brought to America and there took on folkloric forms that still exist
    in Bolivia, Mexico, Venezuela, Colombia, Peru, Panama and Ecuador.
  </p>

  <p>
    In Cuba during the 19th century, it became an important genre, the first written music to be
    rhythmically based on an African rhythm pattern and the first Cuban dance to gain international
    popularity, the progenitor of danzón, mambo and cha-cha-cha, with a characteristic "habanera
    rhythm" and sung lyrics.
  </p>

  <p>
    Outside Cuba, the Cuban contradanza became known as the habanera &ndash; the dance of Havana
    &ndash; and that name was adopted in Cuba itself subsequent to its international popularity in
    the later 19th century, though it was never so called by the people who created it.
  </p>

  <p class="right">
    &mdash; <a href="https://en.wikipedia.org/wiki/Contradanza">Wikipedia</a>
  </p>
</blockquote>

<style>
  .embed {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }
</style>
