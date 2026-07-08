---
title: Procedural Candle Flame
description: An animated icosphere candle flame mesh driven by a procedural buoyant-plume simulation in Three.js.
keywords: webgl, three.js, procedural, candle, flame, icosphere, programming
---

<script>
  import CandleFlameCanvas from '$lib/components/CandleFlameCanvas.svelte';
</script>

# {title}

This demo starts from an **icosphere** — a sphere mesh topologically, like the microgravity flame shape described in the [physics overview](https://sky-lights.org/2025/06/16/physics-of-candle-flames/). Each vertex is mapped onto a teardrop envelope above the wick, then displaced every frame by a procedural buoyant-plume field (wind, turbulence, 3D noise). That mimics how NIST visualizes FDS output as a [stoichiometric mixture-fraction isosurface](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=101159), but with an explicit mesh you can inspect rather than a ray-marched volume.

<CandleFlameCanvas />

## What a real candle flame is doing

Dan Heim's [Physics of Candle Flames](https://sky-lights.org/2025/06/16/physics-of-candle-flames/) is a good overview of what's actually happening above the wick:

- Radiant heat melts wax at the top of the candle. Capillary action pulls liquid wax up the wick — that's the fuel.
- Heat vaporizes those hydrocarbons into hydrogen and carbon.
- Those molecules react with oxygen to produce heat, light, water vapor, and CO₂.
- The **visible yellow light** comes from incandescent carbon (soot) carried upward by convection — the same reason a light bulb filament glows.
- Soot cools as it rises, loses incandescence, and the flame tapers to a tip.
- Fresh air is drawn in at the base, which is why you see a **blue zone** near the wick where combustion is more complete.

The classic teardrop shape is also a convection story. Hot combustion products rise, pulling oxygen in from below. On Earth, gravity gives you a clear up and down. In microgravity, NASA experiments show the flame becomes **spherical and mostly blue** — convection stops shaping it, diffusion takes over, and you don't get the same glowing soot column.

NIST researchers Hamins, Bundy, and Dillon measured paraffin taper candles under controlled lab conditions ([Characterization of Candle Flames](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=101159), 2005). Their numbers give a useful reality check for proportions:

- **Flame height** — about **42 mm** from the wax pool to the visible tip at steady state (21 mm diameter candle).
- **Visible flame zone** — roughly the first **40 mm** above the base, where radiative heat transfer dominates.
- **Hot plume** — above that zone, convection takes over; the buoyant plume stays fairly straight and about **25 mm** wide from 60–80 mm up.
- **Wick curvature** — the flame tip sits above the curved wick, not necessarily the geometric center of the candle.
- **Peak temperature** — literature values cited in the paper put maximum flame temperature around **1400 °C** near the wick.

In their FDS model, the simulated flame shape matched the photograph when visualized as the **isosurface of stoichiometric mixture fraction** — calculated height 40 mm vs measured 42 mm.

## How the demo works

The flame is an icosphere (subdivided icosahedron) — sphere topology, deformed into a candle shape:

1. **Rest pose** — each vertex direction on the unit sphere is mapped to a teardrop envelope: wide at the base (~32 mm), pinched at the tip, ~42 mm tall (NIST's measured flame height for a 21 mm candle).

2. **Plume simulation** — each frame, vertices are offset by a procedural mixture-fraction-style field: buoyant rise, wind bend (stronger near the tip), 3D fBM turbulence, and radial breathing. The wick fuel source anchors the base.

3. **Shading** — per-vertex colors from height and distance to the plume centerline: blue at the oxygen-rich base, pale yellow body, bright core. A slightly larger additive glow shell wraps the mesh.

4. **Candle geometry** — wax cylinder, melt pool lip, and curved wick are separate Three.js meshes lit with a point light driven by the flame.

Scene units are meters: candle radius 0.105, default flame height 0.42.

## Controls

- **Wind X / Wind Y**: direction of the flame bend.
- **Wind strength**: how much the plume centerline bends and frays.
- **Turbulence**: flicker in the mixture-fraction field.
- **Flame height**: isosurface height in scene units (0.42 ≈ 42 mm).
- **Exposure**: overall brightness and glow.

You can also drag in the viewport to aim the wind.

## Implementation notes

- `restFlamePoint()` — maps icosphere vertex direction to teardrop rest pose
- `simDisplacement()` — plume field offset per vertex (wind, turbulence, fBM)
- `createFlameMesh()` — Three.js icosphere with CPU vertex animation each frame
- `createCandleScene()` — renderer, wax, wick, lighting

The TypeScript side runs the "sim" on the CPU (~2.5k vertices) and uploads deformed positions every frame.

## Further reading

- [Physics of Candle Flames](https://sky-lights.org/2025/06/16/physics-of-candle-flames/) — Dan Heim, SKY LIGHTS
- [Characterization of Candle Flames](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=101159) — Hamins, Bundy & Dillon, NIST (2005). Measured flame height, heat flux profiles, and FDS isosurface modeling of paraffin taper candles.
