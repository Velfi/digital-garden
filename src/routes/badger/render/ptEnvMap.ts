import * as THREE from 'three';

// Environment map importance sampler.
//
// Given an equirectangular HDRI, compute a luminance-weighted cumulative
// distribution function so the path tracer can draw samples proportional
// to the envmap's brightness. Pharr/Humphreys (PBRT 3rd ed. §14.2.4): a
// conditional CDF along rows (sample u given v) plus a marginal CDF
// along v (sample v). Both tables are uploaded as R32F textures; the
// shader looks up with a 1D binary search.
//
// The marginal CDF is a column of `height` values; the conditional CDF is
// `height` rows of `width` values. We pack both into a single RG texture
// of size (W+1, H): row r contains (H+1 values of conditional CDF for
// row r, with the last column holding the row's integral). Actually we
// keep them separate for simplicity — one 1D marginal CDF texture and
// one 2D conditional CDF texture.

export type EnvSampler = {
  // Raw equirect HDRI. Kept alongside the CDFs so the shader can read
  // radiance at a sampled direction.
  envTex: THREE.Texture;
  envWidth: number;
  envHeight: number;
  // Marginal CDF over v (height rows). Length H + 1. Shader reads this
  // to pick a row.
  marginalCdfTex: THREE.DataTexture;
  marginalCdfLength: number;
  // Conditional CDF: width+1 values per row. Row-major, uploaded as a
  // (W+1, H) R32F texture.
  conditionalCdfTex: THREE.DataTexture;
  conditionalCdfW: number;
  conditionalCdfH: number;
  // Total envmap integral (sum of luminances × solid-angle weights).
  // Exposed because shader PDFs need to divide by it.
  totalIntegral: number;
  dispose(): void;
};

// Read the EXR pixels out of a Three.js Texture. EXRLoader emits
// Float32Array data via a DataTexture, so we can directly reference
// `image.data`. If `renderer` is provided we can read back from any
// texture via WebGLRenderTarget, but for EXR that's unnecessary.
function readEquirectData(tex: THREE.Texture): {
  data: Float32Array;
  width: number;
  height: number;
} {
  const image = tex.image as { data?: Float32Array | Uint16Array; width: number; height: number };
  if (!image || !image.data) {
    throw new Error('envmap: expected a DataTexture with Float32Array data (EXR).');
  }
  const raw = image.data;
  // EXR may arrive as half-float; promote to float for CPU CDF building.
  let data: Float32Array;
  if (raw instanceof Float32Array) {
    data = raw;
  } else {
    data = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) data[i] = (raw as Uint16Array)[i];
  }
  return { data, width: image.width, height: image.height };
}

export function buildEnvSampler(envTex: THREE.Texture): EnvSampler {
  const { data, width: W, height: H } = readEquirectData(envTex);
  // Luminance per pixel, with the sin(theta) solid-angle weighting that
  // the equirect -> direction mapping implies. This weighting makes the
  // sampler truly proportional to env radiance integrated over the
  // sphere (not just the 2D image).
  const lum = new Float32Array(W * H);
  for (let iy = 0; iy < H; iy++) {
    // v in [0,1], theta in [0, pi]. sin(theta) = sin(pi * v).
    const v = (iy + 0.5) / H;
    const sinTheta = Math.sin(Math.PI * v);
    for (let ix = 0; ix < W; ix++) {
      const o = (iy * W + ix) * 4;
      // Rec. 709 luminance.
      const L = 0.2126 * data[o + 0] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      lum[iy * W + ix] = Math.max(0, L) * sinTheta;
    }
  }

  // Per-row integrals + conditional CDFs (W+1 values per row).
  const rowIntegral = new Float32Array(H);
  const conditional = new Float32Array((W + 1) * H);
  for (let iy = 0; iy < H; iy++) {
    let sum = 0;
    const base = iy * (W + 1);
    conditional[base] = 0;
    for (let ix = 0; ix < W; ix++) {
      sum += lum[iy * W + ix];
      conditional[base + ix + 1] = sum;
    }
    rowIntegral[iy] = sum;
    // Normalise the row's CDF so lookups return values in [0,1]. Empty
    // rows get a uniform CDF so we don't divide by zero downstream.
    if (sum > 0) {
      for (let ix = 0; ix <= W; ix++) conditional[base + ix] /= sum;
    } else {
      for (let ix = 0; ix <= W; ix++) conditional[base + ix] = ix / W;
    }
  }

  // Marginal CDF over rows.
  const marginal = new Float32Array(H + 1);
  let total = 0;
  marginal[0] = 0;
  for (let iy = 0; iy < H; iy++) {
    total += rowIntegral[iy];
    marginal[iy + 1] = total;
  }
  if (total > 0) {
    for (let iy = 0; iy <= H; iy++) marginal[iy] /= total;
  } else {
    for (let iy = 0; iy <= H; iy++) marginal[iy] = iy / H;
  }

  // Upload.
  const marginalCdfTex = new THREE.DataTexture(marginal, H + 1, 1, THREE.RedFormat, THREE.FloatType);
  marginalCdfTex.internalFormat = 'R32F';
  marginalCdfTex.magFilter = THREE.NearestFilter;
  marginalCdfTex.minFilter = THREE.NearestFilter;
  marginalCdfTex.wrapS = THREE.ClampToEdgeWrapping;
  marginalCdfTex.wrapT = THREE.ClampToEdgeWrapping;
  marginalCdfTex.needsUpdate = true;

  const conditionalCdfTex = new THREE.DataTexture(conditional, W + 1, H, THREE.RedFormat, THREE.FloatType);
  conditionalCdfTex.internalFormat = 'R32F';
  conditionalCdfTex.magFilter = THREE.NearestFilter;
  conditionalCdfTex.minFilter = THREE.NearestFilter;
  conditionalCdfTex.wrapS = THREE.ClampToEdgeWrapping;
  conditionalCdfTex.wrapT = THREE.ClampToEdgeWrapping;
  conditionalCdfTex.needsUpdate = true;

  return {
    envTex,
    envWidth: W,
    envHeight: H,
    marginalCdfTex,
    marginalCdfLength: H + 1,
    conditionalCdfTex,
    conditionalCdfW: W + 1,
    conditionalCdfH: H,
    totalIntegral: total,
    dispose() {
      marginalCdfTex.dispose();
      conditionalCdfTex.dispose();
    }
  };
}

// GLSL helpers. Callers prepend this to the path tracer shader. Provides:
//   - sampleEnvDirection(xi) -> (direction, radiance, pdf)
//   - envPdf(direction) -> pdf of sampling this direction via the CDFs
// The env radiance lookup stays in sampleEnv() in the main shader —
// this module just adds importance sampling.
export const PT_ENVMAP_GLSL = /* glsl */ `

uniform sampler2D uEnvMarginalCdf;     // size (uEnvHeight + 1, 1)
uniform sampler2D uEnvConditionalCdf;  // size (uEnvWidth + 1, uEnvHeight)
uniform float uEnvWidth;
uniform float uEnvHeight;
uniform float uEnvIntegral;

// Binary search for the smallest index i such that cdf[i] > u. Assumes
// cdf is monotone non-decreasing and in [0,1]. Length is N + 1.
int envSearchMarginal(float u) {
  int N = int(uEnvHeight);
  int lo = 0;
  int hi = N;
  for (int k = 0; k < 24; k++) {
    if (lo + 1 >= hi) break;
    int mid = (lo + hi) / 2;
    float cdf = texelFetch(uEnvMarginalCdf, ivec2(mid, 0), 0).r;
    if (cdf <= u) lo = mid; else hi = mid;
  }
  return lo;
}
int envSearchConditional(int row, float u) {
  int N = int(uEnvWidth);
  int lo = 0;
  int hi = N;
  for (int k = 0; k < 24; k++) {
    if (lo + 1 >= hi) break;
    int mid = (lo + hi) / 2;
    float cdf = texelFetch(uEnvConditionalCdf, ivec2(mid, row), 0).r;
    if (cdf <= u) lo = mid; else hi = mid;
  }
  return lo;
}

// Sample a direction proportional to env luminance. Returns unit direction
// + pdf (in solid-angle measure). Input xi is a 2D uniform sample.
vec3 envSampleDir(vec2 xi, out float pdf) {
  int row = envSearchMarginal(xi.x);
  int col = envSearchConditional(row, xi.y);
  // Continuous u, v within the sampled pixel using the slope of the CDF
  // between its two endpoints. This removes the grid aliasing that a
  // naive (col/W, row/H) lookup would produce.
  float cdfA = texelFetch(uEnvMarginalCdf, ivec2(row, 0), 0).r;
  float cdfB = texelFetch(uEnvMarginalCdf, ivec2(row + 1, 0), 0).r;
  float vf = (float(row) + (xi.x - cdfA) / max(cdfB - cdfA, 1e-8)) / uEnvHeight;
  float ccdfA = texelFetch(uEnvConditionalCdf, ivec2(col, row), 0).r;
  float ccdfB = texelFetch(uEnvConditionalCdf, ivec2(col + 1, row), 0).r;
  float uf = (float(col) + (xi.y - ccdfA) / max(ccdfB - ccdfA, 1e-8)) / uEnvWidth;

  float theta = vf * 3.14159265;
  float phi = (uf - 0.5) * 2.0 * 3.14159265;
  float sinTheta = sin(theta);
  vec3 dir = vec3(cos(phi) * sinTheta, cos(theta), sin(phi) * sinTheta);

  // pdf: per Pharr/Humphreys, solid-angle pdf for equirect is
  //   p_omega = p_uv / (2 * pi^2 * sinTheta)
  // where p_uv is the (u,v) joint PDF from the CDFs. The (2 pi^2 sinTheta)
  // factor is the Jacobian of the uv->omega change of variables.
  // Recover p_uv as the pixel's normalised luminance × W × H.
  float slopeMarg = (cdfB - cdfA) * uEnvHeight; // p(v)
  float slopeCond = (ccdfB - ccdfA) * uEnvWidth;  // p(u|v)
  float p_uv = slopeMarg * slopeCond;
  pdf = sinTheta > 1e-6 ? p_uv / (2.0 * 3.14159265 * 3.14159265 * sinTheta) : 0.0;
  return dir;
}

// PDF of sampling an arbitrary direction through the env importance
// sampler. Looks up the same CDF slopes at the direction's (u, v).
float envPdfDir(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  float u = phi / (2.0 * 3.14159265) + 0.5;
  float v = theta / 3.14159265;
  int row = clamp(int(v * uEnvHeight), 0, int(uEnvHeight) - 1);
  int col = clamp(int(u * uEnvWidth), 0, int(uEnvWidth) - 1);
  float cdfA = texelFetch(uEnvMarginalCdf, ivec2(row, 0), 0).r;
  float cdfB = texelFetch(uEnvMarginalCdf, ivec2(row + 1, 0), 0).r;
  float ccdfA = texelFetch(uEnvConditionalCdf, ivec2(col, row), 0).r;
  float ccdfB = texelFetch(uEnvConditionalCdf, ivec2(col + 1, row), 0).r;
  float p_uv = (cdfB - cdfA) * uEnvHeight * (ccdfB - ccdfA) * uEnvWidth;
  float sinTheta = max(sin(theta), 1e-6);
  return p_uv / (2.0 * 3.14159265 * 3.14159265 * sinTheta);
}

// Balance-heuristic MIS weight for combining two samplers (here: BRDF
// sampler and env sampler, one sample from each per shading point).
float misBalance(float pdfA, float pdfB) {
  return pdfA / max(pdfA + pdfB, 1e-6);
}
`;
