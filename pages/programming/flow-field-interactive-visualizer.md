import VerticalSpacer from '../../components/VerticalSpacer.js'

# Painting flow fields

_TODO: auto-generated links to other pages in the same subfolder are currently broken. This will be fixed by [<img src="https://img.shields.io/github/pulls/detail/state/yenly/foamy-nextjs/9" />](https://github.com/yenly/foamy-nextjs/pull/9)_

The source code is available on [GitHub]

This project was born out of a deeper exploration into dimensional noise with the knowledge gained from my [[vector-field-visualizer]] project.
In this app, a dimensional noise feel is used to guide particle that leave a colorful trail behind them. The trails combine over time to reveal the
"flow" of dimensional noise. Several noise algorithms are available to guide the particles. This visualization contains a UI for easy modification of
the app's configuration. Particles can be placed individually by left clicking or painted by holding the right mouse button.

There are also some keyboard controls:

| Key   | Action                                                                                  |
| ----- | --------------------------------------------------------------------------------------- |
| Space | Spawn new particle in a random location                                                 |
| A     | Toggle On/Off. Automatically spawn a particle every frame unless too many already exist |
| B     | Clear the screen and change the background                                              |
| C     | Switch to the next color palette                                                        |
| L     | Switch to the next line cap type                                                        |
| N     | Generate a new noise seed and reset the field                                           |
| ~     | Show or hide the UI                                                                     |

_Note: Because of how the flowing lines are painted, the UI won't immediately disappear and must be painted over, either by changing the background or by painting particles over it._

## Examples

<Image
  src="/images/programming/flow/turbo.png"
  alt="Turbo palette painted over noise produced by the billow algorithm"
  width="1920"
  height="1080"
  layout="responsive"
  subtitle="Turbo palette painted over noise produced by the billow algorithm" />

<VerticalSpacer/>

<Image
  src="/images/programming/flow/viridis.png"
  alt="Viridis palette painted over noise produced by the billow algorithm"
  width="1920"
  height="1080"
  layout="responsive"
  subtitle="Viridis palette painted over noise produced by the billow algorithm" />

<VerticalSpacer/>

<Image
  src="/images/programming/flow/fantasy.png"
  alt="Fantasy palette painted over noise produced by the Worley algorithm"
  width="1920"
  height="1080"
  layout="responsive"
  subtitle="Fantasy palette painted over noise produced by the Worley algorithm" />

[GitHub]: https://github.com/Velfi/Flow
[vector-field-visualization]: ./vector-field-visualization "Visualizing dimensional noise algorithms"

[//begin]: # "Autogenerated link references for markdown compatibility"
[vector-field-visualizer]: vector-field-visualizer "Visualizing dimensional noise algorithms"
[//end]: # "Autogenerated link references"