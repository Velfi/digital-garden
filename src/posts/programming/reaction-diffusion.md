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

## Example Images

![An example of the Reaction Diffusion Simulation](/images/programming/reaction-diffusion/example_1.png)
![An example of the Reaction Diffusion Simulation](/images/programming/reaction-diffusion/example_2.png)
![An example of the Reaction Diffusion Simulation](/images/programming/reaction-diffusion/example_3.png)
![An example of the Reaction Diffusion Simulation](/images/programming/reaction-diffusion/example_4.png)
![An example of the Reaction Diffusion Simulation](/images/programming/reaction-diffusion/example_5.png)

## Running The Visualizer

You'll need to have Rust and `cargo` installed. Then, run `cargo run --release` in your terminal of choice.

## Controls

- **Left Mouse Button**: Click and drag to seed the reaction
- **Right Mouse Button**: Click and drag to erase/create voids in the reaction
- **Z**: Toggle psychedelic mode (randomly cycles through LUTs)
- **X**: Clear the screen
- **N**: Fill the screen with noise
- **G**: Cycle through different color gradients (hold SHIFT to cycle backwards)
- **P**: Cycle through different reaction presets (hold SHIFT to cycle backwards)
- **U**: Cycle through different nutrient patterns (hold SHIFT to cycle backwards)
- **Arrow Keys**: Adjust feed rate (left/right) and kill rate (up/down) in Custom preset (hold SHIFT for finer control)
- **? or \\**: Toggle help overlay
- **ESC**: Exit the application

## Reaction Presets

The simulation comes with several built-in presets that create different patterns:

- `BRAIN_CORAL`
- `FINGERPRINT`
- `MITOSIS`
- `RIPPLES`
- `SOLITON_COLLAPSE`
- `U_SKATE_WORLD`
- `UNDULATING`
- `WORMS`
- `CUSTOM` (Interactive: use arrow keys to adjust feed and kill rates, hold SHIFT for finer control)

## Nutrient Patterns

The simulation also includes various nutrient patterns that affect how the reaction spreads:

- Uniform
- Checkerboard
- Diagonal Gradient
- Radial Gradient
- Vertical Stripes
- Horizontal Stripes
- Noise

[GitHub]: https://github.com/Velfi/Gray-Scott-Reaction-Diffusion
[reaction diffusion system wikipedia]: https://en.wikipedia.org/wiki/Reaction%E2%80%93diffusion_system
[patterns-in-nature]: https://en.wikipedia.org/wiki/Patterns_in_nature
