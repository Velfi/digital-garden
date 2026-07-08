export interface PlumeParams {
  time: number;
  windX: number;
  windY: number;
  windStrength: number;
  turbulence: number;
  flameHeight: number;
}

export const FLAME_BASE = 0.008;
export const WICK_TOP = 0.024;

function hash3(x: number, y: number, z: number): number {
  let p = [
    ((x * 123.34) % 1) * 43758.5453,
    ((y * 456.21) % 1) * 43758.5453,
    ((z * 78.23) % 1) * 43758.5453
  ];
  p = p.map((v) => v - Math.floor(v));
  const d = p[0] * (p[1] + 45.32) + p[1] * (p[2] + 45.32) + p[2] * (p[0] + 45.32);
  return d - Math.floor(d);
}

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const c = (a: number, b: number, c: number, d: number) =>
    a + (b - a) * ux + (c - a) * uy + (d - b) * ux * uy;

  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);

  const nx00 = c(n000, n100, n010, n110);
  const nx10 = c(n001, n101, n011, n111);
  return nx00 + (nx10 - nx00) * uz;
}

export function fbm3(x: number, y: number, z: number): number {
  let v = 0;
  let a = 0.5;
  let px = x;
  let py = y;
  let pz = z;
  for (let i = 0; i < 4; i++) {
    v += a * noise3(px, py, pz);
    const nx = 0.8 * px - 0.6 * py + 0.2 * pz;
    const ny = 0.6 * px + 0.8 * py + 0.1 * pz;
    const nz = -0.2 * px + 0.1 * py + 0.9 * pz;
    px = nx * 2.05 + 13.7;
    py = ny * 2.05 + 7.1;
    pz = nz * 2.05 + 3.9;
    a *= 0.5;
  }
  return v;
}

export function wickCurveX(y: number): number {
  const t = Math.max(0, Math.min(1, (y + 0.006) / (WICK_TOP + 0.006)));
  return t * t * 0.006;
}

/** Plume axis at height y — wind lean lives here so every mesh layer bends together. */
export function plumeAnchor(y: number, params: PlumeParams): [number, number] {
  const y01 = Math.max(0, Math.min(1, y / params.flameHeight));
  let ax = wickCurveX(y);
  let az = 0;

  if (params.windStrength <= 0) return [ax, az];

  const pin = basePinWeight(y01);
  const bend = y01 * y01 * params.windStrength * pin;
  const eddy = fbm3(params.windX * 2, y * 8 - params.time * 1.2, params.windY * 2) - 0.5;
  ax += params.windX * bend * 0.14 + eddy * 0.018 * params.turbulence * y01;
  az += params.windY * bend * 0.1 + eddy * 0.012 * params.turbulence * y01;

  return [ax, az];
}

/** Map unit-sphere direction to rest flame envelope (teardrop, sphere topology). */
export function restFlamePoint(
  dx: number,
  dy: number,
  dz: number,
  flameHeight: number
): [number, number, number, number] {
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;

  const phi = Math.acos(Math.max(-1, Math.min(1, uy)));
  const theta = Math.atan2(uz, ux);
  const y01 = 1 - phi / Math.PI;
  const yCurve = Math.pow(y01, FLAME_HEIGHT_EXP);

  const py = FLAME_BASE + yCurve * flameHeight;
  const width = flameEnvelopeWidth(y01);
  const ring = Math.sin(phi);

  return [Math.cos(theta) * ring * width, py, Math.sin(theta) * ring * width, y01];
}

/** Normalized height 0 (wick) → 1 (tip). */
export const FLAME_HEIGHT_EXP = 0.82;

export function flameHeightAt(y01: number, flameHeight: number): number {
  return FLAME_BASE + Math.pow(y01, FLAME_HEIGHT_EXP) * flameHeight;
}

export function y01FromHeight(y: number, flameHeight: number): number {
  return Math.max(
    0,
    Math.min(1, Math.pow(Math.max(0, y - FLAME_BASE) / flameHeight, 1 / FLAME_HEIGHT_EXP))
  );
}

/** Pin turbulence/wind near the wick so the base stays a round cap. */
export function basePinWeight(y01: number): number {
  const t = Math.max(0, Math.min(1, y01));
  return Math.pow(Math.min(1, t / 0.14), 1.6);
}

/** Candle flame silhouette — narrow wick, modest bulge ~30% up, clear taper to tip. */
export function flameEnvelopeWidth(y01: number): number {
  const t = Math.max(0, Math.min(1, y01));
  const footOpen = Math.sin(Math.min(1, t / 0.11) * Math.PI * 0.5);
  const wick = Math.pow(Math.min(1, t / 0.06), 0.45);
  const tip = Math.pow(1 - t, 0.82);
  const belly = Math.exp(-Math.pow((t - 0.3) / 0.28, 2));
  return (0.002 + 0.034 * wick * tip * (0.34 + 0.66 * belly)) * footOpen;
}

/** Radial distance in the local plume cross-section (symmetric around the bent axis). */
export function flameLocalRadial(y01: number, lx: number, lz: number): number {
  const width = flameEnvelopeWidth(y01);
  return Math.min(1, Math.hypot(lx, lz) / Math.max(width, 0.0001));
}

export function simDisplacement(
  lx: number,
  ly: number,
  lz: number,
  y01: number,
  params: PlumeParams
): [number, number, number] {
  const r = Math.hypot(lx, lz) || 0.0001;
  const nx = lx / r;
  const nz = lz / r;

  const rising = params.time * (1.4 + params.turbulence * 0.6);
  const turb =
    fbm3(lx * 14 + rising * 0.22, (ly - FLAME_BASE) * 18 - rising * 0.55, lz * 14 + rising * 0.18) -
    0.5;

  const breathe = turb * 0.014 * y01 * params.turbulence;
  const dy = turb * 0.006 * params.turbulence * (0.3 + y01);
  const pin = basePinWeight(y01);

  if (params.windStrength <= 0) {
    return [nx * breathe * pin, dy * pin, nz * breathe * pin];
  }

  const scale = params.windStrength;
  // Subtle turbulence flutter — keep this modest so the main wind
  // character comes from plumeAnchor's smooth axis bend, not per-vertex noise.
  const dx = turb * 0.05 * params.turbulence * y01 * scale;
  const dz = turb * 0.04 * params.turbulence * y01 * scale;
  // Directional lean push so windX/windY also affect vertex displacement directly.
  const ySq = y01 * y01;
  const pushX = params.windX * 0.04 * ySq * scale * pin;
  const pushZ = params.windY * 0.03 * ySq * scale * pin;

  return [(dx + pushX + nx * breathe) * pin, dy * pin, (dz + pushZ + nz * breathe) * pin];
}

export function flameRadial01(
  y01: number,
  x: number,
  y: number,
  z: number,
  params: PlumeParams
): number {
  const [ax, az] = plumeAnchor(y, params);
  const r = Math.hypot(x - ax, z - az);
  const width = flameEnvelopeWidth(y01);
  return Math.min(1, r / Math.max(width, 0.0001));
}

/** @deprecated Use flameLocalRadial — kept for tests/docs references. */
export function flameRadialRest(y01: number, x: number, y: number, z: number): number {
  const r = Math.hypot(x - wickCurveX(y), z);
  const width = flameEnvelopeWidth(y01);
  return Math.min(1, r / Math.max(width, 0.0001));
}
