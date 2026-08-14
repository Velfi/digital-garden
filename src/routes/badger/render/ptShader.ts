// GLSL for the path-tracing fragment shader.
//
// Composed from three pieces:
//   1. PT_FRAG_HEADER — uniforms, helpers, scene intersection (BVH)
//   2. PT_MATERIALS_GLSL — BRDF primitives + layered sampler (ptMaterials)
//   3. PT_FRAG_BODY — integrator main(): reads prev accumulator, writes
//      incremental radiance to layout(location=0) and a first-hit G-buffer
//      to layout(location=1) for the denoiser.
//
// Output format:
//   - location 0: vec4 accum      — (R, G, B, second-moment of luminance)
//   - location 1: vec4 gbuffer    — (normalX, normalY, normalZ, viewZ)
//   - location 2: vec4 gbufferAlb — (albedo.rgb, mask)  — mask==0 means env
//
// The two G-buffer attachments are used as edge-stopping guides for the
// à-trous denoiser in ptDenoise.ts. They're rewritten every sample so the
// denoiser gets the latest camera-side data even though it only needs a
// single first-hit snapshot per converged region.

import { PT_MATERIALS_GLSL } from './ptMaterials.glsl';
import { PT_ENVMAP_GLSL } from './ptEnvMap';

export const PT_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const PT_FRAG_HEADER = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;

uniform sampler2D uTriPositions;
uniform vec2 uTriPositionsSize;
uniform sampler2D uTriNormals;
uniform vec2 uTriNormalsSize;
uniform usampler2D uTriMaterialId;
uniform vec2 uTriMaterialIdSize;
uniform sampler2D uMaterialTable;
uniform vec2 uMaterialTableSize;
uniform int uTriCount;

uniform vec3 uCameraPos;
uniform mat4 uCameraMat;
uniform float uFovTanHalf;
uniform float uAspect;
uniform float uLensRadius;
uniform float uFocusDist;

uniform sampler2D uEnvMap;
uniform float uEnvIntensity;

uniform vec3 uSceneCentre;
uniform float uSceneRadius;

uniform int uFrameIndex;
uniform vec2 uResolution;
uniform sampler2D uPrevAccum;
uniform sampler2D uPrevGbufferN;
uniform sampler2D uPrevGbufferA;

uniform sampler2D uBvhNodes;
uniform vec2 uBvhNodesSize;
uniform usampler2D uBvhPrimIndices;
uniform vec2 uBvhPrimIndicesSize;
uniform int uBvhNodeCount;

uniform int uPreviewMode;

// Backdrop: when the primary ray misses the scene geometry, we don't want
// the HDRI pixels visible directly (the HDRI is there for *lighting*, not
// as the backplate of a product shot). Instead we draw a smooth vertical
// gradient between two colours. The HDRI is still sampled as *radiance*
// on indirect bounces, so reflections show the environment.
uniform vec3 uBackdropTop;
uniform vec3 uBackdropBottom;

// Area lights (softbox rects). Each light = origin + two edge vectors +
// emission. Up to MAX_RECTS per scene; extra lights are ignored.
#define MAX_RECTS 4
uniform int uRectLightCount;
uniform vec3 uRectOrigin[MAX_RECTS];
uniform vec3 uRectEdgeU[MAX_RECTS];
uniform vec3 uRectEdgeV[MAX_RECTS];
uniform vec3 uRectEmission[MAX_RECTS];
uniform vec3 uRectNormal[MAX_RECTS]; // precomputed, pointing *away* from the lit side

// Adaptive sampling: once uAdaptiveActive == 1, pixels whose running
// variance estimate (stored in the accumulator's alpha channel) falls
// below uAdaptiveThreshold skip the expensive integrator path and just
// carry their previous sample through unchanged. This keeps the sample
// count monotonic across the frame (important for the divide-by-samples
// in composite) without spending work on already-clean pixels.
uniform int uAdaptiveActive;
uniform float uAdaptiveThreshold;

in vec2 vUv;
layout(location = 0) out vec4 outAccum;
layout(location = 1) out vec4 outGbufferN;
layout(location = 2) out vec4 outGbufferA;

// ---- utilities ----

vec4 fetchTexel(sampler2D tex, vec2 size, int idx) {
  int W = int(size.x);
  int x = idx - (idx / W) * W;
  int y = idx / W;
  return texelFetch(tex, ivec2(x, y), 0);
}

uint fetchU16(usampler2D tex, vec2 size, int idx) {
  int W = int(size.x);
  int x = idx - (idx / W) * W;
  int y = idx / W;
  return texelFetch(tex, ivec2(x, y), 0).r;
}

uint fetchU32(usampler2D tex, vec2 size, int idx) {
  int W = int(size.x);
  int x = idx - (idx / W) * W;
  int y = idx / W;
  return texelFetch(tex, ivec2(x, y), 0).r;
}

struct Material {
  vec3 baseColor;
  float metalness;
  float roughness;
  float clearcoat;
  float clearcoatRoughness;
  int flags;
  float ior;
  vec3 absorption;
};

// Material table layout: 4 RGBA32F texels per material.
Material readMaterial(int id) {
  vec4 a = fetchTexel(uMaterialTable, uMaterialTableSize, id * 4 + 0);
  vec4 b = fetchTexel(uMaterialTable, uMaterialTableSize, id * 4 + 1);
  vec4 c = fetchTexel(uMaterialTable, uMaterialTableSize, id * 4 + 2);
  vec4 d = fetchTexel(uMaterialTable, uMaterialTableSize, id * 4 + 3);
  Material m;
  m.baseColor = a.rgb;
  m.metalness = a.a;
  m.roughness = b.r;
  m.clearcoat = b.g;
  m.clearcoatRoughness = b.b;
  m.flags = int(b.a);
  m.ior = c.r;
  m.absorption = d.rgb;
  return m;
}

vec3 sampleEnv(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = asin(clamp(dir.y, -1.0, 1.0));
  vec2 uv = vec2(phi / (2.0 * 3.14159265) + 0.5, theta / 3.14159265 + 0.5);
  return texture(uEnvMap, uv).rgb * uEnvIntensity;
}

// Backdrop used when the primary ray misses the scene. Reflections off the
// badge still see the HDRI; this is just the visible *backplate*. Vertical
// gradient because real studio sweeps have top→bottom falloff.
vec3 backdropColor(vec3 dir) {
  float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  // Mild pow curve gives a softer transition than raw linear mix.
  t = pow(t, 0.8);
  return mix(uBackdropBottom, uBackdropTop, t);
}

float halton(int index, int base) {
  float f = 1.0;
  float r = 0.0;
  int i = index;
  for (int k = 0; k < 32; k++) {
    if (i <= 0) break;
    f /= float(base);
    r += f * float(i - (i / base) * base);
    i = i / base;
  }
  return r;
}

vec2 concentricDisk(vec2 xi) {
  vec2 off = 2.0 * xi - 1.0;
  if (off.x == 0.0 && off.y == 0.0) return vec2(0.0);
  float r, theta;
  if (abs(off.x) > abs(off.y)) {
    r = off.x;
    theta = 0.7853982 * (off.y / off.x);
  } else {
    r = off.y;
    theta = 1.5707963 - 0.7853982 * (off.x / off.y);
  }
  return r * vec2(cos(theta), sin(theta));
}

void makeRay(vec2 uv, out vec3 ro, out vec3 rd) {
  vec2 jitter = vec2(halton(uFrameIndex + 1, 2), halton(uFrameIndex + 1, 3)) - 0.5;
  vec2 pixel = uv * uResolution + jitter;
  vec2 jUv = pixel / uResolution;
  vec2 ndc = jUv * 2.0 - 1.0;
  vec3 rayCam = normalize(vec3(ndc.x * uAspect * uFovTanHalf,
                               ndc.y * uFovTanHalf,
                               -1.0));
  vec3 pinholeDir = normalize((uCameraMat * vec4(rayCam, 0.0)).xyz);
  ro = uCameraPos;
  rd = pinholeDir;

  if (uLensRadius > 0.0 && uPreviewMode == 0) {
    vec2 lensXi = vec2(halton(uFrameIndex + 1, 5), halton(uFrameIndex + 1, 7));
    vec2 lens = concentricDisk(lensXi) * uLensRadius;
    vec3 camRight = (uCameraMat * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
    vec3 camUp = (uCameraMat * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    vec3 lensOffset = camRight * lens.x + camUp * lens.y;
    vec3 focalPoint = uCameraPos + pinholeDir * uFocusDist;
    ro = uCameraPos + lensOffset;
    rd = normalize(focalPoint - ro);
  }
}

float intersectSceneSphere(vec3 ro, vec3 rd) {
  vec3 oc = ro - uSceneCentre;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - uSceneRadius * uSceneRadius;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float sq = sqrt(disc);
  float tNear = -b - sq;
  if (tNear < 0.0) tNear = 0.0;
  return tNear;
}

bool intersectTri(
  vec3 ro, vec3 rd,
  vec3 v0, vec3 v1, vec3 v2,
  out float tOut, out float uOut, out float vOut
) {
  vec3 e1 = v1 - v0;
  vec3 e2 = v2 - v0;
  vec3 p = cross(rd, e2);
  float det = dot(e1, p);
  if (abs(det) < 1e-8) return false;
  float invDet = 1.0 / det;
  vec3 tv = ro - v0;
  float u = dot(tv, p) * invDet;
  if (u < 0.0 || u > 1.0) return false;
  vec3 q = cross(tv, e1);
  float v = dot(rd, q) * invDet;
  if (v < 0.0 || u + v > 1.0) return false;
  float t = dot(e2, q) * invDet;
  if (t < 1e-4) return false;
  tOut = t;
  uOut = u;
  vOut = v;
  return true;
}

struct Hit {
  bool hit;
  float t;
  vec3 pos;
  vec3 normal;
  int materialId;
};

void tryTri(int i, vec3 ro, vec3 rd, inout Hit h) {
  vec3 v0 = fetchTexel(uTriPositions, uTriPositionsSize, i * 3 + 0).xyz;
  vec3 v1 = fetchTexel(uTriPositions, uTriPositionsSize, i * 3 + 1).xyz;
  vec3 v2 = fetchTexel(uTriPositions, uTriPositionsSize, i * 3 + 2).xyz;
  float t, u, v;
  if (!intersectTri(ro, rd, v0, v1, v2, t, u, v)) return;
  if (t >= h.t) return;
  h.hit = true;
  h.t = t;
  h.pos = ro + rd * t;
  vec3 n0 = fetchTexel(uTriNormals, uTriNormalsSize, i * 3 + 0).xyz;
  vec3 n1 = fetchTexel(uTriNormals, uTriNormalsSize, i * 3 + 1).xyz;
  vec3 n2 = fetchTexel(uTriNormals, uTriNormalsSize, i * 3 + 2).xyz;
  h.normal = normalize(n0 * (1.0 - u - v) + n1 * u + n2 * v);
  h.materialId = int(fetchU16(uTriMaterialId, uTriMaterialIdSize, i));
}

bool intersectAabb(vec3 ro, vec3 invRd, vec3 bmin, vec3 bmax, float tMaxRay, out float tMin) {
  vec3 t0 = (bmin - ro) * invRd;
  vec3 t1 = (bmax - ro) * invRd;
  vec3 tsmall = min(t0, t1);
  vec3 tbig = max(t0, t1);
  float tEnter = max(max(tsmall.x, tsmall.y), tsmall.z);
  float tExit = min(min(tbig.x, tbig.y), tbig.z);
  tMin = max(tEnter, 0.0);
  return tExit >= tMin && tMin < tMaxRay;
}

Hit intersectScene(vec3 ro, vec3 rd) {
  Hit h;
  h.hit = false;
  h.t = 1e30;
  h.pos = vec3(0.0);
  h.normal = vec3(0.0, 1.0, 0.0);
  h.materialId = 0;

  if (intersectSceneSphere(ro, rd) < 0.0) return h;

  vec3 invRd = vec3(
    abs(rd.x) > 1e-20 ? 1.0 / rd.x : 1e30,
    abs(rd.y) > 1e-20 ? 1.0 / rd.y : 1e30,
    abs(rd.z) > 1e-20 ? 1.0 / rd.z : 1e30
  );

  int nodeIdx = 0;
  for (int iter = 0; iter < 2048; iter++) {
    if (nodeIdx >= uBvhNodeCount) break;
    int t0 = nodeIdx * 2;
    vec4 n0 = fetchTexel(uBvhNodes, uBvhNodesSize, t0);
    vec4 n1 = fetchTexel(uBvhNodes, uBvhNodesSize, t0 + 1);
    uint w0 = floatBitsToUint(n0.w);
    uint w1 = floatBitsToUint(n1.w);
    float tHit;
    bool aabbHit = intersectAabb(ro, invRd, n0.xyz, n1.xyz, h.t, tHit);
    if (!aabbHit) {
      nodeIdx = (w0 == 0xFFFFFFFFu) ? int(w1) : nodeIdx + 1;
      continue;
    }
    if (w0 == 0xFFFFFFFFu) {
      nodeIdx = nodeIdx + 1;
    } else {
      int primStart = int(w0);
      int primCount = int(w1);
      for (int k = 0; k < primCount; k++) {
        uint triIdx = fetchU32(uBvhPrimIndices, uBvhPrimIndicesSize, primStart + k);
        tryTri(int(triIdx), ro, rd, h);
      }
      nodeIdx = nodeIdx + 1;
    }
  }
  return h;
}

// Cheap visibility test — used by area-light NEE (and only there, because
// envmap NEE omits visibility as before). Returns true if any geometry
// blocks a segment of length tMax from ro along rd.
bool occludedSeg(vec3 ro, vec3 rd, float tMax) {
  // Bounding-sphere early-out: if the ray from ro doesn't intersect the
  // scene sphere within tMax, nothing else can block it.
  float t = intersectSceneSphere(ro, rd);
  if (t < 0.0 || t > tMax) return false;
  vec3 invRd = vec3(
    abs(rd.x) > 1e-20 ? 1.0 / rd.x : 1e30,
    abs(rd.y) > 1e-20 ? 1.0 / rd.y : 1e30,
    abs(rd.z) > 1e-20 ? 1.0 / rd.z : 1e30
  );
  int nodeIdx = 0;
  for (int iter = 0; iter < 2048; iter++) {
    if (nodeIdx >= uBvhNodeCount) break;
    int i0 = nodeIdx * 2;
    vec4 n0 = fetchTexel(uBvhNodes, uBvhNodesSize, i0);
    vec4 n1 = fetchTexel(uBvhNodes, uBvhNodesSize, i0 + 1);
    uint w0 = floatBitsToUint(n0.w);
    uint w1 = floatBitsToUint(n1.w);
    float tHit;
    bool aabbHit = intersectAabb(ro, invRd, n0.xyz, n1.xyz, tMax, tHit);
    if (!aabbHit) {
      nodeIdx = (w0 == 0xFFFFFFFFu) ? int(w1) : nodeIdx + 1;
      continue;
    }
    if (w0 == 0xFFFFFFFFu) {
      nodeIdx = nodeIdx + 1;
    } else {
      int primStart = int(w0);
      int primCount = int(w1);
      for (int k = 0; k < primCount; k++) {
        uint triIdx = fetchU32(uBvhPrimIndices, uBvhPrimIndicesSize, primStart + k);
        // Inline a tri test that short-circuits on any hit in range.
        int i = int(triIdx);
        vec3 v0 = fetchTexel(uTriPositions, uTriPositionsSize, i * 3 + 0).xyz;
        vec3 v1 = fetchTexel(uTriPositions, uTriPositionsSize, i * 3 + 1).xyz;
        vec3 v2 = fetchTexel(uTriPositions, uTriPositionsSize, i * 3 + 2).xyz;
        float tt, uu, vv;
        if (intersectTri(ro, rd, v0, v1, v2, tt, uu, vv) && tt < tMax) {
          return true;
        }
      }
      nodeIdx = nodeIdx + 1;
    }
  }
  return false;
}

float glitterHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

uint g_seed;
void seedRng(vec2 uv) {
  uint ix = uint(uv.x * uResolution.x);
  uint iy = uint(uv.y * uResolution.y);
  g_seed = ix * 1973u + iy * 9277u + uint(uFrameIndex) * 26699u;
  g_seed = (g_seed ^ 61u) ^ (g_seed >> 16);
  g_seed *= 9u;
  g_seed = g_seed ^ (g_seed >> 4);
  g_seed *= 0x27d4eb2du;
  g_seed = g_seed ^ (g_seed >> 15);
}
float rand() {
  g_seed = g_seed * 1664525u + 1013904223u;
  return float(g_seed & 0x00ffffffu) / float(0x01000000u);
}

// luminance — used for fireflies, adaptive sampling variance, and area-light
// weighting in NEE.
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;

const PT_FRAG_BODY = /* glsl */ `
// ---- area-light NEE ----
//
// Sample one rectangle light uniformly: pick a light, then a point on its
// surface, test visibility, accumulate the contribution with MIS against
// the BRDF. Rect lights are not in the BVH — they're purely analytic — so
// the badge can't block them unless the rect is physically behind geometry.

struct RectSample {
  vec3 pos;
  vec3 normal;
  vec3 emission;
  float pdfArea; // 1 / (N_lights * area_i)
};

RectSample sampleRectLight(vec2 xi, float xiPick) {
  RectSample s;
  s.pos = vec3(0.0);
  s.normal = vec3(0.0, 1.0, 0.0);
  s.emission = vec3(0.0);
  s.pdfArea = 0.0;
  int n = uRectLightCount;
  if (n <= 0) return s;
  int i = int(floor(xiPick * float(n)));
  if (i >= n) i = n - 1;
  vec3 o = uRectOrigin[i];
  vec3 eu = uRectEdgeU[i];
  vec3 ev = uRectEdgeV[i];
  s.pos = o + eu * xi.x + ev * xi.y;
  s.normal = uRectNormal[i];
  s.emission = uRectEmission[i];
  float area = length(cross(eu, ev));
  s.pdfArea = 1.0 / max(area * float(n), 1e-6);
  return s;
}

float rectPdfArea(int i) {
  if (i < 0 || i >= uRectLightCount) return 0.0;
  vec3 eu = uRectEdgeU[i];
  vec3 ev = uRectEdgeV[i];
  float area = length(cross(eu, ev));
  return 1.0 / max(area * float(uRectLightCount), 1e-6);
}

// Integrator.
//
// Per bounce:
//   - Intersect scene. If miss, add env radiance (MIS-weighted if the last
//     bounce was a BRDF sample).
//   - If dielectric: stochastic reflect/refract with absorption applied to
//     throughput across transmitted segments (Beer-Lambert).
//   - Otherwise: NEE from (a) envmap CDFs and (b) area rects, combined with
//     balance-heuristic MIS against the BRDF. Then a BRDF continuation.

const int MAX_BOUNCES_OPAQUE = 3;
const int MAX_BOUNCES_TOTAL = 6;

struct TraceResult {
  vec3 radiance;
  // First-hit data for the G-buffer. viewZ = -(view space z); always
  // positive in front of the camera. Normals are world-space. Mask = 1
  // if we hit geometry, 0 if the primary ray missed (and we shaded the
  // backdrop).
  vec3 firstNormal;
  float firstViewZ;
  vec3 firstAlbedo;
  float firstMask;
};

TraceResult traceRay(vec3 ro, vec3 rd) {
  TraceResult tr;
  tr.radiance = vec3(0.0);
  tr.firstNormal = vec3(0.0);
  tr.firstViewZ = 0.0;
  tr.firstAlbedo = vec3(0.0);
  tr.firstMask = 0.0;

  vec3 throughput = vec3(1.0);
  float prevBrdfPdf = 0.0;
  bool prevIsSpecularSample = true;
  // Absorption currently active on the throughput — applied each segment.
  // Zero outside dielectric interiors.
  vec3 currentSigmaA = vec3(0.0);
  int maxBounces = uPreviewMode == 1 ? 1 : MAX_BOUNCES_OPAQUE;
  bool firstHitCaptured = false;

  for (int b = 0; b < MAX_BOUNCES_TOTAL; b++) {
    if (b >= maxBounces) break;
    Hit h = intersectScene(ro, rd);

    // Apply Beer-Lambert across the last segment. If the ray escapes, t is
    // unbounded and we stop here — absorption through an infinite medium
    // would zero throughput anyway, and the env contribution is meant to
    // represent distant light that doesn't pass through resin.
    if (h.hit) {
      throughput *= exp(-currentSigmaA * h.t);
    }

    if (!h.hit) {
      vec3 envR = sampleEnv(rd);
      float w = 1.0;
      if (b > 0 && !prevIsSpecularSample) {
        float envPdf = envPdfDir(rd);
        w = misBalance(prevBrdfPdf, envPdf);
      }
      // Primary miss: shade the backdrop gradient and capture the "miss"
      // G-buffer (far depth, neutral normal) so the denoiser treats these
      // pixels as a flat region rather than fighting against noise.
      if (b == 0 && !firstHitCaptured) {
        tr.radiance = backdropColor(rd);
        tr.firstAlbedo = backdropColor(rd);
        tr.firstNormal = vec3(0.0, 0.0, 1.0);
        tr.firstViewZ = 1e4;
        tr.firstMask = 0.0;
        return tr;
      }
      tr.radiance += throughput * envR * w;
      break;
    }

    Material m = readMaterial(h.materialId);
    bool isDielectric = (m.flags & 4) != 0;
    bool isGround = (m.flags & 8) != 0;

    // Capture G-buffer data from first hit.
    if (b == 0 && !firstHitCaptured) {
      firstHitCaptured = true;
      vec3 nFace = h.normal;
      if (dot(nFace, -rd) < 0.0) nFace = -nFace;
      tr.firstNormal = nFace;
      // View-space Z = distance along camera forward = dot(hit - cameraPos, -cameraForward).
      // With uCameraViewMat = world->view, viewZ of a world point is
      // -(cameraViewMat * vec4(p, 1)).z in a RH view (OpenGL convention).
      vec3 camToHit = h.pos - uCameraPos;
      vec3 camForward = -(uCameraMat * vec4(0.0, 0.0, 1.0, 0.0)).xyz; // forward = -z
      tr.firstViewZ = max(1e-3, dot(camToHit, normalize(camForward)));
      tr.firstAlbedo = m.baseColor;
      tr.firstMask = 1.0;
    }

    if (isDielectric) {
      maxBounces = MAX_BOUNCES_TOTAL;
      vec3 nGeom = h.normal;
      vec3 woD = -rd;
      BrdfSample ds = sampleDielectric(nGeom, woD, m.baseColor, m.ior, rand());
      if (ds.pdf <= 0.0) break;
      throughput *= ds.weight;
      if (any(isnan(throughput)) || any(isinf(throughput))) break;
      float side = dot(ds.dir, nGeom) > 0.0 ? 1.0 : -1.0;
      ro = h.pos + nGeom * side * 1e-3;
      rd = ds.dir;
      // Entering the medium toggles absorption. We approximate the "inside"
      // state as "the sign of (ds.dir · geometric normal) is opposite the
      // sign of (wo · geometric normal)" — i.e., we just transmitted through
      // the surface rather than reflecting off it.
      bool transmitted = dot(ds.dir, nGeom) * dot(woD, nGeom) < 0.0;
      if (transmitted) {
        // If we were outside (currentSigmaA == 0) switch to the medium's
        // absorption; if we were inside, we just exited — zero it out.
        if (currentSigmaA == vec3(0.0)) {
          currentSigmaA = m.absorption;
        } else {
          currentSigmaA = vec3(0.0);
        }
      }
      prevIsSpecularSample = true;
      prevBrdfPdf = ds.pdf;
      if (b >= 2) {
        float q = min(0.95, max(max(throughput.r, throughput.g), throughput.b));
        if (rand() > q) break;
        throughput /= q;
      }
      continue;
    }

    vec3 n = h.normal;
    if (dot(n, -rd) < 0.0) n = -n;
    vec3 wo = -rd;
    // Substrate normal — preserved before any perturbation so the coat-
    // thickness model and orange-peel use the geometric meniscus shape, not
    // the tilt of a flake that happens to be at this pixel.
    vec3 nSubstrate = n;

    // --- NEE (env + rect), MIS-weighted against the BRDF sample ---
    //
    // We draw one sample from each sampler and combine via the balance
    // heuristic. The envmap NEE path skips the visibility test (cheap
    // approximation — the badge is small and mostly convex). The rect NEE
    // path *does* shadow-test, because rects can be occluded by the badge
    // itself (e.g. a key softbox's direct light blocked by the badge's own
    // wall).

    // Enamel-stack absorption (bit 4). The resin coat above the tinted
    // substrate absorbs light on both legs of the ray through it; we use
    // a nominal thickness in world units (badges modelled in mm) and the
    // material's absorption coefficient. Non-enamel materials pass zero
    // which short-circuits to the original evalLayered.
    bool isEnamelStack = (m.flags & 16) != 0;
    vec3 absA = isEnamelStack ? m.absorption : vec3(0.0);
    // Per-region coat thickness. On a real pin the resin is thickest in the
    // flat centre of a cell (where n points at +Y) and tapers toward the
    // meniscus walls, where the surface curves down to meet the metal. We
    // drive thickness from the enamel top normal's Y component, which is
    // free — the meniscus geometry already encodes the dip as tilted
    // normals at the cell edges. Clamp to a floor of 0.15mm so edges still
    // pick up *some* tinted depth.
    float tiltY = clamp(nSubstrate.y, 0.0, 1.0);
    float thickA = isEnamelStack ? (0.15 + 0.55 * tiltY * tiltY) : 0.0;
    // Fine cloisonne often reads slightly denser right against the metal
    // cloisons: the curved meniscus near the wire deepens the color band
    // locally even while the centre stays optically deep. We approximate
    // that by boosting absorption toward lower-Y meniscus normals without
    // making the whole cell muddy.
    float edgePool = isEnamelStack ? pow(1.0 - tiltY, 1.8) : 0.0;
    absA *= 1.0 + 0.45 * edgePool;

    // Orange-peel: real enamel cures with micro-waviness from surface-
    // tension ripples (~0.5-2mm wavelength, sub-micron amplitude). The eye
    // reads this as "that's a real coating" the moment it shows up in the
    // environment reflection. We perturb the shading normal with the
    // horizontal gradient of a cheap analytic height field — three sine
    // components at close-but-distinct frequencies beat into irregular
    // cells that don't look like a grid. Frequencies 7.9, 3.3, 13.7 per mm
    // put the dominant feature around 0.8-1.2mm, matching cured-epoxy
    // orange-peel. Amplitude is below the threshold where it reads as
    // bumpiness but above where the environment reflection stays mirror-
    // sharp.
    if (isEnamelStack) {
      vec2 p = h.pos.xz;
      float dx = cos(p.x * 7.9 + p.y * 3.1) * 7.9
               - sin(p.x * 3.3 - p.y * 8.2) * 3.3
               + cos(p.x * 13.7 - p.y * 11.3) * 13.7 * 0.6;
      float dy = cos(p.x * 7.9 + p.y * 3.1) * 3.1
               + sin(p.x * 3.3 - p.y * 8.2) * 8.2
               - sin(p.x * 13.7 - p.y * 11.3) * 11.3 * 0.6;
      float waviness = mix(0.0018, 0.0042, clamp((m.roughness - 0.03) / 0.10, 0.0, 1.0));
      vec3 bump = vec3(dx, 0.0, dy) * waviness;
      // Tangent-plane project (remove component along n) then add and
      // renormalise. Cheaper than reconstructing a full TBN for this
      // low-contrast micro-detail.
      vec3 bumpT = bump - n * dot(bump, n);
      n = normalize(n + bumpT);
    }

    // --- Glitter ---
    // Physical model: hexagonal aluminium flakes (~150-300um across,
    // ~50um thick) suspended in the resin coat at varying depths. The
    // flake replaces the substrate at this pixel rather than blending
    // into it: a real flake is an opaque mirror sitting on top of the
    // pigment, not a translucent lens.
    //
    // Robust-realism choices vs. the original 2D-circular-flake model:
    //   * Triplanar hashing — flakes tile in 3D, so meniscus walls show
    //     flakes face-on, not vertical streaks.
    //   * Hex distance field — crisp polygon edges, not fuzzy circles.
    //   * View-direction parallax — flakes shift relative to the
    //     substrate as the camera moves, the unmistakable "embedded in
    //     resin" cue.
    //   * Material *replacement*, not metalness blending — flake = pure
    //     aluminium (F0 ~0.91, near-zero roughness) with no enamel-
    //     stack absorption (the flake is above the pigment).
    //   * Two octaves at different scales — natural size variation.
    //
    // The flake stays under the resin clearcoat, which we keep enabled
    // so the dielectric coat reflection still sits over the mirror.
    if ((m.flags & 1) != 0) {
      // Parallax: project the view ray into the resin a random per-pixel
      // depth. Refraction through a flat air-resin interface bends V by
      // ~asin(sin(theta)/ior); we approximate with a small linear scale.
      // Coat thickness sets the parallax magnitude — thicker coat at the
      // cell centre gives more parallax shift, near zero at the meniscus
      // edge, matching how real glitter visually disappears behind the
      // wall as the camera tilts.
      vec3 vDir = normalize(uCameraPos - h.pos);
      float depthFrac = glitterHash(h.pos.xy + h.pos.yz * 0.7);
      vec3 parallax = -vDir * (thickA * depthFrac * 0.6);
      vec3 wp = h.pos + parallax;

      // Triplanar weights — pick the axis aligned with the substrate
      // normal so the 2D hash grid lies *in* the surface, not collapsed
      // along it. Power-4 weights give a near-binary selection that
      // avoids visible blending seams on rounded geometry.
      vec3 axW = abs(nSubstrate);
      axW = axW * axW; axW = axW * axW;
      axW /= max(axW.x + axW.y + axW.z, 1e-4);
      // Build the 2D hash coordinate from the two axes orthogonal to
      // the dominant one. Concretely: if Y dominates, use (x, z); if X
      // dominates, use (y, z); if Z dominates, use (x, y). Blending is
      // unnecessary because axW is essentially one-hot.
      vec2 gpA;
      if (axW.y >= axW.x && axW.y >= axW.z) gpA = wp.xz;
      else if (axW.x >= axW.z)              gpA = wp.yz;
      else                                  gpA = wp.xy;

      // Two-octave evaluation — the flake "wins" if either octave fires.
      // Octave A: ~0.33mm cells (fine), B: ~0.5mm cells (slightly larger
      // flakes, lower density). Real cosmetic glitter has this kind of
      // mixed-size distribution.
      bool flakeFires = false;
      vec3 flakeNormal = nSubstrate;
      float flakeDepthFlash = 0.0; // 0..1 perturbation marker for output

      // Hex distance helper: returns the chebyshev-style distance to a
      // hex centre. < 0.5 means inside a unit hex tile in skewed coords.
      // Using the standard offset hex metric gives clean edges for free.
      // Octave A
      {
        float scale = 3.0; // 1/3 mm per cell
        vec2 gp = gpA * scale;
        vec2 gi = floor(gp);
        vec2 gf = gp - gi;
        // Per-cell jitter + density gate. Keep ~45% of cells (denser than
        // the old 25%) — denser glitter still reads as glitter because
        // most flakes aren't aimed at the eye at any one moment.
        float keep = step(0.55, glitterHash(gi + vec2(11.3, 4.7)));
        vec2 center = vec2(
          0.25 + 0.5 * glitterHash(gi + vec2(1.3, 7.7)),
          0.25 + 0.5 * glitterHash(gi + vec2(9.1, 2.4))
        );
        // Hex footprint via a 6-direction min-distance test. Real flakes
        // are six-sided with hard edges; the "inside" test cuts a sharp
        // boundary instead of the original soft circular falloff.
        vec2 d2 = gf - center;
        float ang0 = glitterHash(gi + vec2(2.1, 6.3)) * 6.2831853 / 6.0;
        float r = 0.18; // hex radius in cell units
        // Project onto the three hex axes (60deg apart) and take the max
        // |projection| → that's the hex distance.
        float c0 = cos(ang0), s0 = sin(ang0);
        float h0 = abs(d2.x * c0 + d2.y * s0);
        float c1 = cos(ang0 + 1.0472), s1 = sin(ang0 + 1.0472);
        float h1 = abs(d2.x * c1 + d2.y * s1);
        float c2 = cos(ang0 + 2.0944), s2 = sin(ang0 + 2.0944);
        float h2 = abs(d2.x * c2 + d2.y * s2);
        float hexD = max(max(h0, h1), h2);
        bool inside = hexD < r * (0.7 + 0.6 * glitterHash(gi + vec2(7.7, 3.1)));
        if (inside && keep > 0.5) {
          // Per-flake tilted normal in the substrate's tangent frame.
          // Max ~25 deg tilt — restrained so flakes tend to face up,
          // making the sparkle direction stable and angle-dependent
          // rather than uniformly bright.
          float a = glitterHash(gi + vec2(3.7, 1.1)) * 6.2831853;
          float tlt = glitterHash(gi + vec2(5.3, 8.9));
          float tilt = 0.42 * sqrt(tlt);
          vec3 t, b;
          orthonormalBasis(nSubstrate, t, b);
          flakeNormal = normalize(
            nSubstrate * sqrt(max(0.0, 1.0 - tilt * tilt))
            + (cos(a) * t + sin(a) * b) * tilt
          );
          flakeFires = true;
          flakeDepthFlash = depthFrac;
        }
      }
      // Octave B — only consult if A didn't fire, so the larger flakes
      // fill the gaps rather than overwriting the fine ones.
      if (!flakeFires) {
        float scale = 2.0; // 0.5 mm cells (larger flakes)
        vec2 gp = gpA * scale + vec2(31.4, 17.9); // offset to decorrelate
        vec2 gi = floor(gp);
        vec2 gf = gp - gi;
        float keep = step(0.7, glitterHash(gi + vec2(13.1, 5.7)));
        vec2 center = vec2(
          0.25 + 0.5 * glitterHash(gi + vec2(1.3, 7.7)),
          0.25 + 0.5 * glitterHash(gi + vec2(9.1, 2.4))
        );
        vec2 d2 = gf - center;
        float ang0 = glitterHash(gi + vec2(2.1, 6.3)) * 6.2831853 / 6.0;
        float r = 0.16;
        float c0 = cos(ang0), s0 = sin(ang0);
        float h0 = abs(d2.x * c0 + d2.y * s0);
        float c1 = cos(ang0 + 1.0472), s1 = sin(ang0 + 1.0472);
        float h1 = abs(d2.x * c1 + d2.y * s1);
        float c2 = cos(ang0 + 2.0944), s2 = sin(ang0 + 2.0944);
        float h2 = abs(d2.x * c2 + d2.y * s2);
        float hexD = max(max(h0, h1), h2);
        bool inside = hexD < r * (0.8 + 0.4 * glitterHash(gi + vec2(7.7, 3.1)));
        if (inside && keep > 0.5) {
          float a = glitterHash(gi + vec2(3.7, 1.1)) * 6.2831853;
          float tlt = glitterHash(gi + vec2(5.3, 8.9));
          float tilt = 0.38 * sqrt(tlt);
          vec3 t, b;
          orthonormalBasis(nSubstrate, t, b);
          flakeNormal = normalize(
            nSubstrate * sqrt(max(0.0, 1.0 - tilt * tilt))
            + (cos(a) * t + sin(a) * b) * tilt
          );
          flakeFires = true;
          flakeDepthFlash = depthFrac;
        }
      }

      if (flakeFires) {
        // Replace the substrate at this pixel with an aluminium mirror.
        // F0 ~0.91 across the visible spectrum; use a faint warm bias
        // (silver flakes pick up trace pigment from the resin during
        // suspension) so red-glitter cells read very subtly red even on
        // the brightest pops, instead of looking like white pinholes.
        vec3 alumF0 = vec3(0.91, 0.92, 0.92);
        m.baseColor = mix(alumF0, m.baseColor, 0.08);
        m.metalness = 1.0;
        m.roughness = 0.04;
        n = flakeNormal;
        // The flake sits above the pigment — the absorbing substrate is
        // shadowed by it for this pixel. Disable enamel-stack absorption
        // so we don't darken the mirror reflection through a coat that
        // physically isn't on top of the flake (only the resin clearcoat
        // is, and that's handled by the clearcoat lobe).
        absA = vec3(0.0);
        thickA = 0.0;
      }
    }

    // Env sample.
    {
      vec2 ex = vec2(rand(), rand());
      float envPdf = 0.0;
      vec3 envDir = envSampleDir(ex, envPdf);
      if (envPdf > 0.0 && dot(n, envDir) > 0.0) {
        vec3 brdfCos = evalLayeredFull(
          n, wo, envDir,
          m.baseColor, m.metalness, m.roughness,
          m.clearcoat, m.clearcoatRoughness,
          absA, thickA
        );
        float brdfPdf = pdfLayered(
          n, wo, envDir,
          m.baseColor, m.metalness, m.roughness,
          m.clearcoat, m.clearcoatRoughness
        );
        float mis = misBalance(envPdf, brdfPdf);
        tr.radiance += throughput * brdfCos * sampleEnv(envDir) * (mis / envPdf);
      }
    }

    // Rect sample. Only meaningful when rects exist.
    if (uRectLightCount > 0) {
      vec2 ex = vec2(rand(), rand());
      float xiPick = rand();
      RectSample ls = sampleRectLight(ex, xiPick);
      if (ls.pdfArea > 0.0) {
        vec3 toL = ls.pos - h.pos;
        float dist2 = dot(toL, toL);
        float dist = sqrt(dist2);
        vec3 wi = toL / dist;
        float NoL = dot(n, wi);
        float LnoL = -dot(ls.normal, wi); // light's own cos
        if (NoL > 0.0 && LnoL > 0.0) {
          // Convert area PDF -> solid-angle PDF at h.pos.
          float pdfSA = ls.pdfArea * dist2 / LnoL;
          // Occlude in world space. Short epsilon on ro to avoid self-hit.
          vec3 shadowRo = h.pos + n * 1e-3;
          if (!occludedSeg(shadowRo, wi, dist - 2e-3)) {
            vec3 brdfCos = evalLayeredFull(
              n, wo, wi,
              m.baseColor, m.metalness, m.roughness,
              m.clearcoat, m.clearcoatRoughness,
              absA, thickA
            );
            float brdfPdf = pdfLayered(
              n, wo, wi,
              m.baseColor, m.metalness, m.roughness,
              m.clearcoat, m.clearcoatRoughness
            );
            float mis = misBalance(pdfSA, brdfPdf);
            tr.radiance += throughput * brdfCos * ls.emission * (mis / pdfSA);
          }
        }
      }
    }

    // Ground plane: skip the BRDF continuation past the first bounce. The
    // ground is just a shadow catcher — tracing into the hemisphere above
    // it gives a noisy indirect integration that mostly just reconstructs
    // the HDRI (which is already accounted for by the envmap NEE). Breaking
    // here is biased but the bias is imperceptible on a matte backdrop and
    // it kills a big chunk of NEE/BRDF variance.
    if (isGround && b > 0) break;

    vec2 xi = vec2(rand(), rand());
    float lobeXi = rand();
    BrdfSample bs = sampleLayeredFull(
      n, wo,
      m.baseColor, m.metalness, m.roughness,
      m.clearcoat, m.clearcoatRoughness,
      absA, thickA,
      xi, lobeXi
    );
    if (bs.pdf <= 0.0) break;
    prevIsSpecularSample = false;
    prevBrdfPdf = bs.pdf;
    throughput *= bs.weight;
    if (any(isnan(throughput)) || any(isinf(throughput))) break;

    if (b >= 2) {
      float q = min(0.95, max(max(throughput.r, throughput.g), throughput.b));
      if (rand() > q) break;
      throughput /= q;
    }

    ro = h.pos + n * 1e-3;
    rd = bs.dir;
    if (dot(rd, n) <= 0.0) break;
  }
  return tr;
}

void main() {
  seedRng(vUv);

  // Adaptive sampling: when active, check the stored variance in uPrevAccum's
  // alpha. If it's below threshold we skip integration and copy the previous
  // accumulation forward unchanged; this keeps the "divide by samples" in the
  // composite well-defined while parking work on already-clean pixels.
  vec4 prev = texture(uPrevAccum, vUv);
  if (uAdaptiveActive == 1 && uFrameIndex > 0) {
    float samples = float(uFrameIndex);
    float mean = luma(prev.rgb) / samples;
    float m2 = prev.a / samples; // stored sum of squares / samples = E[L^2]
    // Variance of the sample mean = (E[L^2] - mean^2) / samples.
    float var = max(0.0, m2 - mean * mean) / samples;
    float relVar = var / max(mean * mean, 1e-4);
    if (relVar < uAdaptiveThreshold) {
      // Carry prev forward and skip tracing. First-hit G-buffer is still
      // needed by the denoiser and composite, so preserve the previous
      // guide surfaces instead of synthesizing placeholder values.
      outAccum = prev;
      outGbufferN = texture(uPrevGbufferN, vUv);
      outGbufferA = texture(uPrevGbufferA, vUv);
      return;
    }
  }

  vec3 ro, rd;
  makeRay(vUv, ro, rd);
  TraceResult tr = traceRay(ro, rd);
  vec3 sample_ = tr.radiance;
  if (any(isnan(sample_)) || any(isinf(sample_))) sample_ = vec3(0.0);
  sample_ = min(sample_, vec3(20.0));

  // Accumulate radiance + second moment (sum of L^2) so next frame can
  // compute a variance estimate for adaptive sampling.
  float l = luma(sample_);
  outAccum = vec4(prev.rgb + sample_, prev.a + l * l);

  // G-buffer: latest first-hit data (world normal + viewZ + albedo + mask).
  outGbufferN = vec4(tr.firstNormal, tr.firstViewZ);
  outGbufferA = vec4(tr.firstAlbedo, tr.firstMask);
}
`;

export const PT_FRAG = PT_FRAG_HEADER + PT_ENVMAP_GLSL + PT_MATERIALS_GLSL + PT_FRAG_BODY;
