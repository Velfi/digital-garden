---
title: Plotter Art Generation Suite
description: A collection of art generators that can export SVGs. I purchased an AxiDraw V3 and its been a lot of fun. Feel free to use these generators to make your own art.
keywords: plotter, art, svg, rust
---

The source code is available on [GitHub]

A collection of art generators that can export SVGs. I purchased an [AxiDraw V3] and it's been a lot
of fun. Feel free to use these generators to make your own art. Running it requires you to have Rust
installed. To export SVGs, set the `SVG_EXPORT_DIRECTORY` environment variable (you can create an
`.env` file in the project root to set this as well).

## Generators

### Line Groups

Run it with this command: `cargo run release --bin line_groups`

![Groups of wavy lines overlaid on top of each other at regular intervals](/images/programming/plotlings/line_groups.svg)
The first one I created for this project. It generates groups of lines that look neat. It can also
look similar to a [ridgeline plot].

### Maze

Run it with this command: `cargo run release --bin maze`

![An unsolvable maze](/images/programming/plotlings/maze.svg)
Based on the classic [maze BASIC program].

### Dune

Run it with this command: `cargo run release --bin dune`

![A series of regularly spaced triangles that, together, have the appearance of a sand dune](/images/programming/plotlings/dune.svg)

<p class="image-subtitle">A naïve recreation of Sohan Murthy's Continuity Correction that ended up going in a new direction."</p>

I had a link to [Sohan's page][Sohan Murthy's Continuity Correction] here, but it broke and I can't
find the original artwork anymore.

### Line Noise

Run it with this command: `cargo run release --bin line_noise`

![A cloud of short horizontal lines](/images/programming/plotlings/line_noise.svg)

[GitHub]: https://github.com/Velfi/plotlings
[Ridgeline plot]: https://www.data-to-viz.com/graph/ridgeline.html
[maze BASIC program]: http://www.slate.com/articles/technology/books/2012/11/computer_programming_10_print_chr_205_5_rnd_1_goto_10_from_mit_press_reviewed.html
[Sohan Murthy's Continuity Correction]: https://sohan.space/portfolio/continuity-correction/
[AxiDraw V3]: https://shop.evilmadscientist.com/productsmenu/846
