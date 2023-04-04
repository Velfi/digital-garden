---
title: Painting flow fields
description: An interactive visualization of dimensional noise.
keywords: flow field, dimensional noise, noise, visualization, rust
---

# {title}

The source code is available on [GitHub]

This project was born out of a deeper exploration into dimensional noise with the knowledge gained
from my [[vector-field-visualizer]] project. In this app, a dimensional noise feel is used to guide
particle that leave a colorful trail behind them. The trails combine over time to reveal the "flow"
of dimensional noise. Several noise algorithms are available to guide the particles. This
visualization contains a UI for easy modification of the app's configuration. Particles can be
placed individually by left clicking or painted by holding the right mouse button.

There are also some keyboard controls:

<table>
  <thead>
    <tr>
      <th>Key</th>
      <th>Action</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Space</td>
      <td>Spawn new particle in a random location</td>
    </tr>
    <tr>
      <td>A</td>
      <td>Toggle On/Off. Automatically spawn a particle every frame unless too many already exist</td>
    </tr>
    <tr>
      <td>B</td>
      <td>Clear the screen and change the background</td>
    </tr>
    <tr>
      <td>C</td>
      <td>Switch to the next color palette</td>
    </tr>
    <tr>
      <td>L</td>
      <td>Switch to the next line cap type</td>
    </tr>
    <tr>
      <td>N</td>
      <td>Generate a new noise seed and reset the field</td>
    </tr>
    <tr>
      <td>~</td>
      <td>Show or hide the UI</td>
    </tr>
  </tbody>
</table>

_Note: Because of how the flowing lines are painted, the UI won't immediately disappear and must be painted over, either by changing the background or by painting particles over it._

## Examples

![Fantasy palette painted over noise produced by the Worley algorithm](/images/programming/flow/turbo.png)

<p class="image-subtitle">Fantasy palette painted over noise produced by the Worley algorithm</p>

![Viridis palette painted over noise produced by the billow algorithm](/images/programming/flow/viridis.png)

<p class="image-subtitle">Viridis palette painted over noise produced by the billow algorithm</p>

![Turbo palette painted over noise produced by the billow algorithm](/images/programming/flow/fantasy.png)

<p class="image-subtitle">Turbo palette painted over noise produced by the billow algorithm</p>

[GitHub]: https://github.com/Velfi/Flow
[vector-field-visualizer]: vector-field-visualizer 'Visualizing dimensional noise algorithms'
