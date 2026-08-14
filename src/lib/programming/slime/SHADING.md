# Slime shading

How the slime gets its look, in two tiers. Both are implemented: tier 2
(`volumeMaterial.ts`, wired in `slimeScene.ts`) is the live path; tier 1
(`slimeMaterial.ts`) remains as the fallback genome.

## Tier 1 — material genome (implemented, `slimeMaterial.ts`)

One parameterized `MeshPhysicalMaterial` covers shiny / matte / transparent /
milky in any colour: ~8 numbers + 2 colours per genome (roughness, clearcoat,
transmission, ior, thickness, attenuationDistance, sheen, backlight; albedo,
attenuationColor). Transparent colour comes from Beer–Lambert absorption
(`attenuationColor` / `attenuationDistance`), not albedo — thin edges pale,
fat middle saturated. The one custom ingredient is the Barré-Brisebois
translucency term (GDC 2011) injected via `onBeforeCompile`: a backlight
`pow(saturate(dot(V, -(L + N·δ))), power)` with constant thickness — the blob
is near-convex, so the baked thickness map the technique normally wants is
unnecessary. Three.js note honoured: transmissive materials keep `opacity: 1`
and want an environment map (the scene supplies a dim PMREM RoomEnvironment).

Research notes and sources: scratchpad research doc (Barré-Brisebois GDC
2011; Zucconi fast-SSS; Codrops transmission write-up; drei
MeshTransmissionMaterial as a parts bin; matcaps as the ultra-cheap fallback).

## Tier 2 — measured-thickness volume material (implemented)

Implementation notes beyond the spec, learned by rendering it:

- **Single-scatter albedo.** The scattered-out term must be weighted by
  `scattering / extinction` per channel, not by `(1 − transmission)` alone —
  the most-absorbed channel otherwise scatters the most, and the green jelly
  rendered salmon-pink.
- **Scatter carries the brightness.** Against this box's dark walls, pure
  transmission is smoked glass; the scatter term is lit (key + ambient + a
  forward-scatter lobe) and the terrarium lights were raised, because what
  the interior pass shows through the jelly _is_ the slime's luminance.
- **Eyes moved inside.** `EYE_PROUD` went negative: the beads hang ~2 mm into
  the jelly, draw only in the interior pass, and reach the screen refracted.
- **Absorption halved** from the spec's starting values — full strength read
  bottle-green; the reference creature is pale sea-glass.
- Reflection uses the same three-line analytic room as the glass shader
  rather than PMREM sampling; drying raises scatter and dulls the highlight
  inside the shader (`uDryness`), replacing tier 1's material lerps.

### Finishes and colourways (settings, on top of tier 2)

The four tier-1 archetypes are available on the live path as **finishes**
(`settings.ts` → `volumeMaterial.setFinish`): jelly (stock), glassy, milky,
matte. Each is four multipliers — scatter strength, absorption, gloss
exponent, specular strength (highlight *and* room reflection) — applied
in-shader (`uFinish*`), so they compose with everything dynamic: dryness,
mood, and `setNewborn`'s uniform animation, which they deliberately do not
overwrite.

**Colourways** are named hue rotations away from the stock sea-glass
(`COLORWAYS` in `settings.ts`), fed through the same `uHue` grade the debug
slider uses; `effectiveHue` composes the two and wraps at ±180 so the
clamp in `setColorGrade` never flattens a legal combination. The preset
angles are estimates from the base scatter hue and still want an eyeball.

### Compile checking

Every hand-written shader (this material, terrarium, caustic, grime, trail,
particle eyes) is compiled by `glslCompile.test.ts` through
`glslangValidator` (`brew install glslang`; the test skips itself where the
binary is missing) behind the same GLSL ES 3.00 compat header three.js uses
over WebGL2. The `onBeforeCompile` injections (oats, tier-1 genomes) are out
of scope — they patch three's own chunks.

### Original spec

Treat the slime as a tiny volume, not transparent plastic. Three passes:

1. **Interior pass** — render terrarium + embedded meshes (oat, eyes) to a
   colour texture.
2. **Back-depth pass** — slime back faces only, into a `DepthTexture`
   (WebGL2 core).
3. **Front-face pass** — per pixel: thickness = linearised back depth − front
   depth; bend the view ray with `refract()`; sample the interior texture at
   the refracted exit point; apply Beer–Lambert absorption + pale scatter;
   overlay Fresnel reflection + sharp wet GGX highlight; **write opaque** (no
   alpha blending → no transparent-sorting problems).

Core fragment structure (view space; `uProjection`, `uNear`/`uFar` for depth
linearisation):

```glsl
float thicknessZ = max(linearDepth(texture(uBackDepth, uv).r) - linearDepth(gl_FragCoord.z), 0.0);
vec3 insideRay   = refract(I, N, 1.0 / uIOR);
float pathLength = thicknessZ / max(abs(insideRay.z), 0.15);
vec3 exitVS      = vViewPosition + insideRay * pathLength;   // → project → refractedUV
vec3 behind      = texture(uSceneColor, refractedUV).rgb;
vec3 extinction  = uAbsorption + vec3(uScatterStrength) + cloud * vec3(1.2, 1.0, 0.65);
vec3 transmission = exp(-extinction * pathLength);
vec3 volume      = behind * transmission + scatterColor * (1.0 - transmission);
color            = mix(volume, envReflection, fresnel) + wetGGX;
```

Starting values, with the slime's diameter D as the unit: `ior 1.34`,
`absorption vec3(0.75, 0.12, 0.42) / D`, `scatterColor (0.55, 0.82, 0.66)`,
`scatterStrength 0.18 / D`, `roughness 0.10`, `cloudRadius 0.22 D`.
Division of labour: absorption = body colour; scatter = cloudy biological
softness; Fresnel/GGX = wet membrane; refraction = embedded things feel
embedded.

### Digestion cloud (pairs with feeding)

A procedural creamy cloud around the oat while it digests: `rayGaussian`
(closest approach of the refracted ray to the oat centre) scaled by
`uDigest * (1 − 0.65·uDigest)`, added to extinction and lerping the scatter
colour toward oat-cream `(0.88, 0.72, 0.48)`.

### Oat dissolve

The oat gets its own shader: `fbm(objectPos·18) − digestProgress < 0 →
discard`, soft edge via `smoothstep(0, 0.12, remaining)` darkening toward the
bite line; shrink to ~70% over the digest; a dozen instanced crumbs drifting
outward sell it cheaply.
