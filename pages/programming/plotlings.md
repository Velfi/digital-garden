import VerticalSpacer from '../../components/VerticalSpacer.js'

# Plotter Art Generation Suite

The source code is available on [GitHub]

A collection of art generators that can export SVGs. I purchased an [AxiDraw V3] and it's been a lot of fun. Feel free to use these generators to make your own art. Running it requires you to have Rust installed. To export SVGs, set the `SVG_EXPORT_DIRECTORY` environment variable (you can create an `.env` file in the project root to set this as well).

## Generators

### Line Groups

Run it with this command: `cargo run release --bin line_groups`

<Image src="/images/programming/plotlings/line_groups.svg" alt="Groups of wavy lines overlaid on top of each other at regular intervals" width="523" height="900" layout="responsive" />
The first one I created for this project. It generates groups of lines that look neat. It can also look similar to a [ridgeline plot].

<VerticalSpacer/>

### Maze

Run it with this command: `cargo run release --bin maze`

<Image src="/images/programming/plotlings/maze.svg" alt="An unsolvable maze" width="900" height="655" layout="responsive" />
Based on the classic [maze BASIC program].

<VerticalSpacer/>

### Dune

Run it with this command: `cargo run release --bin dune`

<Image src="/images/programming/plotlings/dune.svg" alt="A series of regularly spaced triangles that, togehter, have the appearance of a sand dune" width="673" height="900" layout="responsive" />
A naïve recreation of [Sohan Murthy's Continuity Correction] that ended up going in a new direction.

[GitHub]: https://github.com/Velfi/plotlings
[ridgeline plot]: https://www.data-to-viz.com/graph/ridgeline.html
[maze BASIC program]: http://www.slate.com/articles/technology/books/2012/11/computer_programming_10_print_chr_205_5_rnd_1_goto_10_from_mit_press_reviewed.html
[Sohan Murthy's Continuity Correction]: https://sohan.space/portfolio/continuity-correction/
[AxiDraw V3]: https://shop.evilmadscientist.com/productsmenu/846
