import * as THREE from 'three';
import { FLOOR_Y } from './constants';
import { ROOM_GLSL, type SlimeRoomUniforms } from './roomLight';
import type { SlimeFinish } from './settings';

/**
 * The slime as a tiny volume — the tier-2 material from `SHADING.md`.
 *
 * `MeshPhysicalMaterial`'s transmission treats the slime as tinted glass:
 * one surface, one thickness number. This treats it as a body of jelly. The
 * scene renders the terrarium and everything *inside* the slime (the eyes,
 * a swallowed oat) into a colour texture, renders the slime's back faces
 * into a depth texture, and then draws the front faces with this material,
 * which per pixel:
 *
 *   - measures true thickness (back depth − front depth, linearised),
 *   - bends the view ray with `refract()` and walks it that thickness,
 *   - samples the interior texture where the bent ray exits,
 *   - applies Beer–Lambert absorption and a pale scatter over the path,
 *   - adds the digestion cloud around a swallowed oat (a Gaussian of extra
 *     scatter along the refracted ray),
 *   - finishes with Fresnel room-reflection and a sharp wet highlight,
 *   - and writes **opaque** — no alpha blending, so no sorting problems.
 *
 * The "room" being reflected is the same three-line gradient the glass
 * shader uses: at this size a gradient is indistinguishable from a
 * photograph, and it keeps the material self-contained instead of chasing
 * PMREM mip conventions.
 *
 * The vertex shader goes through `modelMatrix` like any citizen. The first
 * draft skipped it — the spring-mesh skin wrote world positions with an
 * identity transform, so it never mattered — until a skin arrived carrying a
 * real transform (the retired marching-cubes cube that followed the blob)
 * and its [-1, 1] local coordinates rendered as a two-metre slime looming
 * over the tank. Today's icosphere skin is back to world-at-identity, but
 * the lesson stands.
 */

/** Slime diameter, the spec's reference unit for the volume coefficients. */
const DIAMETER = 0.04;

const VOLUME_VERTEX = /* glsl */ `
varying vec3 vWorld;
varying vec3 vWorldNormal;
varying vec3 vView;
varying vec3 vViewNormal;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vWorldNormal = mat3(modelMatrix) * normal;
  vec4 view = viewMatrix * world;
  vView = view.xyz;
  vViewNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * view;
}
`;

const VOLUME_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform sampler2D uBackDepth;
uniform vec2 uResolution;
uniform mat4 uProjection;
uniform float uNear;
uniform float uFar;

uniform float uIor;
uniform vec3 uAbsorption;      // per metre
uniform vec3 uScatterColor;
uniform float uScatterStrength; // per metre
uniform float uDryness;        // 0 fresh .. 1 parched
uniform float uValence;        // 0 miserable .. 1 content (see emotion.ts)
uniform float uArousal;        // 0 calm .. 1 agitated

uniform vec3 uKeyDirWorld;     // toward the key light
uniform vec3 uOatCenterView;
uniform float uCloudRadius;
uniform float uDigest;

uniform float uFinishScatter;  // finish: scatter-strength multiplier, 1 = jelly
uniform float uFinishAbsorb;   // finish: absorption multiplier, 1 = jelly
uniform float uFinishGloss;    // finish: highlight-tightness multiplier, 1 = jelly
uniform float uFinishSpec;     // finish: highlight+reflection strength, 1 = jelly

uniform float uHue;            // debug hue shift, radians, 0 = stock tint
uniform float uSat;            // debug saturation, 0 grey .. 2 lurid, 1 = stock
uniform float uLight;          // debug lightness, 0 dark .. 2 washed, 1 = stock

uniform float uMica;           // 0 plain jelly .. 1 full pearl suspension
uniform vec3 uSlimeCenter;     // body centroid, the pigment's anchor frame
uniform float uSwirlTime;      // swirl phase — advanced by the body's own stirring
uniform float uFlakeDensity;   // cells per body-diameter — higher = finer dust
uniform float uFlakeCut;       // sparsity threshold — higher = fewer specks

varying vec3 vWorld;
varying vec3 vWorldNormal;
varying vec3 vView;
varying vec3 vViewNormal;

${ROOM_GLSL}

// Cheap 3D value noise, for the frost. Two octaves is plenty at this scale.
float vmHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float vmNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(vmHash(i), vmHash(i + vec3(1, 0, 0)), f.x);
  float b = mix(vmHash(i + vec3(0, 1, 0)), vmHash(i + vec3(1, 1, 0)), f.x);
  float c = mix(vmHash(i + vec3(0, 0, 1)), vmHash(i + vec3(1, 0, 1)), f.x);
  float d = mix(vmHash(i + vec3(0, 1, 1)), vmHash(i + vec3(1, 1, 1)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
// Gradient of the noise by central differences — the frost's normal bump.
vec3 vmNoiseGradient(vec3 p) {
  const float e = 0.35;
  return vec3(
    vmNoise(p + vec3(e, 0, 0)) - vmNoise(p - vec3(e, 0, 0)),
    vmNoise(p + vec3(0, e, 0)) - vmNoise(p - vec3(0, e, 0)),
    vmNoise(p + vec3(0, 0, e)) - vmNoise(p - vec3(0, 0, e))
  );
}

// Three uncorrelated hashes per cell, for the mica flakes.
vec3 vmHash3(vec3 p) {
  return fract(sin(vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453);
}

// The swirl: a domain-warp offset — noise pushed through noise. Sampling the
// pigment at q + swirlOffset(q) folds it into marbled streaks; advancing
// uSwirlTime folds the folds, which reads as the liquid stirring.
vec3 swirlOffset(vec3 q, float t) {
  return (vec3(
    vmNoise(q * 1.7 + vec3(0.0, 0.40 * t, 0.0)),
    vmNoise(q * 1.7 + vec3(5.2, 1.3, 0.35 * t)),
    vmNoise(q * 1.7 + vec3(0.30 * t, 9.2, 2.8))
  ) - 0.5) * 1.4;
}

// One shell of suspended flakes at material-space q: each noise cell is a
// flake with a random facing and a random pearl hue. A flake lights only when
// its facing agrees with the key-light halfway vector — discrete glints, the
// car-paint trick, rather than a smooth sheen.
vec3 micaFlakes(vec3 q, vec3 viewDir, vec3 halfway) {
  // Powder scale: the body is 4 cm across and q spans roughly [-0.5, 0.5],
  // so at the stock density of ~100 a cell is ~0.4 mm of slime — dust, not
  // the car-paint chips this trick usually draws. Density and sparsity are
  // the options modal's two sheen sliders.
  vec3 cell = floor(q * uFlakeDensity);
  vec3 r = vmHash3(cell);
  // Each cell holds one round speck, not a cube of glitter: a jittered
  // centre and a radial falloff, so the lit shape is a dot, not the cell.
  vec3 speckCenter = 0.25 + 0.5 * vmHash3(cell + 31.0);
  float speckDist = length(fract(q * uFlakeDensity) - speckCenter);
  float speck = smoothstep(0.38, 0.2, speckDist);
  vec3 flakeN = normalize(r * 2.0 - 1.0);
  flakeN *= sign(dot(flakeN, viewDir) + 1e-4); // a flake shows us its face
  float align = pow(clamp(dot(flakeN, halfway), 0.0, 1.0), 40.0);
  // Most cells hold no flake at all — sparsity is what makes glints twinkle.
  float sparsity = speck * smoothstep(uFlakeCut, uFlakeCut + 0.16, vmHash3(cell + 17.0).x);
  // Pearlescent tint: real mica is thin-film coated, so its colour slides
  // with angle. A cosine palette over per-flake phase + view angle fakes it.
  float phase = r.y + 0.6 * dot(viewDir, flakeN);
  vec3 tint = 0.5 + 0.5 * cos(6.2831 * (phase + vec3(0.0, 0.33, 0.67)));
  return align * sparsity * mix(vec3(1.0), tint, 0.65);
}

// Hue rotation about the grey axis. The clamp matters: the rotation matrix
// can push a channel slightly negative, and a negative absorption coefficient
// would *amplify* light along the path.
vec3 hueRotate(vec3 c, float a) {
  const vec3 grey = vec3(0.57735);
  float cosA = cos(a);
  float sinA = sin(a);
  return max(
    c * cosA + cross(grey, c) * sinA + grey * dot(grey, c) * (1.0 - cosA),
    vec3(0.0)
  );
}

float linearDepth(float depth) {
  float z = depth * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

// Peak of a Gaussian blob sampled along a ray — the digestion cloud's
// density at the ray's closest approach to the oat.
float rayGaussian(vec3 origin, vec3 direction, float length_, vec3 center, float radius) {
  float h = clamp(dot(center - origin, direction), 0.0, length_);
  vec3 q = origin + direction * h - center;
  return exp(-dot(q, q) / (2.0 * radius * radius));
}

void main() {
  vec2 screenUV = gl_FragCoord.xy / uResolution;

  float frontZ = linearDepth(gl_FragCoord.z);
  float backZ = linearDepth(texture2D(uBackDepth, screenUV).x);
  float thicknessZ = max(backZ - frontZ, 0.0);

  // The frost: a fine noise bump over the surface. It perturbs the world
  // normal (reflections and highlights shimmer) and, half as strongly, the
  // view normal (the refracted interior wobbles) — the reference creature's
  // surface is set jelly, not blown glass.
  // Agitation raises the frost: an aroused body's membrane visibly
  // shimmers and crawls, a calm one sets nearly glassy.
  vec3 frost = (vmNoiseGradient(vWorld * 900.0) * 0.055
    + vmNoiseGradient(vWorld * 2600.0) * 0.03) * (0.8 + 1.1 * uArousal);

  // Refraction takes only a quarter of the frost: enough that the interior
  // shimmers, not enough to smear the eyes into smudges.
  vec3 nView = normalize(vViewNormal + (viewMatrix * vec4(frost * 0.25, 0.0)).xyz);
  vec3 iView = normalize(vView); // camera → surface

  vec3 insideRay = refract(iView, nView, 1.0 / uIor);
  // Camera-axis span into approximate ray distance. The clamp keeps
  // grazing rays from claiming near-infinite paths.
  float rayScale = 1.0 / max(abs(insideRay.z), 0.15);

  // The bent ray stops at the first thing inside the body it hits — an
  // eye, the oat — or exits the back and sees the room. Everything optical
  // (image displacement, Beer–Lambert, in-scatter) integrates over *that*
  // span: a bead half-embedded at the surface has no goo in front of it,
  // so it neither displaces nor dims; the room beyond refracts and
  // attenuates through the full thickness. Two taps: the first guesses the
  // span from the unbent line of sight, the second re-reads the content
  // depth where the bent ray actually landed.
  float contentSpan = clamp(linearDepth(texture2D(uSceneDepth, screenUV).x) - frontZ, 0.0, thicknessZ);
  vec2 refractedUV = screenUV;
  for (int tap = 0; tap < 2; tap++) {
    vec3 exitView = vView + insideRay * (contentSpan * rayScale);
    vec4 exitClip = uProjection * vec4(exitView, 1.0);
    vec2 uv = exitClip.xy / max(exitClip.w, 1e-5) * 0.5 + 0.5;
    // A ray bent off the edge of the frame keeps the last good sample
    // rather than smearing the border pixels.
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    refractedUV = uv;
    contentSpan = clamp(linearDepth(texture2D(uSceneDepth, uv).x) - frontZ, 0.0, thicknessZ);
  }
  vec3 behind = texture2D(uSceneColor, refractedUV).rgb;
  // The optical path: membrane to the content the ray actually sees.
  float pathLength = contentSpan * rayScale;

  // The creamy cloud around a digesting oat, brightest mid-digest.
  float cloud = rayGaussian(vView, insideRay, pathLength, uOatCenterView, uCloudRadius);
  cloud *= uDigest * (1.0 - 0.65 * uDigest) * 3.0;

  // Drying turns the jelly cloudy and a little sallow before tier-1's
  // material ever went matte: scatter climbs, absorption warms.
  float dryScatter = 1.0 + 2.5 * uDryness;
  // Saturating the absorption pushes it away from its own grey — a grey
  // absorber is neutral smoked glass, a lurid one tints the transmission hard.
  vec3 hueAbsorption = hueRotate(uAbsorption, uHue);
  vec3 absorptionGrey = vec3(dot(hueAbsorption, vec3(0.299, 0.587, 0.114)));
  hueAbsorption = max(mix(absorptionGrey, hueAbsorption, uSat), vec3(0.0));
  vec3 dryAbsorption = hueAbsorption * uFinishAbsorb * (1.0 + vec3(0.2, 0.45, 0.9) * uDryness);

  // Low spirits cloud the jelly the same way drying does, milder: a happy
  // slime is glassy, a miserable one goes milky and opaque.
  float moodScatter = mix(1.55, 0.85, uValence);
  vec3 scattering = vec3(uScatterStrength * uFinishScatter * dryScatter * moodScatter)
    + cloud * vec3(1.2, 1.0, 0.65);

  // Mica, part one: the pigment streaks. Double-warped noise in the body's
  // own (centroid-anchored) frame modulates the scatter, so the milk itself
  // carries visible marbled bands — the swirl is legible even between glints.
  if (uMica > 0.001) {
    vec3 micaQ = (vWorld - uSlimeCenter) / ${DIAMETER.toFixed(3)};
    vec3 warped = micaQ * 2.4 + swirlOffset(micaQ, uSwirlTime);
    float streak = vmNoise(warped * 2.0 + swirlOffset(warped, uSwirlTime * 0.7)) - 0.5;
    scattering *= 1.0 + uMica * 1.2 * streak;
  }
  vec3 extinction = dryAbsorption + scattering;
  vec3 transmission = exp(-extinction * pathLength);
  // Of the light the path removed, only the *scattered* share glows back out
  // — the single-scatter albedo. Using total extinction here was a real bug:
  // the red channel is the most absorbed, so it scattered the most, and the
  // green jelly rendered salmon-pink.
  vec3 albedoSS = scattering / max(extinction, vec3(1e-4));
  // Colour drains with the mood: the scatter tint desaturates toward its
  // own grey as valence falls, so a neglected slime literally pales.
  float moodSat = 0.35 + 0.65 * uValence;
  vec3 hueScatter = hueRotate(uScatterColor, uHue);
  hueScatter = max(
    mix(vec3(dot(hueScatter, vec3(0.299, 0.587, 0.114))), hueScatter, uSat) * uLight,
    vec3(0.0)
  );
  vec3 scatterGrey = vec3(dot(hueScatter, vec3(0.299, 0.587, 0.114)));
  vec3 moodTint = mix(scatterGrey, hueScatter, moodSat);
  vec3 scatterColor = mix(moodTint, vec3(0.88, 0.72, 0.48), clamp(cloud, 0.0, 1.0));
  // The scatter term carries the body's brightness — against this box's dark
  // walls, straight transmission is a lump of smoked glass. What scatters in
  // is lit: mostly the key from above, a floor of ambient, and a lift of
  // forward-scatter glow where the light is behind the body.
  vec3 nWorldLit = normalize(vWorldNormal);
  float scatterLight = 0.72
    + 0.55 * clamp(dot(nWorldLit, uKeyDirWorld), 0.0, 1.0)
    + 0.35 * pow(clamp(dot(normalize(vWorld - cameraPosition), uKeyDirWorld), 0.0, 1.0), 2.0);
  vec3 volume = behind * transmission
    + albedoSS * scatterColor * (1.0 - transmission) * scatterLight;

  // The wet membrane: Fresnel room-reflection, a sharp wet glint, and a
  // broad soft lobe — the reference's highlight is a window, not a laser.
  vec3 nWorld = normalize(vWorldNormal + frost);
  vec3 viewDirWorld = normalize(cameraPosition - vWorld);
  float cosIncident = clamp(dot(nWorld, viewDirWorld), 0.0, 1.0);
  float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosIncident, 5.0);

  vec3 reflection = roomRadiance(reflect(-viewDirWorld, nWorld));

  vec3 halfway = normalize(uKeyDirWorld + viewDirWorld);
  float ndoth = clamp(dot(nWorld, halfway), 0.0, 1.0);
  // Roughness follows valence: content = tight wet glint, miserable = the
  // highlight spreads and dims, the same direction drying pushes.
  float gloss = mix(220.0, 30.0, uDryness) * mix(0.5, 1.15, uValence) * uFinishGloss;
  float highlight = (pow(ndoth, gloss) * mix(1.0, 0.25, uDryness) * mix(0.55, 1.0, uValence)
    + pow(ndoth, 22.0 * uFinishGloss) * mix(0.22, 0.08, uDryness)) * uFinishSpec;

  vec3 color = mix(volume, reflection * uFinishSpec, fresnel)
    + vec3(1.0, 0.98, 0.92) * highlight;

  // Mica, part two: the glints. Three shells of flakes sampled along the
  // *refracted* ray, each dimmed by the Beer–Lambert of its depth — the
  // parallax between shells is what places the sparkle inside the liquid
  // instead of painting it on the membrane. Drying dulls the shine.
  if (uMica > 0.001) {
    vec3 insideRayWorld = normalize(transpose(mat3(viewMatrix)) * insideRay);
    vec3 glint = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float depthT = pathLength * (0.18 + 0.31 * float(i));
      vec3 wp = vWorld + insideRayWorld * depthT;
      vec3 q = (wp - uSlimeCenter) / ${DIAMETER.toFixed(3)};
      q += swirlOffset(q, uSwirlTime) * 0.35;
      glint += micaFlakes(q, viewDirWorld, halfway) * exp(-extinction * depthT);
    }
    color += glint * uMica * (1.0 - 0.5 * uDryness);
  }

  // Contact: the bottom few millimetres sit in their own shadow, pressed wet
  // into the moss. Grounds the body — without it the jelly floats.
  float contact = 1.0 - smoothstep(0.0, 0.005, vWorld.y - (${FLOOR_Y.toFixed(4)}));
  color *= 1.0 - 0.35 * contact;

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface VolumeMaterialBundle {
  material: THREE.ShaderMaterial;
  /** Point the material at this frame's render targets and camera. */
  setFrame(
    sceneColor: THREE.Texture,
    sceneDepth: THREE.Texture,
    backDepth: THREE.Texture,
    width: number,
    height: number,
    camera: THREE.PerspectiveCamera
  ): void;
  /** The digestion cloud: oat position in *view* space, progress 0..1, 0 off. */
  setDigestion(centerView: THREE.Vector3, digest: number): void;
  /** 0 fresh and glassy; 1 parched — cloudy, sallow, dull. */
  setDryness(dryness: number): void;
  /**
   * Debug colour grade: hue shift in degrees (-180..180, 0 = stock
   * sea-glass), then saturation and lightness multipliers (0..2, 1 = stock).
   */
  setColorGrade(hueDegrees: number, saturation: number, lightness: number): void;
  /** One of the four material archetypes; `jelly` is the stock look. */
  setFinish(finish: SlimeFinish): void;
  /** Mica strength, 0 plain jelly .. 1 full pearl suspension. */
  setMica(strength: number): void;
  /**
   * The powder itself, both 0..1: `size` from fine dust to coarse glitter,
   * `amount` from a few stray specks to a dense suspension.
   */
  setMicaLook(size: number, amount: number): void;
  /** Per frame while mica is on: the body centroid and the swirl phase. */
  setSwirl(center: readonly [number, number, number], phase: number): void;
  /**
   * The mood, both 0..1 (see emotion.ts): valence drives saturation,
   * clarity and gloss; arousal drives the surface shimmer.
   */
  setEmotion(valence: number, arousal: number): void;
  /**
   * How newly-emerged the body is, 1 just out of the crust .. 0 grown in.
   * A newborn plasmodium is dense and dark — packed pigment, no room for
   * light — so absorption runs high and the scatter is choked down toward
   * a murky olive (the same living colour the crust's rim showed). As it
   * grows in, the body clears to the familiar pale sea-glass.
   */
  setNewborn(newness: number): void;
  dispose(): void;
}

/**
 * The four archetypes, as multipliers on the stock jelly. They compose with
 * everything dynamic — dryness, mood, newborn density — because they scale
 * the base coefficients in-shader rather than overwriting the uniforms
 * `setNewborn` animates.
 *
 * - `glassy`: barely any milk in the body, weaker absorption, a tighter and
 *   brighter membrane — coloured water rather than jelly.
 * - `milky`: dense scatter, absorption backed off so it glows instead of
 *   muddying — the body reads as opal.
 * - `matte`: the wet membrane gone — highlight blown wide and dim, room
 *   reflection dulled, a touch more milk. Gummy, not glossy.
 */
const FINISHES: Record<SlimeFinish, { scatter: number; absorb: number; gloss: number; spec: number }> = {
  jelly: { scatter: 1, absorb: 1, gloss: 1, spec: 1 },
  glassy: { scatter: 0.3, absorb: 0.55, gloss: 1.35, spec: 1.15 },
  milky: { scatter: 2.6, absorb: 0.45, gloss: 0.9, spec: 1 },
  matte: { scatter: 1.5, absorb: 0.8, gloss: 0.12, spec: 0.3 }
};

/** Scatter colour of a just-emerged body: the crust rim's murky olive. */
const NEWBORN_SCATTER = new THREE.Vector3(0.3, 0.36, 0.2);

// The stock jelly's volume coefficients, per metre over the body's diameter.
// One home each: the initial uniforms and `setNewborn`'s relaxation both
// read these, so the grown-in body always returns to exactly this glass.
const BASE_ABSORPTION = new THREE.Vector3(0.27, 0.05, 0.12);
const BASE_SCATTER_COLOR = new THREE.Vector3(0.58, 0.85, 0.74);
const BASE_SCATTER_STRENGTH = 0.34 / DIAMETER;

export function createVolumeMaterial(
  keyDirWorld: THREE.Vector3,
  room: SlimeRoomUniforms
): VolumeMaterialBundle {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...room,
      uSceneColor: { value: null },
      uSceneDepth: { value: null },
      uBackDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uProjection: { value: new THREE.Matrix4() },
      uNear: { value: 0.005 },
      uFar: { value: 3 },
      uIor: { value: 1.34 },
      // The spec's starting values, over the slime's diameter — except the
      // scatter, roughly doubled: the spec's reference scene is bright, this
      // terrarium is a dark study, and the scatter is where a jelly's body
      // gets its light from.
      // Halved from the spec's numbers: at full strength the jelly reads
      // bottle-green; the reference creature is pale sea-glass.
      uAbsorption: { value: BASE_ABSORPTION.clone().divideScalar(DIAMETER) },
      uScatterColor: { value: BASE_SCATTER_COLOR.clone() },
      uScatterStrength: { value: BASE_SCATTER_STRENGTH },
      uDryness: { value: 0 },
      uValence: { value: 0.6 },
      uArousal: { value: 0.2 },
      uKeyDirWorld: { value: keyDirWorld.clone().normalize() },
      uOatCenterView: { value: new THREE.Vector3(0, 0, 0) },
      uCloudRadius: { value: DIAMETER * 0.22 },
      uDigest: { value: 0 },
      uFinishScatter: { value: 1 },
      uFinishAbsorb: { value: 1 },
      uFinishGloss: { value: 1 },
      uFinishSpec: { value: 1 },
      uHue: { value: 0 },
      uSat: { value: 1 },
      uLight: { value: 1 },
      uMica: { value: 0 },
      uSlimeCenter: { value: new THREE.Vector3(0, FLOOR_Y, 0) },
      uSwirlTime: { value: 0 },
      uFlakeDensity: { value: 100 },
      uFlakeCut: { value: 0.735 }
    },
    vertexShader: VOLUME_VERTEX,
    fragmentShader: VOLUME_FRAGMENT
  });

  return {
    material,
    setFrame(sceneColor, sceneDepth, backDepth, width, height, camera) {
      const u = material.uniforms;
      u.uSceneColor.value = sceneColor;
      u.uSceneDepth.value = sceneDepth;
      u.uBackDepth.value = backDepth;
      u.uResolution.value.set(width, height);
      u.uProjection.value.copy(camera.projectionMatrix);
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
    },
    setDigestion(centerView, digest) {
      material.uniforms.uOatCenterView.value.copy(centerView);
      material.uniforms.uDigest.value = digest;
    },
    setDryness(dryness) {
      material.uniforms.uDryness.value = Math.min(1, Math.max(0, dryness));
    },
    setColorGrade(hueDegrees, saturation, lightness) {
      const d = Math.min(180, Math.max(-180, hueDegrees));
      material.uniforms.uHue.value = (d * Math.PI) / 180;
      material.uniforms.uSat.value = Math.min(2, Math.max(0, saturation));
      material.uniforms.uLight.value = Math.min(2, Math.max(0, lightness));
    },
    setFinish(finish) {
      const f = FINISHES[finish] ?? FINISHES.jelly;
      material.uniforms.uFinishScatter.value = f.scatter;
      material.uniforms.uFinishAbsorb.value = f.absorb;
      material.uniforms.uFinishGloss.value = f.gloss;
      material.uniforms.uFinishSpec.value = f.spec;
    },
    setMica(strength) {
      material.uniforms.uMica.value = Math.min(1, Math.max(0, strength));
    },
    setMicaLook(size, amount) {
      const s = Math.min(1, Math.max(0, size));
      const a = Math.min(1, Math.max(0, amount));
      // Size slides cell density from ~0.25 mm dust to ~1 mm glitter;
      // amount slides the sparsity threshold from stray specks to a crowd.
      material.uniforms.uFlakeDensity.value = 160 - 120 * s;
      material.uniforms.uFlakeCut.value = 0.92 - 0.37 * a;
    },
    setSwirl(center, phase) {
      material.uniforms.uSlimeCenter.value.set(center[0], center[1], center[2]);
      material.uniforms.uSwirlTime.value = phase;
    },
    setEmotion(valence, arousal) {
      material.uniforms.uValence.value = Math.min(1, Math.max(0, valence));
      material.uniforms.uArousal.value = Math.min(1, Math.max(0, arousal));
    },
    setNewborn(newness) {
      const t = Math.min(1, Math.max(0, newness));
      // Fully newborn: ~6× the absorption, a quarter of the scatter, and the
      // scatter light itself pulled toward the crust rim's dark olive.
      material.uniforms.uAbsorption.value
        .copy(BASE_ABSORPTION)
        .divideScalar(DIAMETER)
        .multiplyScalar(1 + 5 * t);
      material.uniforms.uScatterStrength.value = BASE_SCATTER_STRENGTH * (1 - 0.75 * t);
      (material.uniforms.uScatterColor.value as THREE.Vector3)
        .copy(BASE_SCATTER_COLOR)
        .lerp(NEWBORN_SCATTER, t);
    },
    dispose() {
      material.dispose();
    }
  };
}
