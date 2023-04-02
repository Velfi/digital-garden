<script lang="ts">
  const EXAMPLE_A = `╬═════════════════╬
║                 ║
║             . o ║
║      .       + .║
║     o o       o ║
║    . o S   . . E║
║   . . o + ..oo. ║
║    o .   +. ++. ║
║     .    .. .oo ║
║           .. .. ║
╬═════════════════╬`;

  const EXAMPLE_B = `╬═════════════════╬
║         ...   . ║
║         ........║
║          = o.. o║
║         * =   . ║
║        S + .    ║
║        .  .     ║
║       ..E.      ║
║      ..=o.      ║
║      .+.oo.     ║
╬═════════════════╬`;

  const EXAMPLE_C = `╬═════════════════╬
║                 ║
║              E  ║
║             .   ║
║          . o    ║
║        So = .   ║
║        +.* + .  ║
║       ..O = o . ║
║       oo O o .  ║
║      .ooo . .   ║
╬═════════════════╬`;

  const EXAMPLE_D = `╬═════════════════╬
║    .            ║
║   . o           ║
║    + = o . E    ║
║   o . O + .     ║
║    o . S o      ║
║   . . O *       ║
║      o * .      ║
║         .       ║
║                 ║
╬═════════════════╬`;
</script>

<svelte:head>
  <title>The Roving Bishop Algorithm</title>
  <meta
    name="description"
    content="A program that generates random images similar to the ones produced by SSH during keygen. I followed this paper but messed up some of the bit-reading parts so it won't work exactly the same as the SSH one does."
  />
  <meta name="keywords" content="roving bishop, algorithm, svelte" />
</svelte:head>

<h1>The Roving Bishop Algorithm</h1>

<p>The source code is available on<a href="https://github.com/Velfi/roving_bishop">GitHub</a></p>

<p>
  A program that generates random images similar to the ones produced by SSH during keygen. I
  followed
  <a href="http://www.dirk-loss.de/sshvis/drunken_bishop.pdf">this paper</a>
  but messed up some of the bit-reading parts so it won't work exactly the same as the SSH one does.
</p>

<h2>Example Outputs</h2>

<div class="container">
  <pre class="example">{EXAMPLE_A}</pre>
  <pre class="example">{EXAMPLE_B}</pre>
  <pre class="example">{EXAMPLE_C}</pre>
  <pre class="example">{EXAMPLE_D}</pre>
</div>

<h2>See Also</h2>

<ul>
  <li>
    <a href="https://www.jfurness.uk/the-drunken-bishop-algorithm/">A cool demonstration</a> of the algorithm
    and an explanation of how it works.
  </li>
  <li>
    <a
      href="https://pthree.org/2013/05/30/openssh-keys-and-the-drunken-bishop/
  ">An even older demonstration</a
    > of the algorithm and an explanation of how it works.
  </li>
</ul>

<style lang="scss">
  .container {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .example {
    font-family: 'Fira Code', Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', 'Courier New', Courier,
      monospace;
    font-size: 0.9rem;
    text-align: center;
  }
</style>
