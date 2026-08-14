import * as THREE from 'three';

/**
 * Slime skin, as a material genome.
 *
 * One parameterized `MeshPhysicalMaterial` covers the whole matrix a slime
 * wants — shiny, matte, transparent, milky, in any colour — as roughly eight
 * numbers and two colours (see `scratchpad/slime-shader-research.md`, which
 * this file implements). Transparent colour comes from Beer–Lambert
 * absorption (`attenuationColor` over `attenuationDistance`), not albedo:
 * thin edges pale, fat middle saturated, which is how coloured jelly
 * actually reads.
 *
 * The one custom ingredient is the Barré-Brisebois translucency term (GDC
 * 2011): a backlight added after the standard lights, `pow(saturate(dot(V,
 * -(L + N·δ))), power)`, tinted per genome. It is what makes milky *glow*
 * instead of just frosting, it costs a dozen ALU with no extra pass, and on
 * a nearly-convex blob a constant thickness stands in fine for the baked
 * map the technique normally wants. Injected with `onBeforeCompile`, so
 * everything else — transmission, clearcoat, sheen — stays stock three.js.
 */

export interface SlimeGenome {
  color: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  transmission: number;
  ior: number;
  /** Volume depth for refraction, metres. The blob is ~8 mm thick. */
  thickness: number;
  attenuationColor: number;
  attenuationDistance: number;
  sheen: number;
  /** Backlight strength; 0 disables the injection entirely. */
  backlight: number;
  backlightColor: number;
}

/**
 * The body: the fried-egg *shape* stays, but the palette is slime — the first
 * colourway read as literal breakfast. A pale jelly-green skirt, coloured the
 * physical way: albedo near-white, the green arriving through Beer–Lambert
 * absorption, so thin edges run pale and the fat middle saturates.
 */
export const BODY_GENOME: SlimeGenome = {
  color: 0xd9eee2,
  roughness: 0.35,
  clearcoat: 0.5,
  clearcoatRoughness: 0.22,
  transmission: 0.92,
  ior: 1.34,
  thickness: 0.008,
  attenuationColor: 0x8fc9a8,
  attenuationDistance: 0.01,
  sheen: 0.15,
  backlight: 0.9,
  backlightColor: 0xa8e6c0
};

/**
 * The upper dome. The reference creature is one continuous jelly, so this is
 * the body genome with slightly deeper absorption and a touch more gloss —
 * the dome reads as the thick part of the same droplet, not a separate organ.
 */
export const NUCLEUS_GENOME: SlimeGenome = {
  color: 0xd2ecdc,
  roughness: 0.28,
  clearcoat: 0.7,
  clearcoatRoughness: 0.15,
  transmission: 0.88,
  ior: 1.36,
  thickness: 0.012,
  attenuationColor: 0x7dbd96,
  attenuationDistance: 0.009,
  sheen: 0.1,
  backlight: 0.95,
  backlightColor: 0x9fe0b8
};

/** How much the backlight bends toward the surface normal before exiting. */
const SS_DISTORTION = 0.6;
/** Falloff sharpness of the glow lobe. */
const SS_POWER = 2.4;
/**
 * Where the backlight comes from, world space. Behind and above the box,
 * opposite the key light — the direction that makes a rim of lit flesh when
 * the camera looks at the shadowed side.
 */
const SS_LIGHT_DIR = new THREE.Vector3(0.35, 0.55, -0.75).normalize();

export function createSlimeMaterial(genome: SlimeGenome): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: genome.color,
    roughness: genome.roughness,
    clearcoat: genome.clearcoat,
    clearcoatRoughness: genome.clearcoatRoughness,
    transmission: genome.transmission,
    ior: genome.ior,
    thickness: genome.thickness,
    attenuationColor: new THREE.Color(genome.attenuationColor),
    attenuationDistance: genome.attenuationDistance,
    sheen: genome.sheen
  });

  if (genome.backlight > 0) {
    const backlightColor = new THREE.Color(genome.backlightColor);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.ssStrength = { value: genome.backlight };
      shader.uniforms.ssColor = { value: backlightColor };
      shader.uniforms.ssLightDir = { value: SS_LIGHT_DIR };

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float ssStrength;
uniform vec3 ssColor;
uniform vec3 ssLightDir;`
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
{
  // Barré-Brisebois translucency: light entering the far side, bent by the
  // surface, caught looking toward where it exits.
  vec3 ssL = normalize((viewMatrix * vec4(ssLightDir, 0.0)).xyz);
  vec3 ssH = normalize(ssL + geometryNormal * ${SS_DISTORTION.toFixed(3)});
  float ssAmount = pow(saturate(dot(geometryViewDir, -ssH)), ${SS_POWER.toFixed(3)}) * ssStrength;
  reflectedLight.indirectDiffuse += diffuseColor.rgb * ssColor * ssAmount;
}`
        );
    };
  }

  return material;
}
