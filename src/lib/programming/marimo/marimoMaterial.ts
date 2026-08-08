import * as THREE from 'three';
import {
  FILAMENT_LENGTH_FRAC,
  FILAMENT_MIN_PIXEL_WIDTH,
  FILAMENT_SWAY_BANDS,
  FILAMENT_SWAY_FLOW_REF,
  FILAMENT_SWAY_GAIN,
  FILAMENT_SWAY_IDLE,
  FILAMENT_SWAY_SPEED,
  FILAMENT_WIDTH_FRAC,
  MAX_FACETS
} from './constants';
import { facetGlsl, type MarimoShape } from './facets';
import { mulberry32 } from './rng';
import { SH_GLSL } from './sphericalHarmonics';
import { LIGHTING_GLSL, WATER_GLSL, createLightUniforms, createWaterUniforms } from './waterShader';

/**
 * Shaders for the marimo itself: the solid body, and the instanced filaments
 * that make it fuzzy. GLSL lives in template literals here, matching the
 * convention in `../candle-flame/flameMaterial.ts`.
 *
 * Both shaders evaluate the same spherical-harmonic radius field imported from
 * `SH_GLSL`, so the shape the physics uses and the shape you see are one
 * definition.
 */

/**
 * The shape field, the per-marimo lumpiness, and the frame at a point on the
 * surface. Exported because the fragment previews draw the same ball with their
 * own stylised shaders, and the piece you are shown has to be the piece you get
 * — one definition of the surface, two ways of colouring it in.
 */
export const MARIMO_SHAPE_GLSL = /* glsl */ `
${SH_GLSL}
${facetGlsl(MAX_FACETS + 1)}

uniform vec4 uShape0;
uniform vec4 uShape1;
uniform vec4 uShape2;
uniform vec4 uShape3;
uniform float uRadius;
uniform vec3 uLumpOffset;
uniform vec4 uLumpCharacter;

float marimoHash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 37.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float marimoNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(marimoHash31(i + vec3(0.0, 0.0, 0.0)), marimoHash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(marimoHash31(i + vec3(0.0, 1.0, 0.0)), marimoHash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(marimoHash31(i + vec3(0.0, 0.0, 1.0)), marimoHash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(marimoHash31(i + vec3(0.0, 1.0, 1.0)), marimoHash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

/**
 * Static per-marimo lumpiness. Not a perfect ball; nothing alive is.
 *
 * The character of it is per-marimo, not global: uLumpCharacter carries the
 * coarse and fine amplitudes, the feature scale, and how much the sample point
 * is stretched along one axis. Two marimo of the same size and the same health
 * should still not be the same object, and this is most of what makes them not.
 */
float marimoLump(vec3 n) {
  vec3 p = n * uLumpCharacter.z;
  // Stretch the sample, so some marimo are grained along an axis rather than
  // evenly pebbled — the difference between rolled and pressed.
  p.y *= 1.0 + uLumpCharacter.w;
  float a = marimoNoise(p * 3.4 + uLumpOffset) - 0.5;
  float b = marimoNoise(p * 8.1 - uLumpOffset) - 0.5;
  return a * uLumpCharacter.x + b * uLumpCharacter.y;
}

float marimoSurfaceRadius(vec3 n) {
  float s = marimoRadiusScale(uShape0, uShape1, uShape2, uShape3, n);
  s = marimoFacetCut(s, n);
  return uRadius * s * (1.0 + marimoLump(n));
}

vec3 marimoSurfacePoint(vec3 n) {
  return n * marimoSurfaceRadius(n);
}

/** Any unit tangent at n. Stable, no singularity. */
vec3 marimoTangent(vec3 n) {
  vec3 up = abs(n.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  return normalize(cross(up, n));
}
`;

const BODY_VERTEX = /* glsl */ `
${MARIMO_SHAPE_GLSL}

varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(position);
  vec3 p = marimoSurfacePoint(n);

  // Analytic-ish normal by finite differences on the radius field, so the flat
  // spot actually catches the light instead of just changing the silhouette.
  vec3 t = marimoTangent(n);
  vec3 b = cross(n, t);
  const float e = 0.035;
  vec3 pa = marimoSurfacePoint(normalize(n + t * e));
  vec3 pb = marimoSurfacePoint(normalize(n + b * e));
  vNormal = normalize(mat3(modelMatrix) * normalize(cross(pa - p, pb - p)));

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const BODY_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${LIGHTING_GLSL}

uniform vec3 uColourDeep;
uniform vec3 uColourRim;

varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);

  vec3 colour = uColourDeep * twoLightDiffuse(n);

  // Cheap fake subsurface: light bleeding through the fuzzy edge.
  float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.0);
  colour += uColourRim * fresnel * 0.35;

  colour *= overheadShade(vWorld.y);
  colour = applyWater(colour, vWorld);
  gl_FragColor = vec4(colour * uExposure, 1.0);
}
`;

const FILAMENT_VERTEX = /* glsl */ `
${MARIMO_SHAPE_GLSL}

uniform float uFurLength;
uniform float uFurWidth;
uniform float uMinPixelWidth;
uniform float uViewportHeight;
uniform vec3 uFlow;
uniform float uCurl;
uniform float uTime;
uniform float uSwaySpeed;
uniform float uSwayBands;
uniform float uSwayIdle;
uniform float uSwayGain;
uniform float uSwayFlowRef;
uniform float uSwayScale;

attribute float aSide;
attribute float aAlong;
attribute vec3 aDir;
attribute vec4 aVar;

varying float vAlong;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTint;

void main() {
  vec3 dir = normalize(aDir);
  vec3 root = marimoSurfacePoint(dir);

  float length_ = uFurLength * uRadius * aVar.x;

  // A fixed per-strand curl direction, plus whatever the water is doing.
  vec3 t = marimoTangent(dir);
  vec3 b = cross(dir, t);
  vec3 curlDir = cos(aVar.y) * t + sin(aVar.y) * b;
  vec3 bend = curlDir * uCurl * length_ + uFlow * aVar.w * length_;

  // Sway. A strand is a single quad with no midpoints, so a wave running along
  // one strand would be invisible; what you actually see is the wave running
  // *across the coat*. So the phase is a function of where the strand sits
  // relative to the flow, which puts neighbouring strands nearly in step and
  // sends bands of motion downstream over the ball, like grass in a current.
  float flowMag = length(uFlow);
  // Biased toward vertical so that still water still has an axis to run the
  // bands along, and so the axis eases round as the flow builds instead of
  // snapping the instant the water starts moving.
  vec3 flowDir = normalize(uFlow + vec3(0.0, uSwayFlowRef * 0.4, 0.0));

  // Sway sideways, in the plane the flow is pushing the strand through. Left
  // unnormalised deliberately: a strand pointing straight downstream has no
  // such plane and so sways least, which is also what water does to it. The
  // curl term keeps a little motion in those strands, and keeps this off zero.
  vec3 swayDir = flowDir - dir * dot(flowDir, dir) + curlDir * 0.3;

  float phase = uTime * uSwaySpeed - dot(dir, flowDir) * uSwayBands;
  // Two detuned components, so the coat never pulses like a metronome.
  float sway = sin(phase + aVar.y * 0.4) * 0.75 + sin(phase * 0.53 + aVar.y) * 0.25;
  float swayAmp =
    (uSwayIdle + uSwayGain * clamp(flowMag / uSwayFlowRef, 0.0, 1.5)) * uSwayScale * aVar.w;
  bend += swayDir * sway * swayAmp * length_;

  // Stiff at the root, free at the tip.
  float h = aAlong;
  float bendWeight = h * h;
  vec3 centre = root + dir * length_ * h + bend * bendWeight;
  vec3 axis = normalize(dir * length_ + bend);

  // The billboard offset below is a fraction of a millimetre, so the strand's
  // centre is world position enough for the water volume.
  vWorld = (modelMatrix * vec4(centre, 1.0)).xyz;

  vec4 mv = modelViewMatrix * vec4(centre, 1.0);

  // Billboard about the strand's own axis: perpendicular to both the strand and
  // the view axis, so it can never turn edge-on and disappear.
  vec3 axisView = normalize((modelViewMatrix * vec4(axis, 0.0)).xyz);
  vec3 sv = cross(axisView, vec3(0.0, 0.0, 1.0));
  float svLen = length(sv);
  vec3 sideView = svLen > 1e-4 ? sv / svLen : vec3(1.0, 0.0, 0.0);

  float width = uFurWidth * uRadius * (1.0 - h * 0.85);

  // Never let a strand fall below about a pixel wide, or the whole coat shimmers.
  float pxPerMetre = (projectionMatrix[1][1] * 0.5 * uViewportHeight) / max(1e-6, -mv.z);
  width = max(width, uMinPixelWidth / max(1e-6, pxPerMetre));

  mv.xyz += sideView * aSide * width;

  vAlong = h;
  vTint = aVar.z;
  vNormal = normalize(mat3(modelMatrix) * dir);
  gl_Position = projectionMatrix * mv;
}
`;

const FILAMENT_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${LIGHTING_GLSL}

uniform vec3 uColourRoot;
uniform vec3 uColourTip;

varying float vAlong;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vTint;

void main() {
  vec3 n = normalize(vNormal);

  vec3 colour = mix(uColourRoot, uColourTip, vAlong);
  colour *= 0.86 + 0.28 * vTint;
  colour *= twoLightDiffuse(n) * overheadShade(vWorld.y);

  // Strands sit in each other's shade near the root. This is what reads as
  // depth in a coat of fur; without it the whole thing looks like a decal.
  colour *= mix(0.32, 1.0, vAlong * vAlong);

  colour = applyWater(colour, vWorld);
  gl_FragColor = vec4(colour * uExposure, 1.0);
}
`;

// Condition colour ramp. Healthy is a deep saturated green; neglected goes
// yellow-brown and loses contrast between root and tip.
const HEALTHY_DEEP = 0x2f4a24;
const HEALTHY_RIM = 0x74a83c;
const HEALTHY_ROOT = 0x24381c;
const HEALTHY_TIP = 0x8fc056;
const DULL_DEEP = 0x5a4a2a;
const DULL_RIM = 0x8a7748;
const DULL_ROOT = 0x3d3320;
const DULL_TIP = 0xa89258;

export interface MarimoShapeUniforms {
  uShape0: { value: THREE.Vector4 };
  uShape1: { value: THREE.Vector4 };
  uShape2: { value: THREE.Vector4 };
  uShape3: { value: THREE.Vector4 };
  /** xyz = face normal in the body frame, w = depth. */
  uFacets: { value: THREE.Vector4[] };
  uFacetCount: { value: number };
  uRadius: { value: number };
  uLumpOffset: { value: THREE.Vector3 };
  /** Coarse amplitude, fine amplitude, feature scale, axial stretch. */
  uLumpCharacter: { value: THREE.Vector4 };
}

/** Every marimo's own surface character, drawn from its seed. See `marimoLump`. */
export function lumpCharacter(seed: number): THREE.Vector4 {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  return new THREE.Vector4(
    0.03 + rand() * 0.05,
    0.012 + rand() * 0.02,
    0.8 + rand() * 0.55,
    rand() * 0.5
  );
}

export function createShapeUniforms(seed: number): MarimoShapeUniforms {
  const s = (seed >>> 0) / 4294967296;
  return {
    uShape0: { value: new THREE.Vector4() },
    uShape1: { value: new THREE.Vector4() },
    uShape2: { value: new THREE.Vector4() },
    uShape3: { value: new THREE.Vector4() },
    uFacets: { value: Array.from({ length: MAX_FACETS + 1 }, () => new THREE.Vector4()) },
    uFacetCount: { value: 0 },
    uRadius: { value: 0.012 },
    uLumpOffset: { value: new THREE.Vector3(s * 91.3, s * 47.7 + 13.1, s * 63.9 + 5.5) },
    uLumpCharacter: { value: lumpCharacter(seed) }
  };
}

/** Write the surface — 16 SH coefficients and the flat faces — into the uniforms. */
export function writeShapeUniforms(
  uniforms: MarimoShapeUniforms,
  shape: MarimoShape,
  radiusMetres: number
): void {
  const c = shape.coeffs;
  uniforms.uShape0.value.set(c[0], c[1], c[2], c[3]);
  uniforms.uShape1.value.set(c[4], c[5], c[6], c[7]);
  uniforms.uShape2.value.set(c[8], c[9], c[10], c[11]);
  uniforms.uShape3.value.set(c[12], c[13], c[14], c[15]);

  const slots = uniforms.uFacets.value;
  const count = Math.min(shape.facetCount, slots.length);
  for (let i = 0; i < count; i++) {
    const facet = shape.facets[i];
    slots[i].set(facet.d[0], facet.d[1], facet.d[2], facet.depth);
  }
  uniforms.uFacetCount.value = count;

  uniforms.uRadius.value = radiusMetres;
}

export function createBodyMaterial(
  shape: MarimoShapeUniforms,
  water = createWaterUniforms(),
  light = createLightUniforms()
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shape,
      ...water,
      ...light,
      uColourDeep: { value: new THREE.Color(HEALTHY_DEEP) },
      uColourRim: { value: new THREE.Color(HEALTHY_RIM) }
    },
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT
  });
}

export function createFilamentMaterial(
  shape: MarimoShapeUniforms,
  water = createWaterUniforms(),
  light = createLightUniforms()
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shape,
      ...water,
      ...light,
      uFurLength: { value: FILAMENT_LENGTH_FRAC },
      uFurWidth: { value: FILAMENT_WIDTH_FRAC },
      uMinPixelWidth: { value: FILAMENT_MIN_PIXEL_WIDTH },
      uViewportHeight: { value: 800 },
      uFlow: { value: new THREE.Vector3() },
      uCurl: { value: 0.25 },
      uTime: { value: 0 },
      uSwaySpeed: { value: FILAMENT_SWAY_SPEED },
      uSwayBands: { value: FILAMENT_SWAY_BANDS },
      uSwayIdle: { value: FILAMENT_SWAY_IDLE },
      uSwayGain: { value: FILAMENT_SWAY_GAIN },
      uSwayFlowRef: { value: FILAMENT_SWAY_FLOW_REF },
      uSwayScale: { value: 1 },
      uColourRoot: { value: new THREE.Color(HEALTHY_ROOT) },
      uColourTip: { value: new THREE.Color(HEALTHY_TIP) }
    },
    vertexShader: FILAMENT_VERTEX,
    fragmentShader: FILAMENT_FRAGMENT,
    side: THREE.DoubleSide
  });
}

// Reused targets, so pushing colours every frame allocates nothing.
const healthyDeep = new THREE.Color(HEALTHY_DEEP);
const healthyRim = new THREE.Color(HEALTHY_RIM);
const healthyRoot = new THREE.Color(HEALTHY_ROOT);
const healthyTip = new THREE.Color(HEALTHY_TIP);

/** Push the current condition into the colour uniforms. */
export function applyConditionColours(
  body: THREE.ShaderMaterial,
  filament: THREE.ShaderMaterial,
  vigor: number
): void {
  const v = Math.max(0, Math.min(1, vigor));
  (body.uniforms.uColourDeep.value as THREE.Color).setHex(DULL_DEEP).lerp(healthyDeep, v);
  (body.uniforms.uColourRim.value as THREE.Color).setHex(DULL_RIM).lerp(healthyRim, v);
  (filament.uniforms.uColourRoot.value as THREE.Color).setHex(DULL_ROOT).lerp(healthyRoot, v);
  (filament.uniforms.uColourTip.value as THREE.Color).setHex(DULL_TIP).lerp(healthyTip, v);
}
