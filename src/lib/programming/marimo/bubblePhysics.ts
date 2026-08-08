/**
 * How an air bubble behaves in water, as a function of its radius alone.
 *
 * A bubble is not a rising dot. Everything you recognise about one — how fast
 * it goes, whether it wobbles, whether it is round — falls out of its size, and
 * the relationships are steep enough that a jar full of bubbles of different
 * sizes looks alive without any per-bubble authoring. The formulas here are the
 * standard ones for air in clean water; only the tempo is stylised, and that is
 * a single scalar at the bottom of the file.
 */

/** Gravity, m/s². */
const G = 9.81;
/** Kinematic viscosity of water at room temperature, m²/s. */
const NU = 1.0e-6;
/** Surface tension of a clean air/water interface, N/m. */
const SIGMA = 0.072;
/** Density difference across the interface, kg/m³. Air is ~0 next to water. */
const DELTA_RHO = 1000;

/**
 * Terminal rise speed in still water, m/s, before the scene's tempo scaling.
 *
 * Two regimes, blended harmonically. Below about 0.1 mm the bubble is a Stokes
 * sphere and speed goes as r², which is why the smallest fizz seems to hang
 * almost still. Above about 1 mm inertia and deformation take over and the
 * speed plateaus near 0.23 m/s no matter how big the bubble gets — a 3 mm
 * bubble does not rise three times faster than a 1 mm one, it rises the same.
 *
 * The harmonic blend `1/(1/a + 1/b)` reproduces both ends and the turnover
 * between them to within the spread of published measurements, which is wider
 * than the error of the fit: real rise speeds depend on how clean the water is,
 * because surfactants immobilise the interface and slow a bubble by up to half.
 */
export function terminalRiseSpeed(radiusM: number): number {
  const r = Math.max(0, radiusM);
  const stokes = (2 * G * r * r) / (9 * NU);
  const capped = 0.235;
  if (stokes <= 0) return 0;
  return 1 / (1 / stokes + 1 / capped);
}

/**
 * Eötvös number: buoyancy over surface tension, on the bubble's own diameter.
 * Below 1 surface tension wins and the bubble is a sphere; above it, it is not.
 */
export function eotvos(radiusM: number): number {
  const d = 2 * Math.max(0, radiusM);
  return (G * DELTA_RHO * d * d) / SIGMA;
}

/**
 * Aspect ratio of the bubble: vertical extent over horizontal, so 1 is a
 * sphere and anything less is the oblate lens a real bubble flattens into as
 * it rises. Wellek's correlation, which is the one everybody uses.
 *
 * The visible consequence: sub-millimetre fizz is perfectly round, and the few
 * big bubbles read as flattened discs seen edge-on. Rendering every bubble as a
 * sphere is the single most obvious tell that they are sprites.
 */
export function aspectRatio(radiusM: number): number {
  return 1 / (1 + 0.163 * Math.pow(eotvos(radiusM), 0.757));
}

/**
 * Path wobble: the radius of the helix a bubble spirals along as it rises, in
 * metres, before tempo scaling.
 *
 * Small bubbles go straight up. Past roughly 0.7 mm radius the wake behind the
 * bubble stops being symmetric and starts shedding vortices, and the bubble
 * begins to zigzag or spiral — that instability is why a stream of bubbles
 * fans out on the way up instead of staying in a line. Amplitude grows with
 * size and then saturates around a bubble radius' worth of sideways travel.
 */
export function wobbleRadius(radiusM: number): number {
  const onset = 0.0007;
  if (radiusM <= onset) return 0;
  const t = Math.min(1, (radiusM - onset) / 0.0009);
  return radiusM * 0.75 * t * t;
}

/**
 * Angular frequency of that spiral, rad/s, before tempo scaling.
 *
 * The spiral is driven by the bubble's own wake shedding, so the frequency is
 * a Strouhal relation on the rise speed and the diameter rather than anything
 * to do with the bubble's surface. Since speed has already plateaued by the
 * time wobble starts, that makes the frequency fall as the bubble gets bigger:
 * a 1.5 mm bubble loops about four times a second, a 0.8 mm one about six.
 * (The much faster capillary ringing of the *shape*, at a hundred-odd hertz for
 * a millimetre bubble, is far too quick to see and is not modelled.)
 */
export function wobbleOmega(radiusM: number): number {
  const r = Math.max(1e-5, radiusM);
  const strouhal = 0.05;
  return (2 * Math.PI * strouhal * terminalRiseSpeed(r)) / (2 * r);
}

/**
 * How much slower this jar runs than the real world.
 *
 * A real 1 mm bubble crosses this 8 cm water column in a third of a second.
 * That is correct and it is unwatchable: the fizz would register as a flicker
 * rather than as bubbles, and the whole point of a marimo jar is that you can
 * watch it. Everything derived from the physics above is scaled by this one
 * number, so the *relationships* between sizes stay honest — a big bubble still
 * outruns a small one by the right factor, still wobbles the right number of
 * times per centimetre climbed — while the whole system plays at a sixth speed.
 */
export const BUBBLE_TIME_SCALE = 0.15;

/** Rise speed as actually used by the scene, m/s. */
export function riseSpeed(radiusM: number): number {
  return terminalRiseSpeed(radiusM) * BUBBLE_TIME_SCALE;
}

/** Spiral angular frequency as actually used by the scene, rad/s. */
export function spiralOmega(radiusM: number): number {
  return wobbleOmega(radiusM) * BUBBLE_TIME_SCALE;
}

/** Smallest and largest bubble the marimo lets go of, in metres of radius. */
export const BUBBLE_MIN_RADIUS = 0.00026;
export const BUBBLE_MAX_RADIUS = 0.00135;

/**
 * Bubble radius for a new bubble, from a uniform sample.
 *
 * Cubed, so most bubbles come out near the bottom of the range and the big
 * ones are rare. Photosynthetic bubbling is a lot of pinheads and the
 * occasional fat one that shoulders past them, not an even spread.
 *
 * Note that this is the radius the bubble *leaves* at, not the one it starts
 * at: a bubble is pinned to the filament it grew on until buoyancy can tear
 * the contact line free, so its departure size is a property of the site it
 * nucleated on, fixed before the bubble is anything at all.
 */
export function sampleRadius(u: number): number {
  const t = Math.min(1, Math.max(0, u)) ** 3;
  return BUBBLE_MIN_RADIUS + (BUBBLE_MAX_RADIUS - BUBBLE_MIN_RADIUS) * t;
}

// ------------------------------------------------------------------ clinging
//
// Oxygen does not appear in the water as a bubble. It comes out of a single
// point on a single filament, and it stays there — pinned by the contact line,
// swelling — until buoyancy finally wins and it lets go. On a real marimo that
// is most of a bubble's life; the rise is the short part. A jar where bubbles
// wink into existence already free is a jar of sprites, and the giveaway is
// that nothing ever *waits*.

/**
 * How long a bubble hangs on before it detaches, in seconds.
 *
 * Physically the residence time is a filling time: gas arrives at one site at a
 * roughly steady rate, and the bubble must reach a fixed departure volume, so
 * the time goes as the *cube* of the departure radius. Honestly cubed, the fat
 * bubbles in this jar would sit for four minutes apiece — true, and the same
 * kind of unwatchable as the real rise speed a few lines up. The exponent is
 * compressed to 1.35 so the whole range fits in a couple of seconds to half a
 * minute while big bubbles still visibly outwait small ones.
 *
 * `u` is a uniform sample: two sites of the same size do not run at the same
 * rate, because the filament under them is not the same filament.
 */
export const BUBBLE_CLING_BASE_SEC = 1.8;
const CLING_EXPONENT = 1.35;

export function clingDuration(radiusM: number, u: number): number {
  const r = Math.max(BUBBLE_MIN_RADIUS, radiusM);
  const base = BUBBLE_CLING_BASE_SEC * Math.pow(r / BUBBLE_MIN_RADIUS, CLING_EXPONENT);
  const jitter = 0.6 + 0.8 * Math.min(1, Math.max(0, u));
  return base * jitter;
}

/**
 * The volume a bubble is already at the moment it becomes visible, as a
 * fraction of its departure volume. Below this it is a speck on a hair and
 * nothing rendered at this scale would resolve it.
 */
const SEED_VOLUME_FRACTION = 0.03;

/**
 * Radius of a bubble that is still attached, part-way through its wait.
 *
 * Steady gas flux means *volume* is what grows linearly, so the radius grows as
 * the cube root of elapsed time: a bubble pops into view at a third of its
 * final size within a moment and then spends the rest of its wait easing the
 * last of the way. That deceleration is the recognisable part — a bubble on a
 * leaf swells fast, then seems to stop, then goes.
 */
export function attachedRadius(
  targetRadiusM: number,
  elapsedSec: number,
  durationSec: number
): number {
  if (!(durationSec > 0)) return targetRadiusM;
  const t = Math.min(1, Math.max(0, elapsedSec / durationSec));
  return targetRadiusM * Math.cbrt(Math.max(SEED_VOLUME_FRACTION, t));
}

/**
 * Speed through the water, m/s, below which nothing is torn off.
 *
 * Deliberately above the marimo's own buoyant glide: a ball drifting up or down
 * at terminal velocity is not being stripped, it is being *carried* — the
 * boundary layer goes with it and so does everything stuck in it. What loses
 * bubbles is being moved faster than the water can follow, which in this jar
 * means a hand on it or a stirred-up current running past it.
 */
export const BUBBLE_SHEAR_THRESHOLD = 0.11;

/** How readily slip above the threshold tears bubbles off, per (m/s)·s. */
const SLIP_RATE = 18;

/**
 * Probability that one clinging bubble of this radius is torn off during `dt`
 * by the marimo slipping through the water at `slipSpeed`.
 *
 * Drag on the exposed cap grows as the cap's area, while the contact line
 * holding the bubble on grows only as its edge — so the big ones go first, and
 * that ordering is free rather than authored. Poisson rather than a threshold,
 * so a shove releases a burst that thins out rather than a rank of bubbles
 * leaving in lockstep.
 *
 * This is not the only way a bubble comes off a moving marimo, and it is not
 * even the usual one: mostly the ball simply turns, and the site the bubble is
 * pinned to ends up underneath. That one is geometry, not a rate, and it lives
 * with the seating code.
 */
export function releaseChance(radiusM: number, slipSpeed: number, dt: number): number {
  if (dt <= 0) return 0;
  const size = Math.max(BUBBLE_MIN_RADIUS, radiusM) / BUBBLE_MIN_RADIUS;
  const rate = Math.max(0, slipSpeed - BUBBLE_SHEAR_THRESHOLD) * SLIP_RATE * size;
  if (rate <= 0) return 0;
  return 1 - Math.exp(-rate * dt);
}

// ------------------------------------------------------------------ break-up
//
// A bubble hit hard enough comes apart. Real break-up is driven by shear — a
// bubble stretched by a velocity gradient past a critical Weber number necks
// and splits in the wake of something — and nothing in a jar this quiet gets
// anywhere near that. So this is the one event here that only happens because
// somebody made it happen: the poke supplies the work, and everything after it
// is ordinary physics again.

/**
 * How many fragments a bubble comes apart into.
 *
 * Four, because four is the largest set of directions that can be spread
 * perfectly evenly over a sphere — the vertices of a regular tetrahedron — and
 * because those four vectors sum to zero. Nothing pushed the bubble sideways,
 * so nothing may leave sideways: the fragments carry away no net momentum, and
 * that falls out of the arrangement rather than being enforced afterwards.
 */
export const FRAGMENT_COUNT = 4;

/**
 * Radius of each fragment. The gas is conserved, so it is the *volume* that
 * divides and the radius that goes as the cube root: four fragments are 63% of
 * the parent across, not a quarter.
 *
 * Their combined surface area, meanwhile, goes *up* by that same cube root —
 * 1.59× — and that is exactly why this never happens on its own. Splitting a
 * bubble has to buy new surface; a bubble left alone spends its whole life
 * doing the opposite, which is why two that touch merge and one never divides.
 */
export function fragmentRadius(parentRadiusM: number, count = FRAGMENT_COUNT): number {
  return parentRadiusM / Math.cbrt(Math.max(1, count));
}

/**
 * Smallest bubble worth poking, in metres of radius.
 *
 * The new surface costs σ·ΔA, so the energy a break-up demands falls with the
 * square of the radius while the poke on offer is however hard the poke is:
 * below some size the poke cannot pay, and the bubble simply rides it out.
 * That is a real threshold and not a rule of the game.
 *
 * The number is picked well above the point where the physics would give out,
 * for two reasons that happen to agree. Only the top fifth or so of the fizz
 * clears it, which makes a breakable bubble something you notice rather than
 * something everywhere; and a fragment can only be broken again if its parent
 * was near the very largest the marimo makes, which is what stops a jar of a
 * hundred-odd bubbles being clicked into thousands. It also lands close to
 * where a bubble stops being big enough on screen to aim at, so nothing that
 * looks poke-able declines to be poked.
 */
export const BUBBLE_POP_MIN_RADIUS = 0.0008;

/** Whether a bubble this size can be broken at all. */
export function canFragment(radiusM: number): boolean {
  return radiusM >= BUBBLE_POP_MIN_RADIUS;
}

/**
 * How much slower a break-up plays than a rise.
 *
 * The two are nowhere near the same speed. A millimetre bubble takes a third of
 * a second to cross this jar and about six milliseconds to come apart, so the
 * tempo that makes the rise watchable (`BUBBLE_TIME_SCALE`, an order of
 * magnitude up from here) leaves the break-up as a single frame in which four
 * bubbles are abruptly there. Slowed the extra decade, the fragments visibly
 * shoulder away from each other and settle.
 *
 * Nothing is lost by doing this. A distance is a distance however long you take
 * over it, so the fragments still end up spread by exactly what the physics
 * below says they should — only the getting there is stretched.
 */
export const FRAGMENT_TIME_SCALE = 0.04;

/**
 * How hard the poke is, in units of "hard enough to break it". The one liberty
 * in this section, and it is a gain on the hand rather than on the water.
 */
const POKE_STRENGTH = 1.6;

/**
 * Speed the fragments leave at, m/s.
 *
 * The only velocity a surface-tension-driven break-up has to offer is the
 * capillary speed √(σ/ρR) — the same scale that caps a rising bubble near
 * 0.23 m/s, and for the same reason.
 */
export function fragmentSpeed(parentRadiusM: number): number {
  const r = Math.max(1e-6, parentRadiusM);
  return POKE_STRENGTH * Math.sqrt(SIGMA / (DELTA_RHO * r)) * FRAGMENT_TIME_SCALE;
}

/**
 * Rate at which that speed dies away, 1/s — the reciprocal of the capillary
 * time √(ρR³/σ), on the jar's break-up tempo.
 *
 * Speed and duration come from the same place, and their product is exactly R:
 * √(σ/ρR) · √(ρR³/σ) = R. So the fragments of a bubble spread by about one
 * parent radius and then stop, with no free parameter anywhere in it. The cloud
 * is the size of the bubble it came from, whatever size that was, and a poke at
 * a big bubble scatters wider than a poke at a small one without being told to.
 */
export function fragmentDecay(parentRadiusM: number): number {
  const r = Math.max(1e-6, parentRadiusM);
  const capillaryTime = Math.sqrt((DELTA_RHO * r * r * r) / SIGMA);
  return FRAGMENT_TIME_SCALE / capillaryTime;
}
