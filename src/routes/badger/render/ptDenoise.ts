import * as THREE from 'three';

// À-trous edge-avoiding wavelet denoiser.
//
// Classic Dammertz et al. (2010) "Edge-Avoiding À-Trous Wavelet Transform
// for Fast Global Illumination Filtering" with edge-stopping functions on
// world-space normal, view-space depth, and albedo — the same guide set
// used by the SVGF lineage. Each iteration is a 5×5 filter with a stride
// that doubles (1, 2, 4, 8 texels); four iterations cover a 33-texel
// footprint without actually sampling 33×33 pixels, which is what makes
// the scheme cheap enough to run in real time.
//
// Demodulation: we filter *radiance / luma(albedo)* (irradiance-like) and
// remodulate the filtered result by albedo in the composite. This keeps
// chroma sharp at material boundaries where the lit signal is smooth but
// the colour changes abruptly — exactly what you get on badge cell edges.
// Scalar (luminance) demodulation avoids the chromatic fringing you get
// from per-channel divide when one channel of the albedo is near zero
// (e.g. black nickel, saturated primaries): all three channels scale by
// the same factor, so the ratio can't invent hues. The result is also
// clamped to a sane HDR ceiling to prevent edge pixels (where albedo
// approaches zero due to AA blending) from producing the bright magenta
// halos that bloom then amplifies.

export type PtDenoise = {
  // Run the filter. `samples` is the sample count the integrator has
  // accumulated into `accum`; we divide inside the filter so we read
  // per-sample radiance. `iterations` is the number of à-trous passes
  // (typically 4). The filtered result is available as `getOutputTexture()`
  // until the next run.
  run(
    accum: THREE.Texture,
    normals: THREE.Texture,
    albedoMask: THREE.Texture,
    samples: number,
    iterations?: number
  ): void;
  getOutputTexture(): THREE.Texture;
  resize(width: number, height: number): void;
  dispose(): void;
};

export type PtDenoiseOptions = {
  renderer: THREE.WebGLRenderer;
  width: number;
  height: number;
  // Edge-stop sigmas. Lower = sharper edges preserved (more noise kept
  // near edges), higher = smoother but more detail lost. These defaults
  // are tuned for a 0.5× render scale at ~1080p targets.
  sigmaN?: number;   // normals (dot-product threshold)
  sigmaZ?: number;   // depth (relative)
  sigmaL?: number;   // luminance (variance-driven)
};

export function createDenoiser(opts: PtDenoiseOptions): PtDenoise {
  const { renderer } = opts;
  let width = Math.max(1, opts.width);
  let height = Math.max(1, opts.height);

  const sigmaN = opts.sigmaN ?? 64.0;
  const sigmaZ = opts.sigmaZ ?? 1.0;
  const sigmaL = opts.sigmaL ?? 10.0;

  function makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    // Half-float is enough for filtered radiance and spares a lot of
    // bandwidth vs the float32 PT accumulator.
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter
    });
  }
  let pingA = makeTarget(width, height);
  let pingB = makeTarget(width, height);

  const uniforms: Record<string, THREE.IUniform> = {
    uInput: { value: null },
    uNormals: { value: null },
    uAlbedoMask: { value: null },
    uStride: { value: 1 },
    uFirstPass: { value: 1 }, // 1 = read from raw accum (with demodulation)
    uSamples: { value: 1 },
    uSigmaN: { value: sigmaN },
    uSigmaZ: { value: sigmaZ },
    uSigmaL: { value: sigmaL },
    uResolution: { value: new THREE.Vector2(width, height) }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    glslVersion: THREE.GLSL3
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function runPass(output: THREE.WebGLRenderTarget) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(output);
    renderer.render(scene, quadCamera);
    renderer.setRenderTarget(prev);
  }

  // Which ping target holds the *latest* filtered output. We alternate each
  // iteration; whichever was written last is what the composite reads.
  let latest: THREE.WebGLRenderTarget = pingA;

  return {
    run(accum, normals, albedoMask, samples, iterations = 4) {
      uniforms.uNormals.value = normals;
      uniforms.uAlbedoMask.value = albedoMask;
      uniforms.uSamples.value = Math.max(1, samples);
      uniforms.uResolution.value.set(width, height);

      // First pass reads the raw accumulator (demodulation happens in the
      // shader using the albedo guide). Subsequent passes read our own
      // ping-pong.
      uniforms.uInput.value = accum;
      uniforms.uFirstPass.value = 1;
      uniforms.uStride.value = 1;
      runPass(pingA);
      latest = pingA;

      uniforms.uFirstPass.value = 0;
      for (let i = 1; i < iterations; i++) {
        const src = latest === pingA ? pingA : pingB;
        const dst = latest === pingA ? pingB : pingA;
        uniforms.uInput.value = src.texture;
        uniforms.uStride.value = 1 << i;
        runPass(dst);
        latest = dst;
      }
    },
    getOutputTexture() {
      return latest.texture;
    },
    resize(w, h) {
      if (w === width && h === height) return;
      width = Math.max(1, Math.floor(w));
      height = Math.max(1, Math.floor(h));
      pingA.dispose();
      pingB.dispose();
      pingA = makeTarget(width, height);
      pingB = makeTarget(width, height);
      latest = pingA;
    },
    dispose() {
      material.dispose();
      quad.geometry.dispose();
      pingA.dispose();
      pingB.dispose();
    }
  };
}

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uInput;
uniform sampler2D uNormals;    // rgb = world normal, a = viewZ
uniform sampler2D uAlbedoMask; // rgb = albedo, a = mask (0 = background)
uniform int uStride;
uniform int uFirstPass;
uniform float uSamples;
uniform float uSigmaN;
uniform float uSigmaZ;
uniform float uSigmaL;
uniform vec2 uResolution;

in vec2 vUv;
out vec4 fragColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 readInput(vec2 uv) {
  if (uFirstPass == 1) {
    // Raw PT accumulator: divide by samples and demodulate by a scalar
    // (luminance of albedo) so all three channels scale by the same factor.
    // Per-channel divide — the older approach — produces bright chromatic
    // halos at geometry edges where AA blends albedo toward zero unevenly
    // across channels, and the albedo edge-stop in the à-trous filter
    // prevents those spikes from averaging out. Scalar demodulation can't
    // invent hues, and we clamp the result so any remaining near-zero
    // albedo can't blow the value up into bloom's bright-pass threshold.
    vec3 r = texture(uInput, uv).rgb / max(uSamples, 1.0);
    vec3 alb = texture(uAlbedoMask, uv).rgb;
    float aLuma = max(luma(alb), 0.04);
    vec3 demod = r / aLuma;
    return min(demod, vec3(32.0));
  }
  return texture(uInput, uv).rgb;
}

void main() {
  vec3 centerRadiance = readInput(vUv);
  vec4 centerN = texture(uNormals, vUv);
  vec4 centerA = texture(uAlbedoMask, vUv);
  float centerMask = centerA.a;

  // Background pixels (ray missed): don't run the filter — just pass the
  // demodulated value straight through (which for a miss is the backdrop
  // colour / albedo, which we set to the same value in the shader, so the
  // result comes out as the backdrop).
  if (centerMask < 0.5) {
    fragColor = vec4(centerRadiance, luma(centerRadiance));
    return;
  }

  vec3 centerNormal = normalize(centerN.rgb);
  float centerZ = centerN.a;
  vec3 centerAlbedo = centerA.rgb;

  // 5×5 à-trous kernel weights (binomial / gaussian-approx): h[-2..2] =
  // (1/16, 1/4, 3/8, 1/4, 1/16), applied separably as an outer product.
  const float kH[5] = float[5](0.0625, 0.25, 0.375, 0.25, 0.0625);

  vec3 sumRadiance = vec3(0.0);
  float sumWeight = 0.0;

  vec2 texel = 1.0 / uResolution;
  float stride = float(uStride);

  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 offset = vec2(float(dx), float(dy)) * stride * texel;
      vec2 uv = vUv + offset;
      // Clamp to edge — outside pixels would pull the filter toward 0.
      uv = clamp(uv, vec2(0.0), vec2(1.0));

      vec3 r = readInput(uv);
      vec4 n = texture(uNormals, uv);
      vec4 a = texture(uAlbedoMask, uv);
      float mask = a.a;
      if (mask < 0.5) continue; // never pull from background

      // Edge-stopping weights. Each is a separable gaussian-like falloff on
      // its guide variable. We use exp for smoothness; the inner products
      // are dots or relative differences so units don't matter much.
      vec3 nSample = normalize(n.rgb);
      float wN = pow(max(0.0, dot(centerNormal, nSample)), uSigmaN);

      float zDiff = abs(centerZ - n.a) / max(centerZ, 1e-3);
      float wZ = exp(-zDiff * uSigmaZ);

      // Luminance stop: big differences between the center and sample's
      // radiance imply an edge in the lit signal, not just noise. Sigma
      // is relative to the center's luminance to handle HDR range.
      float lC = luma(centerRadiance);
      float lS = luma(r);
      float wL = exp(-abs(lC - lS) / (uSigmaL * max(lC, 1e-3) + 1e-3));

      // Albedo stop: prevents bleeding across material boundaries. Since
      // we already demodulated by albedo, same albedos should give same
      // radiance after normalisation; differing albedos mean a material
      // boundary where we don't want to blur.
      float ad = distance(centerAlbedo, a.rgb);
      float wA = exp(-ad * 10.0);

      float kernel = kH[dy + 2] * kH[dx + 2];
      float w = kernel * wN * wZ * wL * wA;
      sumRadiance += r * w;
      sumWeight += w;
    }
  }

  vec3 filtered = sumWeight > 0.0 ? sumRadiance / sumWeight : centerRadiance;
  fragColor = vec4(filtered, luma(filtered));
}
`;
