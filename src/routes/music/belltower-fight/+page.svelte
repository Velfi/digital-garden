<script>
  const width = 810;
  const height = (width * 9) / 16;
</script>

<svelte:head>
  <title>Belltower Fight</title>
  <meta
    name="description"
    content="'Belltower Fight' was an animation I created as part of the Molto Tutti Student Film Festival."
  />
  <meta name="keywords" content="animation, music, piano, violin, viola" />
</svelte:head>

<h1>Belltower Fight</h1>

<p>Watch/listen on <a href="https://www.youtube.com/watch?v=QH7ye3ZyCwo">YouTube</a></p>

<div class="embed">
  <iframe
    {width}
    {height}
    src="https://www.youtube-nocookie.com/embed/QH7ye3ZyCwo"
    title="YouTube video player"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowfullscreen
  />
</div>

<p>
  "Belltower Fight" was an animation I created as part of the <a
    href="https://www.acmusic.org/molto-tutti-student-film-festival-is-this-saturday/"
    >Molto Tutti Student Film Festival</a
  >.
</p>

<p>
  I composed the music and performed the piano part. Thanks to my teacher <a
    href="https://fumeejazz.com/about">Christy</a
  >
  for recording it, Traci for the Viola part, and Rachel for the Violin part. I created the animation
  in
  <a href="https://www.blender.org/">Blender</a>.
</p>

<style>
  .embed {
    display: flex;
    justify-content: center;
    margin-bottom: 1rem;
  }
</style>
