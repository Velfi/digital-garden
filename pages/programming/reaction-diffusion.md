import VerticalSpacer from '../../components/VerticalSpacer.js'

# Gray Scott Reaction Diffusion Simulation

The source code is available on [GitHub].

> *from the [Reaction Diffusion System Wikipedia] article*:
> Reaction–diffusion systems are mathematical models which correspond to several physical phenomena: the most common is the change in space and time of the concentration of one or more chemical substances: local chemical reactions in which the substances are transformed into each other, and diffusion which causes the substances to spread out over a surface in space.

If that sounds like gibberish, just know that it's an algorithm for modeling the processes that create lots of natural patterns. To understand how the simulation works, imagine that you have a petri dish containing two chemicals: A and B. Each step of the simulation, some chemical B interacts with chemical A and catalyzes it, converting into more chemical B. Also, more chemical A is fed into the petri dish at a constant rate and Chemical B is removed from the petri dish at a constant rate. That's it. Depending on how fast you add more chemical A and how fast you remove excess chemical B a multitude of different patterns will appear.

[Click here for more info on cool patterns that appear in nature.][patterns-in-nature]

<Image src="/images/programming/reaction-diffusion/soliton.png" height="1716" width="2772" alt="The 'Soliton Collapse' setting" subtitle="The 'Soliton Collapse' setting" />

<VerticalSpacer/>

<Image src="/images/programming/reaction-diffusion/brain_coral.png" height="1706" width="2800" alt="The 'Brain Coral' setting" subtitle="The 'Brain Coral' setting" />

<VerticalSpacer/>

## Running The Visualizer

You'll need to have Rust and `cargo` installed. Then, run `cargo run --release` in you terminal of choice. Click and drag around to seed the reaction and interact with it.

## Seeing Different Reactions

Right now, changing the default interaction is somewhat inconvenient, but I've provided a few presets that you can manually enter. Just update line 33 in `main.rs`

```rust
// src/main.rs:33
// Change the preset to anything exported from `model_presets`
const CURRENT_MODEL: (f32, f32) = model_presets::SOLITON_COLLAPSE;
```

The options available are:

| Preset Name      | Feed Rate | Removal Rate |
| ---------------- | --------- | ------------ |
| BRAIN_CORAL      | 0.0545    | 0.0620       |
| FINGERPRINT      | 0.0545    | 0.0620       |
| MITOSIS          | 0.0367    | 0.0649       |
| RIPPLES          | 0.0180    | 0.0510       |
| SOLITON_COLLAPSE | 0.0220    | 0.0600       |
| U_SKATE_WORLD    | 0.0620    | 0.0610       |
| UNDULATING       | 0.0260    | 0.0510       |
| WORMS            | 0.0780    | 0.0610       |

You can also enter a tuple of your own values here if you prefer.

[Reaction Diffusion System Wikipedia]: https://en.wikipedia.org/wiki/Reaction%E2%80%93diffusion_system
[patterns-in-nature]: https://en.wikipedia.org/wiki/Patterns_in_nature
[example_soliton]: /example_soliton.png "An example of the 'Soliton Collapse' setting"
[example_brain_coral]: /example_brain_coral.png "An example of the 'Brain Coral' setting"
[GitHub]: https://github.com/Velfi/Gray-Scott-Reaction-Diffusion
