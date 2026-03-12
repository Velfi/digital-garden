---
title: Particle Life Simulation
description: A GPU-accelerated particle life simulation written in Rust using WGPU.
keywords: particle life, rust, programming, gpu, wgpu
---

# {title}

The source code is available on [GitHub].

An interactive particle life simulation based on several sources, mainly [particle-life.com](https://particle-life.com). This is a GPU-accelerated implementation that demonstrates emergent behavior through simple interaction rules.

![Example 1](/images/programming/particle-life/example_1.png)
![Example 2](/images/programming/particle-life/example_2.png)
![Example 3](/images/programming/particle-life/example_3.png)
![Example 4](/images/programming/particle-life/example_4.png)
![Example 5](/images/programming/particle-life/example_5.png)

## Features

- GPU-accelerated particle rendering and physics
- Multiple particle types with configurable interaction rules
- Various initial position patterns and type distributions
- Interactive camera controls and particle manipulation
- Configurable color palettes
- Particle trails and fade effects
- Mouse-based particle interaction (attract/repel)

## Running the app

```bash
cargo run --release
```

## Controls

### Camera Controls

- `W/A/S/D` or Arrow Keys - Move camera
- `Mouse scroll` - Zoom in/out
- `Shift + Z` - Reset camera with zoom
- `Z` - Reset camera without zoom

### Simulation Controls

- `Space` - Pause/Resume simulation
- `P` - Regenerate particle positions
- `C` - Regenerate particle types
- `M` - Generate new interaction matrix
- `B` - Toggle world wrapping
- `T` - Toggle particle trails
- `Shift + Scroll` - Adjust particle size
- `Ctrl + Shift + Scroll` - Adjust simulation speed

### Mouse Interaction

- Left Click + Drag - Repel particles
- Right Click + Drag - Attract particles

### UI Controls

- `/` - Toggle GUI visibility
- `Esc` - Exit application

## References

- [Flow-Lenia: Towards open-ended evolution in cellular automata through mass conservation and parameter localization](https://arxiv.org/pdf/2212.07906)
- [ALIEN - Explore worlds of artificial life](https://github.com/chrxh/alien)
- [Particle Life Simulation](https://github.com/hunar4321/particle-life)

[GitHub]: https://github.com/Velfi/particle-life
