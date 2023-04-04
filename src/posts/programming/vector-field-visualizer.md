---
title: Visualizing dimensional noise algorithms
description: A Rust app for visualizing dimensional noise algorithms
keywords: noise, rust, programming
---

# {title}

The source code is available on [GitHub]

![visualization of noise produced by fractal brownian motion algorithm](/images/programming/vector-field-visualizer/fbm-noise-example-1.png 'FBM Noise Example 1')

I'm in love with the aesthetics of noise and randomness. That love inspired this app for viewing dimensional noise with a vector field.

- **Dimensional Noise**: Random numbers produced by an noise algorithm that takes one or more input parameters (usually 1 to 4.) When input parameters are close together, the algorithm produces numbers that are closer together. When input parameters are not close together, the generated numbers are more random.
- **Vector Field**: A grid of short line segments that point in directions based on the numbers returned by the dimensional noise algorithm. Each line (vector) points in a direction similar to the direction that it's neighbors are pointing.

The app works like this:

For each point on a 2D grid, a line segment (vector) is created at that point. We calculate a noise value based on each line's XY coordinates and rotate the line segment accordingly. We also use the noise value to set the length (or magnitude) of the vector.

The app demonstrates different noise algorithms provided by the [noise] crate including:

- [OpenSimplex Noise]
- [Perlin Noise]
- [Worley Noise]
- [Value Noise]
- [Fractal Brownian Motion Noise]

If you're generally interested in how noise algorithms work, check out the noise section in the [Book Of Shaders].

![visualization of noise produced by a fractal brownian motion algorithm](/images/programming/vector-field-visualizer/fbm-noise-example-2.png 'FBM Noise Example 2')

[GitHub]: https://github.com/Velfi/Rust-Vector-Field-Visualization
[book of shaders]: https://thebookofshaders.com/11/
[noise]: https://crates.io/crates/noise
[OpenSimplex noise]: https://en.wikipedia.org/wiki/OpenSimplex_noise
[Perlin noise]: https://en.wikipedia.org/wiki/Perlin_noise
[Worley noise]: https://en.wikipedia.org/wiki/Worley_noise
[value noise]: https://en.wikipedia.org/wiki/Value_noise
[fractal brownian motion noise]: https://thebookofshaders.com/13/
