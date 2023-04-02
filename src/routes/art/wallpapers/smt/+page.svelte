<script>
  import AliceSmall from '$lib/assets/images/wallpapers/smt/Alice.png?w=650&imagetools';
  import AlrauneSmall from '$lib/assets/images/wallpapers/smt/Alraune.png?w=650&imagetools';
  import HecateSmall from '$lib/assets/images/wallpapers/smt/Hecate.png?w=650&imagetools';
  import ParvatiSmall from '$lib/assets/images/wallpapers/smt/Parvati.png?w=650&imagetools';
  import MabSmall from '$lib/assets/images/wallpapers/smt/Queen_Mab.png?w=650&imagetools';
  import SeiryuSmall from '$lib/assets/images/wallpapers/smt/Seiryu.png?w=650&imagetools';
  import SmtIISmall from '$lib/assets/images/wallpapers/smt/smtii.png?w=650&imagetools';
  import TiamatSmall from '$lib/assets/images/wallpapers/smt/Tiamat.png?w=650&imagetools';

  import AliceFull from '$lib/assets/images/wallpapers/smt/Alice.png';
  import AlrauneFull from '$lib/assets/images/wallpapers/smt/Alraune.png';
  import HecateFull from '$lib/assets/images/wallpapers/smt/Hecate.png';
  import ParvatiFull from '$lib/assets/images/wallpapers/smt/Parvati.png';
  import MabFull from '$lib/assets/images/wallpapers/smt/Queen_Mab.png';
  import SeiryuFull from '$lib/assets/images/wallpapers/smt/Seiryu.png';
  import SmtIIFull from '$lib/assets/images/wallpapers/smt/smtii.png';
  import TiamatFull from '$lib/assets/images/wallpapers/smt/Tiamat.png';

  import WallpaperGallery from '$lib/components/WallpaperGallery.svelte';
</script>

<svelte:head>
  <title>Shin Megami Tensei Wallpapers</title>
  <meta
    name="description"
    content="I'm a big nerd when it comes to Atlas JRPGs. They've developed nearly two Megami Tensei series games a year since they started back in 1987. The first game in the series that I played was Persona 3: FES, a spin-off of the Shin Megami Tensei (SMT) main series of games."
  />
  <meta name="keywords" content="wallpapers, megami tensei, shin megami tensei" />
</svelte:head>

<h1>Shin Megami Tensei Wallpapers</h1>

<p>
  I'm a big nerd when it comes to Atlas JRPGs. They've developed nearly two Megami Tensei series
  games a year since they started back in 1987. The first game in the series that I played was
  <a href="https://www.mobygames.com/game/32307/shin-megami-tensei-persona-3-fes/">Persona 3: FES</a
  >, a spin-off of the Shin Megami Tensei (SMT) main series of games.
</p>
<p>I've since also played:</p>
<ul>
  <li>
    <p>
      <a href="https://www.mobygames.com/game/141836/persona-5-royal/"
        >Persona 5 and Persona 5 Royal</a
      >
    </p>
  </li>
  <li>
    <p>
      <a href="https://www.mobygames.com/game/15180/shin-megami-tensei-nocturne/">SMT 3: Nocturne</a
      >,
      <a href="https://www.mobygames.com/game/61143/shin-megami-tensei-iv/">SMT IV</a>,
      <a href="https://www.mobygames.com/game/82708/shin-megami-tensei-iv-apocalypse/"
        >SMT IV: Apocalypse</a
      >, and <a href="https://www.mobygames.com/game/174498/shin-megami-tensei-v/">SMT V</a>
    </p>
  </li>
</ul>
<p>
  I couldn't find any desktop backgrounds that I liked from the games so I made some by taking
  sprites ripped from the SNES games and scaling them to 1080p. Here they are:
</p>

<WallpaperGallery
  images={[
    [AliceSmall, AliceFull, 'Alice'],
    [AlrauneSmall, AlrauneFull, 'Alraune'],
    [HecateSmall, HecateFull, 'Hecate'],
    [ParvatiSmall, ParvatiFull, 'Parvati'],
    [MabSmall, MabFull, 'Queen Mab'],
    [SeiryuSmall, SeiryuFull, 'Seiryu'],
    [SmtIISmall, SmtIIFull, 'A screenshot from SMT II'],
    [TiamatSmall, TiamatFull, 'Tiamat']
  ]}
/>
