// Material/BRDF GLSL for the path tracer.
//
// Layered-PBR model:
//   - Base lobe: Cook-Torrance GGX specular (Walter '07 NDF, Smith '14
//     height-correlated G, Schlick Fresnel), mixed against Lambert
//     diffuse by metalness
//   - Clearcoat lobe: second GGX specular at IOR 1.5 stacked on top of
//     the base; base lobe attenuated by (1 - clearcoat * Fc). This is
//     deliberately an additive/attenuation-based composition — the
//     three-gpu-pathtracer Safari bug reproduced with a multiplicative
//     form (color *= clearcoatTerm) where NaN from a zero divisor
//     cascaded to black. Our world-space dots + max(.,1e-4) clamps +
//     additive Lo avoid the compiler pattern that triggered it.
//
// Importance sampling:
//   - GGX-VNDF (Heitz '18) for both base and clearcoat specular lobes
//   - Cosine-weighted hemisphere for diffuse
//   - One-sample lobe selection with balance weights: stochastic choice
//     between diffuse, specular, clearcoat proportional to their
//     approximate contributions; return inverse-pdf weighted throughput

export const PT_MATERIALS_GLSL = /* glsl */ `

// ---- frame ----

// Build an orthonormal basis (t, b, n) around a surface normal. Branchless
// Duff et al. 2017 method.
void orthonormalBasis(vec3 n, out vec3 t, out vec3 b) {
  float sign_ = n.z >= 0.0 ? 1.0 : -1.0;
  float a = -1.0 / (sign_ + n.z);
  float bb = n.x * n.y * a;
  t = vec3(1.0 + sign_ * n.x * n.x * a, sign_ * bb, -sign_ * n.x);
  b = vec3(bb, sign_ + n.y * n.y * a, -n.y);
}

vec3 toWorld(vec3 localV, vec3 n) {
  vec3 t, b;
  orthonormalBasis(n, t, b);
  return localV.x * t + localV.y * b + localV.z * n;
}
vec3 toLocal(vec3 worldV, vec3 n) {
  vec3 t, b;
  orthonormalBasis(n, t, b);
  return vec3(dot(worldV, t), dot(worldV, b), dot(worldV, n));
}

// ---- BRDF primitives ----

// Walter's GGX NDF. alpha = roughness^2. NoH must be clamped >= 0.
float ggxD(float NoH, float alpha) {
  float a2 = alpha * alpha;
  float denom = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * denom * denom);
}

// Smith GGX height-correlated G2. Both NoV, NoL clamped >= 0.
float smithG2Correlated(float NoV, float NoL, float alpha) {
  float a2 = alpha * alpha;
  float vv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float ll = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(vv + ll, 1e-6);
}

// Smith GGX single-direction G1 (used in VNDF sampling pdf).
float smithG1(float NoV, float alpha) {
  float a2 = alpha * alpha;
  return 2.0 / (1.0 + sqrt(1.0 + a2 * (1.0 - NoV * NoV) / max(NoV * NoV, 1e-6)));
}

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  float x = 1.0 - max(cosTheta, 0.0);
  float x5 = x * x * x * x * x;
  return f0 + (1.0 - f0) * x5;
}
float fresnelSchlickF(float cosTheta, float f0) {
  float x = 1.0 - max(cosTheta, 0.0);
  float x5 = x * x * x * x * x;
  return f0 + (1.0 - f0) * x5;
}

// Heitz GGX-VNDF sampler (2018 correction). Given a view direction in the
// local frame and alpha = roughness^2, returns a half-vector sampled from
// the VNDF. Used to importance-sample specular reflections.
vec3 ggxVndfSample(vec3 ve, float alpha, vec2 xi) {
  vec3 vh = normalize(vec3(alpha * ve.x, alpha * ve.y, ve.z));
  float lensq = vh.x * vh.x + vh.y * vh.y;
  vec3 tt1 = lensq > 0.0 ? vec3(-vh.y, vh.x, 0.0) / sqrt(lensq) : vec3(1.0, 0.0, 0.0);
  vec3 tt2 = cross(vh, tt1);
  float r = sqrt(xi.x);
  float phi = 2.0 * 3.14159265 * xi.y;
  float t1 = r * cos(phi);
  float t2 = r * sin(phi);
  float s = 0.5 * (1.0 + vh.z);
  t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;
  vec3 nh = t1 * tt1 + t2 * tt2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * vh;
  return normalize(vec3(alpha * nh.x, alpha * nh.y, max(0.0, nh.z)));
}

// Cosine-weighted hemisphere sample.
vec3 cosineHemisphere(vec2 xi) {
  float r = sqrt(xi.x);
  float phi = 2.0 * 3.14159265 * xi.y;
  return vec3(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - xi.x)));
}

// ---- BRDF evaluation ----
//
// All inputs are world-space. Material provides linear roughness; we
// square internally to get the GGX alpha (matches Three's convention).
//
// Returns: BRDF * cos(theta_l) — i.e. the integrand numerator. The
// caller divides by the sampling pdf to form a Monte Carlo estimate.

struct BrdfSample {
  vec3 dir;    // world-space outgoing direction
  vec3 weight; // BRDF * cos / pdf for this sample
  float pdf;
};

// Forward decl so evalLayered (the zero-absorption shortcut below) can call
// into evalLayeredFull, which is defined further down. GLSL requires the
// declaration to precede any call site.
vec3 evalLayeredFull(
  vec3 n, vec3 wo, vec3 wi,
  vec3 baseColor, float metalness, float roughness,
  float clearcoat, float ccRoughness,
  vec3 absorption, float coatThickness
);

// Evaluate the layered BRDF at a surface for wi (incident, TOWARD source)
// and wo (outgoing, toward camera). Returns BRDF * cos(NoL). Clearcoat is
// additive on top of the base lobe; the base lobe is attenuated by
// (1 - clearcoat * Fc_view) so the total absorbs the clearcoat's Fresnel
// transmission.
vec3 evalLayered(
  vec3 n, vec3 wo, vec3 wi,
  vec3 baseColor, float metalness, float roughness,
  float clearcoat, float ccRoughness
) {
  return evalLayeredFull(n, wo, wi, baseColor, metalness, roughness,
    clearcoat, ccRoughness, vec3(0.0), 0.0);
}

// Enamel-stack variant: the base lobe represents the tinted substrate under
// a transparent resin coat. Two effects stack on top of the uncoated BRDF:
//
//   1. Beer-Lambert absorption on both legs of the ray through the coat:
//      exp(-sigma_a * coatThickness * (1/NoV + 1/NoL)). Longer paths at
//      grazing angles darken toward the pigment's saturated colour.
//   2. Two-leg Fresnel attenuation of the diffuse substrate reflection:
//      (1 - F_NoL)(1 - F_NoV). Energy that Fresnel-reflects off the resin
//      surface never reaches the pigment, so grazing angles read as
//      mirror-glassy rather than pigment-coloured.
//
// Together these give the signature "bright glassy edge, deep pigment
// centre" of real pin enamel. The clearcoat specular lobe itself sits
// *above* the absorbing layer, so it's unaffected (mirror-like reflections
// stay bright at all angles).
vec3 evalLayeredFull(
  vec3 n, vec3 wo, vec3 wi,
  vec3 baseColor, float metalness, float roughness,
  float clearcoat, float ccRoughness,
  vec3 absorption, float coatThickness
) {
  float NoV = max(dot(n, wo), 1e-4);
  float NoL = max(dot(n, wi), 1e-4);
  if (dot(n, wi) <= 0.0) return vec3(0.0);
  vec3 h = normalize(wo + wi);
  float NoH = max(dot(n, h), 1e-4);
  float VoH = max(dot(wo, h), 1e-4);

  float alpha = roughness * roughness;
  alpha = max(alpha, 0.0016);

  vec3 f0 = mix(vec3(0.04), baseColor, metalness);
  vec3 F = fresnelSchlick(VoH, f0);

  float D = ggxD(NoH, alpha);
  float G = smithG2Correlated(NoV, NoL, alpha);
  vec3 specular = F * D * G;

  vec3 diffuse = (1.0 - metalness) * baseColor / 3.14159265 * (1.0 - F);

  // Two-leg Fresnel attenuation for the coat→substrate→coat diffuse path
  // (Weidlich-Wilkie). A ray reaching the pigment has to transmit through
  // the resin interface on the way in *and* on the way out, losing
  // (1 - F_NoL)(1 - F_NoV) of its energy to those two Fresnel reflections.
  // This is what gives real enamel the "glassy-bright edge, deep-pigment
  // centre" contrast — at grazing angles the substrate goes dim and the
  // coat's mirror lobe takes over. Zero-thickness materials (no coat stack)
  // skip this and keep the classic MeshPhysicalMaterial look.
  if (coatThickness > 0.0) {
    float FNoL = fresnelSchlickF(NoL, 0.04);
    float FNoV = fresnelSchlickF(NoV, 0.04);
    diffuse *= (1.0 - FNoL) * (1.0 - FNoV);
  }

  vec3 baseLobe = (diffuse + specular) * NoL;

  // Beer-Lambert through the coat. Zero absorption / thickness short-circuits
  // to vec3(1) — cheap and keeps the common path identical to the original.
  vec3 coatTransmission = vec3(1.0);
  if (coatThickness > 0.0) {
    float pathFactor = 1.0 / NoV + 1.0 / NoL;
    coatTransmission = exp(-absorption * coatThickness * pathFactor);
  }
  baseLobe *= coatTransmission;

  float ccAlpha = ccRoughness * ccRoughness;
  ccAlpha = max(ccAlpha, 0.0016);
  float FcVoH = fresnelSchlickF(VoH, 0.04);
  float FcNoV = fresnelSchlickF(NoV, 0.04);
  float Dc = ggxD(NoH, ccAlpha);
  float Gc = smithG2Correlated(NoV, NoL, ccAlpha);
  float clearcoatSpec = FcVoH * Dc * Gc;
  vec3 coatLobe = vec3(clearcoat * clearcoatSpec) * NoL;

  return baseLobe * (1.0 - clearcoat * FcNoV) + coatLobe;
}

// Sample the layered BRDF at a surface. Randomly picks a lobe
// (diffuse / specular / clearcoat) weighted by its approximate
// contribution, then samples that lobe's distribution and returns the
// outgoing direction + MC weight. The weight is BRDF * NoL / pdf, which
// is what the integrator multiplies into throughput.
BrdfSample sampleLayeredFull(
  vec3 n, vec3 wo,
  vec3 baseColor, float metalness, float roughness,
  float clearcoat, float ccRoughness,
  vec3 absorption, float coatThickness,
  vec2 xi, float lobeXi
);

BrdfSample sampleLayered(
  vec3 n, vec3 wo,
  vec3 baseColor, float metalness, float roughness,
  float clearcoat, float ccRoughness,
  vec2 xi, float lobeXi
) {
  return sampleLayeredFull(n, wo, baseColor, metalness, roughness,
    clearcoat, ccRoughness, vec3(0.0), 0.0, xi, lobeXi);
}

BrdfSample sampleLayeredFull(
  vec3 n, vec3 wo,
  vec3 baseColor, float metalness, float roughness,
  float clearcoat, float ccRoughness,
  vec3 absorption, float coatThickness,
  vec2 xi, float lobeXi
) {
  BrdfSample s;
  s.dir = n; s.weight = vec3(0.0); s.pdf = 0.0;

  float NoV = max(dot(n, wo), 1e-4);

  // Lobe weights: crude approximations of integrated response. Keeps the
  // sampler focused where the BRDF is likely to return something useful.
  vec3 f0 = mix(vec3(0.04), baseColor, metalness);
  vec3 FV = fresnelSchlick(NoV, f0);
  float wSpec = (FV.x + FV.y + FV.z) / 3.0;
  float wDiffuse = (1.0 - metalness) * (1.0 - wSpec);
  float wCoat = clearcoat * fresnelSchlickF(NoV, 0.04);
  float wTotal = wDiffuse + wSpec + wCoat;
  if (wTotal <= 0.0) return s;
  float pDiffuse = wDiffuse / wTotal;
  float pSpec = wSpec / wTotal;
  float pCoat = wCoat / wTotal;

  float alpha = max(roughness * roughness, 0.0016);
  float ccAlpha = max(ccRoughness * ccRoughness, 0.0016);

  vec3 wi;
  if (lobeXi < pDiffuse) {
    // Diffuse — cosine hemisphere in local frame.
    vec3 localL = cosineHemisphere(xi);
    wi = toWorld(localL, n);
  } else if (lobeXi < pDiffuse + pSpec) {
    // Base specular — VNDF around surface normal.
    vec3 woLocal = toLocal(wo, n);
    vec3 hLocal = ggxVndfSample(woLocal, alpha, xi);
    vec3 wiLocal = reflect(-woLocal, hLocal);
    wi = toWorld(wiLocal, n);
  } else {
    // Clearcoat specular — VNDF with clearcoat alpha.
    vec3 woLocal = toLocal(wo, n);
    vec3 hLocal = ggxVndfSample(woLocal, ccAlpha, xi);
    vec3 wiLocal = reflect(-woLocal, hLocal);
    wi = toWorld(wiLocal, n);
  }
  s.dir = wi;

  float NoL = dot(n, wi);
  if (NoL <= 1e-6) return s;

  // Evaluate the BRDF at the sampled direction.
  vec3 brdfCos = evalLayeredFull(n, wo, wi, baseColor, metalness, roughness,
    clearcoat, ccRoughness, absorption, coatThickness);

  // PDF of the multi-lobe sampler: weighted sum of each lobe's PDF at
  // this direction. This is the balance heuristic denominator and is
  // what makes the lobe selection unbiased.
  float pdfDiffuse = max(NoL, 0.0) / 3.14159265;
  // Specular PDF from VNDF: p(h) * (1 / (4 * VoH)).
  vec3 h = normalize(wo + wi);
  float NoH = max(dot(n, h), 1e-4);
  float VoH = max(dot(wo, h), 1e-4);
  float Dg = ggxD(NoH, alpha);
  float G1v = smithG1(NoV, alpha);
  float pdfSpec = (Dg * G1v * VoH / max(NoV, 1e-4)) / max(4.0 * VoH, 1e-4);
  float Dcg = ggxD(NoH, ccAlpha);
  float G1cv = smithG1(NoV, ccAlpha);
  float pdfCoat = (Dcg * G1cv * VoH / max(NoV, 1e-4)) / max(4.0 * VoH, 1e-4);
  float pdf = pDiffuse * pdfDiffuse + pSpec * pdfSpec + pCoat * pdfCoat;
  if (pdf <= 1e-6) return s;
  s.pdf = pdf;
  s.weight = brdfCos / pdf;
  return s;
}

// ---- dielectric (delta BSDF) ----
//
// Mirror-sharp glass / resin: no microfacets, no roughness. At the
// interface we stochastically pick reflection vs. refraction weighted by
// Schlick's Fresnel. The resulting lobe is a delta — PDF is infinite in
// the chosen direction — so the MC weight is just baseColor (per-bounce
// tint on transmission to approximate Beer-Lambert without tracking path
// length, which a badge-scale dome coat doesn't need).
//
// wo points toward the camera; n is the surface normal on whichever
// side wo arrived from. ior is the material's index of refraction; the
// outside medium is assumed to be air (n=1).
BrdfSample sampleDielectric(
  vec3 n, vec3 wo, vec3 baseColor, float ior, float xi
) {
  BrdfSample s;
  s.dir = n; s.weight = vec3(0.0); s.pdf = 0.0;

  // Entering vs exiting. If wo is on the same side as n we're outside
  // looking in; otherwise we've hit the inside of a closed mesh.
  float cosI = dot(n, wo);
  bool entering = cosI > 0.0;
  vec3 nFacing = entering ? n : -n;
  float etaI = entering ? 1.0 : ior;
  float etaT = entering ? ior : 1.0;
  float eta = etaI / etaT;

  float cosThetaI = abs(cosI);
  float sin2ThetaT = eta * eta * max(0.0, 1.0 - cosThetaI * cosThetaI);
  // Total internal reflection when sin2ThetaT >= 1.
  float F;
  vec3 refrDir = vec3(0.0);
  if (sin2ThetaT >= 1.0) {
    F = 1.0;
  } else {
    float cosThetaT = sqrt(1.0 - sin2ThetaT);
    float f0s = (etaI - etaT) / (etaI + etaT);
    float F0 = f0s * f0s;
    F = F0 + (1.0 - F0) * pow(1.0 - cosThetaI, 5.0);
    refrDir = normalize(eta * -wo + (eta * cosThetaI - cosThetaT) * nFacing);
  }

  if (xi < F) {
    s.dir = reflect(-wo, nFacing);
    s.weight = baseColor;
  } else {
    s.dir = refrDir;
    s.weight = baseColor;
  }
  // Delta lobe: signal a very high PDF so MIS against a finite env PDF
  // collapses to 1.0 for this branch. The integrator treats
  // prevIsSpecularSample=true as "skip env MIS at next hit" anyway.
  s.pdf = 1e6;
  return s;
}

// PDF of the multi-lobe sampler at an arbitrary direction wi. Used by
// MIS when combining env-importance sampling with BRDF sampling — we
// need both samplers' PDFs at the other sampler's chosen direction.
float pdfLayered(
  vec3 n, vec3 wo, vec3 wi,
  vec3 baseColor, float metalness, float roughness,
  float clearcoat, float ccRoughness
) {
  float NoV = max(dot(n, wo), 1e-4);
  float NoL = dot(n, wi);
  if (NoL <= 1e-6) return 0.0;
  vec3 h = normalize(wo + wi);
  float NoH = max(dot(n, h), 1e-4);
  float VoH = max(dot(wo, h), 1e-4);
  float alpha = max(roughness * roughness, 0.0016);
  float ccAlpha = max(ccRoughness * ccRoughness, 0.0016);
  vec3 f0 = mix(vec3(0.04), baseColor, metalness);
  vec3 FV = fresnelSchlick(NoV, f0);
  float wSpec = (FV.x + FV.y + FV.z) / 3.0;
  float wDiffuse = (1.0 - metalness) * (1.0 - wSpec);
  float wCoat = clearcoat * fresnelSchlickF(NoV, 0.04);
  float wTotal = wDiffuse + wSpec + wCoat;
  if (wTotal <= 0.0) return 0.0;
  float pDiffuse = wDiffuse / wTotal;
  float pSpec = wSpec / wTotal;
  float pCoat = wCoat / wTotal;
  float pdfDiffuse = max(NoL, 0.0) / 3.14159265;
  float Dg = ggxD(NoH, alpha);
  float G1v = smithG1(NoV, alpha);
  float pdfSpec = (Dg * G1v * VoH / max(NoV, 1e-4)) / max(4.0 * VoH, 1e-4);
  float Dcg = ggxD(NoH, ccAlpha);
  float G1cv = smithG1(NoV, ccAlpha);
  float pdfCoat = (Dcg * G1cv * VoH / max(NoV, 1e-4)) / max(4.0 * VoH, 1e-4);
  return pDiffuse * pdfDiffuse + pSpec * pdfSpec + pCoat * pdfCoat;
}

`;
