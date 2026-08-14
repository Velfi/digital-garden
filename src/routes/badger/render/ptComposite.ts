import * as THREE from 'three';

// Composite pass: takes either the path tracer's raw accumulation texture
// or the denoiser's filtered output, optionally remodulates by albedo,
// applies a 2-tap bright-pass bloom, AgX tonemap, and writes to the canvas.
//
// The composite handles both "fast preview" (raw accum, no denoise, no
// remodulate) and "full quality" (denoised demodulated input, remodulate
// by albedo, apply bloom) modes via uniforms so a single pass can serve
// the animation loop without swapping materials on the fly.

export type PtComposite = {
  material: THREE.ShaderMaterial;
  scene: THREE.Scene;
  quadCamera: THREE.OrthographicCamera;
  // accumTex: PT accumulator (or denoised output)
  // albedoTex: G-buffer albedo (for remodulation when denoised==true)
  // samples: PT sample count (only used when denoised==false)
  // denoised: true if accumTex is the filter output (already divided by
  //           samples & demodulated); false if raw accum
  // fadeAmount: 0..1 alpha for cross-fade-in
  setInputs(
    accumTex: THREE.Texture,
    albedoTex: THREE.Texture | null,
    samples: number,
    fadeAmount: number,
    denoised: boolean
  ): void;
  setExposure(exposure: number): void;
  setBloom(strength: number, threshold: number): void;
  dispose(): void;
};

export function createComposite(): PtComposite {
  const uniforms: Record<string, THREE.IUniform> = {
    uAccum: { value: null },
    uAlbedo: { value: null },
    uSamples: { value: 0 },
    uFade: { value: 1 },
    uExposure: { value: 1.2 },
    uDenoised: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBloomStrength: { value: 0.22 },
    uBloomThreshold: { value: 1.1 },
    uHeroContrast: { value: 0.08 },
    uHeroSaturation: { value: 1.08 },
    uHeroClarity: { value: 0.12 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    glslVersion: THREE.GLSL3
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    material,
    scene,
    quadCamera,
    setInputs(accumTex, albedoTex, samples, fadeAmount, denoised) {
      uniforms.uAccum.value = accumTex;
      uniforms.uAlbedo.value = albedoTex;
      uniforms.uSamples.value = Math.max(1, samples);
      uniforms.uFade.value = Math.max(0, Math.min(1, fadeAmount));
      uniforms.uDenoised.value = denoised ? 1 : 0;
      if (albedoTex && albedoTex.image) {
        const img = albedoTex.image as { width?: number; height?: number };
        if (img.width && img.height) {
          uniforms.uResolution.value.set(img.width, img.height);
        }
      }
    },
    setExposure(exposure) {
      uniforms.uExposure.value = Math.max(0, exposure);
    },
    setBloom(strength, threshold) {
      uniforms.uBloomStrength.value = Math.max(0, strength);
      uniforms.uBloomThreshold.value = Math.max(0, threshold);
    },
    dispose() {
      material.dispose();
      quad.geometry.dispose();
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

// AgX approximate (Troy Sobotka / Blender). Uses Christophe Brejon's
// "Minimal" fit: linear-to-log encode, a sigmoid contrast curve, and a
// linear-to-display decode. The full AgX pipeline uses a 3D LUT; this
// approximation is ~2–3% off on the primaries but free of the ACES highlight
// desaturation that makes metallic finishes look chalky.
const AGX = /* glsl */ `
const mat3 AGX_IN = mat3(
  0.842479062253094, 0.0423282422610123, 0.0423756549057051,
  0.0784335999999992, 0.878468636469772,  0.0784336,
  0.0792237451477643, 0.0791661274605434, 0.879142973793104
);
const mat3 AGX_OUT = mat3(
  1.19687900512017, -0.0528968517574562, -0.0529716355144438,
  -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
  -0.0990297440797205, -0.0989611768448433, 1.15107367264116
);
vec3 agxLog2(vec3 x) {
  const float min_ev = -12.47393;
  const float max_ev = 4.026069;
  x = clamp(log2(max(x, vec3(1e-8))), vec3(min_ev), vec3(max_ev));
  return (x - min_ev) / (max_ev - min_ev);
}
vec3 agxSigmoid(vec3 x) {
  // 6-order polynomial fit to the AgX contrast curve from the reference LUT.
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2
       - 40.14 * x4 * x
       + 31.96 * x4
       - 6.868 * x2 * x
       + 0.4298 * x2
       + 0.1191 * x
       - 0.00232;
}
vec3 agxTonemap(vec3 x) {
  x = AGX_IN * x;
  x = agxLog2(x);
  x = agxSigmoid(x);
  x = AGX_OUT * x;
  return clamp(x, vec3(0.0), vec3(1.0));
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uAccum;
uniform sampler2D uAlbedo;
uniform float uSamples;
uniform float uFade;
uniform float uExposure;
uniform int uDenoised;
uniform vec2 uResolution;
uniform float uBloomStrength;
uniform float uBloomThreshold;
uniform float uHeroContrast;
uniform float uHeroSaturation;
uniform float uHeroClarity;

in vec2 vUv;
out vec4 fragColor;

${AGX}

// Get per-pixel HDR radiance after demodulation handling.
vec3 readRadiance(vec2 uv) {
  if (uDenoised == 1) {
    // Denoised path: uAccum holds demodulated radiance (already divided by
    // samples). Remodulate by albedo to recover the material colour.
    vec3 demod = texture(uAccum, uv).rgb;
    vec3 alb = texture(uAlbedo, uv).rgb;
    return demod * alb;
  }
  vec3 a = texture(uAccum, uv).rgb;
  return a / max(uSamples, 1.0);
}

// 2-tap bloom: a single-pass downsampled bright-pass that samples a small
// neighbourhood around the center at two scales. This is not a Kawase chain
// and won't have the spread of a proper multi-pass bloom, but for the
// localized highlights on a polished badge it reads correctly and costs
// essentially nothing compared to a second pass.
vec3 bloom(vec2 uv) {
  vec2 texel = 1.0 / uResolution;
  vec3 acc = vec3(0.0);
  // Two 4-tap kernels at radii 2 and 6.
  const vec2 offs[8] = vec2[8](
    vec2( 1.0,  0.0), vec2(-1.0,  0.0), vec2( 0.0,  1.0), vec2( 0.0, -1.0),
    vec2( 0.6,  0.6), vec2(-0.6,  0.6), vec2(-0.6, -0.6), vec2( 0.6, -0.6)
  );
  for (int i = 0; i < 4; i++) {
    vec3 c = readRadiance(uv + offs[i] * texel * 2.0);
    c = max(c - vec3(uBloomThreshold), vec3(0.0));
    acc += c * 0.5;
  }
  for (int i = 4; i < 8; i++) {
    vec3 c = readRadiance(uv + offs[i] * texel * 6.0);
    c = max(c - vec3(uBloomThreshold), vec3(0.0));
    acc += c * 0.35;
  }
  return acc * 0.125;
}

vec3 adjustSaturation(vec3 c, float sat) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, sat);
}

void main() {
  vec3 hdr = readRadiance(vUv);

  if (uDenoised == 1 && uHeroClarity > 0.0) {
    vec2 texel = 1.0 / uResolution;
    vec3 blur =
      readRadiance(vUv + vec2(texel.x, 0.0)) +
      readRadiance(vUv - vec2(texel.x, 0.0)) +
      readRadiance(vUv + vec2(0.0, texel.y)) +
      readRadiance(vUv - vec2(0.0, texel.y));
    blur *= 0.25;
    hdr += (hdr - blur) * uHeroClarity;
  }

  if (uBloomStrength > 0.0) {
    hdr += bloom(vUv) * uBloomStrength;
  }

  hdr *= uExposure;
  vec3 ldr = agxTonemap(hdr);
  ldr = adjustSaturation(ldr, uHeroSaturation);
  ldr = mix(ldr, smoothstep(vec3(0.0), vec3(1.0), ldr), uHeroContrast);
  fragColor = vec4(ldr, uFade);
}
`;
