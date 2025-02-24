---
title: Gray Scott Reaction Diffusion Simulation
description: A Rust implementation of a reaction diffusion simulation.
keywords: reaction diffusion, rust, programming
---

# {title}

The source code is available on [GitHub].

> Reaction–diffusion systems are mathematical models which correspond to several physical phenomena:
> the most common is the change in space and time of the concentration of one or more chemical
> substances: local chemical reactions in which the substances are transformed into each other, and
> diffusion which causes the substances to spread out over a surface in space.
>
> <p class="right"><i>&mdash; <a href="https://en.wikipedia.org/wiki/Reaction%E2%80%93diffusion_system">Wikipedia</a></i></p>

If that sounds like gibberish, just know that it's an algorithm for modeling the processes that
create lots of natural patterns. To understand how the simulation works, imagine that you have a
petri dish containing two chemicals: A and B. Each step of the simulation, some chemical B interacts
with chemical A and catalyzes it, converting into more chemical B. Also, more chemical A is fed into
the petri dish at a constant rate and Chemical B is removed from the petri dish at a constant rate.
That's it. Depending on how fast you add more chemical A and how fast you remove excess chemical B a
multitude of different patterns will appear.

[Click here for more info on cool patterns that appear in nature.][patterns-in-nature]

![The 'Soliton Collapse' setting](/images/programming/reaction-diffusion/soliton.png)

<p class="image-subtitle">The 'Soliton Collapse' setting</p>

![The 'Brain Coral' setting](/images/programming/reaction-diffusion/brain_coral.png)

<p class="image-subtitle">The 'Brain Coral' setting</p>

## Running The Visualizer

You'll need to have Rust and `cargo` installed. Then, run `cargo run --release` in you terminal of
choice. Click and drag around to seed the reaction and interact with it.

## Seeing Different Reactions

Right now, changing the default interaction is somewhat inconvenient, but I've provided a few
presets that you can manually enter. Just update line 33 in `main.rs`

```rust
// src/main.rs:33
// Change the preset to anything exported from `model_presets`
const CURRENT_MODEL: (f32, f32) = model_presets::SOLITON_COLLAPSE;
```

The options available are:

<table>
    <thead>
        <tr>
            <th>Preset Name</th>
            <th>Feed Rate</th>
            <th>Removal Rate</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>BRAIN_CORAL</td>
            <td>0.0545</td>
            <td>0.0620</td>
        </tr>
        <tr>
            <td>FINGERPRINT</td>
            <td>0.0545</td>
            <td>0.0620</td>
        </tr>
        <tr>
            <td>MITOSIS</td>
            <td>0.0367</td>
            <td>0.0649</td>
        </tr>
        <tr>
            <td>RIPPLES</td>
            <td>0.0180</td>
            <td>0.0510</td>
        </tr>
        <tr>
            <td>SOLITON_COLLAPSE</td>
            <td>0.0220</td>
            <td>0.0600</td>
        </tr>
        <tr>
            <td>U_SKATE_WORLD</td>
            <td>0.0620</td>
            <td>0.0610</td>
        </tr>
        <tr>
            <td>UNDULATING</td>
            <td>0.0260</td>
            <td>0.0510</td>
        </tr>
        <tr>
            <td>WORMS</td>
            <td>0.0780</td>
            <td>0.0610</td>
        </tr>
    </tbody>
</table>

You can also enter a tuple of your own values here if you prefer.

[GitHub]: https://github.com/Velfi/Gray-Scott-Reaction-Diffusion
[reaction diffusion system wikipedia]: https://en.wikipedia.org/wiki/Reaction%E2%80%93diffusion_system
[patterns-in-nature]: https://en.wikipedia.org/wiki/Patterns_in_nature
[example_soliton]: /example_soliton.png "An example of the 'Soliton Collapse' setting"
[example_brain_coral]: /example_brain_coral.png "An example of the 'Brain Coral' setting"
