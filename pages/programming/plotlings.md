# Plotter Art Generation Suite

The source code is available on [GitHub]

A collection of art generators that can export SVGs. I purchased an [AxiDraw V3] and it's been a lot of fun. Feel free to use these generators to make your own art.

## Running it yourself

Rust is required. To export to SVG, set the `SVG_EXPORT_DIRECTORY` environment variable. The programs support `.env` files.

## Generators

### Line Groups

Run it with this command: `cargo run release --bin line_groups`

![Line Groups](/previews/line_groups.png)
<Image src="/images/programming/plotlings/line_groups.svg" alt="Line Groups" width="799" height="346" layout="responsive" />
The first one I created for this project. It generates groups of lines that look neat.

### Maze

Run it with this command: `cargo run release --bin maze`

![Maze](/previews/maze.png)
<Image src="/images/programming/plotlings/maze.svg" alt="Maze" width="799" height="346" layout="responsive" />
Based on the classic maze BASIC program.

### Dune

Run it with this command: `cargo run release --bin dune`

![Dune](/previews/dune.png)
<Image src="/images/programming/plotlings/dune.svg" alt="Dune" width="799" height="346" layout="responsive" />
A naïve recreation of [Sohan Murthy's Continuity Correction][continuity-correction] that ended up going in a new direction.

[GitHub]: https://github.com/Velfi/plotlings
[continuity-correction]: https://sohan.space/portfolio/continuity-correction/
[AxiDraw V3]: https://shop.evilmadscientist.com/productsmenu/846
