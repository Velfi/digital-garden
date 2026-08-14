/**
 * Every tuning number for the slime terrarium lives here.
 *
 * Same house rule as the marimo's `constants.ts`: any care-clock constant
 * (anything with a `_TAU` or `_PER_SEC` suffix) must only ever appear in
 * step-size-invariant expressions — either `x += rate * dt` or
 * `x += (target - x) * (1 - exp(-dt / tau))` — so catch-up over a month of
 * absence and a month of one-second ticks give the same pet.
 */

// ---------------------------------------------------------------- terrarium

/**
 * Terrarium interior, metres — 12 cm across, 9 deep, 8 tall. A dry glass box
 * on a desk, no lid a slime could reach: it is a puddle animal, not a climber.
 * Deliberately shallow front-to-back so the pet is never far from the glass
 * and reads large on screen.
 */
export const BOX_HALF_X = 0.06;
export const BOX_HALF_Z = 0.045;
export const FLOOR_Y = -0.028;
export const BOX_HEIGHT = 0.08;

// ------------------------------------------------------------------- physics

/**
 * The simulation step. The marimo runs 240 Hz because centimetre rigid bodies
 * in water want it; a soft body's cost is verts × solver iterations *per
 * step*, and a resting blob looks identical at half the rate. 120 Hz keeps
 * `rate·dt` terms comfortable and leaves the frame budget for the solver.
 */
export const SIM_STEP_SEC = 1 / 120;
/**
 * Substeps per rendered frame, and the accumulator's whole backlog budget. A
 * 30 fps frame needs 4 to run real-time, so 5 leaves one substep of catch-up
 * headroom; anything generous re-creates the stutter spiral the cap exists
 * to prevent (see the accumulator in slimeScene).
 */
export const MAX_SIM_SUBSTEPS = 5;

/** Substrate under the slime: cork-ish, grippy, dead. */
export const FLOOR_FRICTION = 0.7;
export const FLOOR_RESTITUTION = 0.02;

// --------------------------------------------------------------- soft body

/**
 * Whole-slime mass, kilograms. About what the volume says at a bit over water
 * density — the shape encloses ~1.2e-5 m³ (`volumeOf` is pinned near this in
 * the tests). Divided evenly over the vertices; the mesh is uniform enough
 * that per-area weighting would be fuss without visible reward.
 */
export const SLIME_MASS_KG = 0.014;

/**
 * Internal overpressure, in pascals. Jolt wants `n·R·T` (instantaneous
 * pressure = `mPressure / volume`), so these are multiplied by the *measured*
 * rest volume — `volumeOf(egg)` at body creation — rather than by a written-
 * down volume that would silently go stale every time the shape is redrawn.
 * It already changed once, egg to gumdrop.
 *
 * The overpressure is deliberately of the same order as the blob's own
 * weight-pressure (mass over footprint): enough to keep it plumped rather
 * than slumped, not enough to inflate it. The first guess was 1000 Pa —
 * fourteen times its weight — and the settle test measured the result: 2.3×
 * rest volume, a balloon that never stopped wobbling.
 */
// Retuned for the gumdrop: 24 mm of jelly weighs in at ~110 Pa over its own
// footprint, so the egg's 130 Pa barely held it up and a poke never plumped
// back out. Twice its weight-pressure reads as firm jelly.
// Halved again when the spokes arrived: with structure carrying the shape,
// pressure is seasoning (plumpness, poke-recovery), not skeleton.
// Demoted again for the beanbag: a beanbag is not inflated. What re-rounds
// the body now is plastic *recovery* (rest lengths remembering the built
// shape over seconds); pressure is only the faint fullness that keeps the
// skin from wrinkling, and a fast pressure would fight the squash-and-stay
// that makes the material read.
export const SLIME_OVERPRESSURE_WET_PA = 45;
export const SLIME_OVERPRESSURE_DRY_PA = 15;

/**
 * XPBD compliance per region, metres per newton. Lower is stiffer. The yolk
 * is an order of magnitude stiffer than the white — that difference, not the
 * colour, is what makes the dome read as a yolk when the body jiggles. Edge
 * (stretch) and dihedral (bend) get separate numbers: the white should bend
 * far more freely than it stretches, which is what a skirt of egg white does.
 */
// Retuned 100x softer when the hub-and-spoke structure landed. The original
// numbers looked small but were effectively *rigid*: against ~5e-5 kg
// vertices at 120 Hz, XPBD's alpha/dt^2 term only rivals the mass term near
// compliance ~2.6, so 5e-4 vs 1e-4 were both just "inextensible" — the body
// was a rigid shell that crumpled explosively instead of squashing. With
// spokes holding the shape, the skin is free to actually stretch.
// The battery's winner sits at 15x the rigid originals: softer skins kept
// finding folds on the drop gestures. Softness lives mostly in the spokes
// and the syrup term, not the skin.
export const EDGE_COMPLIANCE_WHITE = 7.5e-3;
// Uniform on purpose (the names survive for the plumbing): slime has no
// up. Any per-region stiffness is a bias toward one mesh orientation, and
// the pet gets flipped. The dome's old 5-10x stiffness was why squashes
// read as an inverted bowl; the bottom's softness only helped bottom-down.
export const EDGE_COMPLIANCE_YOLK = 7.5e-3;
export const EDGE_COMPLIANCE_BOTTOM = 7.5e-3;
export const BEND_COMPLIANCE_WHITE = 0.75;
export const BEND_COMPLIANCE_YOLK = 0.75;
export const BEND_COMPLIANCE_BOTTOM = 0.75;

// ------------------------------------------------------------- viscoplastic

/**
 * The beanbag terms. An XPBD body with fixed rest lengths is an elastic
 * balloon: every deformation is a debt the constraints repay, so a squash
 * springs back instantly and a resting pose can only ever be the built
 * shape. A beanbag is *viscoplastic* — deform it past a yield and the
 * material flows: the squash becomes the new shape, and only slowly does the
 * body remember what it was. Implemented as rest lengths that chase the
 * actual lengths when strained past `PLASTIC_YIELD`, then relax back toward
 * the built shape with `PLASTIC_RECOVER_TAU`. Both motions are exponential
 * approaches, so frame rate cannot change the material.
 */
/** Strain (fraction of rest length) inside which deformation stays elastic. */
export const PLASTIC_YIELD = 0.1;
/** How fast strain beyond the yield flows into the rest lengths, 1/s. Slow
 * on purpose: flow measures lengths mid-solve, and a fast flow turns the
 * landing bounce into a driven oscillator. */
export const PLASTIC_FLOW_RATE = 3;
/**
 * Length-rate (m/s) at which plastic flow reaches full strength. The gate is
 * what makes the material heal: without it, a static dent re-learns itself
 * faster than recovery can erase it (flow at 3/s beats recovery at 0.4/s,
 * so ~88% of every dent persisted forever). Gated by strain *rate*, flow
 * only runs while the material is actively being worked — squash, carry,
 * impact — and a body at rest belongs entirely to recovery.
 */
export const PLASTIC_RATE_REF = 0.008;
/** How long the body takes to remember its built shape, seconds. */
export const PLASTIC_RECOVER_TAU = 2.5;
/** Rest lengths may flow this far from built, as a fraction. The clamp is
 * what keeps a pathological step from teaching the body a pathological
 * shape. */
export const PLASTIC_CLAMP_LO = 0.6;
export const PLASTIC_CLAMP_HI = 1.55;

/**
 * Compliance of the radial spokes (one per surface vertex, into the internal
 * hub that carries half the body's mass). The spokes are the slime's actual
 * structure — the reason a hard landing squashes and stops instead of pushing
 * the top membrane through the bottom and shredding the solver. The skin
 * constraints above are free to be goopy-soft *because* the spokes hold the
 * shape. Zero is a rigid ball; goop lives at meaningfully nonzero values
 * (against ~5e-5 kg vertices, compliance only starts to matter near 1).
 */
export const SLIME_SPOKE_COMPLIANCE = 0.2;

/**
 * The syrup term: what fraction of each vertex's hub-relative *radial*
 * velocity is bled off per 120 Hz step. XPBD constraints are pure springs,
 * so a hard landing's squash used to pogo the body back into the air off
 * its own compressed spokes; goop is viscoelastic, and this is the
 * viscosity. Radial only — sideways jiggle keeps its life. Applied at the
 * fixed sim step, so it needs no dt-invariance dressing.
 */
export const SLIME_RADIAL_DAMP = 0.25;

/**
 * Rigid-spin damping rate, 1/s. The droplet is rotationally symmetric about
 * vertical, so yaw is the one mode nothing in the material can resist: zero
 * stiffness against it, the syrup term is radial-only, and the soft-body
 * contact solve grips a slow pivot far too weakly to stop it. Measured: a
 * hard throw left the body pirouetting about +y at a steady ~48°/s forever
 * — never settling, and *spinning up* from ~17°/s after release, so the
 * spin is actively pumped, not residual. The pump sits inside the Jolt
 * solve itself (it survives with plasticity fully disabled, and pure yaw
 * never strains an edge or changes a spoke's bearing, so no scripted term
 * feeds it — fixed-order constraint sweeps are the usual paddle-wheel).
 * The guard therefore extracts the vertex cloud's net rigid rotation each
 * step and bleeds it: mass-weighted about the mass centroid, so the bleed
 * is exactly momentum-neutral (the PBD engine's cardinal lesson), and only
 * the rigid mode is touched — wobble, slosh and squash are orthogonal to it
 * and keep their life (poke still rings 1.5 Hz over 3 cycles). The rate is
 * deliberately brutal: the pump amplitude-locks like a limit cycle, and 12
 * or 20 per second still let it wind up to ~40°/s; 30 crushes it to ~2°/s
 * and the throw settles in under a quarter second.
 */
export const SLIME_SPIN_DAMP = 30;

/** Solver iterations per step. Soft-body cost is verts × this × Hz. */
export const SLIME_ITERATIONS = 8;

/**
 * Contact skin on every soft-body vertex, metres. Same spirit as the marimo's
 * CONVEX_RADIUS but three times thicker: a vertex is the only thing standing
 * between the membrane and the floor, and 1.5 mm of skin turns a landing from
 * an edge case into a contact.
 */
export const SLIME_VERTEX_RADIUS = 0.0015;

/**
 * The pressure guard. Jolt's pressure is `nRT / V` with V measured from the
 * mesh each step — and a hard landing can squash the blob until the top
 * membrane passes through the bottom (there is no self-collision), at which
 * point V collapses toward zero and the pressure force diverges. The first
 * drop test shredded the mesh to twenty metres across exactly this way.
 *
 * So the step clamps the *effective* nRT so that measured pressure never
 * exceeds `SLIME_PRESSURE_MAX_PA`, and cuts pressure entirely while the
 * volume reading is below `SLIME_VOLUME_FLOOR_FRAC` of rest — a reading that
 * low means the mesh is self-intersected and the number is fiction. Edges and
 * bends then pull the membrane apart again, volume becomes meaningful, and
 * pressure fades back in on its own.
 */
// The ceiling is deliberately snug — barely over twice the wet overpressure.
// At the original 1500 Pa a hard landing's squash was *rewarded* with seven
// newtons of rebound on a fourteen-gram body, and the taller gumdrop found
// that path the first time it was dropped.
export const SLIME_PRESSURE_MAX_PA = 500;
export const SLIME_VOLUME_FLOOR_FRAC = 0.35;

/**
 * The grip's authority: how fast steering may move held vertices, m/s. This
 * has to be well above any hand speed, because grip strength *is* this cap —
 * force through the cluster is `m_cluster · cap / dt`, and a dozen
 * 27-milligram vertices lifting a 14-gram body need roughly 4 m/s of
 * authority just to break even with gravity. During smooth tracking the
 * steered speed is `tracking error / dt`, millimetres' worth, so the cap
 * only bites when the pointer is yanked — where it is the slip point that
 * keeps a whip from storing spring energy in the mesh (the old
 * infinite-mass pins snapped a whipped body apart at 20 m/s).
 */
// Capped at SLIME_MAX_VELOCITY: the world's velocity guard clamps every
// vertex there anyway, so a bigger number would only misdescribe the grip.
export const GRAB_STEER_SPEED = 2;
/** What release may carry, m/s. A hand lets go; it does not hurl the pet. */
export const GRAB_THROW_SPEED = 1.0;

/** Sticky, damp animal on cork: grips well, does not bounce. */
export const SLIME_FRICTION = 0.6;
export const SLIME_RESTITUTION = 0;
// 0.08 originally — the body rang for six-plus seconds after every landing
// (the "constant shaking"). Goop is viscous; 0.5 lets a poke wobble a few
// cycles and then genuinely rest.
export const SLIME_LINEAR_DAMPING = 0.5;
/** Nothing in a terrarium moves at two metres a second on purpose. */
export const SLIME_MAX_VELOCITY = 2;

// ---------------------------------------------------------------- rendering

/** Framing. The subject is 4 cm wide and the camera sits outside the glass —
 * close and low, like the reference photo: nose against the terrarium. */
export const CAMERA_FOV_DEG = 35;
export const CAMERA_DISTANCE = 0.15;
/** Eye height above the floor. Low and level, like kneeling at the terrarium. */
export const CAMERA_HEIGHT = 0.026;
/** Where the camera looks: just above the floor, where the slime lives. */
export const CAMERA_TARGET_Y = 0.013;
/**
 * Where the drag-orbit starts, radians. The orbit itself is a full turntable
 * — every pane can be looked at and squeegeed — so the only framing decision
 * left is the first one.
 */
export const AZIMUTH_START = 0.14;

/** Moss tuft scatter (the constant kept its old pebble name's job). */
export const PEBBLE_COUNT = 460;

// --------------------------------------------------------------- care clock

/** Where moisture settles with nobody misting: terrarium air, not desert air. */
export const MOISTURE_AMBIENT = 0.03;
/** Drying time constant while alive. Damp this morning is parched by the weekend. */
export const MOISTURE_TAU_ACTIVE = 30 * 3600;
/**
 * Drying time constant as a sclerotium. Faster on purpose: a crust holds no
 * water, so one spray never revives it — reviving takes returning.
 */
export const MOISTURE_TAU_DORMANT = 8 * 3600;
/** One spray's worth of moisture. */
export const MIST_MOISTURE = 0.4;
/** The immediate lift of being tended to. The slow gain routes through vigor. */
export const MIST_VIGOR_BONUS = 0.06;

/** Satiety drains toward empty over a couple of days. */
export const SATIETY_TAU = 60 * 3600;
export const FEED_SATIETY = 0.45;
/** Above this it is not hungry, and the flake button says so. */
export const FEED_DISABLED_ABOVE = 0.85;
/** A springtail is a morsel next to an oat flake: satiety per critter eaten. */
export const SNACK_SATIETY = 0.05;

/**
 * How long a dropped flake stays good, seconds. Long enough for the slowest
 * legitimate trek (reduced motion ambles at 0.3×: a full crossing plus
 * settles is ~a minute); short enough that a genuinely missed meal turns
 * visibly moldy within the visit that dropped it.
 */
export const OAT_MOLD_SEC = 90;
/** The mold blooms in over this long once it starts. */
export const OAT_MOLD_RAMP_SEC = 8;
/** How close to the flake's centre a bin-it click counts, metres. Bigger
 * than the flake: a 5 mm target at this camera distance is pixel-hunting. */
export const OAT_CLICK_RADIUS = 0.008;

/** Sparkle earned per pinch of mica: five pinches take a plain jelly to full pearl. */
export const MICA_SPRINKLE_STEP = 0.2;
/** Sparkle settles out of suspension over about a week: a full pearl is a
 * faint shimmer in four days and effectively plain jelly in ten. */
export const SPARKLE_TAU = 4 * 86400;
/** Each misting rinses a little glitter off — water and finery trade. */
export const MIST_SPARKLE_RINSE = 0.05;

/** How fast wellbeing chases what moisture and food imply. */
export const VIGOR_TAU = 6 * 3600;
/** Vigor can never fall below this. The "it can never die" guarantee. */
export const VIGOR_FLOOR = 0.15;
export const HEALTH_FLOOR = 0.2;

/**
 * The revival soak: how many hours of *full* moisture the first waking needs.
 * One mist holds the crust damp for roughly `MIST_MOISTURE × the dormant tau`
 * ≈ 3.2 moisture-hours, so a half-hour soak means a single spray wakes the
 * crust within the same visit. Only moisture *above ambient* counts (see
 * stepCare), so an unmisted tank never wakes it on humidity alone.
 */
export const REVIVAL_SOAK_HOURS = 0.5;
/** A re-crusted slime already knows how; later revivals need half the soak. */
export const REVIVAL_REPEAT_FACTOR = 0.5;
/** The hatch: crust cracks, slime oozes out and inflates. */
export const HATCH_SEC = 20;

/** Below this moisture the slime is critically dry and the recrust clock runs. */
export const DRY_THRESHOLD = 0.08;
/** Critically dry for this long and it curls up into a sclerotium again. */
export const RECRUST_SEC = 120 * 3600;

/** Growth: fully kept, about half a millimetre of radius a day. */
export const GROWTH_MM_PER_SEC = 0.5 / 86400;
export const INITIAL_RADIUS_MM = 25;
export const MAX_RADIUS_MM = 32.5;

/** Catch-up bounds, straight from the marimo's reasoning. */
export const CATCHUP_TARGET_STEP_SEC = 3600;
export const CATCHUP_MAX_STEPS = 4000;
export const CATCHUP_MAX_ELAPSED_SEC = 10 * 365.25 * 86400;

/** The care clock ticks this often while the page is open. */
export const CARE_TICK_SEC = 1;

// ------------------------------------------------------------------- trails

/**
 * Trail field resolution over the floor. 256 texels across 12 cm is half a
 * millimetre per texel — finer than the smear a 5 cm slime leaves.
 */
export const TRAIL_WIDTH = 256;
export const TRAIL_HEIGHT = 192;
/** How long a trail takes to fade to 37%. A smear outlives a drag, not a visit. */
export const TRAIL_TAU_SEC = 45;
/** How fast a resting contact paints the field to full, per second. */
export const TRAIL_LAY_PER_SEC = 2.2;
/** Stamp radius around each contact vertex, metres. */
export const TRAIL_SPLAT_RADIUS = 0.0045;
/** A bottom vertex within this height of the floor is touching it. */
export const TRAIL_CONTACT_HEIGHT = 0.0035;

// -------------------------------------------------------------------- grime

/**
 * Grime field resolution per glass pane. Chunkier than the floor trail on
 * purpose: a smear on glass is a smudge, not a signature, and 128 texels
 * across 12 cm is still under a millimetre each.
 */
export const GRIME_WIDTH = 128;
export const GRIME_HEIGHT = 96;
/**
 * How long a smear takes to fade to 37% on its own. Twenty minutes: long
 * enough that within any one visit the squeegee is the only real remedy,
 * short enough that a pane nobody thought to orbit around to does not
 * soil forever.
 */
export const GRIME_TAU_SEC = 1200;
/** How fast a resting wall contact paints the field to full, per second. */
export const GRIME_LAY_PER_SEC = 0.5;
/** Moving contacts smear harder: extra lay-down per metre-per-second of slide. */
export const GRIME_MOTION_GAIN = 40;
/** Stamp radius around each wall contact, metres. */
export const GRIME_SPLAT_RADIUS = 0.005;
/** A vertex within this distance of a pane is pressed against it, metres. */
export const GRIME_CONTACT_DIST = 0.004;
/**
 * Decay tau while the page is closed, seconds. Two days, not twenty minutes:
 * the live tau is a *wet* smear settling; a smear left overnight has dried
 * on, and dried film is the squeegee's problem, not time's.
 */
export const GRIME_AWAY_TAU_SEC = 48 * 3600;
/** One offline climb per this much absence, at full activity. */
export const GRIME_AWAY_CLIMB_INTERVAL_SEC = 45 * 60;
/** Most climbs one absence may lay — the panes saturate anyway. */
export const GRIME_AWAY_MAX_CLIMBS = 16;
/** Absences longer than this gum no further — everything laid has dried and
 * decayed to its equilibrium by then. Mirrors the care sim's elapsed cap. */
export const GRIME_AWAY_MAX_ELAPSED_SEC = 14 * 24 * 3600;
/** Per-sample contact time and slide speed of an unwatched climb — tuned to
 * read as one honest streak per pass, not a paint roller. */
export const GRIME_AWAY_SPLAT_DT = 0.6;
export const GRIME_AWAY_SLIDE = 0.02;
// ---------------------------------------------------------------- squeegee

/** Blade width, metres — a toy squeegee for a 12 cm box. */
export const SQUEEGEE_BLADE_WIDTH = 0.03;
/**
 * Half-thickness of the rubber's contact line on the glass, metres. A bare
 * press (no travel yet) stamps a blade-shaped mark this tall, and every
 * stroke's wiped rectangle extends this far past where the blade was planted
 * and lifted.
 */
export const SQUEEGEE_CONTACT_HALF_M = 0.002;
/** How far the wiped band reaches either side of the stroke, metres. */
export const SQUEEGEE_WIPE_HALF_WIDTH = SQUEEGEE_BLADE_WIDTH / 2;
/** How much of the field one pass removes, 0..1. Two passes leave a pane honest. */
export const SQUEEGEE_WIPE_STRENGTH = 0.9;
/** The blade's kinematic body, half extents (along pane u, v, and normal). */
export const SQUEEGEE_BLADE_HALF_EXTENTS: readonly [number, number, number] = [
  SQUEEGEE_BLADE_WIDTH / 2,
  0.004,
  0.0035
];

// ------------------------------------------------------------------- climb

/**
 * The stroll clock: how long the slime sits before its next wander, seconds,
 * uniform between these bounds. Long enough that the pet mostly rests (it is
 * a puddle animal that *can* climb, not a hamster), short enough that a
 * visitor who stays a few minutes gets to see it move.
 */
export const CLIMB_IDLE_MIN_SEC = 20;
export const CLIMB_IDLE_MAX_SEC = 55;
/** How fast the will's anchor travels, metres per second. A slime ambles. */
export const CLIMB_ANCHOR_SPEED = 0.007;
/**
 * The will's grip: vertices within this of the grip point are steered. Wider
 * than the hand's cluster — the slime climbs with its whole leading face,
 * and the extra vertices are where the authority to hold its own weight on
 * the glass comes from (force through the grip is m·cap/dt, summed).
 */
// 16 mm measured too small: the ball sits off the surface, catches a
// crescent of skin (~15 vertices), and 15 · m · cap/dt is under the body's
// own weight — the test watched the body stay on the moss. 24 mm grips a
// proper cap of the leading face.
export const CLIMB_GRIP_RADIUS = 0.024;
/**
 * Steering speed cap for the will's grip, m/s — the hand's number, because
 * grip strength *is* this cap and the integration test measured 1.2 losing
 * to gravity: the body stayed on the moss while the anchor climbed alone.
 */
export const CLIMB_STEER_SPEED = 2;
/**
 * Where on the pane an ascent begins, as a height fraction: crown height of
 * the resting body. The will climbs the way the hand lifts — gripping the
 * top so the body dangles and peels — because gripping the low flank pulls
 * against the whole body's leverage and loses (measured, same test).
 */
export const CLIMB_START_V = 0.28;
/**
 * The anchor waits when it gets this far above the body's centroid, metres —
 * an inchworm pulls, gathers itself, pulls again; an anchor with no feedback
 * just escapes its own grip. Sized from the measured statics: velocity-
 * steering holds weight at a standing crown error of ~9 mm, and the crown
 * dangles ~14 mm above the centroid, so 22 mm was *exactly* the stall point
 * — the telemetry watched the body hover there. 34 mm leaves real pull
 * above equilibrium while staying well inside the 50 mm lost-body release.
 */
export const CLIMB_LAG_PAUSE = 0.034;
/** An ascent that has made no summit in this long gives up and comes down. */
export const CLIMB_ASCEND_GIVE_UP_SEC = 60;
/** The grip re-seeds this often while moving — the inchworm rhythm. */
export const CLIMB_REGRIP_SEC = 1.1;
/**
 * While climbing, steer targets sit this far *into* the pane, metres. The
 * box clamp in `steerSlimeVertices` stops them at the glass, so the grip
 * presses the body flat against it — adhesion, as theatre.
 */
export const CLIMB_WALL_PRESS = 0.004;
/** Moisture below which the slime will not climb (a drying film cannot grip). */
export const CLIMB_MIN_MOISTURE = 0.25;
/** Highest point on the pane a climb aims for, as a fraction of box height. */
export const CLIMB_MAX_HEIGHT_FRAC = 0.75;

// -------------------------------------------------------------- interaction

/** The finger, metres. Fingertip-sized against a 5 cm slime. */
export const FINGER_RADIUS = 0.006;
/** How far past first contact the press reaches, metres. ~60% of the white's thickness. */
// Deepened from 9 mm when the spokes landed: the finger now fights real
// internal structure, and a 9 mm push only moved the apex 1.7 mm — a tap,
// not a squish. 14 mm reads as a finger sinking into goop.
export const FINGER_MAX_DEPTH = 0.014;
/** The push ramps in over this long — a press, not an impact. */
export const FINGER_PRESS_SEC = 0.25;
/** The finger's centre never goes below this height above the floor. */
export const FINGER_FLOOR_CLEARANCE = 0.0025;

/**
 * Pointer travel (in NDC, where the viewport is 2 across) that turns a press
 * into a grab. Under it you are pushing; past it you have taken hold.
 */
export const GRAB_NDC_THRESHOLD = 0.05;
/**
 * Grab anchor spring, per unit mass: ω = 25 rad/s, critically damped at
 * 2ω — the marimo's hand, verbatim, because it is the same hand.
 */
export const GRAB_OMEGA = 25;
/**
 * Vertical gain on the grab anchor, relative to where the grab began.
 *
 * The anchor rides the view ray at the grab's hit distance, so the pointer's
 * reachable height is set by the camera — and the close, low framing that
 * made the pet a subject also shrank the top of the frame to ~3.5 cm of
 * world height. The hand's up-and-down is amplified by this factor
 * (sideways stays 1:1) so a natural drag can lift the pet to the top of the
 * box; the box clamp still has the final word.
 */
export const GRAB_LIFT_GAIN = 2.2;
/** How close to the glass the anchor may be dragged, metres. */
export const GRAB_BOX_MARGIN = 0.008;
/** Anchor height range above the floor, metres. */
export const GRAB_MIN_LIFT = 0.004;

// Physics modules must never hot-swap: a scene holding closures over an old
// world while new modules load beside it renders ghosts of retired physics
// (a stale tab once showed the long-dead elastic gumdrop over the beanbag
// build). Any edit here forces a clean reload; the pet persists via storage.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
