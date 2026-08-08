---
title: Marimo
description: A simulated moss ball in a jar, built in Three.js. Notes on the biology it models and the techniques used, with references.
keywords: marimo, moss ball, aegagropila, three.js, webgl, simulation, spherical harmonics, instancing, programming
---

<script>
  import MarimoTank from '$lib/components/MarimoTank.svelte';
</script>

# {title}

<MarimoTank variant="ambient" />

Stir the water. It will settle. There is a [full jar](/marimo) with a care panel and
growth rings; It saves to your browser storage.

## The biology it models

Marimo are not moss, nor are they plants. They are a filamentous green alga, _Aegagropila
linnaei_, and the ball is one of three growth forms the species takes — most of it
grows as unremarkable fuzz on rocks
([Aegagropila linnaei](https://en.wikipedia.org/wiki/Aegagropila_linnaei)).

Three findings drove the simulation, all from Nakayama et al.'s MRI study of the Lake
Akan population, [_The structure and formation of giant Marimo (Aegagropila linnaei) in
Lake Akan, Japan_](https://pmc.ncbi.nlm.nih.gov/articles/PMC8581023/) (Scientific
Reports, 2021):

- **Rotation is what makes them round.** Wind-driven waves roll the balls and pack the
  outer filaments evenly. Below a critical wind speed of about 4.8 m/s they stop turning
  — and the ones that stop develop a flat side.
- **They breathe themselves to the surface.** Photosynthetic oxygen accumulates inside
  until the ball is buoyant, it rises, vents, and sinks again over a few hours.
- **They grow at about 12.6 mm of diameter per year**, laying down annual rings: dense
  in summer when waves are polishing them, sparse under winter ice.

Two related results that did not make it into the model: the balls hold their spherical
form partly by _suppressing_ reproduction, since zoospore formation breaks filaments
apart ([Hokkaido University](https://www.global.hokudai.ac.jp/blog/reproduction-key-to-maintenance-of-marimo-shape/));
and their thermal envelope is narrow enough that a single day at 35 °C causes them to
disintegrate 80 days later ([Scientific Reports, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10558478/)).

## How it is built

**Two clocks.** A motion clock at a fixed 1/240 s handles buoyancy, drag and rolling.
A separate care clock owns everything persisted — size, colour, cloudiness, trapped
gas, the flat spot — and runs off `Date.now()` whether the page is open or not. Every
term in it is either linear in `dt` or an exact first-order relaxation, so many small
steps and one large step give the same answer. That is what lets a month of absence and
a one-second tick call the same function. The step _count_ is bounded, not the elapsed
time; capping elapsed time would delete a returning visitor's growth.

**Oxygen is solved, not stepped.** The gas cycle fills over hours and vents in seconds,
so coarse stepping would pin every returning marimo to the same phase. It is a
first-order lag toward a fixed equilibrium, so the crossing time has a closed form and
a week of absence resolves into a whole number of cycles plus a remainder. A useful
accident: when photosynthesis drops, the equilibrium falls below the vent threshold and
a neglected ball simply stops surfacing. No rule was written for that.

**The shape is 16 spherical-harmonic coefficients** (`l ≤ 3`) — about 120 bytes, and
zero per-frame CPU, since they go into the vertex shader as four `vec4`s. Building the
dent as `kernel[band] · Y[k](restDirection)` makes it exactly rotationally symmetric
about the resting direction by the addition theorem, which is testable to 1e-9. Real SH
basis and conventions follow Sloan's
[_Stupid Spherical Harmonics Tricks_](https://www.ppsloan.org/publications/StupidSH36.pdf).

**The fuzz is instanced geometry, not shell texturing.** [Shell texturing](https://github.com/GarrettGunnell/Shell-Texturing)
(after [Lengyel et al.](https://hhoppe.com/fur.pdf)) hashes a UV grid, and Three's
`IcosahedronGeometry` inherits equirectangular UVs from `PolyhedronGeometry` — strands
would pinch at the poles and break along the seam. Instead ~16,000 two-triangle slivers
are placed on a Fibonacci sphere (no poles, no seam;
[Keinert et al.](https://dl.acm.org/doi/10.1145/2816795.2818131) cover the general
mapping) and positioned entirely in the vertex shader. One draw call, no `discard`, a
true silhouette — and because each strand is placed individually, the water's velocity
can bend each one separately, so the coat lies over when you stir the jar.

**The water is a volume, not fog.** Single-scattering Beer–Lambert with per-channel
coefficients, where the path length comes from intersecting the view ray with the water
box rather than from distance to the camera — which is why a marimo breaking the
surface is untinted above the waterline and tinted below. The coefficients are built
from pure water (which absorbs red roughly twenty times more strongly than blue;
[Pope & Fry, 1997](https://doi.org/10.1364/AO.36.008710)), CDOM — the "yellow substance"
an alga leaches into standing water, whose absorption falls off exponentially with
wavelength ([Bricaud et al., 1981](https://doi.org/10.4319/lo.1981.26.1.0043)) — and
grey particulate scattering. Because those two biases oppose each other, fouling shifts
the water's hue toward yellow-brown rather than merely darkening it. The magnitudes are
exaggerated: the real path here is about 4.5 cm, over which honest coefficients are
indistinguishable from air.

**The surface uses the actual critical angle.** Past 48.6°, water-to-air is a perfect
mirror ([Snell's window](https://en.wikipedia.org/wiki/Snell%27s_window)), so the tank
is rendered again at half resolution from a camera mirrored through the water plane.
[Schlick's approximation](https://en.wikipedia.org/wiki/Schlick%27s_approximation) has
to be applied to the _transmitted_ angle going from dense to rare, or reflectance stays
near 2% right up to the critical angle and the mirror region appears out of nowhere.

## Time scale

The sim runs at six marimo-years per real year: 0.207 mm of diameter per day. Invisible
over a day, roughly 1.5 mm over a week, obvious over a month. Growth scales with health
but the multiplier bottoms out at 0.15 rather than zero, so a wholly neglected marimo
still grow — browner, flat on one side, in cloudy water, never surfacing.
