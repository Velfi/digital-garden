# Particle physics for the slime — research and recommendation

Research pass (2026-08-13, three parallel web-research agents) into replacing
the Jolt spring-mesh soft body with particle-based "actual blob physics", per
the open question in the project. Full sources at the end of each section.

## Why we're here

The spring-mesh body has been retrofitted four times (pressure balloon →
gumdrop → viscoplastic rest lengths → gravity-aligned shape memory) and each
retrofit engineered one more property that real goo exhibits *for free*:
slumping, orientation-freedom, squash-that-sticks, never shredding. The
question was whether a particle/SDF chassis makes those emergent instead of
engineered — and what it costs in a browser.

## Finding 1 — feasibility is a non-issue

Our scale (one ~4 cm creature, 2–5k particles, ~32³ grid) is *far below*
every published demo's ceiling:

- Grant Kot ran 10,000-particle MPM in vanilla JS on 2012 hardware
  ([kotsoft/fluid](https://github.com/kotsoft/fluid)).
- Müller's Ten-Minute-Physics FLIP water runs a 100-cell grid with tens of
  thousands of particles at 60 fps in one plain-JS file, in real SI units
  ([18-flip.html](https://github.com/matthias-research/pages/blob/master/tenMinutePhysics/18-flip.html)).
- WebGPU MLS-MPM does 100k particles on *integrated* graphics
  ([WebGPU-Ocean](https://github.com/matsuoka-601/webgpu-ocean)) — we need 2%
  of that.

Back-of-envelope for 3D MLS-MPM at 5k particles: ~270k node-ops per substep
plus a 33k-cell grid sweep — well under a millisecond in scalar TypeScript
with typed arrays. 4–8 substeps per frame is comfortable at 60 fps,
single-threaded, no WebGPU, no WASM. Escape hatch if explicit substepping
ever chafes: EA SEED's Position-Based MPM is stable at any timestep with
BSD-3 reference code ([pbmpm](https://github.com/electronicarts/pbmpm)).

## Finding 2 — the method menu, ranked for this pet

| Method | Emergent slump | Orientation-free | Squash-sticks-recovers | Stability | Size |
|---|---|---|---|---|---|
| **MLS-MPM** + corotated + plastic yield | **Yes** | Yes | **Native** (constitutive) | CFL-bound (substeps) or PB-MPM | ~600 lines |
| Cluster shape matching + plasticity (Müller '05) | Tuned, not emergent | Yes (polar decomp) | Native (Sp yield/creep) | **Provably unconditional** | ~300 lines |
| Clavet '05 viscoelastic SPH | **Yes — best pure goo** | Yes | Native, but **no persistent rest shape** (a full puddle never re-rounds) | Very good | ~400 lines |
| PBF / Flex-style unified particles | Yes | Yes | Only via embedded shape-matching | Excellent | moderate |
| XPBD tets (Ten-Minute-Physics 10+12) | Tuned | Yes | Add-on creep | "Unbreakable" | small (MIT forkable) |

The alternatives agent's bottom line: the highest-ceiling *hybrid* is the
Flex recipe scaled down (XPBD particles + shape-match clusters with creep +
Clavet cohesion). But note what that is: shape-matching *engineers* the shape
memory — the same philosophical road the spring mesh was on, just sturdier.

## Finding 3 — MPM's material is the material we've been hand-forging

The recipe (all pieces verified in running code):

- **MLS-MPM core**: the ~88-line Taichi formulation; best learning pair is
  [nialltl's guide](https://nialltl.neocities.org/articles/mpm_guide) + MIT
  [incremental_mpm](https://github.com/nialltl/incremental_mpm) (the base
  WebGPU-Ocean built from). Quadratic B-spline kernels (non-negotiable —
  linear kernels have cell-crossing force spikes).
- **Constitutive model for slime**: fixed corotated elasticity with low
  stiffness (identity F = the blob's memory — it re-rounds *because it is
  elastic*), plus a **widened snow-paper singular-value clamp** on F
  (Stomakhin 2013): strains inside the clamp are elastic, strains beyond it
  yield permanently. Widen the clamp and lower hardening → snow becomes clay
  becomes slime. Slow re-rounding = Oldroyd-B-style relaxation of F toward
  identity at 1/τ. This is `flowPlasticity` reborn as ten lines of the
  actual physics.
- **Walls**: grid-side velocity clamps within 3 cells of each face — sticky
  (zero velocity) or slip (zero normal). No collision geometry at all for an
  axis-aligned terrarium.
- **Grab**: pull particle velocities toward the cursor inside a radius
  (pbmpm's pattern, in their WGSL) — bounded impulses, cannot shred, ever.
- **Units caveat**: graphics MPM is nondimensional (unit box, tuned gravity
  and stiffness). Our real-metres doctrine gets a deliberate mapping at the
  boundary: simulate in grid units, convert positions/forces at the world
  interface, tune g_grid and E by feel. Müller's FLIP proves SI units *can*
  work directly if we prefer.

## Finding 4 — rendering is nearly free for us

Screen-space fluid rendering (van der Laan/Green 2009) is a structural
near-drop-in for the existing volume material:

1. Splat particles as sphere impostors → depth target (trivial at 5k).
2. Smooth depth with the **narrow-range filter** (Truong & Yuksel 2018 —
   simpler and better-behaved than curvature flow at few-particle scales).
3. **Thickness pass**: same splats, additive blending, depth-tested,
   half-res + blur. This value *directly replaces* `backDepth − frontDepth`
   in our Beer–Lambert term. Refraction of the interior pass, absorption,
   Fresnel, digestion cloud — all survive unchanged.
4. Composite writes `gl_FragDepth` from smoothed depth so the blob
   inter-occludes with the scene (and the DoF pass keeps working — it
   already consumes exactly these depth textures).

Working WebGL2 reference: [xuxmin/pbf](https://github.com/xuxmin/pbf);
structural reference: the official three.js
[`webgpu_compute_particles_fluid`](https://threejs.org/examples/webgpu_compute_particles_fluid.html)
example. Cost: "a bloom's worth" of full-screen passes. Upgrade path if the
surface boils: ellipsoid splats from per-particle PCA (cheap at 5k).

**Eyes**: anchor each eye to its k-nearest particle cluster; per frame,
polar-decompose the cluster's 3×3 moment matrix against rest for a rotation
frame (the oriented-particles pattern, [Müller & Chentanez
2011](https://matthias-research.github.io/pages/publications/orientedParticles.pdf)).
One tiny decomposition per eye per frame. Eyes drawn into the interior pass
refract through the body exactly as they do today.

## Recommendation

**MLS-MPM, in single-threaded TypeScript, with the corotated + widened-clamp
+ slow-relaxation material, rendered via SSFR.**

Against the runner-up (shape-matching hybrid): the pet's whole failure
history is engineered shape memory reading as fake. Shape matching is that
same idea done properly; MPM is the idea *dissolved* — slump, flip-
invariance, squash-and-stick, and re-rounding all fall out of ten lines of
constitutive model, and the failure modes we spent today guarding against
(membrane inversion, constraint detonation, pogo) structurally cannot occur
in a grid-transfer method with bounded grab impulses.

What survives the pivot: the terrarium Jolt world (rigid oat flake, statics),
the entire care sim and lifecycle, the volume shader's optical model, the
interior/DoF passes, trails/caustic/grime (contacts become "particles near
floor/pane"), and the care→material coupling gets *better*: moisture maps to
yield stress and relaxation time — a dry slime is literally stiffer, cloudier
goo.

What retires: the soft-body half of joltWorld (spokes, guards, plasticity,
steering), the egg mesh as physics (it stays as the eyes' rest reference and
spawn shape sampling), interaction's cluster machinery, the climb driver's
steering backend (the planner survives; it drives a force field instead).

### Milestone sketch (pending go)

- **P1 — headless material**: `mpmWorld.ts`, 3D MLS-MPM on typed arrays,
  probe-tested like today: settle-silhouette, flip-invariance, squash-stick
  + heal, drop from height, violent-drag battery, step-cost budget.
- **P2 — SSFR pipeline**: depth/thickness splats + narrow-range filter;
  adapt `volumeMaterial` to particle depth; keep interior pass and DoF.
- **P3 — creature integration**: grab/poke as velocity fields, eyes via
  oriented clusters, oat one-way coupling, trails/grime from particle
  contacts, care coupling (moisture → yield/τ), climb planner re-targeted.
- **P4 — swap and retire**: behind the existing scene interface; the Jolt
  soft-body code is deleted, not maintained alongside.

## Source index

MPM: [nialltl guide](https://nialltl.neocities.org/articles/mpm_guide) ·
[incremental_mpm](https://github.com/nialltl/incremental_mpm) ·
[mpm88/mpm99](https://github.com/taichi-dev/taichi/blob/master/python/taichi/examples/simulation/mpm88.py) ·
[WebGPU-Ocean](https://github.com/matsuoka-601/webgpu-ocean) ·
[pbmpm (EA SEED)](https://github.com/electronicarts/pbmpm) ·
[PB-MPM paper](https://media.contentapi.ea.com/content/dam/ea/seed/presentations/seed-siggraph2024-pbmpm-paper.pdf) ·
[holtsetio/flow](https://github.com/holtsetio/flow) ·
[Stomakhin snow 2013 plasticity] · [Continuum Foam, Yue 2015](https://dl.acm.org/doi/abs/10.1145/2751541) ·
[Viscoelastic MPM, Ram 2015](https://dl.acm.org/doi/10.1145/2786784.2786798) ·
[kotsoft/fluid](https://github.com/kotsoft/fluid) ·
[TMP FLIP](https://github.com/matthias-research/pages/blob/master/tenMinutePhysics/18-flip.html)

Alternatives: [Clavet 2005](https://dl.acm.org/doi/10.1145/1073368.1073400) ·
[kotsoft JS port](https://github.com/kotsoft/particle_based_viscoelastic_fluid) ·
[PBF, Macklin & Müller 2013](https://dl.acm.org/doi/10.1145/2461912.2461984) ·
[Unified Particles / Flex](https://mmacklin.com/uppfrta_preprint.pdf) ·
[Meshless Deformations (shape matching)](https://matthias-research.github.io/pages/publications/MeshlessDeformations_SIG05.pdf) ·
[FastLSM](http://www.alecrivers.com/fastlsm/) ·
[JellyCar deep dive](https://www.gamedeveloper.com/programming/deep-dive-the-soft-body-physics-of-jelly-car-explained) ·
[Claybook GDC 2018](https://media.gdcvault.com/gdc2018/presentations/Aaltonen_Sebastian_GPU_Based_Clay.pdf) ·
[Vessel GDC talk](https://www.gdcvault.com/play/1019404/Liquid-Intelligence-Connecting-AI-and)

Rendering: [van der Laan/Green SSFR](https://dl.acm.org/doi/10.1145/1507149.1507164) ·
[Narrow-Range Filter](https://www.semanticscholar.org/paper/50373abc8713985851823528e4e3ac2a494e43da) ·
[Yu & Turk anisotropic kernels](https://dl.acm.org/doi/10.1145/2421636.2421641) ·
[xuxmin/pbf (WebGL SSFR)](https://github.com/xuxmin/pbf) ·
[three.js WebGPU fluid example](https://threejs.org/examples/webgpu_compute_particles_fluid.html) ·
[oriented particles](https://matthias-research.github.io/pages/publications/orientedParticles.pdf) ·
[gl_FragDepth raymarch compositing](https://discourse.threejs.org/t/raymarching-correct-gl-fragdepth/66033)
