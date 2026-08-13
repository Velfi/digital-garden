/**
 * Every tuning number for the marimo tank lives here.
 *
 * The care-clock constants (anything with a `_TAU` or `_PER_SEC` suffix used by
 * `careSim.ts`) must only ever appear in step-size-invariant expressions —
 * either `x += rate * dt` or `x += (target - x) * (1 - exp(-dt / tau))`. That is
 * what lets `catchUp.ts` advance a month in a few thousand coarse steps and get
 * the same answer as a month of one-second ticks.
 */

// ---------------------------------------------------------------- time scale

/** Marimo-years per real year. The single knob controlling how fast it grows. */
export const MARIMO_TIME_COMPRESSION = 6;

/** Lake Akan giant marimo grow ~12.6 mm of diameter per year, so 6.3 mm of radius. */
export const REAL_RADIUS_MM_PER_YEAR = 6.3;

export const SECONDS_PER_YEAR = 31_557_600;

/** Radius growth at perfect health. ~0.207 mm of diameter per real day. */
export const GROWTH_MM_PER_SEC =
  (REAL_RADIUS_MM_PER_YEAR * MARIMO_TIME_COMPRESSION) / SECONDS_PER_YEAR;

// ------------------------------------------------------------------- growth

export const INITIAL_RADIUS_MM = 12;
/**
 * Radius range for the fragments offered at the chooser.
 *
 * A real marimo regrows from almost nothing — a single filament will do — but
 * below about a centimetre across the rolling never gathers the strands into a
 * sphere, and here it would also mean months of watching a speck. These are
 * torn-off pieces of a bigger ball, which is how you actually get one.
 */
export const FRAGMENT_MIN_RADIUS_MM = 6;
export const FRAGMENT_MAX_RADIUS_MM = 13;

/** One of the shapes the chooser offers. See `FRAGMENT_GRADES`. */
export interface FragmentGrade {
  /** What the chooser calls it, and what `describeRoughness` answers. */
  word: string;
  /**
   * Band of `shapeRoughness` the piece is built to land in — how far its
   * silhouette departs from a circle, as a fraction of radius. Measured off the
   * finished shape rather than requested as a coefficient norm, so the band
   * means the same thing the eye does.
   */
  minPeak: number;
  maxPeak: number;
  /** Lobes summed to build it. More lobes read as more broken-up, not just deeper. */
  minLobes: number;
  maxLobes: number;
  /** Chance a lobe scoops inward rather than bulging out. */
  scoopChance: number;
  /**
   * Depth of the flat face where it tore away, as a fraction of radius. Zero
   * for a piece that came off cleanly.
   *
   * A torn fragment is the one case where a marimo starts life with a facet
   * rather than earning one by lying still, and it is what makes the roughest
   * option read as broken off rather than merely misshapen. It rounds out the
   * same way an earned one does: by being outgrown.
   */
  tornFace: number;
}

/**
 * The three pieces the chooser offers, roundest first.
 *
 * Graded rather than drawn independently: three amplitudes out of one range
 * land close together often enough that the choice reads as "pick a marimo"
 * rather than "pick a shape", which is the one thing this screen is for. The
 * bands are kept well apart so the three are never mistakable for each other,
 * and the roughest tops out inside what `BIAS_MAX` allows — a fragment the
 * grown-marimo cap would have to shrink is one that looks different in the tank
 * from how it looked in the chooser.
 *
 * The floor is not zero: even the round option has to read as something torn
 * off a bigger ball rather than as a small finished marimo.
 */
export const FRAGMENT_GRADES: readonly FragmentGrade[] = [
  {
    word: 'mostly round',
    minPeak: 0.012,
    maxPeak: 0.032,
    minLobes: 1,
    maxLobes: 2,
    scoopChance: 0.5,
    tornFace: 0
  },
  {
    word: 'a little lumpy',
    minPeak: 0.06,
    maxPeak: 0.085,
    minLobes: 2,
    maxLobes: 3,
    scoopChance: 0.6,
    tornFace: 0.045
  },
  {
    word: 'very lumpy',
    minPeak: 0.128,
    maxPeak: 0.155,
    minLobes: 3,
    maxLobes: 5,
    scoopChance: 0.68,
    tornFace: 0.09
  }
];

/**
 * Per-band weights on a fragment's lobes, relative to an ordinary dent.
 *
 * l=1 is nearly free to leave out and expensive to keep: it slides the ball
 * inside its own frame instead of deforming it, so a fragment built from plain
 * dents spends most of its `BIAS_MAX` budget on an offset nobody can see, and
 * comes out looking like an egg however deep the lobes were. Spending that
 * budget on l=3 instead is what makes the roughest option read as *torn* —
 * pear-shaped, three-cornered, with a flat where it came away — rather than
 * merely oval. See `shapeRoughness`.
 */
export const FRAGMENT_BAND_TILT: readonly number[] = [0, 0.2, 1, 2.4];

/**
 * Depth of a fragment's later lobes relative to its first.
 *
 * One dominant feature with smaller ones around it, rather than several equals:
 * it looks more like something torn off — a main scoop, and the smaller damage
 * around where it came away — and it concentrates the deviation instead of
 * spreading it evenly, which is what lets the roughest grade reach its band at
 * all without asking for a norm past `BIAS_MAX`.
 */
export const FRAGMENT_SATELLITE_DEPTH = 0.65;

/**
 * Lobe layouts tried before a fragment settles for what it has.
 *
 * A layout whose lobes cancel each other needs a bigger coefficient norm to
 * reach the same visible lumpiness, and past `BIAS_MAX` there is none to be
 * had. Redrawing the layout is cheaper than deepening it past the cap: about
 * one layout in ten falls short at the roughest grade, so a dozen tries puts
 * "we had to settle" out of reach in practice.
 */
export const FRAGMENT_LAYOUT_TRIES = 12;
/** Big enough that a well-kept marimo nearly fills the jar. A fine endgame. */
export const MAX_RADIUS_MM = 45;
/**
 * Radius gained per growth ring. Chosen against MAX_RADIUS_MM so a marimo that
 * reaches full size lays down rather more than MAX_RINGS rings, and the oldest
 * really do get dropped — otherwise the cap would be dead code.
 * At full health that is a ring roughly every three real days.
 */
export const RING_SPACING_MM = 0.3;
export const MAX_RINGS = 96;

// ------------------------------------------------------------ vigor/fouling

/** Time constant for the water going stale. Noticeably murky after ~1 week. */
export const FOUL_TAU = 8 * 86400;
/** How fast greenness chases the condition the water implies. */
export const VIGOR_TAU = 3 * 86400;
/** How much fouling drags vigor down at its worst. */
export const VIGOR_FOULING_PENALTY = 0.8;
/** Vigor can never fall below this. The "it can never die" guarantee, part 1. */
export const VIGOR_FLOOR = 0.12;
/** Growth can never fall below this fraction of full speed. Guarantee, part 2. */
export const HEALTH_FLOOR = 0.15;
export const HEALTH_FOULING_PENALTY = 0.55;

/** A water change wipes fouling and gives a small immediate vigor bump. */
export const WATER_CHANGE_VIGOR_BONUS = 0.08;
/** Below this, the water change button is disabled — the water is already clear. */
export const WATER_CHANGE_MIN_FOULING = 0.08;

// ------------------------------------------------------------ shape/rotation

/**
 * Peak radial flattening at the contact point, as a fraction of mean radius.
 *
 * Lower than it used to be because it is now worth all of what it says. The
 * flat spot was a spherical-harmonic dent, and about two fifths of a dent's
 * depth lives in l=1 — which, to first order, slides the ball sideways inside
 * its own frame rather than deforming it. So 0.16 of dent bought about 0.10 of
 * visible flattening. As a plane cut (see `facets.ts`) every bit of it shows.
 */
export const DENT_MAX = 0.1;

/**
 * The flat spot is deliberately asymmetric in time: slow to form, much quicker
 * to undo.
 *
 * An earlier version accumulated stillness linearly over days and drained it at
 * a fixed multiple while turning, which meant erasing a week of neglect needed
 * about twenty-one hours of continuous rolling. Nobody would ever discover the
 * mechanic. Forming over days and recovering over minutes of actual play is
 * both more forgiving and more legible, and it is still the same story: turning
 * is what keeps it round.
 */
export const DENT_FORM_TAU = 2 * 86400;
/** About a minute of steady rolling halves the flat spot. */
export const DENT_RECOVER_TAU = 90;

/**
 * How much the resting contact suppresses growth on that side, per unit of dent.
 *
 * Above 1 on purpose. A shaded side would merely fail to gain, but the contact
 * patch is also pressed flat and scuffed against the gravel, so it loses ground
 * relative to the mean rather than just standing still. This is the whole
 * mechanism by which a flat spot stops being temporary: see `stepCare`.
 */
export const GROWTH_SHADOW = 1.6;
/** Cap on peak permanent deviation, as a fraction of mean radius. */
export const BIAS_MAX = 0.18;

/**
 * Hard clamp on total radial deviation, to keep l<=3 ringing in check.
 *
 * Only the smooth field passes through here now. Facets are cuts rather than
 * summed terms — a plane cannot ring, and its depth is capped on its own — so
 * this only has to cover a fully baked-in bias, with enough headroom that the
 * clamp never bites on a shape the sim can actually produce (the most a bias at
 * the norm cap can reach in any one direction is about `BIAS_MAX * 1.15`).
 */
export const SHAPE_DEVIATION_CLAMP = BIAS_MAX * 1.9;

// ------------------------------------------------------------------- facets

/**
 * How many flat faces a marimo may carry at once.
 *
 * Three, because that is what one can actually collect: a marimo that is never
 * turned lies on one side and flattens there; one that gets turned occasionally
 * and then left alone collects a second and becomes a cushion, which is what the
 * pressed ones in Lake Akan look like; three is already an unusual life. Past
 * that it would be a die, not an alga.
 */
export const MAX_FACETS = 3;

/**
 * Width of the rounded rim where a flat face meets the curve, as a fraction of
 * mean radius.
 *
 * Not sharp, on purpose. The flat is pressed into a 3 mm pile of filaments, so
 * the edge is always a roll rather than a crease — and a crease at this mesh
 * density would alias into a visible ring of facets anyway.
 */
export const FACET_RIM = 0.055;

/** Deepest a permanent flat may get, as a fraction of mean radius. */
export const FACET_MAX_DEPTH = 0.15;
/** Shallower than this and a facet is dropped; it is under a coat this deep. */
export const FACET_MIN_DEPTH = 0.004;
/**
 * How nearly a new contact has to line up with an existing flat to deepen it
 * rather than start another. cos(25 degrees) — wide enough that a marimo
 * rocking slightly in place keeps working on the same face.
 */
export const FACET_MERGE_COS = 0.906;
/** How eagerly a facet being deepened swings round to face where it now rests. */
export const FACET_AXIS_TRACK = 0.6;

/**
 * Moment arm of the gravel's reaction under a tipped flat, as a fraction of the
 * mean radius.
 *
 * The point of the whole exercise: a flattened marimo does not sit on its flat
 * because it was drawn that way, it sits on it because that is the stable place
 * to be. But it gets there as a *torque* — the support point sits under the low
 * edge of the face rather than under the middle of the ball, and the offset is
 * a lever on the ball's weight. Scaled by depth, so a barely-marked ball is not
 * visibly magnetic.
 *
 * Smaller than the bare geometry says, and deliberately: the true offset is a
 * good tenth of the radius, but the ball has to roll its contact patch through
 * the gravel to use it, and rolling resistance on loose grains eats most of it.
 * What is left is tuned so a marimo leans over onto its face across a couple of
 * seconds and rocks once — the water decides the rest.
 */
export const FACET_SETTLE_ARM = 0.03;
/** Above this speed it is rolling, not settling, and the tipping is switched off. */
export const FACET_SETTLE_SPEED = 0.02;

/** Angular speed that counts as "fully turning". */
export const OMEGA_REF = 1.5;
/**
 * How quickly the rolling average of rotation responds. Short enough that half
 * a minute of play visibly counts as "turning", which is the feedback loop the
 * whole roundness mechanic depends on.
 */
export const TURN_TAU = 45;
/** Turning this much counts as fully in motion for the purposes of re-rounding. */
export const TURN_CREDIT_FOR_FULL_ROUNDING = 0.3;

// ----------------------------------------------------------------- buoyancy

export const RHO_WATER = 1000;
export const RHO_ALGA = 1035;
export const RHO_AIR = 1.2;
export const GRAVITY = 9.81;
export const DRAG_COEF = 0.9;
export const ADDED_MASS_COEF = 0.5;
/** Volume fraction replaced by gas at `gas === 1`. Tuned for neutral around 0.57. */
export const GAS_FULL_FRACTION = 0.06;

/** Photosynthetic fill time constant, scaled by health. */
export const GAS_TAU = 2.5 * 3600;
/** Passive loss, so a badly neglected marimo settles and stops surfacing. */
export const GAS_LEAK_TAU = 36 * 3600;
export const VENT_THRESHOLD = 0.85;
export const GAS_AFTER_VENT = 0.05;
export const VENT_DURATION_SEC = 8;
/** A squeeze expels this much trapped gas. */
export const SQUEEZE_GAS_RELEASE = 0.4;

// -------------------------------------------------------------------- water

/**
 * Jar interior, metres — about 11 cm across and 10 cm of water. Deliberately
 * small: a desk jar, not an aquarium, so the marimo reads large enough on
 * screen for the filaments to be worth rendering.
 */
export const TANK_HALF_X = 0.055;
export const TANK_HALF_Z = 0.045;
export const FLOOR_Y = -0.05;
/**
 * Filled to about 8 cm. Deliberately not to the brim: with the marimo framed as
 * the subject, a taller column pushes the surface out of shot entirely, and the
 * underside of the surface is where most of the water rendering lives.
 */
export const WATER_Y = 0.03;

/** Stirred water spins down over a few seconds. */
export const WATER_SPIN_TAU = 6;
/**
 * The overturning cell dies much faster than the spin. Rotation about the jar's
 * axis can coast — nothing opposes it but wall friction — whereas water shoved
 * upwards has to come back down the moment you stop pushing, because the jar is
 * closed. Making this short is also what stops a flick of the pointer from
 * parking the marimo against the surface for six seconds.
 */
export const WATER_DRIFT_TAU = 1.5;
export const SWIRL_MAX_OMEGA = 4;
export const SWIRL_MAX_VY = 0.09;
/**
 * How fast rotation catches up with what your hand is doing.
 *
 * A hand is a grip, not a nudge: it sets the rolling rate rather than pulling
 * the ball toward it, and this is only the lag on getting there. Must stay well
 * under the period of a typical drag. At 1.2 s it low-passed the back-and-forth
 * of rolling the ball, so the target reversed before it ever spun up and
 * handling it registered as barely turning at all.
 *
 * The water does *not* use this. Water resists turning; it does not dictate a
 * rate. See `SPIN_COAT_DRAG`.
 */
export const SPIN_COUPLE_TAU = 0.18;

export const FLOOR_RESTITUTION = 0.05;

/**
 * Friction between the coat and the gravel, as two Coulomb coefficients.
 *
 * These deliberately replace a per-step `velocity *= 0.88`. A multiplier is
 * exponential: it decays and never arrives, and the leftover is not harmless,
 * because the rolling rate is speed divided by a 15 mm radius. A millimetre a
 * second of creep the eye cannot see is still four degrees a second of turn it
 * can, so a stirred marimo sat on the bottom and revolved indefinitely. A
 * constant deceleration reaches exactly zero, in finite time, and stays.
 *
 * Sliding is the ordinary wet-plant-on-wet-stone figure. Rolling resistance is
 * enormous by wheel standards and should be: the "road" is loose gravel with
 * grains a tenth of the ball across, so rolling is mostly a matter of climbing
 * out of one hollow into the next.
 */
export const FLOOR_MU_SLIDE = 0.6;
export const FLOOR_MU_ROLL = 0.25;
/**
 * Floor under the contact load, m/s².
 *
 * Load-proportional friction alone gives a near-neutral marimo no grip at all,
 * because the water is holding up nearly all of its weight — and near-neutral is
 * exactly where a well-kept marimo lives. But a ball that light does not rest
 * *on* gravel, it rests *in* it, bedded a grain or two deep, and climbing out of
 * its own dimple costs about the same however little it weighs.
 */
export const FLOOR_BED_ACCEL = 0.02;
/**
 * Spin-down per unit contact deceleration, in units of 1/radius.
 *
 * For a solid sphere, a friction force `mu*N` acting at radius `R` sheds slip at
 * `mu*N*R / I = 2.5*mu*N/(m*R)`. The 2.5 is `1 / (2/5)`, the inertia of a sphere
 * about its centre — the one place this model does admit to having one.
 */
export const SPIN_FRICTION_COEF = 2.5;

// -------------------------------------------------------- turning underwater

/** Dynamic viscosity of water at room temperature, Pa·s. */
export const WATER_VISCOSITY = 1.0e-3;

/**
 * Stokes rotational drag over the inertia of a solid sphere: 8π / ((2/5)·(4/3)π).
 *
 * A sphere turning in a viscous fluid feels `8*pi*mu*R^3*w` opposing it. Divided
 * by `(2/5)*m*R^2` the radius cancels down to `15*mu/(rho*R^2)` — a rate, in
 * 1/s, and the whole of why a big marimo goes on turning long after a small one
 * has stopped.
 */
export const SPIN_VISCOUS_COEF = 15;

/**
 * How much more the coat resists turning than the bare ball would.
 *
 * A marimo is not a sphere in water, it is 3 mm of loose filament in water, and
 * the shear happens right through that mat rather than across a clean boundary.
 * Eight is the difference between a spun ball coasting for a couple of seconds
 * and coasting for fifteen, and two seconds is what the real thing does.
 */
export const SPIN_COAT_DRAG = 8;

/**
 * Form drag on the rotation: `15*C_rot / (8*pi)`, again over a sphere's inertia.
 *
 * Quadratic in spin, so it is nothing at all at the rates a settling marimo
 * reaches and the dominant term when one has been flicked hard. That asymmetry
 * is the signature of a thing turning in water rather than one being eased
 * toward a number: fast spins die fast, slow spins linger.
 */
export const SPIN_FORM_COEF = 0.35;

// ------------------------------------------------------------------ catch-up

/** Target coarse step when advancing elapsed wall time. */
export const CATCHUP_TARGET_STEP_SEC = 3600;
/** Hard ceiling on step count, so any elapsed time costs bounded work. */
export const CATCHUP_MAX_STEPS = 4000;
/** Absolute sanity clamp on elapsed time, against a wildly wrong system clock. */
export const CATCHUP_MAX_ELAPSED_SEC = 10 * SECONDS_PER_YEAR;
/** Bound on vent cycles resolved analytically in one catch-up. */
export const CATCHUP_MAX_VENTS = 5000;

// ---------------------------------------------------------------- rendering

/** Filament count on the full app. ~5 px strand spacing on a 400 px ball. */
export const FILAMENT_COUNT_FULL = 16384;
/** Filament count for the ambient variant embedded in the post. */
export const FILAMENT_COUNT_AMBIENT = 6144;
/** Strand length as a fraction of mean radius, before per-strand jitter. */
export const FILAMENT_LENGTH_FRAC = 0.075;
/** Strand base width as a fraction of mean radius. */
export const FILAMENT_WIDTH_FRAC = 0.008;
/** Minimum on-screen strand width in pixels, to stop sub-pixel shimmer. */
export const FILAMENT_MIN_PIXEL_WIDTH = 1.2;
/** How far strand directions wander off pure-radial. Velvet, not sea urchin. */
export const FILAMENT_DIR_JITTER = 0.22;

// The coat does not track the water instantly — it has mass and it is wet, so
// it lags going in and overshoots coming back. A deliberately underdamped
// spring on the flow vector is what reads as "underwater" rather than "wired
// to the mouse".
/** Natural frequency of the coat's response to the flow, rad/s. */
export const FILAMENT_FLOW_OMEGA = 8;
/** Damping ratio. Below 1, so stopping the water leaves a visible recoil. */
export const FILAMENT_FLOW_DAMPING = 0.34;
/** Integration step for that spring. Keeps it stable on a slow frame. */
export const FILAMENT_FLOW_STEP_SEC = 1 / 120;

/** Sway wave speed, rad/s. */
export const FILAMENT_SWAY_SPEED = 2.7;
/**
 * Phase change across the ball, in radians per unit of the direction projected
 * onto the flow. Sets how many bands of sway are visible at once — low enough
 * that neighbouring strands move together and you read one coat, not noise.
 */
export const FILAMENT_SWAY_BANDS = 3.4;
/** Sway amplitude in still water, as a fraction of strand length. */
export const FILAMENT_SWAY_IDLE = 0.09;
/** Extra sway amplitude at reference flow, as a fraction of strand length. */
export const FILAMENT_SWAY_GAIN = 0.5;
/** Flow magnitude (in the shader's already-scaled units) that saturates gain. */
export const FILAMENT_SWAY_FLOW_REF = 1.2;

export const ICOSPHERE_DETAIL = 4;

// -------------------------------------------------------------------- stones

/**
 * Icosphere subdivisions a river stone is built from.
 *
 * The same as the marimo's, for a different reason. The marimo needs the
 * vertices because it is displaced in the vertex shader every frame and its coat
 * needs somewhere to stand; a stone is deformed once on the CPU and then never
 * moves a vertex again. What needs the detail here is the *colour*, which is
 * baked per vertex — bedding and speckle are the difference between a rock and a
 * bead — and the flat faces, whose edges are only as sharp as the triangles
 * crossing them.
 */
export const STONE_DETAIL = 4;

/**
 * Quartz-ish, kg/m^3. Well over water, which is the point: stones sink.
 *
 * This, the friction and the restitution below are the whole of the stones'
 * physics tuning. Everything else — mass, inertia, buoyancy, drag, how they
 * fall and how they stack — is the engine integrating over the real shapes at
 * real scale. See `joltWorld.ts`.
 */
export const STONE_DENSITY = 2650;

/** Rock on gravel, and rock on rock. High: none of this is meant to slide far. */
export const STONE_FRICTION = 0.62;
/** Stone onto gravel is a thud, not a bounce. */
export const STONE_RESTITUTION = 0.08;

/** How far a resting stone sits down into the gravel bed, metres. */
export const STONE_BED_DEPTH = 0.0015;

/**
 * Where a dropped stone appears, relative to the waterline, in metres.
 *
 * Zero: it arrives lying *in* the surface, and sinks from there.
 *
 * Dropping it in from a height was the first thing tried and there is nowhere
 * to drop it from. The camera is held below the waterline looking very slightly
 * up, so the surface sits within a few pixels of the top of the frame — a stone
 * is drawn a good deal larger than the entire strip of air above it, and popping
 * one in up there does the whole animation off the top of the picture and
 * arrives as a splash from nowhere.
 *
 * Starting on the line turns out to be the better reading anyway: the sticker
 * lies flat on the water, becomes a stone, and goes under. That is the moment
 * the whole feature is about, and it happens where it can be watched.
 */
export const STONE_SPAWN_HEIGHT = 0;

/** How long the 2D sticker takes to inflate into a 3D stone, seconds. */
export const STONE_POP_SEC = 0.42;
/**
 * How far past full size the pop overshoots before it settles.
 *
 * This is the entire difference between a stone that grows and a stone that
 * pops. Small, because it is read at the end of a fast move and a large
 * overshoot on a rock reads as rubber.
 */
export const STONE_POP_OVERSHOOT = 0.11;

/**
 * Room for as many as this in the jar at once.
 *
 * Four. The jar is eleven centimetres across and these are proper cobbles now;
 * past four the gravel is paved over, the marimo has nowhere to roll, and a
 * collection stops reading as an arrangement and starts reading as a pile.
 */
export const STONE_MAX_IN_TANK = 4;

/** How many shapes the box offers at once. One row, one per slot. */
export const STONE_OFFER_COUNT = 4;
/** How close to the glass a stone may be placed, metres. */
export const STONE_WALL_MARGIN = 0.0015;
/** Tries at finding a spot that overlaps nothing before taking the best one. */
export const STONE_PLACEMENT_TRIES = 32;
