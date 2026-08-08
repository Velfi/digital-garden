import * as THREE from 'three';
import { MARIMO_SHAPE_GLSL, type MarimoShapeUniforms } from './marimoMaterial';

/**
 * The shader behind the fragment previews: the same ball the tank draws,
 * rendered as a diagram rather than a photograph.
 *
 * The tank's job is to look like a jar on a desk. This one's job is to answer a
 * different question — *what shape is this piece?* — in a 96 px square, before
 * anyone has agreed to keep it. So it drops the water, the room, the lighting
 * rig and the coat, and spends the pixels on the shape itself:
 *
 * - **Contours.** Iso-lines of the surface radius, exactly like a topographic
 *   map. A scoop draws closed rings; a flat face draws a plateau ringed at its
 *   edge; a smooth bulge draws nothing at all. Shading alone cannot say which
 *   of those a dark patch is, and at 96 px it mostly doesn't try.
 * - **Terraces.** The bands between the lines, tinted alternately. A line can be
 *   lost against a lump; a whole shaded band cannot.
 * - **Banded light.** Three flat steps rather than a smooth ramp, so the form
 *   reads as facets of a solid instead of a gradient.
 *
 * Leaving the fur off is the point rather than an economy. A coat of fuzz is
 * what a marimo *looks* like, and it is also exactly what hides the thing being
 * chosen between: three balls of moss at thumbnail size are three green discs.
 * The tank puts the coat back on the moment one is picked.
 *
 * It evaluates `MARIMO_SHAPE_GLSL`, so the piece you are shown is the piece you
 * get, down to the lumps: same coefficients, same facet cuts, same per-seed
 * surface character.
 */

/** Contour lines per unit of radius scale. One line every ~3% of the radius. */
const PREVIEW_CONTOUR_BANDS = 32;
/**
 * Line half-width, in pixels.
 *
 * Pixels rather than height, which is what makes the round case come out right:
 * where the surface barely changes radius there is no crossing to draw and the
 * ball is left clean, instead of one enormous band swallowing it.
 */
const PREVIEW_CONTOUR_WIDTH = 1.4;
/** How dark a contour line goes. */
const PREVIEW_CONTOUR_STRENGTH = 0.7;
/** How far apart the two terraces are shaded. Subtle: this is a hint, not a map. */
const PREVIEW_TERRACE_STRENGTH = 0.09;

// A key from over the viewer's left shoulder and a cool fill opposite, both
// fixed in world space so the ball turns *through* the light as it spins.
const PREVIEW_KEY = new THREE.Vector3(-0.6, 1, 0.65).normalize();
const PREVIEW_FILL = new THREE.Vector3(0.75, -0.15, 0.4).normalize();

// Read against the tank's healthy palette (see `marimoMaterial.ts`), lifted a
// little: this is a picture on a page, not a ball seen through 12 cm of water.
const PREVIEW_DEEP = 0x24401c;
const PREVIEW_LIGHT = 0x74a446;
const PREVIEW_LINE = 0x12250e;
const PREVIEW_RIM = 0x8fc056;

function glslVec3(v: THREE.Vector3): string {
  return `vec3(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)})`;
}

/**
 * Banded diffuse. Three flat steps with just enough softening not to stair-step
 * on a small canvas — a smooth ramp says "photo", and this is a diagram.
 */
const PREVIEW_LIGHT_GLSL = /* glsl */ `
const vec3 PREVIEW_KEY = ${glslVec3(PREVIEW_KEY)};
const vec3 PREVIEW_FILL = ${glslVec3(PREVIEW_FILL)};

float previewToon(vec3 n) {
  float d = dot(n, PREVIEW_KEY) * 0.5 + 0.5;
  float lit = 0.30
    + 0.30 * smoothstep(0.46, 0.53, d)
    + 0.30 * smoothstep(0.66, 0.74, d);
  return lit + 0.16 * max(0.0, dot(n, PREVIEW_FILL));
}
`;

/** The map itself. Needs `MARIMO_SHAPE_GLSL` ahead of it for the field. */
const PREVIEW_CONTOUR_GLSL = /* glsl */ `
uniform vec3 uColourLine;
uniform float uContourBands;
uniform float uContourWidth;
uniform float uContourStrength;
uniform float uTerraceStrength;

/**
 * The map at this direction: x is line strength, y is which terrace, in [-1, 1].
 *
 * The height being contoured is the smooth shape and its facet cuts,
 * deliberately *not* the lump noise — topographic lines drawn over gravel are
 * just gravel. Both fade out where the surface turns away so steeply that they
 * would collapse into moire, near the silhouette; the outline is already saying
 * what they would have said there.
 */
vec2 previewContour(vec3 dir) {
  float scale = marimoFacetCut(marimoRadiusScale(uShape0, uShape1, uShape2, uShape3, dir), dir);
  float bands = scale * uContourBands;
  float w = fwidth(bands);
  float legible = 1.0 - smoothstep(0.3, 0.75, w);

  float dist = abs(fract(bands - 0.5) - 0.5) / max(w * uContourWidth, 1e-5);
  float line = (1.0 - clamp(dist, 0.0, 1.0)) * legible;

  // Every other band, with the switch softened over about a pixel.
  float terrace = smoothstep(0.5 - w, 0.5 + w, fract(bands * 0.5)) * 2.0 - 1.0;
  return vec2(line, terrace * legible);
}
`;

const BODY_VERTEX = /* glsl */ `
${MARIMO_SHAPE_GLSL}

varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vDir;

void main() {
  vec3 n = normalize(position);
  vec3 p = marimoSurfacePoint(n);

  // Finite differences on the radius field, as in the tank's body shader: the
  // flat spot has to catch the light, not just bend the silhouette.
  vec3 t = marimoTangent(n);
  vec3 b = cross(n, t);
  const float e = 0.035;
  vec3 pa = marimoSurfacePoint(normalize(n + t * e));
  vec3 pb = marimoSurfacePoint(normalize(n + b * e));
  vNormal = normalize(mat3(modelMatrix) * normalize(cross(pa - p, pb - p)));

  vDir = n;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const BODY_FRAGMENT = /* glsl */ `
precision highp float;

${MARIMO_SHAPE_GLSL}
${PREVIEW_LIGHT_GLSL}
${PREVIEW_CONTOUR_GLSL}

uniform vec3 uColourDeep;
uniform vec3 uColourLight;
uniform vec3 uColourRim;

varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vDir;

void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorld);

  vec3 colour = mix(uColourDeep, uColourLight, clamp(previewToon(n), 0.0, 1.0));

  // Read off the interpolated direction rather than a varying of its own, so
  // the lines are curves on the real surface instead of polygons on the mesh.
  vec2 map = previewContour(normalize(vDir));
  colour *= 1.0 + map.y * uTerraceStrength;
  colour = mix(colour, uColourLine, map.x * uContourStrength);

  // A little light through the edge, which is also what separates the ball from
  // the panel behind it.
  float fresnel = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.2);
  colour += uColourRim * fresnel * 0.4;

  gl_FragColor = vec4(colour, 1.0);
}
`;

export function createPreviewBodyMaterial(shape: MarimoShapeUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...shape,
      uColourDeep: { value: new THREE.Color(PREVIEW_DEEP) },
      uColourLight: { value: new THREE.Color(PREVIEW_LIGHT) },
      uColourLine: { value: new THREE.Color(PREVIEW_LINE) },
      uColourRim: { value: new THREE.Color(PREVIEW_RIM) },
      uContourBands: { value: PREVIEW_CONTOUR_BANDS },
      uContourWidth: { value: PREVIEW_CONTOUR_WIDTH },
      uContourStrength: { value: PREVIEW_CONTOUR_STRENGTH },
      uTerraceStrength: { value: PREVIEW_TERRACE_STRENGTH }
    },
    vertexShader: BODY_VERTEX,
    fragmentShader: BODY_FRAGMENT
  });
}
