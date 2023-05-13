<script>
  import SiteLogo from '$lib/components/SiteLogo.svelte';
  import { siteConfig } from '$lib/siteconfig';
</script>

<svelte:head>
  <title>{siteConfig.title}</title>
  <meta name="author" content={siteConfig.author} />
  <meta
    name="description"
    content="A digital garden built by me (Zelda) using Svelte. I share my thoughts, projects, and art here."
  />
  <meta name="keywords" content="digital garden, zelda, posts, programming, art" />
</svelte:head>

<main class="container">
  <h1>Welcome to the garden</h1>

  <div class="site-logo">
    <SiteLogo />
  </div>

  <h2>About This Site</h2>

  <p>
    I was inspired by my friend <a href="https://athanasi.us">thatzopoulos</a> to cultivate a
    <a href="https://maggieappleton.com/garden-history">digital garden</a>. I love to write and
    share things but the constraints of dated blog posts in a reverse-chronological timeline has
    always felt wrong to me.
  </p>

  <p>
    This "digital garden" is my attempt to thwart any feelings of "not producing <em>content</em>"
    because
    <em>content</em> is not what I'm about.
  </p>

  <p>
    The pages of this site will continually grow and change. I hope you find them amusing,
    educational, useful, and interesting.
  </p>

  <h2>Neat e-people of the web</h2>

  <p class="center">
    <small>
      <b>
        <i>Fight back against bots, SEO, and "content"!</i>
      </b>
      <i>
        If someone you know maintains a page you like, don't forget to tell them you appreciate it
        their effort! Say no to a <a href="https://www.youtube.com/watch?v=7Pq-S557XQU"
          >dead internet</a
        >.
      </i>
    </small>
  </p>

  <ul>
    <li><a href="https://sowe.li">casey</a></li>
    <li><a href="http://tesseract.page">tessarine</a> <i>(currently defunct)</i></li>
    <li><a href="https://athanasi.us">thatzopoulos</a></li>
    <li><a href="http://garden.nekomorphism.com">nekomorphism</a></li>
    <li><a href="neat-internet">Neat things the internet exposed me to</a></li>
  </ul>

  <h2>My Store</h2>

  <p><strong><em>Wow! Amazing! <a href="/store/zelda">I sell stickers!</a></em></strong></p>

  <p>
    I love stickers and collect them. Since I purchased a printer and a cutting robot, I've been
    able to start making my own. Some of them are images that I generated with DALL·E. I sell them
    in packs for $15. Shipping is included and if you know where I live then local pickup is
    available.
  </p>

  <h2>Arts</h2>
  <ul>
    <li><a href="art/antique-stamps">Antique stamps converted to SVG</a></li>
    <li><a href="art/tiles">Tiles</a></li>
    <li><a href="art/2022-09-photospheres">September '22 Photo Spheres</a></li>
  </ul>

  <h3>Wallpapers</h3>
  <ul>
    <li><a href="art/smt-wallpapers">Shin Megami Tensei Wallpapers</a></li>
    <li><a href="art/2022-wallpapers">2022 Wallpapers</a></li>
    <li><a href="art/2023-wallpapers">2023 Wallpapers</a></li>
  </ul>

  <h2>Fonts</h2>
  <ul>
    <li><a href="fonts/atalanta-and-rudras">Pixel Fonts (Atalanta and Rudras)</a></li>
    <li><a href="fonts/cistercian-monk-numerals">Cistercian Monk Numerals</a></li>
  </ul>

  <h2>Games</h2>
  <ul>
    <li><a href="games/new-wave-paradise">New Wave Paradise</a></li>
  </ul>

  <h2>Music</h2>
  <ul>
    <li><a href="music/habanera">Habanera For Two Flutes And A Cello</a></li>
    <li><a href="music/belltower-fight">Belltower Fight</a></li>
    <li><a href="synth/manuals">Synth Manuals</a></li>
    <li><a href="synth/patches">Synth Presets</a></li>
  </ul>

  <h2>Movies</h2>
  <ul>
    <li><a href="movies/zardoz">Zardoz (1974), dir. John Boorman</a></li>
  </ul>

  <h2>Programmings</h2>
  <ul>
    <li>
      <a href="ai/fun-with-large-language-models">Fun with large language models</a>
    </li>
    <li><a href="programming/plotlings">Plotter Art Generation Suite</a></li>
    <li><a href="programming/iching">I Ching</a></li>
    <li><a href="programming/slime-mold">Slime Mold (Physarum) Simulation</a></li>
    <li><a href="programming/wrestler-markov">I created a Wrestler</a></li>
    <li><a href="programming/diffuser">Diffuser</a></li>
    <li>
      <a href="programming/vector-field-visualizer">Visualizing dimensional noise algorithms</a>
    </li>
    <li><a href="programming/flow-field-interactive-visualizer">Painting flow fields</a></li>
    <li><a href="programming/cellular-automata">Cellular Automata</a></li>
    <li>
      <a href="programming/reaction-diffusion">Gray Scott Reaction Diffusion Simulation</a>
    </li>
    <li><a href="programming/roving-bishop">The Roving Bishop Algorithm</a></li>
    <li>
      <a href="programming/canvas-animations-in-this-garden">
        How this site previously used Canvas to render art and animations
      </a>
    </li>
  </ul>

  <h2>Thoughts</h2>
  <ul>
    <li><a href="ai/ai-and-institutions">AI & Institutions</a></li>
    <li><a href="thoughts/24-days-between-jobs">Time off between jobs</a></li>
    <li><a href="thoughts/typing">On Typing</a></li>
    <li><a href="thoughts/colors">On Colors <em><small>(interactive)</small></em></a></li>
    <li><a href="thoughts/technopastoral">On Digital Gardens</a></li>
  </ul>

  <h2>Footnotes</h2>
  <p>
    This site was originally based on <a href="https://github.com/yenly/foamy-nextjs"
      >this template</a
    >
    but I've since made so many changes at this point that there's nothing left of the original framework.
    It's a real "Ship of Theseus" situation. You can view the full source code of this site on
    <a href="https://github.com/Velfi/digital-garden">GitHub</a>. If you like it, feel free to copy
    and adapt it to your own needs.
  </p>
</main>

<style>
  .site-logo {
    border-radius: 50%;
    border: 5px solid;
    color: currentColor;
    margin: 1rem 0rem 0.5rem 1rem;
    float: right;
    width: 30%;
  }

  .container {
    display: block;
    flex-direction: unset;
  }
</style>
