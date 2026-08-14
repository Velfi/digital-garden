import { BOX_HALF_X, BOX_HALF_Z, BOX_HEIGHT, FLOOR_Y } from './constants';
import { stoneExtents, stoneSurface, type Stone } from '../marimo/stones';

/**
 * A rock as the solver needs it: the marimo generator's pure shape, laid at
 * a point and turned about Y. Yaw only — a stone laid on the moss is turned,
 * never tipped, and one angle keeps the world-to-stone transform to a 2×2.
 */
export interface SolverRock {
  x: number;
  y: number;
  z: number;
  yaw: number;
  stone: Stone;
}

/**
 * The slime as position-based particles: the Flex recipe at pet scale.
 *
 * This replaces the MLS-MPM continuum (see PARTICLE_PHYSICS.md for the full
 * method menu). MPM's material was honest but its stiffness was CFL-bound —
 * at dt=1/800 the body could never be firmer than ~3.2 kPa, and the pet read
 * gloopy no matter how the yield was tuned. Position-based dynamics inverts
 * that trade: stiffness is a projection strength, unconditionally stable at
 * any value, so the body can be exactly as firm as the orb verdict wants
 * ("an orb like a water balloon" — squashes under a press, springs back
 * with a jiggle, holds no dents), at a third of the substep rate.
 *
 * The body is ~1,000 particles under three influences per substep:
 *
 * - **Pairwise projections.** Particles closer than the rest spacing are
 *   pushed apart (incompressibility that cannot be fooled — the grid-density
 *   lesson, in position form) and particles within twice the rest spacing
 *   are gently pulled together (cohesion: the body holds itself, strays
 *   re-merge, lifting it doesn't pull taffy).
 * - **Shape-matching clusters.** Overlapping neighbourhoods each remember a
 *   rest configuration and blend their particles toward the best-fit rigid
 *   pose of it (Müller '05, with the warm-started trig-free rotation
 *   extraction kept from the MPM engine). The remembered shape is the ball
 *   — the "balloon skin": memory is long (FADE_TAU) and yield engages only
 *   under violent rearrangement, at which point clusters also re-seed from
 *   the flesh around them so the memory recrystallises around whatever the
 *   body has become. Flip-invariance is free: a ball is a ball upside
 *   down.
 * - **The creature terms.** Tone (the horizontal corral), the cling while
 *   held, the lure's lean, and the hand's velocity targets are carried over
 *   from the MPM engine verbatim — they were tuned against playtests and
 *   are the pet's settled feel, independent of the material model under
 *   them. All are bounded velocity blends: no gesture or drive can shred
 *   or NaN the body, by construction.
 *
 * Velocities are derived from positions (v = (x − x_prev)/dt), so every
 * projection is implicitly damped — composure — and an XSPH pass smooths
 * what remains so the pile never fizzes.
 *
 * Hard-won invariant, learned four different ways in one afternoon: every
 * *internal* stage (pairs, shape matching, idle tone) must be exactly
 * momentum-neutral, because any per-particle normalisation quietly breaks
 * Newton's third law and the residual walks the body across the tank
 * forever. External forces (gravity, floor, the hand, a luring corral)
 * are the only things allowed to translate the pet.
 */

// ------------------------------------------------------------------- tuning

/** Substep, seconds. No CFL here — this is simply the rate at which the
 * solver converges nicely with two iterations; the scene's 120 Hz step
 * always lands a whole number of substeps. */
export const PBD_DT = 1 / 240;
/** Pair-projection sweeps per substep. Jacobi-style (see below), which
 * converges slower than Gauss–Seidel — hence three. */
const SOLVER_ITERS = 3;
/** Jacobi over-relaxation on the averaged correction. */
const SOLVER_OMEGA = 1.5;

/** Equilibrium particle spacing, metres — cbrt(body volume / count). */
const REST_SPACING = 0.0026;
/** Cohesion reach; also the neighbour-search radius. */
const COHESION_RADIUS = REST_SPACING * 2;
/** Fraction of an overlap corrected per sweep. Deliberately soft: hard
 * corrections at 2.6 mm spacing turn into 0.3 m/s velocity spikes when the
 * positions are differentiated, and the pile rings instead of resting. */
const CONTACT_K = 0.5;
/** Fraction of the gap to rest spacing closed per sweep for particles in
 * the cohesion shell. Tiny, and the shell is short (see COHESION_REACH):
 * the shell holds ~7× more pairs than contact range does, so cohesion at
 * a felt strength over-compresses the pile until the contact skin cannot
 * push back — the first cut crushed the body to a 2 mm film this way. */
const COHESION_K = 0.02;
/** Cohesion acts from rest spacing out to this multiple of it. */
const COHESION_REACH = REST_SPACING * 1.5;
/**
 * Density pressure: the collective-compression guard. Pair contacts under
 * Jacobi averaging resolve micro-overlaps but a *pile* can still pack
 * denser under sustained load — the crown sank ~0.15 mm/s forever as the
 * fade ate the elastic support. This term measures per-particle density
 * from the pair kernel and pushes down the over-density gradient, exactly
 * the role MPM's grid pressure played: incompressibility that cannot be
 * fooled, and the thing that turns a gathered footprint into a rising
 * mound. Pairwise-symmetric, so it cannot create momentum.
 */
const DENSITY_PUSH = 0.5;
/** Measured interior density reads above the all-particle mean (surface
 * dilution); rest density is the mean scaled by this. */
const DENSITY_REST_SCALE = 1.0;

/** XSPH velocity smoothing, per unit of pair weight: v_i gains
 * k·w·(v_j − v_i) from each neighbour, and v_j the opposite — the
 * *pairwise* form, because the blend-toward-my-neighbourhood-mean form
 * normalises per particle, doesn't conserve momentum, and steadily pushed
 * a lopsided body across the floor. At a typical interior weight-sum of
 * ~15 this matches the old 0.45 blend. Goo is viscous; this is the main
 * dissipation the solver has. */
const XSPH_K = 0.03;

/**
 * Shape-matching drive, 1/s: the elasticity knob, and the single biggest
 * feel knob. Higher = firmer, springier, faster to re-round; the projection
 * is stable at any value, which is the whole point of the pivot.
 */
const SM_RATE = 130;
/** Elastic memory melts toward the present on this clock. Long — the orb's
 * ball shape is its identity (the balloon skin), not a pose it happens to
 * hold; the fade only lets truly persistent circumstances (a long pin, a
 * dry sag) soak in. */
const FADE_TAU_SEC = 45;
/** Cluster strain (RMS goal miss / cluster radius) beyond which the rest
 * shape creeps toward the present. High on purpose: a water balloon does
 * not hold dents — only violent rearrangement (the shake battery, a hard
 * carry) reshapes the memory, and the fade + rebuilds absorb the rest. */
const YIELD_STRAIN = 0.45;
/** Creep rate past the yield, 1/s per unit of excess strain. Gentle: the
 * first cut used 30 and the settle transient alone dissolved the memory
 * into a permanent puddle within a second. */
const PLASTIC_RATE = 8;

/** Cluster seeding lattice and capture radius. Cluster radius is the
 * body's rigidity length scale — global stiffness falls off with
 * (radius / body size), and 7.5 mm clusters let a 21 mm droplet pancake
 * while every cluster stayed politely sub-yield. 11 mm holds the body. */
const CLUSTER_SPACING = 0.009;
const CLUSTER_RADIUS = 0.011;
const MAX_MEMBERS = 384;
const MIN_MEMBERS = 10;
/** Every cluster gets a re-seed *opportunity* on this cycle (staggered
 * round-robin), so memory follows the material it is actually embedded in
 * rather than a membership list from spawn. */
const REBUILD_PERIOD_SEC = 6;
/** …but a rebuild only happens when the cluster is genuinely rearranged
 * (strain above this) or starved of members. Rebuilding is topology
 * repair, not routine — an unconditional rebuild re-adopts gravity's
 * latest sag every cycle and the mound melts ~0.4 mm/s forever. */
const REBUILD_STRAIN = 0.5;

// The creature terms, carried from the MPM engine unchanged — see the long
// comments there (preserved in git) and in the project notes: tone is a
// horizontal-only corral shaped as a bounded velocity target; the cling is
// its 3D sibling centred on the grip; the lure leans the corral's centre.
const TONE_CORRAL_RADIUS = 0.014;
const TONE_VSLOPE = 4;
const TONE_VMAX = 0.09;
const TONE_RATE = 260;
const LURE_LEAN = 0.009;
/** Fraction of the corral's creep applied as a *positional* nudge after
 * shape matching. The velocity-level corral alone loses the rim war here:
 * shape matching restores a third of every inward step toward the
 * remembered (wider) footprint, so the skirt spread ~1 mm/s forever and a
 * flipped body never re-mounded. Position applied post-SM gets the last
 * word each substep, and the fade consolidates its gains. Bounded by
 * creep·dt (≤0.4 mm per substep) — still goo pace, still shred-proof. */
const TONE_POS_SHARE = 0.8;

/**
 * Grip-haul up a rock, m/s. When the lure sits on a rock's footprint the
 * body has been asked to climb it, and the corral's lean alone cannot do
 * it: the probe showed the mound heaping against the flank and stalling —
 * a centroid drive has no purchase on "up". So particles in contact with
 * that rock walk themselves up-slope along its surface, the way the damp
 * goo grips moss. The direction is the surface tangent with the most
 * vertical in it, which goes to zero at the apex by construction — the
 * haul is self-limiting, and a perched body simply stops climbing.
 * Positional, applied in the clamp (so velocities inherit it), and only
 * on contact: no contact, no grip, no haul — a body knocked off a rock
 * falls like anything else.
 */
const ROCK_HAUL = 0.1;
/**
 * How far off the rock's surface the grip still holds, metres. Strict
 * contact is one particle thin — the probe watched that single layer ratchet
 * up the flank while cohesion to the heap swallowed its gains. A skin about
 * one particle spacing deep lets the whole wetted flank haul, which is also
 * the honest picture: it is the goo against the rock that grips, not a
 * mathematical surface.
 */
const ROCK_GRIP_SKIN = 0.003;

// The hop: an excited pet pops off the floor — mouse-popcorn. One shot of
// upward velocity across the whole body, applied only while it is actually
// standing on something (a mid-air request fizzles; no double jumps). The
// goo pays a stretch tax on launch — the skirt lags the mound — so the cap
// is set by measurement, not v²/2g: at 0.7 the whole body clears the floor
// by roughly half a centimetre. A short startled hop, not a leap at the lid.
const HOP_UP_MAX = 0.7;
const HOP_DRIFT_MAX = 0.12;
/** How close to the floor a particle must sit to count as standing, m. */
const HOP_GROUND_BAND = 0.004;
/** Fraction of the body that must be standing for the hop to fire. */
const HOP_GROUND_FRACTION = 0.1;

const CLING_RADIUS = 0.01;
const CLING_VSLOPE = 3;
const CLING_VMAX = 0.13;
const CLING_RATE = 60;

// The feeding pseudopod (see setTendril): a small attractor the scene aims
// at a meal. Particles inside its reach creep toward the tip, cling-style —
// a bounded velocity target, so no aim can shred — and the skin wraps the
// resulting stream into a visible gooey tongue. The tongue is an *internal*
// gesture: whatever net horizontal impulse it hands its particles is
// refunded to the rest of the body each substep, so reaching for an oat can
// never become the walking-body bug wearing a bib.
// Reach is a tongue's width, not a body's: at 28 mm the attractor captured
// most of the 16 mm-radius body and walked the whole slime to the flake —
// the "oat walks to the slime" bug, mirrored. At 12 mm it still slid the
// bulk 23 mm down its own shaft. A slim tongue plus the core exclusion
// below is what finally separates reach from walk.
const TENDRIL_REACH = 0.006;
/** Particles this close to the body's centroid (horizontally) are the
 * reservoir, never the tongue: the drives skip them, and cohesion refills
 * the tongue from the core at goo pace. Without this the capsule through
 * the body pulled the bulk tipward and the mound walked. */
const TENDRIL_CORE_RADIUS = 0.007;
const TENDRIL_VSLOPE = 25;
const TENDRIL_VMAX = 0.16;
const TENDRIL_RATE = 40;
/** How fast the solver's own tip walks toward the caller's target, m/s.
 * The caller aims; the solver paces. A clock-driven tip outran the goo in
 * the probe (captured 388 → 0 in a quarter second, and a tip beyond reach
 * can never recapture), so the tip advances only while material is still
 * on it, and backtracks to the goo when the tongue thins. */
const TENDRIL_TIP_SPEED = 0.014;
/** The tip advances while goo sits within this fraction of the reach, and
 * retreats when the nearest material falls beyond it. */
const TENDRIL_HOLD_FRACTION = 0.7;
/**
 * How much of the shape-matching blend is melted away at the tip, 0..1.
 * The orb's memory is what forbids a tongue: yield sits at 5 mm of RMS
 * miss and shape matching restores two-thirds of any offset per substep,
 * so no polite pull ever wins — the probe watched the rim bulge half a
 * millimetre and stall. Captured material is instead excused from the
 * memory while it is on the tongue (goo melts where the body reaches),
 * and the cluster rebuild machinery re-embeds it when the meal is done.
 */
const TENDRIL_MELT = 0.92;
/**
 * The largest fraction of the body allowed on the tongue. Without a limit
 * the conveyor kept feeding after the tip arrived, and the body migrated
 * down its own tongue onto the flake (the probe watched the centroid slide
 * 40 mm). Past this load the drives throttle in proportion, so the tongue
 * holds its shape and the mound stays where it is.
 */
const TENDRIL_MAX_LOAD = 0.07;

/** The poke's velocity injection rate, 1/s — the splash of a poke. Kept
 * modest: velocity injected into a position-based solve is ~95% restored
 * within the same substep, so this term can't dent, only ripple. */
const PUSH_RATE = 120;
/** The poke's *positional* displacement share: the finger displaces goo
 * at its commanded speed, applied after shape matching so restoration
 * lags a substep behind and a sustained press holds a real dent — the
 * velocity form alone left a 0.05 mm dent from a 0.12 m/s press. */
const PUSH_POS = 1.0;

/** Particle speed cap, m/s. Goo never sprints — and in a 12 cm tank a
 * runaway at 1.2 m/s is a ricochet, so the cap sits just above the hand's
 * own 0.6 m/s command ceiling. */
const SPEED_CAP = 0.8;

/**
 * Rolling resistance, 1/s: an orb's shape matching is rotation-degenerate
 * (spinning a remembered sphere costs nothing), and floor friction cannot
 * oppose rolling-without-slipping — the ball toured the tank in slow
 * curves. Each substep the body's rigid-rotation component (ω from angular
 * momentum about the centroid) is bled off at this rate while the hand is
 * idle. A water balloon sloshes its rotation dead the same way. Non-rigid
 * wobble is untouched; net linear momentum is exactly zero.
 */
const ROLL_DAMP_RATE = 12;
/**
 * Idle drift brake, 1/s: with no hand and no lure, the body's mean
 * horizontal velocity is bled off — a 14 g blob on grippy cork does not
 * coast. This is the last word on the walking-body bug family: whatever
 * residual asymmetry the solver stack carries, an idle pet stays put.
 * The lure's crawl and the hand's carries are exempt.
 */
const IDLE_BRAKE_RATE = 6;

/** Tangential velocity kept per substep while touching the floor / a wall.
 * The floor is cork: grippy, dead. */
const FLOOR_KEEP = 0.25;
const WALL_KEEP = 0.8;

// ------------------------------------------------------------- the play ball
// A toy: one rigid hollow ball the goo can bat around. It is the only
// *dynamic* thing the solver owns besides the body itself, so its physics
// stays deliberately small — gravity, bounces, rolling, and a momentum
// exchange with the particles. Coupling is two-way: particles are projected
// out of the ball (it is solid, like the stone), and the ball receives the
// equal-and-opposite share of every projection scaled by the mass ratio —
// which is exactly what lets a 14 g slime shove a 2 g ball, and what lets
// a rolling ball part the goo instead of ghosting through it.

/** Per-particle mass over ball mass: (0.014 kg / ~950) / ~0.002 kg. */
const BALL_COUPLE = 0.008;
/** Bounce kept off the cork floor / the glass walls / the stone. */
const BALL_FLOOR_REST = 0.35;
const BALL_WALL_REST = 0.55;
const BALL_STONE_REST = 0.4;
/** How fast floor contact converts slide into roll, 1/s. */
const BALL_ROLL_RATE = 14;
/** Rolling resistance on the cork, 1/s — the ball coasts to a stop. */
const BALL_ROLL_DRAG = 0.7;
/** Spin bleed while airborne, 1/s. */
const BALL_SPIN_DRAG = 0.15;
/** The ball never outruns the goo's own speed cap by much. */
const BALL_SPEED_CAP = 0.9;
/** Below these it is asleep: parked, not jittering. */
const BALL_SLEEP_SPEED = 0.004;
const BALL_SLEEP_SPIN = 0.6;

// ------------------------------------------------------- neighbour hashing

const CELL = COHESION_RADIUS;
const GRID_OX = -BOX_HALF_X - CELL;
const GRID_OY = FLOOR_Y - CELL;
const GRID_OZ = -BOX_HALF_Z - CELL;
const GRID_NX = Math.ceil((BOX_HALF_X * 2) / CELL) + 3;
const GRID_NY = Math.ceil(BOX_HEIGHT / CELL) + 3;
const GRID_NZ = Math.ceil((BOX_HALF_Z * 2) / CELL) + 3;
const GRID_CELLS = GRID_NX * GRID_NY * GRID_NZ;

export interface ParticleWorld {
  readonly particleCount: number;
  /** Advance by `dt` seconds (internally substepped at PBD_DT). */
  step(dt: number): void;
  /** World-space particle positions, xyz per particle. */
  readPositions(out: Float32Array): void;
  /** World-space particle velocities, xyz per particle. */
  readVelocities(out: Float32Array): void;
  /**
   * The hand: pull every particle within `radius` of (x,y,z) toward velocity
   * (vx,vy,vz), with strength 0..1. Applied during the next `step` only —
   * call every frame while holding. Bounded by construction: it writes
   * velocities toward a target, never forces, so no gesture can shred.
   */
  pullTowards(
    x: number,
    y: number,
    z: number,
    radius: number,
    vx: number,
    vy: number,
    vz: number,
    strength: number
  ): void;
  /** Push particles away from a point — the poke. Same contract as pull. */
  pushFrom(x: number, y: number, z: number, radius: number, speed: number): void;
  /** Rotate the whole body 180° about the x axis through its centroid — the
   * "set it down upside down" of the probe tests. */
  flipForTest(): void;
  /** Retune the material live (care coupling): stiffness, memory (yield),
   * and tone — the aliveness that re-gathers the body. 1 = the constants. */
  setMaterialScale(stiffness: number, memory: number, tone?: number): void;
  /** Retune the goo live: multipliers on XSPH viscosity, the density
   * pressure push, and the shape-matching drive. 1 = the constants. */
  setTuning(viscosity: number, pressure: number, shape?: number): void;
  /**
   * The will, minimally: bias the tone's gathering centre toward a world
   * point (an oat flake, or a spot worth ambling to). The corral leans a
   * few millimetres toward it, so the whole mound crawls there at goo
   * pace. `urgency` scales the lean — an excited dash or a listless
   * mosey — around 1 = the stock crawl. Cleared with `clearLure`.
   */
  setLure(x: number, z: number, urgency?: number): void;
  clearLure(): void;
  /**
   * The feeding pseudopod: an attractor at a world point that draws nearby
   * particles into a tongue — the scene aims it at a meal and walks the tip
   * out to the flake and back. Persistent until cleared, like the lure.
   * `strength` 0..1 scales the creep; momentum-neutral by construction.
   */
  setTendril(x: number, y: number, z: number, strength: number): void;
  clearTendril(): void;
  /**
   * The popcorn hop: one short excited jump — an upward kick (m/s, capped
   * well inside the speed cap) with an optional small horizontal drift.
   * Fires only if the body is standing on the floor when the next substep
   * runs; a hop asked of an airborne or held body does nothing.
   */
  hop(upSpeed: number, driftX?: number, driftZ?: number): void;
  /**
   * The tank's rocks: static river stones, set at spawn from the browser's
   * tank seed. Each is the marimo generator's pure shape description —
   * `stoneSurface` is the one account of where its skin is, shared with the
   * drawn geometry, so the goo rests on exactly what the visitor sees.
   * Grippy like the floor — mossy cobbles, not wet glass. An empty list
   * clears them.
   */
  setRocks(rocks: readonly SolverRock[]): void;
  /**
   * The toy: drop a rigid ball into the tank at a point (it falls from
   * there), or put it away. One ball at most — this is a pet's toy box,
   * not a ball pit. An initial velocity makes it a throw; the solver's own
   * speed cap applies, so no gesture can turn the toy into a bullet.
   */
  setBall(
    x: number,
    y: number,
    z: number,
    radius: number,
    vx?: number,
    vy?: number,
    vz?: number
  ): void;
  clearBall(): void;
  /**
   * Boot the ball: add a velocity to whatever it is doing — the "click it
   * and it bounces away" of the scene. Capped by the ball's own speed cap;
   * a no-op with no ball out.
   */
  kickBall(vx: number, vy: number, vz: number): void;
  /**
   * The ball's pose — position xyz + orientation quaternion xyzw, seven
   * floats into `out`. Returns false (and writes nothing) with no ball out.
   */
  readBall(out: Float32Array): boolean;
  /**
   * Mean position of the particles within `radius` of a point, written into
   * `out` (xyz); returns how many there were. The hand's tether — it must
   * never command material it is no longer touching.
   */
  sampleAround(x: number, y: number, z: number, radius: number, out: Float32Array): number;
}

// Seeded on a jittered grid through a ball — the pet is an orb, a water
// balloon at rest: nearly spherical, flattened only where it meets the
// floor (user mandate: "an orb like a water balloon", "right now it's a
// gumdrop instead of an orb" — the slumped-droplet spawn is retired).
// A jittered lattice (not rejection sampling) starts the body near its
// equilibrium packing, so the first seconds are a settle, not a
// decompression. The jitter is small: seed asymmetry was the seed of the
// walking bug.
//
// Exported (deterministic, cheap) so the main thread can know the particle
// count and hand out honest first-frame positions while the solver lives in
// a worker that has not spoken yet.
export function buildSeedPositions(): Float32Array {
  const seedPositions: number[] = [];
  /** Ball radius for the ~17 cm³ body. */
  const R0 = 0.0159;
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // The lattice is symmetric about the origin in every axis — an
  // asymmetric span seeds a centroid offset the settle then amplifies.
  const half = Math.floor(R0 / REST_SPACING);
  for (let ky = -half; ky <= half; ky++) {
    const y = ky * REST_SPACING;
    const rAt = Math.sqrt(Math.max(0, R0 * R0 - y * y));
    for (let kx = -half; kx <= half; kx++) {
      for (let kz = -half; kz <= half; kz++) {
        const jx = kx * REST_SPACING + (rand() - 0.5) * REST_SPACING * 0.25;
        const jz = kz * REST_SPACING + (rand() - 0.5) * REST_SPACING * 0.25;
        if (jx * jx + jz * jz < rAt * rAt) {
          seedPositions.push(jx, FLOOR_Y + 0.0005 + R0 + y, jz);
        }
      }
    }
  }
  return Float32Array.from(seedPositions);
}

export function createPbdWorld(): ParticleWorld {
  // ----------------------------------------------------------- particles
  const seedPositions = buildSeedPositions();
  const count = seedPositions.length / 3;

  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    px[i] = seedPositions[i * 3];
    py[i] = seedPositions[i * 3 + 1];
    pz[i] = seedPositions[i * 3 + 2];
  }
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const vz = new Float32Array(count);
  const prevX = new Float32Array(count);
  const prevY = new Float32Array(count);
  const prevZ = new Float32Array(count);
  /** Contact flags per particle, set by the box clamp: 1 floor, 2 wall. */
  const contact = new Uint8Array(count);

  // ------------------------------------------------------------ clusters
  // Flat fixed-stride storage so a cluster can rebuild in place.
  const clusterSeeds: number[] = [];
  {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      minX = Math.min(minX, px[i]);
      maxX = Math.max(maxX, px[i]);
      minY = Math.min(minY, py[i]);
      maxY = Math.max(maxY, py[i]);
      minZ = Math.min(minZ, pz[i]);
      maxZ = Math.max(maxZ, pz[i]);
    }
    for (let x = minX; x <= maxX; x += CLUSTER_SPACING) {
      for (let y = minY; y <= maxY; y += CLUSTER_SPACING) {
        for (let z = minZ; z <= maxZ; z += CLUSTER_SPACING) {
          let n = 0;
          const r2 = CLUSTER_RADIUS * CLUSTER_RADIUS;
          for (let i = 0; i < count && n < MIN_MEMBERS; i++) {
            const dx = px[i] - x;
            const dy = py[i] - y;
            const dz = pz[i] - z;
            if (dx * dx + dy * dy + dz * dz < r2) n += 1;
          }
          if (n >= MIN_MEMBERS) clusterSeeds.push(x, y, z);
        }
      }
    }
  }
  const clusterCount = clusterSeeds.length / 3;
  const memberIdx = new Int32Array(clusterCount * MAX_MEMBERS);
  const memberLen = new Int32Array(clusterCount);
  /** Rest offsets from the cluster centroid, per member slot. */
  const restX = new Float32Array(clusterCount * MAX_MEMBERS);
  const restY = new Float32Array(clusterCount * MAX_MEMBERS);
  const restZ = new Float32Array(clusterCount * MAX_MEMBERS);
  /** Warm-started rotation estimate per cluster (w,x,y,z). */
  const clusterQ = new Float32Array(clusterCount * 4);
  /** Last computed centroid per cluster — the rebuild's re-seed point. */
  const clusterCX = new Float32Array(clusterCount);
  const clusterCY = new Float32Array(clusterCount);
  const clusterCZ = new Float32Array(clusterCount);
  /** RMS radius of the rest shape at build time. Plastic creep is
   * renormalised to keep it — flowed shape, remembered volume. Without
   * this the memory ratchets denser under any sustained load and the body
   * ends as a film (the same lesson MPM learned as det-preserving F). */
  const clusterRms = new Float32Array(clusterCount);
  /** Last computed strain per cluster, for the rebuild gate. */
  const clusterStrain = new Float32Array(clusterCount);

  /** (Re)build cluster `k` around a seed point: members are the particles
   * within the capture radius *now*, rest offsets are their offsets *now*.
   * Memory starts fresh — rebuilding is deliberate forgetting. */
  function buildCluster(k: number, sx: number, sy: number, sz: number): void {
    const r2 = CLUSTER_RADIUS * CLUSTER_RADIUS;
    let n = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const base = k * MAX_MEMBERS;
    for (let i = 0; i < count && n < MAX_MEMBERS; i++) {
      const dx = px[i] - sx;
      const dy = py[i] - sy;
      const dz = pz[i] - sz;
      if (dx * dx + dy * dy + dz * dz < r2) {
        memberIdx[base + n] = i;
        cx += px[i];
        cy += py[i];
        cz += pz[i];
        n += 1;
      }
    }
    if (n < MIN_MEMBERS) {
      // The flesh has left this neighbourhood. Re-seed the cluster on an
      // arbitrary particle so it keeps contributing wherever the body is.
      const i = (k * 131 + rebuildTick * 17) % count;
      buildClusterAt(k, i);
      return;
    }
    cx /= n;
    cy /= n;
    cz /= n;
    memberLen[k] = n;
    clusterCX[k] = cx;
    clusterCY[k] = cy;
    clusterCZ[k] = cz;
    let rms = 0;
    for (let m = 0; m < n; m++) {
      const i = memberIdx[base + m];
      restX[base + m] = px[i] - cx;
      restY[base + m] = py[i] - cy;
      restZ[base + m] = pz[i] - cz;
      rms +=
        restX[base + m] * restX[base + m] +
        restY[base + m] * restY[base + m] +
        restZ[base + m] * restZ[base + m];
    }
    clusterRms[k] = Math.sqrt(rms / n);
    clusterQ[k * 4] = 1;
    clusterQ[k * 4 + 1] = clusterQ[k * 4 + 2] = clusterQ[k * 4 + 3] = 0;
  }

  function buildClusterAt(k: number, particle: number): void {
    const r2 = CLUSTER_RADIUS * CLUSTER_RADIUS;
    const sx = px[particle];
    const sy = py[particle];
    const sz = pz[particle];
    let n = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    const base = k * MAX_MEMBERS;
    for (let i = 0; i < count && n < MAX_MEMBERS; i++) {
      const dx = px[i] - sx;
      const dy = py[i] - sy;
      const dz = pz[i] - sz;
      if (dx * dx + dy * dy + dz * dz < r2) {
        memberIdx[base + n] = i;
        cx += px[i];
        cy += py[i];
        cz += pz[i];
        n += 1;
      }
    }
    memberLen[k] = n;
    if (n === 0) return;
    cx /= n;
    cy /= n;
    cz /= n;
    clusterCX[k] = cx;
    clusterCY[k] = cy;
    clusterCZ[k] = cz;
    let rms = 0;
    for (let m = 0; m < n; m++) {
      const i = memberIdx[base + m];
      restX[base + m] = px[i] - cx;
      restY[base + m] = py[i] - cy;
      restZ[base + m] = pz[i] - cz;
      rms +=
        restX[base + m] * restX[base + m] +
        restY[base + m] * restY[base + m] +
        restZ[base + m] * restZ[base + m];
    }
    clusterRms[k] = Math.sqrt(rms / n);
    clusterQ[k * 4] = 1;
    clusterQ[k * 4 + 1] = clusterQ[k * 4 + 2] = clusterQ[k * 4 + 3] = 0;
  }

  let rebuildTick = 0;
  let rebuildCursor = 0;
  /** Substeps between single-cluster rebuilds so a full cycle takes the
   * rebuild period. */
  const rebuildStride = Math.max(
    1,
    Math.round(REBUILD_PERIOD_SEC / PBD_DT / Math.max(1, clusterCount))
  );

  for (let k = 0; k < clusterCount; k++) {
    buildCluster(k, clusterSeeds[k * 3], clusterSeeds[k * 3 + 1], clusterSeeds[k * 3 + 2]);
  }

  // ------------------------------------------------------ solver scratch
  const cellHead = new Int32Array(GRID_CELLS);
  const cellNext = new Int32Array(count);
  // Generous: a compressed transient can triple the neighbourhood, and a
  // pair list that overflows drops contacts exactly when they matter most.
  const MAX_PAIRS = count * 96;
  const pairs = new Int32Array(MAX_PAIRS * 2);
  let pairCount = 0;

  /** Per-particle relative over-density, for the pressure term. */
  const overDensity = new Float32Array(count);
  /** Rest density in kernel-weight units; measured on the first substep. */
  let restDensity = 0;

  /** Shape-matching goal accumulators (Jacobi over overlapping clusters). */
  const accX = new Float32Array(count);
  const accY = new Float32Array(count);
  const accZ = new Float32Array(count);
  const accW = new Float32Array(count);
  /** XSPH accumulators. */
  const xsX = new Float32Array(count);
  const xsY = new Float32Array(count);
  const xsZ = new Float32Array(count);
  const xsW = new Float32Array(count);

  /** Rotation matrix scratch, row-major, and the Apq scratch. */
  const R = new Float32Array(9);
  const A = new Float32Array(9);

  // ---------------------------------------------------------- hand state
  let handActive = 0; // 0 none, 1 pull, 2 push

  // The tank's rocks (see setRocks), with the per-rock precomputation the
  // clamp loop wants: the yaw as a sine/cosine pair, and a bounding radius
  // squared for the cheap reject (the diagonal of the extents box — an
  // overestimate, which only costs a few false passes into the full test).
  interface RockCollider {
    x: number;
    y: number;
    z: number;
    cos: number;
    sin: number;
    boundSq: number;
    /** Horizontal footprint radius squared, for the lure-on-rock test. */
    footprintSq: number;
    stone: Stone;
  }
  const rocks: RockCollider[] = [];
  const rockScratch: [number, number, number] = [0, 0, 0];
  /** Which rock the lure currently sits on, refreshed per substep. -1 none. */
  let hauledRock = -1;

  // The play ball (see setBall). Radius 0 = put away.
  let ballR = 0;
  let ballX = 0;
  let ballY = 0;
  let ballZ = 0;
  let ballVX = 0;
  let ballVY = 0;
  let ballVZ = 0;
  /** Angular velocity, rad/s, and orientation (w,x,y,z). */
  let ballWX = 0;
  let ballWY = 0;
  let ballWZ = 0;
  let ballQW = 1;
  let ballQX = 0;
  let ballQY = 0;
  let ballQZ = 0;
  let handX = 0;
  let handY = 0;
  let handZ = 0;
  let handR = 0;
  let handVX = 0;
  let handVY = 0;
  let handVZ = 0;
  let handStrength = 0;

  let stiffnessScale = 1;
  let memoryScale = 1;
  let toneScale = 1;
  let viscosityScale = 1;
  let pressureScale = 1;
  let shapeScale = 1;

  let lureActive = false;
  let lureX = 0;
  let lureZ = 0;
  let lureLean = LURE_LEAN;

  // The feeding pseudopod (see setTendril): the caller's target, the
  // solver's own self-pacing tip, and the strength. The tip is seeded at
  // the body's centre on activation and walks itself out (see
  // TENDRIL_TIP_SPEED).
  let tendrilActive = false;
  let tendrilTargetX = 0;
  let tendrilTargetY = 0;
  let tendrilTargetZ = 0;
  let tendrilX = 0;
  let tendrilY = 0;
  let tendrilZ = 0;
  let tendrilTipSeeded = false;
  let tendrilStrength = 0;
  /** The tongue's base — the body centroid as of the last substep — so the
   * melt and the corral exemptions cover the whole shaft, not a sphere at
   * the tip: a tip-sphere let the mid-tongue re-solidify, and the orb's
   * memory reeled the tongue back in (the probe's 3 mm sawtooth). */
  let tendrilBaseX = 0;
  let tendrilBaseZ = 0;
  /** Drive scale from the load limit (see TENDRIL_MAX_LOAD), 0..1. */
  let tendrilThrottle = 1;
  /** Where the mound stood when the meal began. While the tongue is out
   * the corral gathers around *this*, not the live centroid — delivered
   * goo kept towing the live centroid toward the flake, and the corral
   * consolidated the body after it, one substep at a time (the probe
   * watched the median walk in lockstep with the tongue). */
  let tendrilAnchorX = 0;
  let tendrilAnchorZ = 0;

  /** Squared distance from a point to the tongue's capsule axis (base →
   * tip, at tip height). Valid only while the tendril is out. */
  function tendrilDist2(x: number, y: number, z: number): number {
    const sx = tendrilX - tendrilBaseX;
    const sz = tendrilZ - tendrilBaseZ;
    const len2 = sx * sx + sz * sz;
    let t = 0;
    if (len2 > 1e-12) {
      t = ((x - tendrilBaseX) * sx + (z - tendrilBaseZ) * sz) / len2;
      t = Math.min(1, Math.max(0, t));
    }
    const dx = x - (tendrilBaseX + sx * t);
    const dy = y - tendrilY;
    const dz = z - (tendrilBaseZ + sz * t);
    return dx * dx + dy * dy + dz * dz;
  }

  // A requested hop, consumed by the next substep (see the HOP constants).
  let hopPending = false;
  let hopUp = 0;
  let hopDX = 0;
  let hopDZ = 0;

  /**
   * Müller-style robust rotation extraction from the 3×3 in `A`, refining
   * the cluster's warm-started quaternion; writes the matrix into `R`.
   * Trig-free (see the original note in the MPM engine): at warm-start
   * angles the increment (1, ω/2) needs no sin/cos, and unlike SVD it
   * cannot produce a reflection — which matters, because a mirrored goal
   * set would turn a cluster inside out.
   */
  function extractRotation(k: number): void {
    let qw = clusterQ[k * 4];
    let qx = clusterQ[k * 4 + 1];
    let qy = clusterQ[k * 4 + 2];
    let qz = clusterQ[k * 4 + 3];

    for (let iter = 0; iter < 3; iter++) {
      const xx = qx * qx;
      const yy = qy * qy;
      const zz = qz * qz;
      const xy = qx * qy;
      const xz = qx * qz;
      const yz = qy * qz;
      const wx2 = qw * qx;
      const wy2 = qw * qy;
      const wz2 = qw * qz;
      R[0] = 1 - 2 * (yy + zz);
      R[1] = 2 * (xy - wz2);
      R[2] = 2 * (xz + wy2);
      R[3] = 2 * (xy + wz2);
      R[4] = 1 - 2 * (xx + zz);
      R[5] = 2 * (yz - wx2);
      R[6] = 2 * (xz - wy2);
      R[7] = 2 * (yz + wx2);
      R[8] = 1 - 2 * (xx + yy);

      let cx = 0;
      let cy = 0;
      let cz = 0;
      let dot = 0;
      for (let col = 0; col < 3; col++) {
        const rx = R[col];
        const ry = R[3 + col];
        const rz = R[6 + col];
        const ax = A[col];
        const ay = A[3 + col];
        const az = A[6 + col];
        cx += ry * az - rz * ay;
        cy += rz * ax - rx * az;
        cz += rx * ay - ry * ax;
        dot += rx * ax + ry * ay + rz * az;
      }
      const inv = 1 / (Math.abs(dot) + 1e-9);
      const hx = cx * inv * 0.5;
      const hy = cy * inv * 0.5;
      const hz = cz * inv * 0.5;
      const mag2 = hx * hx + hy * hy + hz * hz;
      if (mag2 < 1e-18) break;
      const nw = qw - hx * qx - hy * qy - hz * qz;
      const nx = qx + hx * qw + hy * qz - hz * qy;
      const ny = qy - hx * qz + hy * qw + hz * qx;
      const nz = qz + hx * qy - hy * qx + hz * qw;
      const norm = 1 / Math.sqrt(nw * nw + nx * nx + ny * ny + nz * nz);
      qw = nw * norm;
      qx = nx * norm;
      qy = ny * norm;
      qz = nz * norm;
    }

    clusterQ[k * 4] = qw;
    clusterQ[k * 4 + 1] = qx;
    clusterQ[k * 4 + 2] = qy;
    clusterQ[k * 4 + 3] = qz;
    const xx = qx * qx;
    const yy = qy * qy;
    const zz = qz * qz;
    const xy = qx * qy;
    const xz = qx * qz;
    const yz = qy * qz;
    const wxq = qw * qx;
    const wyq = qw * qy;
    const wzq = qw * qz;
    R[0] = 1 - 2 * (yy + zz);
    R[1] = 2 * (xy - wzq);
    R[2] = 2 * (xz + wyq);
    R[3] = 2 * (xy + wzq);
    R[4] = 1 - 2 * (xx + zz);
    R[5] = 2 * (yz - wxq);
    R[6] = 2 * (xz - wyq);
    R[7] = 2 * (yz + wxq);
    R[8] = 1 - 2 * (xx + yy);
  }

  /**
   * The ball's own step: gravity, the box, the stone, and rolling. Runs
   * before the particle clamp so the particles push against the ball's
   * settled position for this substep.
   */
  function stepBall(dt: number): void {
    ballVY -= 9.81 * dt;

    // Cap and integrate.
    const speed2 = ballVX * ballVX + ballVY * ballVY + ballVZ * ballVZ;
    if (speed2 > BALL_SPEED_CAP * BALL_SPEED_CAP) {
      const k = BALL_SPEED_CAP / Math.sqrt(speed2);
      ballVX *= k;
      ballVY *= k;
      ballVZ *= k;
    }
    ballX += ballVX * dt;
    ballY += ballVY * dt;
    ballZ += ballVZ * dt;

    let onFloor = false;
    if (ballY < FLOOR_Y + ballR) {
      ballY = FLOOR_Y + ballR;
      if (ballVY < 0) ballVY = Math.abs(ballVY) > 0.03 ? -ballVY * BALL_FLOOR_REST : 0;
      onFloor = true;
    }
    if (ballX < -BOX_HALF_X + ballR) {
      ballX = -BOX_HALF_X + ballR;
      if (ballVX < 0) ballVX = -ballVX * BALL_WALL_REST;
    } else if (ballX > BOX_HALF_X - ballR) {
      ballX = BOX_HALF_X - ballR;
      if (ballVX > 0) ballVX = -ballVX * BALL_WALL_REST;
    }
    if (ballZ < -BOX_HALF_Z + ballR) {
      ballZ = -BOX_HALF_Z + ballR;
      if (ballVZ < 0) ballVZ = -ballVZ * BALL_WALL_REST;
    } else if (ballZ > BOX_HALF_Z - ballR) {
      ballZ = BOX_HALF_Z - ballR;
      if (ballVZ > 0) ballVZ = -ballVZ * BALL_WALL_REST;
    }

    // The rocks: project out along the radial and reflect the closing speed.
    // Same shape trick as the particle clamp — the offset and its surface
    // point lie on one warped radial, so a rock is a sphere whose radius
    // depends on the direction you ask from. The bounce normal is that
    // radial rather than the true surface normal, which is fine theatre for
    // a toy ball glancing off a lumpy convex stone.
    for (let r = 0; r < rocks.length; r++) {
      const rock = rocks[r];
      const dx = ballX - rock.x;
      const dy = ballY - rock.y;
      const dz = ballZ - rock.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const reject = Math.sqrt(rock.boundSq) + ballR;
      if (d2 >= reject * reject || d2 <= 1e-12) continue;
      const lx = rock.cos * dx - rock.sin * dz;
      const lz = rock.sin * dx + rock.cos * dz;
      const axes = rock.stone.axes;
      const wx = lx / axes[0];
      const wy = dy / axes[1];
      const wz = lz / axes[2];
      const wl = Math.hypot(wx, wy, wz);
      if (wl <= 1e-9) continue;
      stoneSurface(rock.stone, wx / wl, wy / wl, wz / wl, rockScratch);
      const surfD = Math.hypot(rockScratch[0], rockScratch[1], rockScratch[2]);
      const minD = surfD + ballR;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const nz = dz / d;
      ballX = rock.x + nx * minD;
      ballY = rock.y + ny * minD;
      ballZ = rock.z + nz * minD;
      const closing = ballVX * nx + ballVY * ny + ballVZ * nz;
      if (closing < 0) {
        const j = -(1 + BALL_STONE_REST) * closing;
        ballVX += nx * j;
        ballVY += ny * j;
        ballVZ += nz * j;
      }
    }

    // Rolling: on the floor, slide converts to spin (ω → n × v / r for
    // rolling-without-slipping with the contact normal +y) and the roll
    // coasts down; airborne, the spin just slowly bleeds.
    if (onFloor) {
      const rollBlend = Math.min(1, BALL_ROLL_RATE * dt);
      ballWX += (ballVZ / ballR - ballWX) * rollBlend;
      ballWZ += (-ballVX / ballR - ballWZ) * rollBlend;
      ballWY -= ballWY * Math.min(1, BALL_ROLL_RATE * dt);
      const drag = Math.max(0, 1 - BALL_ROLL_DRAG * dt);
      ballVX *= drag;
      ballVZ *= drag;
      const speed = Math.hypot(ballVX, ballVY, ballVZ);
      const spin = Math.hypot(ballWX, ballWY, ballWZ);
      if (speed < BALL_SLEEP_SPEED && spin < BALL_SLEEP_SPIN) {
        ballVX = ballVY = ballVZ = 0;
        ballWX = ballWY = ballWZ = 0;
      }
    } else {
      const drag = Math.max(0, 1 - BALL_SPIN_DRAG * dt);
      ballWX *= drag;
      ballWY *= drag;
      ballWZ *= drag;
    }

    // Orientation: q += ½ (0,ω) q dt, renormalised.
    const hx = ballWX * 0.5 * dt;
    const hy = ballWY * 0.5 * dt;
    const hz = ballWZ * 0.5 * dt;
    const nqw = ballQW - hx * ballQX - hy * ballQY - hz * ballQZ;
    const nqx = ballQX + hx * ballQW + hy * ballQZ - hz * ballQY;
    const nqy = ballQY - hx * ballQZ + hy * ballQW + hz * ballQX;
    const nqz = ballQZ + hx * ballQY - hy * ballQX + hz * ballQW;
    const norm = 1 / Math.sqrt(nqw * nqw + nqx * nqx + nqy * nqy + nqz * nqz);
    ballQW = nqw * norm;
    ballQX = nqx * norm;
    ballQY = nqy * norm;
    ballQZ = nqz * norm;
  }

  function substep(): void {
    const dt = PBD_DT;
    if (ballR > 0) stepBall(dt);

    // The body's centre and mean horizontal drift, for the tone term.
    let cX = 0;
    let cZ = 0;
    let mVX = 0;
    let mVZ = 0;
    // While the tongue is out, its material is excluded from the centroid:
    // the corral gathers the body around where the *mound* is, not around
    // a mean dragged forward by the tongue — the corral consolidating a
    // leaning centroid is exactly the lure's crawl engine, and it walked
    // the body 22 mm down its own tongue before this exclusion.
    const tongueOut = tendrilActive && tendrilStrength > 0 && tendrilTipSeeded;
    const tongueReach2 = TENDRIL_REACH * TENDRIL_REACH;
    let cN = 0;
    for (let i = 0; i < count; i++) {
      if (tongueOut && tendrilDist2(px[i], py[i], pz[i]) < tongueReach2) continue;
      cX += px[i];
      cZ += pz[i];
      mVX += vx[i];
      mVZ += vz[i];
      cN += 1;
    }
    if (cN === 0) {
      for (let i = 0; i < count; i++) {
        cX += px[i];
        cZ += pz[i];
        mVX += vx[i];
        mVZ += vz[i];
      }
      cN = count;
    }
    cX /= cN;
    cZ /= cN;
    mVX /= cN;
    mVZ /= cN;
    if (lureActive) {
      const toX = lureX - cX;
      const toZ = lureZ - cZ;
      const d = Math.hypot(toX, toZ);
      if (d > 1e-6) {
        const lean = Math.min(lureLean, d);
        cX += (toX / d) * lean;
        cZ += (toZ / d) * lean;
      }
    }
    // A lure parked on a rock's footprint is a request to climb it: the
    // clamp below lets contact particles haul themselves up that one rock.
    hauledRock = -1;
    if (lureActive) {
      for (let r = 0; r < rocks.length; r++) {
        const ldx = lureX - rocks[r].x;
        const ldz = lureZ - rocks[r].z;
        if (ldx * ldx + ldz * ldz < rocks[r].footprintSq) {
          hauledRock = r;
          break;
        }
      }
    }

    // The feeding pseudopod's tip walks itself (see TENDRIL_TIP_SPEED):
    // toward the caller's target while goo still sits on it, back toward
    // the body when the tongue thins. Goo pace is set here, not by the
    // caller's clock — a stalled tab or a hasty caller cannot strand the
    // tip beyond its own material.
    if (tendrilActive && tendrilStrength > 0) {
      if (!tendrilTipSeeded) {
        tendrilX = cX;
        tendrilY = tendrilTargetY;
        tendrilZ = cZ;
        tendrilAnchorX = cX;
        tendrilAnchorZ = cZ;
        tendrilTipSeeded = true;
      }
      tendrilBaseX = tendrilAnchorX;
      tendrilBaseZ = tendrilAnchorZ;
      // The mound holds its ground for the length of the meal: the corral
      // (and the core exemption, and the capsule's base) all centre on the
      // anchor from here on.
      cX = tendrilAnchorX;
      cZ = tendrilAnchorZ;
      let nearest2 = Infinity;
      let captured = 0;
      const loadReach2 = TENDRIL_REACH * TENDRIL_REACH;
      for (let i = 0; i < count; i++) {
        const dx = px[i] - tendrilX;
        const dy = py[i] - tendrilY;
        const dz = pz[i] - tendrilZ;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < nearest2) nearest2 = d2;
        if (tendrilDist2(px[i], py[i], pz[i]) < loadReach2) captured += 1;
      }
      // The appetite limit (see TENDRIL_MAX_LOAD): a tongue, not a march.
      const maxLoad = count * TENDRIL_MAX_LOAD;
      tendrilThrottle = captured > maxLoad ? maxLoad / captured : 1;
      const hold = TENDRIL_REACH * TENDRIL_HOLD_FRACTION;
      const step = TENDRIL_TIP_SPEED * dt;
      const laden = nearest2 < hold * hold;
      const gx = laden ? tendrilTargetX : cX;
      const gz = laden ? tendrilTargetZ : cZ;
      const dx = gx - tendrilX;
      const dy = tendrilTargetY - tendrilY;
      const dz = gz - tendrilZ;
      const d = Math.hypot(dx, dy, dz);
      if (d > 1e-6) {
        const k = Math.min(1, step / d);
        tendrilX += dx * k;
        tendrilY += dy * k;
        tendrilZ += dz * k;
      }
    }

    // The hop, before the drives: a one-shot kick to the whole body, but
    // only if enough of it is standing on the floor — legs need ground.
    // Airborne or held aloft, the request quietly fizzles (no double jump).
    if (hopPending) {
      hopPending = false;
      let grounded = 0;
      for (let i = 0; i < count; i++) {
        if (py[i] < FLOOR_Y + HOP_GROUND_BAND) grounded += 1;
      }
      if (grounded >= count * HOP_GROUND_FRACTION && handActive === 0) {
        for (let i = 0; i < count; i++) {
          vy[i] += hopUp;
          vx[i] += hopDX;
          vz[i] += hopDZ;
        }
      }
    }

    // ----------------------------------------------- velocities (drives)
    const toneBlend = Math.min(1, TONE_RATE * dt);
    const clingBlend = Math.min(1, CLING_RATE * dt);
    for (let i = 0; i < count; i++) {
      let nvx = vx[i];
      let nvy = vy[i] - 9.81 * dt;
      let nvz = vz[i];

      if (handActive !== 0) {
        const dx = px[i] - handX;
        const dy = py[i] - handY;
        const dz = pz[i] - handZ;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < handR * handR) {
          const fall = 1 - Math.sqrt(d2) / handR;
          if (handActive === 1) {
            const k = handStrength * fall;
            nvx += (handVX - nvx) * k;
            nvy += (handVY - nvy) * k;
            nvz += (handVZ - nvz) * k;
          } else {
            const inv = 1 / (Math.sqrt(d2) + 1e-6);
            const add = handStrength * fall * PUSH_RATE * dt;
            nvx += dx * inv * add;
            nvy += dy * inv * add;
            nvz += dz * inv * add;
          }
        }
      }

      // The cling: while held, the whole body gathers toward the grip in
      // 3D — without it, lifting goo by a surface pinch is pulling taffy.
      if (handActive === 1 && handStrength > 0.2) {
        const dx = handX - px[i];
        const dy = handY - py[i];
        const dz = handZ - pz[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > CLING_RADIUS) {
          const creep = Math.min(CLING_VMAX, CLING_VSLOPE * (d - CLING_RADIUS)) * handStrength;
          nvx += ((dx / d) * creep - nvx) * clingBlend;
          nvy += ((dy / d) * creep - nvy) * clingBlend;
          nvz += ((dz / d) * creep - nvz) * clingBlend;
        }
      }

      vx[i] = nvx;
      vy[i] = nvy;
      vz[i] = nvz;
    }

    // Tone: the horizontal corral — only material beyond the mound's
    // footprint is gathered, and only relative to the body's own drift,
    // so a carried body stays carriable. When the corral is *idle* (no
    // lure, no hand) its net momentum is removed: the drift-preservation
    // term otherwise turns solver noise into a slow permanent walk across
    // the floor. A luring corral keeps its net push — that push IS the
    // crawl.
    if (toneScale > 0) {
      let toneNetX = 0;
      let toneNetZ = 0;
      let toneTouched = 0;
      const corral2 = TONE_CORRAL_RADIUS * TONE_CORRAL_RADIUS;
      const tendrilOut = tendrilActive && tendrilStrength > 0;
      const tendrilReach2 = TENDRIL_REACH * TENDRIL_REACH;
      for (let i = 0; i < count; i++) {
        // Material the pseudopod has captured is excused from the corral —
        // the same truce the rock-haul needed: a full-blend gather toward
        // the centroid beats any soft-edged reach, and the tongue never
        // leaves the mound. (The tendril drive below runs after this loop,
        // but the exemption is what lets its gains survive.)
        if (tendrilOut && tendrilDist2(px[i], py[i], pz[i]) < tendrilReach2) {
          xsW[i] = 0;
          continue;
        }
        const dx = cX - px[i];
        const dz = cZ - pz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 <= corral2) {
          xsW[i] = 0;
          continue;
        }
        const d = Math.sqrt(d2);
        const creep = Math.min(TONE_VMAX, TONE_VSLOPE * (d - TONE_CORRAL_RADIUS)) * toneScale;
        const dvx = (mVX + (dx / d) * creep - vx[i]) * toneBlend;
        const dvz = (mVZ + (dz / d) * creep - vz[i]) * toneBlend;
        vx[i] += dvx;
        vz[i] += dvz;
        toneNetX += dvx;
        toneNetZ += dvz;
        toneTouched += 1;
        xsW[i] = 1;
      }
      if (toneTouched > 0 && !lureActive && handActive === 0) {
        const nx = toneNetX / toneTouched;
        const nz = toneNetZ / toneTouched;
        for (let i = 0; i < count; i++) {
          if (xsW[i] === 1) {
            vx[i] -= nx;
            vz[i] -= nz;
          }
        }
      }
    }

    // Idle drift brake (see IDLE_BRAKE_RATE).
    if (handActive === 0 && !lureActive) {
      const brake = Math.min(1, IDLE_BRAKE_RATE * dt);
      let bx = 0;
      let bz = 0;
      for (let i = 0; i < count; i++) {
        bx += vx[i];
        bz += vz[i];
      }
      bx = (bx / count) * brake;
      bz = (bz / count) * brake;
      for (let i = 0; i < count; i++) {
        vx[i] -= bx;
        vz[i] -= bz;
      }
    }

    // The feeding pseudopod (see TENDRIL_*): particles within reach of the
    // tip creep toward it, soft-edged so the tongue tapers instead of
    // shearing off. Runs after the tone and the brake so the reach wins
    // those blends — the corral would otherwise gather the tongue straight
    // back into the mound.
    if (tendrilActive && tendrilStrength > 0) {
      const blend = Math.min(1, TENDRIL_RATE * dt) * tendrilStrength * tendrilThrottle;
      const reach2 = TENDRIL_REACH * TENDRIL_REACH;
      for (let i = 0; i < count; i++) {
        // Capture is the whole capsule, so the shaft conveys material
        // forward — a tip-sphere alone starved the tongue (it stretched,
        // thinned, and stalled at equilibrium). The drive still aims at
        // the tip: mid-shaft goo is carried tipward, and the base feeds.
        // The core is exempt (see TENDRIL_CORE_RADIUS).
        const ccx = px[i] - cX;
        const ccz = pz[i] - cZ;
        if (ccx * ccx + ccz * ccz < TENDRIL_CORE_RADIUS * TENDRIL_CORE_RADIUS) continue;
        const cap2 = tendrilDist2(px[i], py[i], pz[i]);
        if (cap2 >= reach2) continue;
        const dx = tendrilX - px[i];
        const dy = tendrilY - py[i];
        const dz = tendrilZ - pz[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-9;
        const creep = Math.min(TENDRIL_VMAX, TENDRIL_VSLOPE * d);
        const edge = 1 - Math.sqrt(cap2) / TENDRIL_REACH;
        const k = blend * edge;
        const dvx = ((dx / d) * creep - vx[i]) * k;
        const dvy = ((dy / d) * creep - vy[i]) * k;
        const dvz = ((dz / d) * creep - vz[i]) * k;
        vx[i] += dvx;
        vy[i] += dvy;
        vz[i] += dvz;
      }
      // No momentum refund: distributing the reaction over the uncaptured
      // body made the slime flee its own tongue. Like the lure's crawl,
      // the reach keeps its net push and the floor's friction answers it;
      // the probe holds the centroid honest instead.
    }

    // Rolling resistance (see ROLL_DAMP_RATE): estimate the body's rigid
    // rotation about its centroid and bleed it off.
    if (handActive === 0) {
      let cy0 = 0;
      for (let i = 0; i < count; i++) cy0 += py[i];
      cy0 /= count;
      let lx = 0;
      let ly = 0;
      let lz = 0;
      let inertia = 0;
      for (let i = 0; i < count; i++) {
        const rx = px[i] - cX;
        const ry = py[i] - cy0;
        const rz = pz[i] - cZ;
        lx += ry * (vz[i] - mVZ) - rz * vy[i];
        ly += rz * (vx[i] - mVX) - rx * (vz[i] - mVZ);
        lz += rx * vy[i] - ry * (vx[i] - mVX);
        inertia += rx * rx + ry * ry + rz * rz;
      }
      if (inertia > 1e-9) {
        const damp = Math.min(1, ROLL_DAMP_RATE * dt) / inertia;
        const wx0 = lx * damp;
        const wy0 = ly * damp;
        const wz0 = lz * damp;
        for (let i = 0; i < count; i++) {
          const rx = px[i] - cX;
          const ry = py[i] - cy0;
          const rz = pz[i] - cZ;
          vx[i] -= wy0 * rz - wz0 * ry;
          vy[i] -= wz0 * rx - wx0 * rz;
          vz[i] -= wx0 * ry - wy0 * rx;
        }
      }
    }

    // Cap and predict.
    for (let i = 0; i < count; i++) {
      let nvx = vx[i];
      let nvy = vy[i];
      let nvz = vz[i];
      const speed2 = nvx * nvx + nvy * nvy + nvz * nvz;
      if (speed2 > SPEED_CAP * SPEED_CAP) {
        const k = SPEED_CAP / Math.sqrt(speed2);
        nvx *= k;
        nvy *= k;
        nvz *= k;
        vx[i] = nvx;
        vy[i] = nvy;
        vz[i] = nvz;
      }
      prevX[i] = px[i];
      prevY[i] = py[i];
      prevZ[i] = pz[i];
      px[i] += nvx * dt;
      py[i] += nvy * dt;
      pz[i] += nvz * dt;
    }

    // ------------------------------------------------- neighbour pairing
    cellHead.fill(-1);
    for (let i = 0; i < count; i++) {
      let gx = ((px[i] - GRID_OX) / CELL) | 0;
      let gy = ((py[i] - GRID_OY) / CELL) | 0;
      let gz = ((pz[i] - GRID_OZ) / CELL) | 0;
      gx = gx < 0 ? 0 : gx >= GRID_NX ? GRID_NX - 1 : gx;
      gy = gy < 0 ? 0 : gy >= GRID_NY ? GRID_NY - 1 : gy;
      gz = gz < 0 ? 0 : gz >= GRID_NZ ? GRID_NZ - 1 : gz;
      const cell = (gx * GRID_NY + gy) * GRID_NZ + gz;
      cellNext[i] = cellHead[cell];
      cellHead[cell] = i;
    }
    pairCount = 0;
    const H2 = COHESION_RADIUS * COHESION_RADIUS;
    for (let i = 0; i < count; i++) {
      let gx = ((px[i] - GRID_OX) / CELL) | 0;
      let gy = ((py[i] - GRID_OY) / CELL) | 0;
      let gz = ((pz[i] - GRID_OZ) / CELL) | 0;
      gx = gx < 1 ? 1 : gx >= GRID_NX - 1 ? GRID_NX - 2 : gx;
      gy = gy < 1 ? 1 : gy >= GRID_NY - 1 ? GRID_NY - 2 : gy;
      gz = gz < 1 ? 1 : gz >= GRID_NZ - 1 ? GRID_NZ - 2 : gz;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const rowCell = ((gx + ox) * GRID_NY + (gy + oy)) * GRID_NZ + gz;
          for (let oz = -1; oz <= 1; oz++) {
            let j = cellHead[rowCell + oz];
            while (j >= 0) {
              if (j > i) {
                const dx = px[j] - px[i];
                const dy = py[j] - py[i];
                const dz = pz[j] - pz[i];
                if (dx * dx + dy * dy + dz * dz < H2 && pairCount < MAX_PAIRS) {
                  pairs[pairCount * 2] = i;
                  pairs[pairCount * 2 + 1] = j;
                  pairCount += 1;
                }
              }
              j = cellNext[j];
            }
          }
        }
      }
    }

    // ---------------------------------------------------------- density
    // Kernel density from the pair list (self + neighbours), then relative
    // over-density against the rest measurement.
    overDensity.fill(1); // self-weight
    const invHd = 1 / COHESION_RADIUS;
    for (let p = 0; p < pairCount; p++) {
      const i = pairs[p * 2];
      const j = pairs[p * 2 + 1];
      const dx = px[j] - px[i];
      const dy = py[j] - py[i];
      const dz = pz[j] - pz[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const t = Math.max(0, 1 - d * invHd);
      const w = t * t;
      overDensity[i] += w;
      overDensity[j] += w;
    }
    if (restDensity === 0) {
      let sum = 0;
      for (let i = 0; i < count; i++) sum += overDensity[i];
      restDensity = (sum / count) * DENSITY_REST_SCALE;
    }
    const invRest = 1 / restDensity;
    for (let i = 0; i < count; i++) {
      overDensity[i] = Math.max(0, overDensity[i] * invRest - 1);
    }

    // -------------------------------------------------- pair projections
    // Jacobi with neighbour-count averaging, NOT in-place Gauss–Seidel.
    // GS's sweep order is a momentum bias: it rectified the pile's substep
    // oscillations into a coherent ~1 mm/s walk across the floor (direction
    // set by the seed jitter, unstoppable by friction because every sweep
    // re-injected it). Jacobi applies equal-and-opposite corrections from a
    // frozen snapshot — momentum-exact, order-free.
    const cohesion = COHESION_K * Math.min(2, stiffnessScale);
    for (let iter = 0; iter < SOLVER_ITERS; iter++) {
      accX.fill(0);
      accY.fill(0);
      accZ.fill(0);
      accW.fill(0);
      for (let p = 0; p < pairCount; p++) {
        const i = pairs[p * 2];
        const j = pairs[p * 2 + 1];
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const dz = pz[j] - pz[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > H2 || d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        let corr = 0;
        if (d < REST_SPACING) {
          corr = CONTACT_K * 0.5 * (REST_SPACING - d);
        } else if (d < COHESION_REACH) {
          corr = -cohesion * 0.5 * (d - REST_SPACING);
        }
        // Pressure: packed neighbourhoods push apart regardless of the
        // pair's own spacing.
        const over = overDensity[i] + overDensity[j];
        if (over > 0) {
          const t = Math.max(0, 1 - d * invHd);
          corr += DENSITY_PUSH * pressureScale * 0.5 * over * t * REST_SPACING;
        } else if (corr === 0) {
          continue;
        }
        const s = corr / d;
        accX[i] -= dx * s;
        accY[i] -= dy * s;
        accZ[i] -= dz * s;
        accW[i] += 1;
        accX[j] += dx * s;
        accY[j] += dy * s;
        accZ[j] += dz * s;
        accW[j] += 1;
      }
      // Apply with per-particle averaging, then remove the sweep's net
      // displacement: the 1/√n scale moves the two ends of a pair by
      // different amounts, so without this the "internal" pair forces
      // translate the body (measured: ~0.1 mm/s of permanent drift).
      let netX = 0;
      let netY = 0;
      let netZ = 0;
      let touched = 0;
      for (let i = 0; i < count; i++) {
        const n = accW[i];
        if (n === 0) continue;
        const k = SOLVER_OMEGA / Math.max(1, Math.sqrt(n));
        px[i] += accX[i] * k;
        py[i] += accY[i] * k;
        pz[i] += accZ[i] * k;
        netX += accX[i] * k;
        netY += accY[i] * k;
        netZ += accZ[i] * k;
        touched += 1;
      }
      if (touched > 0) {
        const nx = netX / touched;
        const ny = netY / touched;
        const nz = netZ / touched;
        for (let i = 0; i < count; i++) {
          if (accW[i] === 0) continue;
          px[i] -= nx;
          py[i] -= ny;
          pz[i] -= nz;
        }
      }
    }

    // ------------------------------------------------------ shape memory
    const smBlend = 1 - Math.exp(-SM_RATE * stiffnessScale * shapeScale * dt);
    const fadeBlend = 1 - Math.exp(-dt / (FADE_TAU_SEC * memoryScale));
    const yieldAt = YIELD_STRAIN * memoryScale;
    accW.fill(0);
    for (let k = 0; k < clusterCount; k++) {
      const n = memberLen[k];
      if (n < 3) continue;
      const base = k * MAX_MEMBERS;

      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let m = 0; m < n; m++) {
        const i = memberIdx[base + m];
        cx += px[i];
        cy += py[i];
        cz += pz[i];
      }
      cx /= n;
      cy /= n;
      cz /= n;
      clusterCX[k] = cx;
      clusterCY[k] = cy;
      clusterCZ[k] = cz;

      A.fill(0);
      for (let m = 0; m < n; m++) {
        const i = memberIdx[base + m];
        const dx = px[i] - cx;
        const dy = py[i] - cy;
        const dz = pz[i] - cz;
        const qx = restX[base + m];
        const qy = restY[base + m];
        const qz = restZ[base + m];
        A[0] += dx * qx;
        A[1] += dx * qy;
        A[2] += dx * qz;
        A[3] += dy * qx;
        A[4] += dy * qy;
        A[5] += dy * qz;
        A[6] += dz * qx;
        A[7] += dz * qy;
        A[8] += dz * qz;
      }
      extractRotation(k);

      // Goals into the accumulators, and the goal miss for the strain.
      let miss2 = 0;
      for (let m = 0; m < n; m++) {
        const i = memberIdx[base + m];
        const qx = restX[base + m];
        const qy = restY[base + m];
        const qz = restZ[base + m];
        const gx = cx + R[0] * qx + R[1] * qy + R[2] * qz;
        const gy = cy + R[3] * qx + R[4] * qy + R[5] * qz;
        const gz = cz + R[6] * qx + R[7] * qy + R[8] * qz;
        accX[i] = accW[i] === 0 ? gx : accX[i] + gx;
        accY[i] = accW[i] === 0 ? gy : accY[i] + gy;
        accZ[i] = accW[i] === 0 ? gz : accZ[i] + gz;
        accW[i] += 1;
        const ex = px[i] - gx;
        const ey = py[i] - gy;
        const ez = pz[i] - gz;
        miss2 += ex * ex + ey * ey + ez * ez;
      }
      const strain = Math.sqrt(miss2 / n) / CLUSTER_RADIUS;
      clusterStrain[k] = strain;

      // Viscoplastic memory: everything melts on the fade clock, and
      // strain past the yield creeps fast — the dent that sticks. The
      // rest offsets move toward the pose rotated back into rest frame.
      let creep = fadeBlend;
      if (strain > yieldAt) {
        creep = Math.min(0.5, creep + PLASTIC_RATE * (strain - yieldAt) * dt);
      }
      if (creep > 1e-6) {
        let mx = 0;
        let my = 0;
        let mz = 0;
        for (let m = 0; m < n; m++) {
          const i = memberIdx[base + m];
          const dx = px[i] - cx;
          const dy = py[i] - cy;
          const dz = pz[i] - cz;
          // Rᵀ · offset
          const ux = R[0] * dx + R[3] * dy + R[6] * dz;
          const uy = R[1] * dx + R[4] * dy + R[7] * dz;
          const uz = R[2] * dx + R[5] * dy + R[8] * dz;
          restX[base + m] += (ux - restX[base + m]) * creep;
          restY[base + m] += (uy - restY[base + m]) * creep;
          restZ[base + m] += (uz - restZ[base + m]) * creep;
          mx += restX[base + m];
          my += restY[base + m];
          mz += restZ[base + m];
        }
        // Recentre so the rest shape keeps a zero mean — a drifted mean
        // would teleport every goal sideways — then renormalise the RMS
        // radius back to the built value: plastic flow changes shape,
        // never volume.
        mx /= n;
        my /= n;
        mz /= n;
        let rms = 0;
        for (let m = 0; m < n; m++) {
          restX[base + m] -= mx;
          restY[base + m] -= my;
          restZ[base + m] -= mz;
          rms +=
            restX[base + m] * restX[base + m] +
            restY[base + m] * restY[base + m] +
            restZ[base + m] * restZ[base + m];
        }
        rms = Math.sqrt(rms / n);
        if (rms > 1e-6) {
          const rescale = clusterRms[k] / rms;
          for (let m = 0; m < n; m++) {
            restX[base + m] *= rescale;
            restY[base + m] *= rescale;
            restZ[base + m] *= rescale;
          }
        }
      }
    }
    // Apply the averaged goals, then remove the pass's *net* displacement:
    // each cluster conserves its own centroid, but averaging across
    // overlapping clusters does not conserve globally, and the leftover is
    // a steady directional shove (elasticity must not self-propel — the
    // body walked ~1 mm/s across the floor on remembered lopsidedness,
    // with friction cancelling 99% of a much larger injection). Any real
    // lift or drag still routes through the floor reaction, as it should.
    let smNetX = 0;
    let smNetY = 0;
    let smNetZ = 0;
    let smTouched = 0;
    const tendrilMelting = tendrilActive && tendrilStrength > 0;
    const tendrilReachSq = TENDRIL_REACH * TENDRIL_REACH;
    for (let i = 0; i < count; i++) {
      if (accW[i] === 0) continue;
      // Goo on the tongue is excused from the orb's memory (see
      // TENDRIL_MELT) — melted where the body reaches, solid elsewhere.
      let blend = smBlend;
      if (tendrilMelting) {
        const td2 = tendrilDist2(px[i], py[i], pz[i]);
        if (td2 < tendrilReachSq) {
          // The melt only takes hold outside the mound: an ungated melt
          // capsule cut a channel through the rim and the body poured
          // itself down it under gravity (the probe's median moved at tip
          // speed — a breached dam, not a tongue). Inside the core the
          // memory stays solid; the gate opens across the rim.
          const ax = px[i] - tendrilBaseX;
          const az = pz[i] - tendrilBaseZ;
          const gate = Math.min(
            1,
            Math.max(0, (Math.hypot(ax, az) - TENDRIL_CORE_RADIUS) / 0.004)
          );
          const melt = (1 - Math.sqrt(td2) / TENDRIL_REACH) * tendrilStrength * gate;
          blend *= 1 - TENDRIL_MELT * melt;
        }
      }
      const inv = 1 / accW[i];
      const ddx = (accX[i] * inv - px[i]) * blend;
      const ddy = (accY[i] * inv - py[i]) * blend;
      const ddz = (accZ[i] * inv - pz[i]) * blend;
      px[i] += ddx;
      py[i] += ddy;
      pz[i] += ddz;
      smNetX += ddx;
      smNetY += ddy;
      smNetZ += ddz;
      smTouched += 1;
    }
    if (smTouched > 0) {
      const nx = smNetX / smTouched;
      const ny = smNetY / smTouched;
      const nz = smNetZ / smTouched;
      for (let i = 0; i < count; i++) {
        if (accW[i] === 0) continue;
        px[i] -= nx;
        py[i] -= ny;
        pz[i] -= nz;
      }
    }

    // The corral's positional word, after shape matching (see
    // TONE_POS_SHARE): the skirt is walked inward at goo pace no matter
    // what the memory would prefer, and the fade makes it permanent.
    if (toneScale > 0) {
      let netX = 0;
      let netZ = 0;
      let touched = 0;
      const tendrilOut = tendrilActive && tendrilStrength > 0;
      const tendrilReach2 = TENDRIL_REACH * TENDRIL_REACH;
      for (let i = 0; i < count; i++) {
        // The pseudopod's capture excuses material from this word too —
        // the velocity corral's exemption alone loses the rim war here,
        // the same way the velocity corral alone lost it (TONE_POS_SHARE).
        if (tendrilOut && tendrilDist2(px[i], py[i], pz[i]) < tendrilReach2) {
          xsW[i] = 0;
          continue;
        }
        const dx = cX - px[i];
        const dz = cZ - pz[i];
        const d2 = dx * dx + dz * dz;
        if (d2 > TONE_CORRAL_RADIUS * TONE_CORRAL_RADIUS) {
          const d = Math.sqrt(d2);
          const creep = Math.min(TONE_VMAX, TONE_VSLOPE * (d - TONE_CORRAL_RADIUS)) * toneScale;
          const move = Math.min(creep * dt * TONE_POS_SHARE, d - TONE_CORRAL_RADIUS);
          px[i] += (dx / d) * move;
          pz[i] += (dz / d) * move;
          netX += (dx / d) * move;
          netZ += (dz / d) * move;
          touched += 1;
          xsW[i] = 2;
        } else {
          xsW[i] = 0;
        }
      }
      // Idle corral gathers without shoving (same rule as the velocity
      // corral above).
      if (touched > 0 && !lureActive && handActive === 0) {
        const nx = netX / touched;
        const nz = netZ / touched;
        for (let i = 0; i < count; i++) {
          if (xsW[i] === 2) {
            px[i] -= nx;
            pz[i] -= nz;
          }
        }
      }
    }

    // The poke's positional word (see PUSH_POS): displace material away
    // from the push point at the commanded speed.
    if (handActive === 2) {
      for (let i = 0; i < count; i++) {
        const dx = px[i] - handX;
        const dy = py[i] - handY;
        const dz = pz[i] - handZ;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < handR * handR && d2 > 1e-12) {
          const d = Math.sqrt(d2);
          const move = handStrength * (1 - d / handR) * PUSH_POS * dt;
          px[i] += (dx / d) * move;
          py[i] += (dy / d) * move;
          pz[i] += (dz / d) * move;
        }
      }
    }

    // The pseudopod's positional word: like the corral's and the poke's,
    // the reach only survives shape matching by having the last word on
    // positions. Bounded by creep·dt with the same soft edge as the
    // velocity form.
    if (tendrilActive && tendrilStrength > 0) {
      const reach2 = TENDRIL_REACH * TENDRIL_REACH;
      for (let i = 0; i < count; i++) {
        // Same capsule capture and core exemption as the velocity word.
        const ccx = px[i] - cX;
        const ccz = pz[i] - cZ;
        if (ccx * ccx + ccz * ccz < TENDRIL_CORE_RADIUS * TENDRIL_CORE_RADIUS) continue;
        const cap2 = tendrilDist2(px[i], py[i], pz[i]);
        if (cap2 >= reach2) continue;
        const dx = tendrilX - px[i];
        const dy = tendrilY - py[i];
        const dz = tendrilZ - pz[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-12) continue;
        const d = Math.sqrt(d2);
        const creep =
          Math.min(TENDRIL_VMAX, TENDRIL_VSLOPE * d) * tendrilStrength * tendrilThrottle;
        const edge = 1 - Math.sqrt(cap2) / TENDRIL_REACH;
        const move = Math.min(creep * edge * dt, d);
        px[i] += (dx / d) * move;
        py[i] += (dy / d) * move;
        pz[i] += (dz / d) * move;
      }
      // No refund — same rule as the velocity word above.
    }

    // ------------------------------------------------------- box + walls
    let ballImpX = 0;
    let ballImpY = 0;
    let ballImpZ = 0;
    for (let i = 0; i < count; i++) {
      let flags = 0;
      if (py[i] < FLOOR_Y) {
        py[i] = FLOOR_Y;
        flags |= 1;
      } else if (py[i] > FLOOR_Y + BOX_HEIGHT) {
        py[i] = FLOOR_Y + BOX_HEIGHT;
        flags |= 2;
      }
      if (px[i] < -BOX_HALF_X) {
        px[i] = -BOX_HALF_X;
        flags |= 2;
      } else if (px[i] > BOX_HALF_X) {
        px[i] = BOX_HALF_X;
        flags |= 2;
      }
      if (pz[i] < -BOX_HALF_Z) {
        pz[i] = -BOX_HALF_Z;
        flags |= 2;
      } else if (pz[i] > BOX_HALF_Z) {
        pz[i] = BOX_HALF_Z;
        flags |= 2;
      }
      // The rocks: static stones the goo cannot enter. The same positional
      // treatment the old sphere stone got — project out along the radial —
      // except the radius now depends on the direction: a river stone is
      // star-shaped, and `stoneSurface` is the one description of where its
      // skin is. The offset and its surface point lie on the same warped
      // radial, so "inside" is just comparing their lengths, and "out" is
      // putting the particle at the surface point. Grippy contact, like the
      // floor — a body lured over a rock mounds up and slides off at goo
      // pace instead of ghosting through the tank's furniture.
      for (let r = 0; r < rocks.length; r++) {
        const rock = rocks[r];
        const dx = px[i] - rock.x;
        const dy = py[i] - rock.y;
        const dz = pz[i] - rock.z;
        if (dx * dx + dy * dy + dz * dz >= rock.boundSq) continue;
        // Into the stone's frame: un-yaw, then undo the ellipsoid's per-axis
        // scaling to recover the direction this offset samples the shape at.
        const lx = rock.cos * dx - rock.sin * dz;
        const ly = dy;
        const lz = rock.sin * dx + rock.cos * dz;
        const axes = rock.stone.axes;
        const wx = lx / axes[0];
        const wy = ly / axes[1];
        const wz = lz / axes[2];
        const wl = Math.hypot(wx, wy, wz);
        if (wl <= 1e-9) continue;
        stoneSurface(rock.stone, wx / wl, wy / wl, wz / wl, rockScratch);
        const surfD = Math.hypot(rockScratch[0], rockScratch[1], rockScratch[2]);
        const offD = Math.hypot(lx, ly, lz);
        if (offD < surfD) {
          px[i] = rock.x + rock.cos * rockScratch[0] + rock.sin * rockScratch[2];
          py[i] = rock.y + rockScratch[1];
          pz[i] = rock.z - rock.sin * rockScratch[0] + rock.cos * rockScratch[2];
          flags |= 1;
        }
        // The climb (see ROCK_HAUL): the goo wetted onto the asked-for rock
        // — in contact or within the grip skin of it — steps up-slope along
        // the surface. The tangent is up with the radial's vertical taken
        // out; at the apex the radial IS up and the step vanishes — hauling
        // self-limits into a perch.
        if (r === hauledRock && offD < surfD + ROCK_GRIP_SKIN) {
          const nd = Math.hypot(px[i] - rock.x, py[i] - rock.y, pz[i] - rock.z);
          if (nd > 1e-9) {
            const ny = (py[i] - rock.y) / nd;
            const tx = (-(px[i] - rock.x) / nd) * ny;
            const ty = 1 - ny * ny;
            const tz = (-(pz[i] - rock.z) / nd) * ny;
            const tl = Math.hypot(tx, ty, tz);
            if (tl > 1e-6) {
              const step = (ROCK_HAUL * dt) / tl;
              px[i] += tx * step;
              py[i] += ty * step;
              pz[i] += tz * step;
            }
          }
        }
      }
      // The ball: solid to the goo like the stone, but *dynamic* — each
      // particle projected out hands the ball the mass-ratio share of the
      // displacement, so a crawling body genuinely bats it away. Slippery
      // contact (the wall flag): the goo slides off its toy rather than
      // gripping it.
      if (ballR > 0) {
        const bx = px[i] - ballX;
        const by = py[i] - ballY;
        const bz = pz[i] - ballZ;
        const bd2 = bx * bx + by * by + bz * bz;
        if (bd2 < ballR * ballR && bd2 > 1e-12) {
          const push = ballR / Math.sqrt(bd2);
          const nx = ballX + bx * push;
          const ny = ballY + by * push;
          const nz = ballZ + bz * push;
          ballImpX -= (nx - px[i]) * BALL_COUPLE;
          ballImpY -= (ny - py[i]) * BALL_COUPLE;
          ballImpZ -= (nz - pz[i]) * BALL_COUPLE;
          px[i] = nx;
          py[i] = ny;
          pz[i] = nz;
          flags |= 2;
        }
      }
      contact[i] = flags;
    }
    // The goo's word to the ball, as one positional shove plus the matching
    // velocity change — bounded by how much material was actually displaced,
    // so no gesture through the slime can fire the ball across the tank.
    if (ballR > 0 && (ballImpX !== 0 || ballImpY !== 0 || ballImpZ !== 0)) {
      // Pinched against the glass: any part of the shove that would drive
      // the ball into a wall (or the floor) it is already resting on cannot
      // move it — the wall clamp would eat it and the ball would sit
      // trapped in the corner under a crawling pile. Instead that blocked
      // magnitude squirts the ball up and toward the open tank, like a wet
      // seed squeezed between fingers.
      const wallEps = ballR * 0.05;
      let blocked = 0;
      if (ballX <= -BOX_HALF_X + ballR + wallEps && ballImpX < 0) {
        blocked -= ballImpX;
        ballImpX = 0;
      } else if (ballX >= BOX_HALF_X - ballR - wallEps && ballImpX > 0) {
        blocked += ballImpX;
        ballImpX = 0;
      }
      if (ballZ <= -BOX_HALF_Z + ballR + wallEps && ballImpZ < 0) {
        blocked -= ballImpZ;
        ballImpZ = 0;
      } else if (ballZ >= BOX_HALF_Z - ballR - wallEps && ballImpZ > 0) {
        blocked += ballImpZ;
        ballImpZ = 0;
      }
      if (ballY <= FLOOR_Y + ballR + wallEps && ballImpY < 0) {
        blocked -= ballImpY;
        ballImpY = 0;
      }
      if (blocked > 0) {
        const cx = -ballX;
        const cz = -ballZ;
        const cl = Math.hypot(cx, cz) || 1;
        ballImpY += blocked * 0.7;
        ballImpX += (cx / cl) * blocked * 0.5;
        ballImpZ += (cz / cl) * blocked * 0.5;
      }
      ballX += ballImpX;
      ballY = Math.max(FLOOR_Y + ballR, ballY + ballImpY);
      ballZ += ballImpZ;
      const invDtImp = 1 / dt;
      ballVX += ballImpX * invDtImp;
      ballVY += ballImpY * invDtImp;
      ballVZ += ballImpZ * invDtImp;
    }

    // ------------------------------------- velocities from positions
    const invDt = 1 / dt;
    for (let i = 0; i < count; i++) {
      let nvx = (px[i] - prevX[i]) * invDt;
      let nvy = (py[i] - prevY[i]) * invDt;
      let nvz = (pz[i] - prevZ[i]) * invDt;
      if (contact[i] & 1) {
        // Cork floor: grippy, dead.
        nvx *= FLOOR_KEEP;
        nvz *= FLOOR_KEEP;
      } else if (contact[i] & 2) {
        nvx *= WALL_KEEP;
        nvy *= WALL_KEEP;
        nvz *= WALL_KEEP;
      }
      vx[i] = nvx;
      vy[i] = nvy;
      vz[i] = nvz;
    }

    // XSPH: pairwise viscous exchange — each pair trades equal and
    // opposite velocity, so the pile moves as goo rather than as a
    // thousand marbles, and the exchange cannot create momentum.
    xsX.fill(0);
    xsY.fill(0);
    xsZ.fill(0);
    const invH = 1 / COHESION_RADIUS;
    for (let p = 0; p < pairCount; p++) {
      const i = pairs[p * 2];
      const j = pairs[p * 2 + 1];
      const dx = px[j] - px[i];
      const dy = py[j] - py[i];
      const dz = pz[j] - pz[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const w = Math.max(0, 1 - d * invH) * XSPH_K * viscosityScale;
      if (w <= 0) continue;
      const ex = w * (vx[j] - vx[i]);
      const ey = w * (vy[j] - vy[i]);
      const ez = w * (vz[j] - vz[i]);
      xsX[i] += ex;
      xsY[i] += ey;
      xsZ[i] += ez;
      xsX[j] -= ex;
      xsY[j] -= ey;
      xsZ[j] -= ez;
    }
    for (let i = 0; i < count; i++) {
      vx[i] += xsX[i];
      vy[i] += xsY[i];
      vz[i] += xsZ[i];
    }

    // --------------------------------------------------- memory turnover
    rebuildTick += 1;
    if (rebuildTick % rebuildStride === 0 && clusterCount > 0) {
      const k = rebuildCursor;
      rebuildCursor = (rebuildCursor + 1) % clusterCount;
      if (clusterStrain[k] > REBUILD_STRAIN || memberLen[k] < MIN_MEMBERS) {
        buildCluster(k, clusterCX[k], clusterCY[k], clusterCZ[k]);
      }
    }
  }

  let accumulator = 0;

  const api: ParticleWorld = {
    particleCount: count,

    step(dt) {
      accumulator += Math.min(dt, 0.1);
      while (accumulator >= PBD_DT) {
        substep();
        accumulator -= PBD_DT;
      }
      // The hand's command decays each frame unless refreshed.
      handStrength *= 0.5;
      if (handStrength < 0.01) handActive = 0;
    },

    readPositions(out) {
      for (let i = 0; i < count; i++) {
        out[i * 3] = px[i];
        out[i * 3 + 1] = py[i];
        out[i * 3 + 2] = pz[i];
      }
    },

    readVelocities(out) {
      for (let i = 0; i < count; i++) {
        out[i * 3] = vx[i];
        out[i * 3 + 1] = vy[i];
        out[i * 3 + 2] = vz[i];
      }
    },

    pullTowards(x, y, z, radius, tvx, tvy, tvz, strength) {
      handActive = 1;
      handX = x;
      handY = y;
      handZ = z;
      handR = radius;
      handVX = tvx;
      handVY = tvy;
      handVZ = tvz;
      handStrength = Math.min(1, Math.max(0, strength));
    },

    pushFrom(x, y, z, radius, speed) {
      handActive = 2;
      handX = x;
      handY = y;
      handZ = z;
      handR = radius;
      handStrength = Math.max(0, speed);
    },

    flipForTest() {
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < count; i++) {
        cy += py[i];
        cz += pz[i];
      }
      cy /= count;
      cz /= count;
      for (let i = 0; i < count; i++) {
        py[i] = 2 * cy - py[i];
        pz[i] = 2 * cz - pz[i];
        vx[i] = vy[i] = vz[i] = 0;
      }
      // The flip is a rigid rotation (Rx(π)) — rotate every cluster's rest
      // shape with it so stored strain stays consistent with the new pose.
      // Never mirror: a mirrored rest set flips chirality (the same rule
      // the mesh's test-flip helper learned the hard way).
      for (let k = 0; k < clusterCount; k++) {
        const base = k * MAX_MEMBERS;
        for (let m = 0; m < memberLen[k]; m++) {
          restY[base + m] = -restY[base + m];
          restZ[base + m] = -restZ[base + m];
        }
        clusterQ[k * 4] = 1;
        clusterQ[k * 4 + 1] = clusterQ[k * 4 + 2] = clusterQ[k * 4 + 3] = 0;
      }
    },

    sampleAround(x, y, z, radius, out) {
      const r2 = radius * radius;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let i = 0; i < count; i++) {
        const dx = px[i] - x;
        const dy = py[i] - y;
        const dz = pz[i] - z;
        if (dx * dx + dy * dy + dz * dz < r2) {
          sx += px[i];
          sy += py[i];
          sz += pz[i];
          n += 1;
        }
      }
      if (n > 0) {
        out[0] = sx / n;
        out[1] = sy / n;
        out[2] = sz / n;
      }
      return n;
    },

    setLure(x, z, urgency = 1) {
      lureActive = true;
      lureX = x;
      lureZ = z;
      lureLean = LURE_LEAN * Math.min(1.6, Math.max(0.2, urgency));
    },

    setRocks(list) {
      rocks.length = 0;
      for (const r of list) {
        const extents = stoneExtents(r.stone);
        rocks.push({
          x: r.x,
          y: r.y,
          z: r.z,
          cos: Math.cos(r.yaw),
          sin: Math.sin(r.yaw),
          boundSq: extents[0] ** 2 + extents[1] ** 2 + extents[2] ** 2,
          footprintSq: extents[0] ** 2 + extents[2] ** 2,
          stone: r.stone
        });
      }
    },

    setBall(x, y, z, radius, vx = 0, vy = 0, vz = 0) {
      ballR = Math.max(0, radius);
      ballX = x;
      ballY = Math.max(FLOOR_Y + ballR, y);
      ballZ = z;
      // A throw arrives already moving; stepBall's cap reins in anything
      // wild before the first integration.
      ballVX = vx;
      ballVY = vy;
      ballVZ = vz;
      ballWX = ballWY = ballWZ = 0;
      ballQW = 1;
      ballQX = ballQY = ballQZ = 0;
    },

    clearBall() {
      ballR = 0;
    },

    kickBall(vx, vy, vz) {
      if (ballR <= 0) return;
      ballVX += vx;
      ballVY += vy;
      ballVZ += vz;
    },

    readBall(out) {
      if (ballR <= 0) return false;
      out[0] = ballX;
      out[1] = ballY;
      out[2] = ballZ;
      out[3] = ballQX;
      out[4] = ballQY;
      out[5] = ballQZ;
      out[6] = ballQW;
      return true;
    },

    clearLure() {
      lureActive = false;
    },

    setTendril(x, y, z, strength) {
      tendrilActive = true;
      tendrilTargetX = x;
      tendrilTargetY = y;
      tendrilTargetZ = z;
      tendrilStrength = Math.min(1, Math.max(0, strength));
    },

    clearTendril() {
      tendrilActive = false;
      tendrilTipSeeded = false;
      tendrilStrength = 0;
    },

    hop(upSpeed, driftX = 0, driftZ = 0) {
      hopUp = Math.min(HOP_UP_MAX, Math.max(0, upSpeed));
      const drift = Math.hypot(driftX, driftZ);
      const k = drift > HOP_DRIFT_MAX ? HOP_DRIFT_MAX / drift : 1;
      hopDX = driftX * k;
      hopDZ = driftZ * k;
      hopPending = hopUp > 0;
    },

    setMaterialScale(stiffness: number, memory: number, tone = 1) {
      stiffnessScale = Math.max(0.05, stiffness);
      memoryScale = Math.max(0.05, memory);
      toneScale = Math.max(0, tone);
    },

    setTuning(viscosity: number, pressure: number, shape = 1) {
      // Zero turns a term off; negative would invert it (agitation,
      // clumping, shape-fleeing) and is refused here regardless of caller.
      viscosityScale = Math.max(0, viscosity);
      pressureScale = Math.max(0, pressure);
      shapeScale = Math.max(0, shape);
    }
  };
  return api;
}

// Physics modules must never hot-swap; see the guard note in joltWorld.ts.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
