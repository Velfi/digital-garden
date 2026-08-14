import type Jolt from 'jolt-physics';
import {
  BEND_COMPLIANCE_BOTTOM,
  BEND_COMPLIANCE_WHITE,
  BEND_COMPLIANCE_YOLK,
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  EDGE_COMPLIANCE_BOTTOM,
  EDGE_COMPLIANCE_WHITE,
  EDGE_COMPLIANCE_YOLK,
  FLOOR_FRICTION,
  FLOOR_RESTITUTION,
  FLOOR_Y,
  PLASTIC_CLAMP_HI,
  PLASTIC_CLAMP_LO,
  PLASTIC_FLOW_RATE,
  PLASTIC_RATE_REF,
  PLASTIC_RECOVER_TAU,
  PLASTIC_YIELD,
  SLIME_FRICTION,
  SLIME_ITERATIONS,
  SLIME_LINEAR_DAMPING,
  SLIME_MASS_KG,
  SLIME_MAX_VELOCITY,
  SLIME_PRESSURE_MAX_PA,
  SLIME_OVERPRESSURE_WET_PA,
  SLIME_RADIAL_DAMP,
  SLIME_RESTITUTION,
  SLIME_SPIN_DAMP,
  SLIME_VERTEX_RADIUS,
  SLIME_SPOKE_COMPLIANCE,
  SLIME_VOLUME_FLOOR_FRAC
} from './constants';
import { REGION_BOTTOM, REGION_YOLK, edgesOf, volumeOf, type EggMesh } from './eggMesh';

/**
 * The terrarium, as Jolt sees it.
 *
 * A sibling of the marimo's `joltWorld.ts`, not an extension of it: each scene
 * owns a whole `JoltInterface`, and only the WASM module load is shared (the
 * host hands in an already-loaded module via `loadJolt` from the marimo file,
 * which is deliberately marimo-agnostic). Everything about talking to the
 * engine lives here; nothing above this file knows Jolt exists, and nothing in
 * this file knows what a slime wants.
 *
 * The governing decision is inherited: true scale, real metres, real gravity.
 * The box is 0.12 m across, the slime is 0.05, and a position handed in is the
 * position the engine integrates.
 *
 * What that costs is `tuneForCentimetres`, copied verbatim from the marimo
 * file rather than imported — it is private there, and the numbers are a
 * matched set with their comments. Same binary, same defaults, same reasons.
 */

/** Convex rounding on the static box faces. Their edges are never a contact feature. */
const BOX_CONVEX_RADIUS = 0.001;

/** How thick the invisible glass is. Only its inside face is ever touched. */
const WALL_THICKNESS = 0.05;

const LAYER_STATIC = 0;
const LAYER_MOVING = 1;
const LAYER_COUNT = 2;

/** A rigid body the terrarium owns. The slime itself is a soft body. */
export interface TerrariumBody {
  id: Jolt.BodyID;
  body: Jolt.Body;
}

/** The slime, and everything needed to read it back each frame. */
export interface SlimeBody {
  id: Jolt.BodyID;
  body: Jolt.Body;
  /** The soft-body motion state — the vertices live in here. */
  motion: Jolt.SoftBodyMotionProperties;
  /** Surface vertices — what render, raycast and pinning see. */
  vertexCount: number;
  /**
   * Surface plus the internal hub vertex the volume tets anchor to. The
   * guards loop this; everything above the world loops `vertexCount` and
   * never learns the hub exists.
   */
  physVertexCount: number;
  /** The faces, kept for the volume the pressure guard measures. */
  faces: Uint16Array;
  faceCount: number;
  /** Rest volume, metres cubed, measured from the egg at creation. */
  restVolume: number;
  /** What the pressure would be with no guard: the care sim's knob. */
  targetPressure: number;
  /** Local vertex positions, refreshed by the guard each step. */
  localScratch: Float32Array;
  /** Vertex velocities and inverse masses, cached by the guard's spin
   * pre-pass so the main pass needs no second WASM read. */
  velScratch: Float32Array;
  invMassScratch: Float32Array;
  /** Post-step positions for the inversion net — `localScratch` is the
   * rollback snapshot and must not be overwritten mid-check. */
  postScratch: Float32Array;
  /** Body origin at the guard's capture, for the displacement clamp. */
  prevOrigin: [number, number, number];
  /** Whether the guard captured this step (false while asleep). */
  guarded: boolean;
  /** Steps the divergence net rolled back, lifetime. A diagnosis counter:
   * zero in healthy play; climbing means gestures are reaching the solver's
   * pathological states and being caught. */
  rollbacks: number;
  /** Vertices the hand is steering *this step* — filled by the steer call,
   * consumed by the guard (the syrup term must not bleed the grip's own
   * motion: radial is vertical at the apex, and the first syrup pass
   * silently reduced every lift to a 1.5 mm twitch), cleared after the
   * step. */
  held: Set<number>;
  /** Fastest vertex last step, m/s — drives adaptive collision substepping. */
  maxSpeed: number;
  /** The shared settings and as-built compliances, for the suppleness lever. */
  shared: Jolt.SoftBodySharedSettings;
  baseEdgeCompliance: Float32Array;
  baseBendCompliance: Float32Array;
  /**
   * The viscoplastic state: rest lengths that yield and slowly remember.
   * `a`/`b` are the skin edges' endpoints; spokes run vertex i ↔ hub and
   * live after the skin edges in `mEdgeConstraints`, in vertex order.
   * `base` is the built shape, `current` mirrors what the WASM constraint
   * has been told, so flow and recovery never have to read it back.
   */
  plasticEdgeA: Uint16Array;
  plasticEdgeB: Uint16Array;
  plasticEdgeBase: Float32Array;
  plasticEdgeCurrent: Float32Array;
  plasticSpokeBase: Float32Array;
  plasticSpokeCurrent: Float32Array;
  /**
   * Where each constraint actually lives in `mEdgeConstraints` — mapped by
   * vertex pair *after* `Optimize()`, because Optimize permutes the array
   * into parallel update groups. Writing by pre-Optimize index lands on a
   * random constraint: the first plasticity write put a 3 mm skin rest
   * length on a 17 mm spoke and detonated the body from standstill.
   */
  plasticEdgeIndex: Uint16Array;
  plasticSpokeIndex: Uint16Array;
  /** Same mapping for the dihedral bends (keyed by their shared edge). */
  plasticBendIndex: Uint16Array;
  /**
   * The droplet, remembered relative to GRAVITY rather than the mesh: hub
   * distance as a function of angle-from-vertical, binned. Spoke recovery
   * targets are looked up from wherever each spoke currently points, so a
   * body set down on any side re-forms the same slumped silhouette around
   * "down" — the mesh has no privileged orientation. This is what separates
   * slime from a gumdrop: a gumdrop's crown is a place on its surface, a
   * slime's crown is merely whatever happens to be on top.
   */
  dropletProfile: Float32Array;
  /** Last measured lengths, for the strain-rate gate on plastic flow. */
  plasticEdgeLastLen: Float32Array;
  plasticSpokeLastLen: Float32Array;
  /** Last values actually written to WASM — the write filter compares against
   * these, never against the live mirror, so slow recovery can accumulate
   * across steps instead of discarding its own sub-threshold progress. */
  plasticEdgeWritten: Float32Array;
  plasticSpokeWritten: Float32Array;
  /** Scratch for the plasticity pass's own position read (surface + hub). */
  plasticScratch: Float32Array;
}

export interface TerrariumWorld {
  /** Advance the simulation one fixed step. */
  step(dt: number): void;

  /** A dynamic sphere. The M1 placeholder, later the bones of the oat flake. */
  addBall(radiusM: number, position: readonly [number, number, number]): TerrariumBody;

  /**
   * The slime: `egg`'s vertices as a Jolt soft body, with edge and dihedral
   * bend constraints built by hand from the mesh topology.
   *
   * By hand rather than through `CreateConstraints`, deliberately. That helper
   * takes a C array of per-vertex attributes, which through Emscripten means
   * either one attribute shared by every vertex or raw pointer arithmetic into
   * the heap. Building the constraint lists ourselves costs a page of code,
   * runs once, and gets per-*region* stiffness — a firm yolk on a loose white —
   * with the same `edgesOf` topology the tests already verify.
   */
  addSlime(egg: EggMesh, position: readonly [number, number, number]): SlimeBody;

  /**
   * World-space vertex positions, written into `out` as xyz triples.
   *
   * Jolt stores soft-body vertices local to the body's transform (the body
   * itself drifts along with the vertices when `mUpdatePosition` is on), so
   * this composes each with the body position. Rotation is identity by
   * construction: `mMakeRotationIdentity` bakes any spawn rotation into the
   * vertices, and nothing after that ever writes one.
   */
  readSlimeVertices(handle: SlimeBody, out: Float32Array): void;

  /**
   * The finger: a kinematic sphere that exists only while the pointer is
   * pressing into the slime. Kinematic on purpose — it is a hand, not a thing
   * in the world, so it moves where it is told and ordinary soft-vs-rigid
   * contact does the denting. No vertex is ever written; pressure pushes the
   * dent back out by itself on release. Unconditionally stable.
   */
  addFinger(radiusM: number, position: readonly [number, number, number]): TerrariumBody;
  /**
   * The squeegee's blade (or any future hand-held tool face): a kinematic
   * box with a fixed orientation, glid along the glass. Same contract as the
   * finger — moves where it is told, ordinary contact does the shoving.
   * `quaternion` is xyzw and is baked at creation; `moveKinematic` keeps it.
   */
  addPaddle(
    halfExtents: readonly [number, number, number],
    position: readonly [number, number, number],
    quaternion: readonly [number, number, number, number]
  ): TerrariumBody;
  /**
   * Drive a kinematic body toward `position` over the step. `MoveKinematic`
   * sets the velocity that arrives exactly then, which is what lets the
   * finger push the soft body rather than teleport through it. Rotation is
   * held at whatever the body was created with.
   */
  moveKinematic(
    handle: TerrariumBody,
    position: readonly [number, number, number],
    dt: number
  ): void;

  /**
   * The hand's hold: steer vertices toward world-space targets by writing
   * velocities, capped at `maxSpeed`. Nothing else about the vertex is
   * touched — mass stays real, position stays the solver's, so the
   * constraint system never sees an infeasible state. This replaced
   * infinite-mass pins with per-step position writes, which stored elastic
   * energy the solver repaid at 20 m/s on release: a grab whipped hard now
   * *slips* against the cap instead, which is both stable and what a wet
   * grip on a goopy ball does. Release is simply ceasing to call this; the
   * parting velocity is whatever the steering left, physical by
   * construction. The body is woken first — a sleeping soft body ignores
   * writes, a lesson already paid for.
   */
  steerSlimeVertices(
    handle: SlimeBody,
    indices: readonly number[],
    worldTargets: Float32Array,
    dt: number,
    maxSpeed: number
  ): void;
  /**
   * Clamp the speed of the given vertices — the throw governor. Called once
   * at release: while held, steering may run fast (grip authority has to
   * out-pull the body's own weight through the cluster), but the hand here
   * does not throw a pet across its box, so whatever velocity the grip was
   * writing at the moment of release is capped to something gentle.
   */
  capSlimeVertexSpeeds(handle: SlimeBody, indices: readonly number[], maxSpeed: number): void;
  /** Wake the slime. Cheap, and every external touch should. */
  wakeSlime(handle: SlimeBody): void;

  /**
   * Mirror the body through its own mid-height and wake it — the "set it
   * down upside down" a hand produces, without simulating the hand. Test
   * infrastructure for the orientation-free-slump property; harmless but
   * pointless in production.
   */
  flipSlimeForTest(handle: SlimeBody): void;

  /**
   * Retune the slime's pressure — the care sim's lever, a target the guard in
   * `step` is free to hold down while the mesh is in trouble.
   */
  setSlimePressure(handle: SlimeBody, pressure: number): void;

  /**
   * Scale every constraint's compliance by `factor` of its as-built value —
   * the care sim's stiffness lever. A dry slime at 0.3 is leathery; 1 is the
   * fresh-built wobble. Touches ~1.7k WASM objects, so the caller quantises
   * moisture into buckets and only calls on a bucket change.
   */
  setSlimeSuppleness(handle: SlimeBody, factor: number): void;

  /** An oat flake: a small dynamic box, dropped from above. */
  addFlake(position: readonly [number, number, number]): TerrariumBody;
  /**
   * A springtail's collision proxy: a small dynamic sphere, swept
   * collision, allowed to sleep (a sitting critter IS a sleeping body).
   * Restitution zero — the spit arc's bounce is choreography, written by
   * the controller, not left to the solver's restitution floor.
   */
  addCritter(radiusM: number, position: readonly [number, number, number]): TerrariumBody;
  /**
   * A static convex hull from local-space xyz triples — the river rocks.
   * Placement is translate + yaw, matching how the terrarium lays them.
   */
  addStaticHull(
    points: Float32Array,
    position: readonly [number, number, number],
    yaw: number
  ): TerrariumBody;
  /**
   * Per-body gravity scale — the Mario-arc lever. The spit flight swaps
   * this between rise, hang, and fall values so a stylized arc can still
   * collide honestly with everything on the way.
   */
  setGravityFactor(handle: TerrariumBody, factor: number): void;
  /** Write linear velocity (wakes the body). */
  setLinearVelocity(handle: TerrariumBody, v: readonly [number, number, number]): void;
  /** Impulse at the centre of mass (wakes the body). */
  addImpulse(handle: TerrariumBody, impulse: readonly [number, number, number]): void;
  /**
   * Teleport, zeroing both velocities — respawns and spit origins.
   * `activate` false leaves the body parked where it lands.
   */
  setPosition(
    handle: TerrariumBody,
    position: readonly [number, number, number],
    activate: boolean
  ): void;
  /** Park (held/eaten critters) or resume a body — `freeze`, reversibly. */
  setActive(handle: TerrariumBody, active: boolean): void;
  /** Park a body where it is and stop simulating it — the engulf freeze. */
  freeze(handle: TerrariumBody): void;
  readVelocity(handle: TerrariumBody, out: [number, number, number]): void;

  remove(handle: TerrariumBody): void;
  /** Take the soft body out of the world — the recrust path. */
  removeSlime(handle: SlimeBody): void;
  /** Pose out, written into `position` and `quaternion`. */
  readPose(
    handle: TerrariumBody,
    position: [number, number, number],
    quaternion: [number, number, number, number]
  ): void;
  dispose(): void;
}

/**
 * Bring the engine's tolerances down to the size of the things in the box.
 *
 * Copied verbatim from the marimo's `joltWorld.ts` (where it is private), with
 * its comments, because every number is a length and the lengths here are the
 * same: centimetre bodies in a decimetre enclosure.
 *
 * Every field here is a length or a speed. The defaults beside them were read
 * out of this exact binary (they are Jolt 5.x's stock values), and each is
 * sized for bodies about a metre across. The retuned values keep the same
 * *proportions* — roughly defaults ÷ 100 against bodies ÷ 100 — so the engine's
 * behaviour per body-size is unchanged; only its idea of "too small to matter"
 * is. Nothing dimensionless is touched.
 */
function tuneForCentimetres(physics: Jolt.PhysicsSystem): void {
  const s = physics.GetPhysicsSettings();

  // Default 0.02 m. How far ahead of a moving body the engine looks for
  // contacts. Sized to cover a step of travel: nothing here falls further than
  // the box height, and 0.08 m of free fall arrives at ~1.25 m/s ≈ 10 mm per
  // 120 Hz step — but the speculative margin only has to catch the last step
  // before contact, and 2.5 mm plus the linear cast on fast movers covers it.
  s.mSpeculativeContactDistance = 0.0025;

  // Default 0.02 m. Overlap the solver tolerates before pushing back. Left at
  // the default, a resting body sinks two centimetres into the floor. 0.2 mm
  // is beneath a pixel.
  s.mPenetrationSlop = 0.0002;

  // Default 0.2 m. The deepest overlap position correction will remove in one
  // go. It only exists to stop explosive corrections, and a fifth of a metre
  // in a tenth-of-a-metre box is no cap at all.
  s.mMaxPenetrationDistance = 0.002;

  // Default 1e-3 m. How close two contact points must be to count as the same
  // point when manifolds are reduced and matched between steps.
  s.mManifoldTolerance = 1e-4;

  // Default (1e-3 m)². How far a body pair may move before its cached collision
  // result from last step stops being reusable.
  s.mBodyPairCacheMaxDeltaPositionSq = 1e-8;

  // Default (0.01 m)². How far a contact point may drift and still inherit its
  // warm-start impulse.
  s.mContactPointPreserveLambdaMaxDistSq = 1e-6;

  // Default 1 m/s. Below this impact speed, restitution is not applied at all.
  // Nothing in the box needs to bounce much, but the default deletes bounce
  // from the whole world; 0.05 m/s keeps real knocks honest.
  s.mMinVelocityForRestitution = 0.05;

  // Default 0.03 m/s. The point-velocity below which a body may fall asleep.
  // Three centimetres per second is a quarter of the box per second; three
  // millimetres per second is the threshold that reads as "stopped".
  s.mPointVelocitySleepThreshold = 0.003;

  physics.SetPhysicsSettings(s);
}

export function createTerrariumWorld(J: typeof Jolt): TerrariumWorld {
  // --- the world ------------------------------------------------------------
  const settings = new J.JoltSettings();
  // A slime, an oat flake or two, five walls, ten springtails, three
  // river rocks. Forty-eight is roomy.
  settings.mMaxBodies = 48;
  settings.mMaxBodyPairs = 512;
  settings.mMaxContactConstraints = 1024;

  const objectFilter = new J.ObjectLayerPairFilterTable(LAYER_COUNT);
  objectFilter.EnableCollision(LAYER_STATIC, LAYER_MOVING);
  objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING);

  const broadPhase = new J.BroadPhaseLayerInterfaceTable(LAYER_COUNT, 2);
  broadPhase.MapObjectToBroadPhaseLayer(LAYER_STATIC, new J.BroadPhaseLayer(0));
  broadPhase.MapObjectToBroadPhaseLayer(LAYER_MOVING, new J.BroadPhaseLayer(1));

  settings.mObjectLayerPairFilter = objectFilter;
  settings.mBroadPhaseLayerInterface = broadPhase;
  settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(
    broadPhase,
    2,
    objectFilter,
    LAYER_COUNT
  );

  const jolt = new J.JoltInterface(settings);
  J.destroy(settings);

  const physics = jolt.GetPhysicsSystem();
  const bodies = physics.GetBodyInterface();
  physics.SetGravity(new J.Vec3(0, -9.81, 0));
  tuneForCentimetres(physics);

  // --- the box --------------------------------------------------------------
  /** A static box: centre and half-extents, metres. */
  function addWall(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
    const shape = new J.BoxShapeSettings(new J.Vec3(hx, hy, hz), BOX_CONVEX_RADIUS).Create().Get();
    const creation = new J.BodyCreationSettings(
      shape,
      new J.RVec3(cx, cy, cz),
      new J.Quat(0, 0, 0, 1),
      J.EMotionType_Static,
      LAYER_STATIC
    );
    creation.mFriction = FLOOR_FRICTION;
    creation.mRestitution = FLOOR_RESTITUTION;
    bodies.CreateAndAddBody(creation, J.EActivation_DontActivate);
    J.destroy(creation);
  }

  // The substrate, and four walls the full height of the glass. No lid: the
  // slime is a puddle, and a hand reaching in wants headroom, not a ceiling.
  const wallMidY = FLOOR_Y + BOX_HEIGHT / 2;
  addWall(0, FLOOR_Y - WALL_THICKNESS / 2, 0, BOX_HALF_X * 2, WALL_THICKNESS / 2, BOX_HALF_Z * 2);
  addWall(
    BOX_HALF_X + WALL_THICKNESS / 2,
    wallMidY,
    0,
    WALL_THICKNESS / 2,
    BOX_HEIGHT / 2,
    BOX_HALF_Z * 2
  );
  addWall(
    -BOX_HALF_X - WALL_THICKNESS / 2,
    wallMidY,
    0,
    WALL_THICKNESS / 2,
    BOX_HEIGHT / 2,
    BOX_HALF_Z * 2
  );
  addWall(
    0,
    wallMidY,
    BOX_HALF_Z + WALL_THICKNESS / 2,
    BOX_HALF_X * 2,
    BOX_HEIGHT / 2,
    WALL_THICKNESS / 2
  );
  addWall(
    0,
    wallMidY,
    -BOX_HALF_Z - WALL_THICKNESS / 2,
    BOX_HALF_X * 2,
    BOX_HEIGHT / 2,
    WALL_THICKNESS / 2
  );

  const handles: TerrariumBody[] = [];

  // --- scratch --------------------------------------------------------------
  // Handles into WASM memory, made once and reused rather than allocated per
  // call — the marimo's discipline, for the marimo's reasons.
  const moveTarget = new J.RVec3(0, 0, 0);
  const vec3Scratch = new J.Vec3(0, 0, 0);
  const rvec3Scratch = new J.RVec3(0, 0, 0);

  const slimes: SlimeBody[] = [];

  /**
   * The pressure guard — see `SLIME_PRESSURE_MAX_PA` for the incident report.
   * Runs before every step: measures the enclosed volume from the live mesh
   * and hands Jolt an effective `n·R·T` that keeps `nRT / V` bounded, zero
   * while the volume reading says the mesh is inside out.
   *
   * The same pass clamps every vertex's speed to `SLIME_MAX_VELOCITY`.
   * `mMaxLinearVelocity` is set on the body but Jolt only applies it to rigid
   * bodies — soft-body vertices integrate unclamped. That gap was a real
   * explosion: a grab whipped side to side stretches the flank, release
   * restores the vertex masses with that elastic energy still stored, and the
   * snap-back accelerated vertices to 20+ m/s — through the walls, mesh
   * inverted, solver diverged. Bounding vertex speed at the source caps how
   * much energy any snap can carry, and 2 m/s is far above anything play
   * legitimately produces in a 12 cm box.
   */
  function guardSlime(slime: SlimeBody, dt: number): void {
    slime.guarded = slime.body.IsActive();
    if (!slime.guarded) return;
    const origin = slime.body.GetPosition();
    slime.prevOrigin[0] = origin.GetX();
    slime.prevOrigin[1] = origin.GetY();
    slime.prevOrigin[2] = origin.GetZ();

    // Cache pass: positions, velocities and inverse masses, one WASM read
    // per vertex. The spin bleed below needs the whole cloud before any
    // vertex can be corrected, and the syrup/clamp pass reuses the cache.
    const p = slime.localScratch;
    const vel = slime.velScratch;
    const im = slime.invMassScratch;
    for (let i = 0; i < slime.physVertexCount; i++) {
      const vertex = slime.motion.GetVertex(i);
      const at = vertex.mPosition;
      p[i * 3] = at.GetX();
      p[i * 3 + 1] = at.GetY();
      p[i * 3 + 2] = at.GetZ();
      const v = vertex.mVelocity;
      vel[i * 3] = v.GetX();
      vel[i * 3 + 1] = v.GetY();
      vel[i * 3 + 2] = v.GetZ();
      im[i] = vertex.mInvMass;
    }

    // The hub: the syrup term below damps every surface vertex's motion
    // *relative to the hub*, along the spoke.
    const hubIndex = slime.physVertexCount - 1;
    const hx = p[hubIndex * 3];
    const hy = p[hubIndex * 3 + 1];
    const hz = p[hubIndex * 3 + 2];
    const hvx = vel[hubIndex * 3];
    const hvy = vel[hubIndex * 3 + 1];
    const hvz = vel[hubIndex * 3 + 2];

    // Rigid-spin extraction — see SLIME_SPIN_DAMP for why the one mode the
    // material cannot resist must be damped by hand. Mass-weighted about the
    // mass centroid, so bleeding it moves no net momentum.
    let mSum = 0;
    let mcx = 0;
    let mcy = 0;
    let mcz = 0;
    for (let i = 0; i < slime.physVertexCount; i++) {
      if (im[i] <= 0) continue;
      const m = 1 / im[i];
      mSum += m;
      mcx += m * p[i * 3];
      mcy += m * p[i * 3 + 1];
      mcz += m * p[i * 3 + 2];
    }
    let spinX = 0;
    let spinY = 0;
    let spinZ = 0;
    let spinK = 0;
    if (mSum > 0) {
      mcx /= mSum;
      mcy /= mSum;
      mcz /= mSum;
      let lx = 0;
      let ly = 0;
      let lz = 0;
      let inertia = 0;
      for (let i = 0; i < slime.physVertexCount; i++) {
        if (im[i] <= 0) continue;
        const m = 1 / im[i];
        const rx = p[i * 3] - mcx;
        const ry = p[i * 3 + 1] - mcy;
        const rz = p[i * 3 + 2] - mcz;
        lx += m * (ry * vel[i * 3 + 2] - rz * vel[i * 3 + 1]);
        ly += m * (rz * vel[i * 3] - rx * vel[i * 3 + 2]);
        lz += m * (rx * vel[i * 3 + 1] - ry * vel[i * 3]);
        inertia += m * (rx * rx + ry * ry + rz * rz);
      }
      if (inertia > 1e-12) {
        spinX = lx / inertia;
        spinY = ly / inertia;
        spinZ = lz / inertia;
        spinK = 1 - Math.exp(-dt * SLIME_SPIN_DAMP);
      }
    }

    const maxSq = SLIME_MAX_VELOCITY * SLIME_MAX_VELOCITY;
    slime.maxSpeed = 0;
    for (let i = 0; i < slime.physVertexCount; i++) {
      const vertex = slime.motion.GetVertex(i);
      const px = p[i * 3];
      const py = p[i * 3 + 1];
      const pz = p[i * 3 + 2];

      let vx = vel[i * 3];
      let vy = vel[i * 3 + 1];
      let vz = vel[i * 3 + 2];
      let touched = false;

      if (spinK > 0 && im[i] > 0) {
        const rx = px - mcx;
        const ry = py - mcy;
        const rz = pz - mcz;
        vx -= spinK * (spinY * rz - spinZ * ry);
        vy -= spinK * (spinZ * rx - spinX * rz);
        vz -= spinK * (spinX * ry - spinY * rx);
        touched = true;
      }

      // The syrup term: goop is viscoelastic, and XPBD constraints are pure
      // springs — an elastic pancake at the bottom of a hard landing pogos
      // the whole body back into the air (measured: airborne at 2 m/s off a
      // 40 mm drop). So the *radial* part of each vertex's velocity relative
      // to the hub is bled off every step, and only that part: compression
      // recovers as a slow ooze while sideways jiggle — the fun wobble —
      // keeps its life. Skipped for the hub itself (no direction to itself).
      if (i < slime.physVertexCount - 1 && !slime.held.has(i)) {
        const dx = px - hx;
        const dy = py - hy;
        const dz = pz - hz;
        const lenSq = dx * dx + dy * dy + dz * dz;
        if (lenSq > 1e-12) {
          const radial = ((vx - hvx) * dx + (vy - hvy) * dy + (vz - hvz) * dz) / lenSq;
          const bleed = radial * SLIME_RADIAL_DAMP;
          vx -= dx * bleed;
          vy -= dy * bleed;
          vz -= dz * bleed;
          touched = true;
        }
      }

      const speedSq = vx * vx + vy * vy + vz * vz;
      if (speedSq > maxSq) {
        const scale = SLIME_MAX_VELOCITY / Math.sqrt(speedSq);
        vx *= scale;
        vy *= scale;
        vz *= scale;
        touched = true;
      }
      if (touched) {
        vec3Scratch.Set(vx, vy, vz);
        vertex.mVelocity = vec3Scratch;
      }
      slime.maxSpeed = Math.max(slime.maxSpeed, Math.sqrt(speedSq));
    }
    const volume = volumeOf({
      positions: slime.localScratch,
      faces: slime.faces,
      faceCount: slime.faceCount
    });

    let effective = slime.targetPressure;
    if (volume < slime.restVolume * SLIME_VOLUME_FLOOR_FRAC) {
      effective = 0;
    } else {
      effective = Math.min(effective, SLIME_PRESSURE_MAX_PA * volume);
    }
    slime.motion.SetPressure(effective);
  }

  /**
   * The displacement clamp — the second half of the guard, run after the
   * step. The velocity clamp above bounds what a step *starts* with, but the
   * explosion it exists for happens *inside* a step: a near-singular bend
   * constraint on a crumpled flank hands a vertex a fifth of a metre of
   * position correction in one solve, and XPBD then reads that displacement
   * back as a 26 m/s velocity. So: no vertex may move farther per step than
   * `SLIME_MAX_VELOCITY · dt`, measured in world space against the guard's
   * capture. Violators are pulled back onto the sphere of allowed travel and
   * handed the matching velocity; a non-finite position (the same divergence,
   * one step later) is restored outright and parked. Legitimate play moves
   * millimetres per step — this triggers only when the solver is lying.
   */
  function clampSlimeStep(slime: SlimeBody, dt: number): void {
    // The hold lasts one step: the hand re-declares it every steer call, so
    // clearing here is what makes release implicit.
    slime.held.clear();
    if (!slime.guarded) return;
    const maxStep = SLIME_MAX_VELOCITY * dt;
    const maxStepSq = maxStep * maxStep;
    const origin = slime.body.GetPosition();
    const ox = origin.GetX();
    const oy = origin.GetY();
    const oz = origin.GetZ();

    // Divergence check first. An inverted volume tet turns Jolt's abs()'d
    // constraint against its own signed gradient — the same trap as the
    // winding, reached at run time — and the local runaway overflows float32
    // into inf/NaN *inside* one step, where no per-vertex clamp can see it
    // in time. One poisoned vertex takes the body origin with it
    // (mUpdatePosition averages the vertices), so the only trustworthy
    // repair is wholesale: roll every vertex and the origin back to the
    // guard's pre-step snapshot, kill the velocities, and let the world
    // re-derive the step from rest. One frozen frame, invisible at 120 Hz.
    let poisoned = !Number.isFinite(ox + oy + oz);
    if (!poisoned) {
      for (let i = 0; i < slime.physVertexCount; i++) {
        const at = slime.motion.GetVertex(i).mPosition;
        if (!Number.isFinite(at.GetX() + at.GetY() + at.GetZ())) {
          poisoned = true;
          break;
        }
      }
    }

    if (!poisoned) {
      for (let i = 0; i < slime.physVertexCount; i++) {
        const vertex = slime.motion.GetVertex(i);
        if (vertex.mInvMass === 0) continue;
        const at = vertex.mPosition;
        const px = slime.prevOrigin[0] + slime.localScratch[i * 3];
        const py = slime.prevOrigin[1] + slime.localScratch[i * 3 + 1];
        const pz = slime.prevOrigin[2] + slime.localScratch[i * 3 + 2];
        const dx = ox + at.GetX() - px;
        const dy = oy + at.GetY() - py;
        const dz = oz + at.GetZ() - pz;
        const travelSq = dx * dx + dy * dy + dz * dz;
        if (travelSq <= maxStepSq) continue;
        const scale = maxStep / Math.sqrt(travelSq);
        vec3Scratch.Set(px + dx * scale - ox, py + dy * scale - oy, pz + dz * scale - oz);
        vertex.mPosition = vec3Scratch;
        // The parting velocity is deliberately a *fraction* of the clamped
        // travel. Handing back the full cap speed re-arms the runaway: the
        // tangled solver throws the vertex 0.2 m, the clamp walks it back to
        // 16 mm, the returned 2 m/s carries it 16 mm before the next throw —
        // and the "explosion" survives as a steady 2 m/s drift out of the box
        // (measured, not hypothetical). A clamp that trips is proof the solver
        // is lying, and a lying solver's energy is eaten, not conserved.
        const brake = 0.3 / dt;
        vec3Scratch.Set(dx * scale * brake, dy * scale * brake, dz * scale * brake);
        vertex.mVelocity = vec3Scratch;
      }

      // Inversion net — evaluated on the *clamped* state, deliberately after
      // the pass above. Mid-explosion the raw post-step positions are a
      // scattered cloud whose signed volume can read huge and positive; the
      // first version of this check ran on that raw state, read "fine", and
      // let a landing that had already turned the mesh inside out through
      // (the net fired once in a 40-step explosion). The clamped state is
      // the one the next step will actually start from, so it is the one
      // whose orientation matters. A reading under 0.3x rest is a mesh that
      // is inverted or about to be — legitimate hard squashes measure ~0.5x
      // — and once inverted, every constraint screams forever; roll the
      // whole step back instead and let the world re-derive it from rest.
      for (let i = 0; i < slime.vertexCount; i++) {
        const at = slime.motion.GetVertex(i).mPosition;
        slime.postScratch[i * 3] = at.GetX();
        slime.postScratch[i * 3 + 1] = at.GetY();
        slime.postScratch[i * 3 + 2] = at.GetZ();
      }
      const volume = volumeOf({
        positions: slime.postScratch,
        faces: slime.faces,
        faceCount: slime.faceCount
      });
      poisoned = volume < slime.restVolume * 0.3;
    }

    if (poisoned) {
      slime.rollbacks += 1;
      rvec3Scratch.Set(slime.prevOrigin[0], slime.prevOrigin[1], slime.prevOrigin[2]);
      bodies.SetPosition(slime.id, rvec3Scratch, J.EActivation_DontActivate);
      for (let i = 0; i < slime.physVertexCount; i++) {
        const vertex = slime.motion.GetVertex(i);
        vec3Scratch.Set(
          slime.localScratch[i * 3],
          slime.localScratch[i * 3 + 1],
          slime.localScratch[i * 3 + 2]
        );
        vertex.mPosition = vec3Scratch;
        vec3Scratch.Set(0, 0, 0);
        vertex.mVelocity = vec3Scratch;
      }
    }
  }

  /**
   * The beanbag pass: viscoplastic rest lengths. See the PLASTIC_* constants
   * for the material model — strain past the yield makes rest lengths *flow*
   * toward the deformed lengths (the squash sticks), and recovery eases them
   * home over seconds (the pet slowly re-rounds). Elastic bodies remember
   * instantly; this one remembers the way putty does.
   *
   * WASM writes are skipped below half a millimetre-per-metre of change, so
   * a settled body converges and the pass goes quiet.
   */
  function flowPlasticity(slime: SlimeBody, dt: number): void {
    if (!slime.body.IsActive()) {
      // Asleep. A body at rest generates no flow — but recovery must go on,
      // or a dent that dozes off becomes permanent (the heal trace froze at
      // 27% rest-drift the moment Jolt slept the body). If the learned shape
      // is still meaningfully off home, wake the body so the solver can
      // follow the recovering rest lengths; once healed, it may truly sleep.
      let worst = 0;
      for (let e = 0; e < slime.plasticEdgeBase.length; e++) {
        worst = Math.max(
          worst,
          Math.abs(slime.plasticEdgeCurrent[e] / slime.plasticEdgeBase[e] - 1)
        );
      }
      // Spokes are judged against the gravity droplet at their frozen
      // angles, not the mesh base — a body healed into the droplet upside
      // down is *healed*, and must be allowed to sleep there.
      const surface = slime.vertexCount;
      const p = slime.plasticScratch;
      const hub = surface * 3;
      const bins = slime.dropletProfile.length;
      for (let i = 0; i < surface; i++) {
        const dx = p[i * 3] - p[hub];
        const dy = p[i * 3 + 1] - p[hub + 1];
        const dz = p[i * 3 + 2] - p[hub + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-9) continue;
        const theta = Math.acos(Math.min(1, Math.max(-1, dy / len)));
        const at = (theta / Math.PI) * (bins - 1);
        const lo = Math.min(bins - 1, Math.floor(at));
        const hi = Math.min(bins - 1, lo + 1);
        const target =
          slime.dropletProfile[lo] +
          (slime.dropletProfile[hi] - slime.dropletProfile[lo]) * (at - lo);
        worst = Math.max(worst, Math.abs(slime.plasticSpokeCurrent[i] / target - 1));
      }
      if (worst < 0.01) return;
      bodies.ActivateBody(slime.id);
    }
    const surface = slime.vertexCount;
    const p = slime.plasticScratch;
    for (let i = 0; i <= surface; i++) {
      const at = slime.motion.GetVertex(i).mPosition;
      p[i * 3] = at.GetX();
      p[i * 3 + 1] = at.GetY();
      p[i * 3 + 2] = at.GetZ();
    }

    const flowK = 1 - Math.exp(-dt * PLASTIC_FLOW_RATE);
    const recoverK = 1 - Math.exp(-dt / PLASTIC_RECOVER_TAU);
    const edges = slime.shared.mEdgeConstraints;
    const edgeCount = slime.plasticEdgeBase.length;

    const flowOne = (
      constraintIndex: number,
      len: number,
      base: number,
      target: number,
      current: Float32Array,
      lastLen: Float32Array,
      written: Float32Array,
      slot: number
    ): void => {
      let cur = current[slot];
      // Textbook plasticity: only the strain *beyond* the yield surface
      // flows into the rest length, so an elastic band of exactly the yield
      // always remains and always pulls back. The first cut chased the full
      // length — rest overshot into resonance with the landing bounce, the
      // floor rectified the oscillation, and the body pogoed itself out of
      // the box at the velocity cap.
      //
      // And the flow is gated by strain *rate*: it runs while the material
      // is being worked and stops when it sits still, so a static dent
      // belongs to recovery and heals instead of re-learning itself.
      const gate = Math.min(1, Math.abs(len - lastLen[slot]) / dt / PLASTIC_RATE_REF);
      lastLen[slot] = len;
      const excess = len - cur;
      const band = PLASTIC_YIELD * base;
      if (excess > band) cur += (excess - band) * flowK * gate;
      else if (excess < -band) cur += (excess + band) * flowK * gate;
      cur += (target - cur) * recoverK;
      cur = Math.min(base * PLASTIC_CLAMP_HI, Math.max(base * PLASTIC_CLAMP_LO, cur));
      // The mirror always advances — recovery moves fractions of the write
      // threshold per step, and thresholding the mirror itself froze every
      // heal at whatever drift made the per-step delta small enough.
      current[slot] = cur;
      if (Math.abs(cur - written[slot]) > base * 5e-4) {
        written[slot] = cur;
        edges.at(constraintIndex).mRestLength = cur;
      }
    };

    for (let e = 0; e < edgeCount; e++) {
      const a = slime.plasticEdgeA[e] * 3;
      const b = slime.plasticEdgeB[e] * 3;
      const dx = p[a] - p[b];
      const dy = p[a + 1] - p[b + 1];
      const dz = p[a + 2] - p[b + 2];
      flowOne(
        slime.plasticEdgeIndex[e],
        Math.sqrt(dx * dx + dy * dy + dz * dz),
        slime.plasticEdgeBase[e],
        slime.plasticEdgeBase[e],
        slime.plasticEdgeCurrent,
        slime.plasticEdgeLastLen,
        slime.plasticEdgeWritten,
        e
      );
    }

    const hub = surface * 3;
    const bins = slime.dropletProfile.length;
    for (let i = 0; i < surface; i++) {
      const dx = p[i * 3] - p[hub];
      const dy = p[i * 3 + 1] - p[hub + 1];
      const dz = p[i * 3 + 2] - p[hub + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // The recovery target comes from the gravity droplet: whatever angle
      // this spoke points from vertical *now*, that is the radius it wants.
      // Flip the body and every spoke re-aims at the profile from its new
      // bearing — the silhouette belongs to gravity, not to the mesh.
      let target = slime.plasticSpokeBase[i];
      if (len > 1e-9) {
        const theta = Math.acos(Math.min(1, Math.max(-1, dy / len)));
        const at = (theta / Math.PI) * (bins - 1);
        const lo = Math.min(bins - 1, Math.floor(at));
        const hi = Math.min(bins - 1, lo + 1);
        target =
          slime.dropletProfile[lo] +
          (slime.dropletProfile[hi] - slime.dropletProfile[lo]) * (at - lo);
      }
      flowOne(
        slime.plasticSpokeIndex[i],
        len,
        slime.plasticSpokeBase[i],
        target,
        slime.plasticSpokeCurrent,
        slime.plasticSpokeLastLen,
        slime.plasticSpokeWritten,
        i
      );
    }
  }

  return {
    step(dt) {
      for (const slime of slimes) flowPlasticity(slime, dt);
      for (const slime of slimes) guardSlime(slime, dt);
      // Collision substeps scale with how fast the slime is actually moving.
      // At rest, one step at 120 Hz is plenty. But PBD contact resolution is
      // positional: a vertex that arrives 7 mm *inside* the floor in one
      // step gets projected 7 mm back out in that same step, which is an
      // implicit restitution-1 bounce — a 40 mm drop used to detonate on
      // touchdown exactly this way (volume doubled in the contact step).
      // Substepping keeps per-substep penetration inside the speculative
      // margin, so a landing reads as a landing.
      let substeps = 1;
      for (const slime of slimes) {
        if (slime.maxSpeed > 0.5) substeps = Math.max(substeps, 4);
        else if (slime.maxSpeed > 0.15) substeps = Math.max(substeps, 2);
      }
      jolt.Step(dt, substeps);
      for (const slime of slimes) clampSlimeStep(slime, dt);
    },

    addSlime(egg, position) {
      const shared = new J.SoftBodySharedSettings();

      // Vertices. `push_back` copies, so one scratch object serves them all.
      // What must be exact is the total mass, and it is — but it is *not*
      // spread evenly: the hub below carries half the body, the skin shares
      // the rest. Physical (the interior goo is most of the mass, the
      // membrane is film), and load-bearing for stability: the hub sits in
      // every volume tet, and Gauss–Seidel solves them one after another —
      // an equal-mass hub gets yanked toward each tet in turn and thrashes
      // (measured: 1.5 m/s at the first step, from rest). A heavy hub turns
      // each tet's correction onto the three light skin corners instead.
      const invMass = (2 * egg.vertexCount) / SLIME_MASS_KG;
      const vertex = new J.SoftBodySharedSettingsVertex();
      vertex.mInvMass = invMass;
      let hubX = 0;
      let hubY = 0;
      let hubZ = 0;
      for (let i = 0; i < egg.vertexCount; i++) {
        const float3 = new J.Float3(
          egg.positions[i * 3],
          egg.positions[i * 3 + 1],
          egg.positions[i * 3 + 2]
        );
        vertex.mPosition = float3;
        shared.mVertices.push_back(vertex);
        J.destroy(float3);
        hubX += egg.positions[i * 3];
        hubY += egg.positions[i * 3 + 1];
        hubZ += egg.positions[i * 3 + 2];
      }

      // The hub: one internal vertex at the centroid, seen only by the
      // volume tets below. It is the incompressibility anchor — nothing
      // renders it, nothing pins it, and `readSlimeVertices` stops short
      // of it.
      const hub = egg.vertexCount;
      const hubFloat3 = new J.Float3(
        hubX / egg.vertexCount,
        hubY / egg.vertexCount,
        hubZ / egg.vertexCount
      );
      vertex.mPosition = hubFloat3;
      vertex.mInvMass = 2 / SLIME_MASS_KG;
      shared.mVertices.push_back(vertex);
      J.destroy(hubFloat3);
      J.destroy(vertex);

      for (let f = 0; f < egg.faceCount; f++) {
        const face = new J.SoftBodySharedSettingsFace(
          egg.faces[f * 3],
          egg.faces[f * 3 + 1],
          egg.faces[f * 3 + 2],
          0
        );
        shared.AddFace(face);
        J.destroy(face);
      }

      // A constraint spanning two regions takes the softer number: the crease
      // where yolk meets white should flex like white, not carry a stiff ring.
      const stiffnessOf = (kind: number, a: number, b: number): number => {
        const table =
          kind === 0
            ? [EDGE_COMPLIANCE_WHITE, EDGE_COMPLIANCE_YOLK, EDGE_COMPLIANCE_BOTTOM]
            : [BEND_COMPLIANCE_WHITE, BEND_COMPLIANCE_YOLK, BEND_COMPLIANCE_BOTTOM];
        const ra = egg.regions[a];
        const rb = egg.regions[b];
        if (ra === REGION_YOLK && rb === REGION_YOLK) return table[REGION_YOLK];
        if (ra === REGION_BOTTOM && rb === REGION_BOTTOM) return table[REGION_BOTTOM];
        return table[0];
      };

      const topology = edgesOf(egg);
      const baseEdgeCompliance = new Float32Array(topology.edges.length);
      const baseBendCompliance = new Float32Array(topology.edges.length);
      for (let e = 0; e < topology.edges.length; e++) {
        const [a, b] = topology.edges[e];
        baseEdgeCompliance[e] = stiffnessOf(0, a, b);
        const edge = new J.SoftBodySharedSettingsEdge(a, b, baseEdgeCompliance[e]);
        shared.mEdgeConstraints.push_back(edge);
        J.destroy(edge);

        const [c, d] = topology.opposites[e];
        baseBendCompliance[e] = stiffnessOf(1, a, b);
        const bend = new J.SoftBodySharedSettingsDihedralBend(a, b, c, d, baseBendCompliance[e]);
        shared.mDihedralBendConstraints.push_back(bend);
        J.destroy(bend);
      }

      // A radial spoke from every surface vertex to the hub: the slime's
      // actual structure. This is what stops the landing crumple — pressure
      // is a weak 1/V spring and there is no self-collision, so without
      // internal structure a hard squash pushed the top membrane through the
      // bottom and handed the solver degenerate geometry it answered with
      // 20 m/s corrections (the sweep's drop tests killed nearly every
      // tuning). A vertex tethered to the hub cannot cross the body without
      // fighting its spoke the whole way, so the squash stops where the
      // material runs out, the way jelly does.
      //
      // Spokes are deliberately plain *edge* constraints, not Jolt's volume
      // tetrahedra, though tets are the textbook incompressibility tool and
      // were tried first. Jolt evaluates a tet as `abs(signed 6V) − rest`
      // but takes the gradient of the *signed* volume (see
      // SoftBodyMotionProperties.cpp — the abs never reaches d1c..d4c), so
      // the moment a tet inverts, its correction points backwards and feeds
      // itself: built one way the body detonated from standstill, wound the
      // other way it survived until a whip sheared one tet inverted and the
      // whole mesh turned inside out within a tenth of a second. An edge
      // constraint has no orientation to get wrong — compressed through
      // zero it just pulls back toward rest length from the other side.
      for (let i = 0; i < egg.vertexCount; i++) {
        const spoke = new J.SoftBodySharedSettingsEdge(i, hub, SLIME_SPOKE_COMPLIANCE);
        shared.mEdgeConstraints.push_back(spoke);
        J.destroy(spoke);
      }

      shared.CalculateEdgeLengths();
      shared.CalculateBendConstraintConstants();
      shared.CalculateVolumeConstraintVolumes();

      shared.Optimize();

      // The built shape, captured for the viscoplastic pass — AFTER
      // Optimize, which permutes `mEdgeConstraints` into parallel update
      // groups. Each constraint is found again by its vertex pair; from here
      // on, every write goes through these mapped indices.
      const edgeCount = topology.edges.length;
      const plasticEdgeA = new Uint16Array(edgeCount);
      const plasticEdgeB = new Uint16Array(edgeCount);
      const plasticEdgeBase = new Float32Array(edgeCount);
      const plasticEdgeCurrent = new Float32Array(edgeCount);
      const plasticEdgeIndex = new Uint16Array(edgeCount);
      const plasticSpokeBase = new Float32Array(egg.vertexCount);
      const plasticSpokeCurrent = new Float32Array(egg.vertexCount);
      const plasticSpokeIndex = new Uint16Array(egg.vertexCount);
      {
        const edgeArray = shared.mEdgeConstraints;
        const byPair = new Map<number, number>();
        const total = edgeArray.size();
        for (let k = 0; k < total; k++) {
          const constraint = edgeArray.at(k);
          const a = constraint.get_mVertex(0);
          const b = constraint.get_mVertex(1);
          byPair.set(Math.min(a, b) * 65536 + Math.max(a, b), k);
        }
        for (let e = 0; e < edgeCount; e++) {
          const [a, b] = topology.edges[e];
          plasticEdgeA[e] = a;
          plasticEdgeB[e] = b;
          const k = byPair.get(Math.min(a, b) * 65536 + Math.max(a, b))!;
          plasticEdgeIndex[e] = k;
          plasticEdgeBase[e] = plasticEdgeCurrent[e] = edgeArray.at(k).mRestLength;
        }
        for (let i = 0; i < egg.vertexCount; i++) {
          const k = byPair.get(Math.min(i, hub) * 65536 + Math.max(i, hub))!;
          plasticSpokeIndex[i] = k;
          plasticSpokeBase[i] = plasticSpokeCurrent[i] = edgeArray.at(k).mRestLength;
        }
      }
      // The gravity droplet: bin the built pose's spoke lengths by angle
      // from vertical. The built shape is a surface of revolution about the
      // vertical axis, so this loses nothing — it re-expresses the same
      // silhouette in the one frame gravity cares about.
      const PROFILE_BINS = 24;
      const dropletProfile = new Float32Array(PROFILE_BINS);
      {
        const sums = new Float64Array(PROFILE_BINS);
        const counts = new Float64Array(PROFILE_BINS);
        const hx = hubX / egg.vertexCount;
        const hy = hubY / egg.vertexCount;
        const hz = hubZ / egg.vertexCount;
        for (let i = 0; i < egg.vertexCount; i++) {
          const dx = egg.positions[i * 3] - hx;
          const dy = egg.positions[i * 3 + 1] - hy;
          const dz = egg.positions[i * 3 + 2] - hz;
          const len = Math.hypot(dx, dy, dz);
          if (len < 1e-9) continue;
          const theta = Math.acos(Math.min(1, Math.max(-1, dy / len)));
          const bin = Math.min(PROFILE_BINS - 1, Math.floor((theta / Math.PI) * PROFILE_BINS));
          sums[bin] += len;
          counts[bin] += 1;
        }
        // Fill any empty bins from their neighbours (the poles are sparse).
        let last = 0;
        for (let b = 0; b < PROFILE_BINS; b++) {
          if (counts[b] > 0) last = sums[b] / counts[b];
          dropletProfile[b] = last;
        }
        for (let b = PROFILE_BINS - 1; b >= 0; b--) {
          if (counts[b] > 0) last = sums[b] / counts[b];
          else dropletProfile[b] = (dropletProfile[b] + last) / 2;
        }
      }

      // The bends, permuted the same way, mapped by the edge they straddle
      // (one bend per edge, so the pair is a unique key).
      const plasticBendIndex = new Uint16Array(edgeCount);
      {
        const bendArray = shared.mDihedralBendConstraints;
        const byPair = new Map<number, number>();
        const total = bendArray.size();
        for (let k = 0; k < total; k++) {
          const constraint = bendArray.at(k);
          const a = constraint.get_mVertex(0);
          const b = constraint.get_mVertex(1);
          byPair.set(Math.min(a, b) * 65536 + Math.max(a, b), k);
        }
        for (let e = 0; e < edgeCount; e++) {
          const [a, b] = topology.edges[e];
          plasticBendIndex[e] = byPair.get(Math.min(a, b) * 65536 + Math.max(a, b))!;
        }
      }

      const creation = new J.SoftBodyCreationSettings(
        shared,
        new J.RVec3(position[0], position[1], position[2]),
        new J.Quat(0, 0, 0, 1),
        LAYER_MOVING
      );
      const restVolume = volumeOf(egg);
      creation.mPressure = SLIME_OVERPRESSURE_WET_PA * restVolume;
      creation.mNumIterations = SLIME_ITERATIONS;
      creation.mVertexRadius = SLIME_VERTEX_RADIUS;
      creation.mFriction = SLIME_FRICTION;
      creation.mRestitution = SLIME_RESTITUTION;
      creation.mLinearDamping = SLIME_LINEAR_DAMPING;
      creation.mMaxLinearVelocity = SLIME_MAX_VELOCITY;
      creation.mUpdatePosition = true;
      creation.mMakeRotationIdentity = true;

      const body = bodies.CreateSoftBody(creation);
      J.destroy(creation);
      // `shared` is ref-counted and now owned by the body; destroying our
      // wrapper would call its destructor out from under the reference, so the
      // wrapper is simply dropped.
      bodies.AddBody(body.GetID(), J.EActivation_Activate);

      const motion = J.castObject(body.GetMotionProperties(), J.SoftBodyMotionProperties);
      const handle: SlimeBody = {
        id: body.GetID(),
        body,
        motion,
        vertexCount: egg.vertexCount,
        physVertexCount: egg.vertexCount + 1,
        faces: egg.faces,
        faceCount: egg.faceCount,
        restVolume,
        targetPressure: SLIME_OVERPRESSURE_WET_PA * restVolume,
        localScratch: new Float32Array((egg.vertexCount + 1) * 3),
        velScratch: new Float32Array((egg.vertexCount + 1) * 3),
        invMassScratch: new Float32Array(egg.vertexCount + 1),
        postScratch: new Float32Array(egg.vertexCount * 3),
        prevOrigin: [0, 0, 0],
        guarded: false,
        rollbacks: 0,
        held: new Set(),
        maxSpeed: 0,
        shared,
        baseEdgeCompliance,
        baseBendCompliance,
        plasticEdgeA,
        plasticEdgeB,
        plasticEdgeBase,
        plasticEdgeCurrent,
        plasticSpokeBase,
        plasticSpokeCurrent,
        plasticEdgeIndex,
        plasticSpokeIndex,
        plasticBendIndex,
        dropletProfile,
        plasticEdgeLastLen: Float32Array.from(plasticEdgeBase),
        plasticSpokeLastLen: Float32Array.from(plasticSpokeBase),
        plasticEdgeWritten: Float32Array.from(plasticEdgeBase),
        plasticSpokeWritten: Float32Array.from(plasticSpokeBase),
        plasticScratch: new Float32Array((egg.vertexCount + 1) * 3)
      };
      slimes.push(handle);
      return handle;
    },

    setSlimePressure(handle, pressure) {
      handle.targetPressure = pressure;
      bodies.ActivateBody(handle.id);
    },

    setSlimeSuppleness(handle, factor) {
      // Through the mapped indices — `Optimize()` permutes the constraint
      // arrays, and this lever's original by-position writes were landing on
      // random constraints. The worst case put millimetre skin compliances on
      // the spokes, quietly rigidifying the live body at scene startup no
      // matter what the tuning said.
      const edges = handle.shared.mEdgeConstraints;
      const bends = handle.shared.mDihedralBendConstraints;
      for (let i = 0; i < handle.baseEdgeCompliance.length; i++) {
        edges.at(handle.plasticEdgeIndex[i]).mCompliance = handle.baseEdgeCompliance[i] * factor;
        bends.at(handle.plasticBendIndex[i]).mCompliance = handle.baseBendCompliance[i] * factor;
      }
      bodies.ActivateBody(handle.id);
    },

    addFlake(position) {
      // An oat flake: a rolled oat is about 5 mm across and paper thin.
      const shape = new J.BoxShapeSettings(new J.Vec3(0.0025, 0.0008, 0.0025), 0.0002)
        .Create()
        .Get();
      const creation = new J.BodyCreationSettings(
        shape,
        new J.RVec3(position[0], position[1], position[2]),
        new J.Quat(0, 0, 0, 1),
        J.EMotionType_Dynamic,
        LAYER_MOVING
      );
      creation.mFriction = 0.5;
      creation.mRestitution = 0.1;
      // Thin and falling: swept collision, or it can slip between soft-body
      // contact points on a lucky frame.
      creation.mMotionQuality = J.EMotionQuality_LinearCast;
      const body = bodies.CreateBody(creation);
      J.destroy(creation);
      bodies.AddBody(body.GetID(), J.EActivation_Activate);
      const handle: TerrariumBody = { id: body.GetID(), body };
      handles.push(handle);
      return handle;
    },

    addCritter(radiusM, position) {
      const shape = new J.SphereShapeSettings(radiusM).Create().Get();
      const creation = new J.BodyCreationSettings(
        shape,
        new J.RVec3(position[0], position[1], position[2]),
        new J.Quat(0, 0, 0, 1),
        J.EMotionType_Dynamic,
        LAYER_MOVING
      );
      // Frictionless on purpose. Friction combines as √(μ₁·μ₂) with the
      // floor's, and at milligram scale even √(0.05·μfloor) steals ~15
      // mm/s per 120 Hz step — more than walking pace itself; the crew
      // stood pinned to the moss. Zero on the critter zeroes the
      // product. Legs are the fiction; the proxy skates, and walls and
      // hulls still stop it honestly.
      creation.mFriction = 0;
      // Zero on purpose: at critter landing speeds Jolt's restitution
      // floor (mMinVelocityForRestitution) makes bouncing a coin flip.
      // The spit's one bounce is written by the controller instead.
      creation.mRestitution = 0;
      // A millimetre body at walking pace still crosses its own diameter
      // in a couple of steps when pinged — swept, like the flake.
      creation.mMotionQuality = J.EMotionQuality_LinearCast;
      // Barely any linear damping: at 1.5 it played air drag on the spit
      // arc and dragged the Mario fall back into symmetry. Sits are
      // enforced by the controller writing zero velocity, not by drag.
      creation.mLinearDamping = 0.05;
      creation.mAngularDamping = 4;
      const body = bodies.CreateBody(creation);
      J.destroy(creation);
      bodies.AddBody(body.GetID(), J.EActivation_Activate);
      const handle: TerrariumBody = { id: body.GetID(), body };
      handles.push(handle);
      return handle;
    },

    addStaticHull(points, position, yaw) {
      const settings_ = new J.ConvexHullShapeSettings();
      settings_.mMaxConvexRadius = 0.0005;
      // A convex wrap loses nothing visible on a stone; feeding the hull
      // builder every subdivision vertex just costs build time. Take a
      // strided sample down to at most 64 points.
      const total = Math.floor(points.length / 3);
      const stride = Math.max(1, Math.ceil(total / 64));
      for (let i = 0; i < total; i += stride) {
        vec3Scratch.Set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
        settings_.mPoints.push_back(vec3Scratch);
      }
      const shape = settings_.Create().Get();
      J.destroy(settings_);
      const halfYaw = yaw / 2;
      const creation = new J.BodyCreationSettings(
        shape,
        new J.RVec3(position[0], position[1], position[2]),
        new J.Quat(0, Math.sin(halfYaw), 0, Math.cos(halfYaw)),
        J.EMotionType_Static,
        LAYER_STATIC
      );
      creation.mFriction = FLOOR_FRICTION;
      creation.mRestitution = 0.2;
      const body = bodies.CreateBody(creation);
      J.destroy(creation);
      bodies.AddBody(body.GetID(), J.EActivation_DontActivate);
      const handle: TerrariumBody = { id: body.GetID(), body };
      handles.push(handle);
      return handle;
    },

    setGravityFactor(handle, factor) {
      handle.body.GetMotionProperties().SetGravityFactor(factor);
    },

    setLinearVelocity(handle, v) {
      bodies.ActivateBody(handle.id);
      vec3Scratch.Set(v[0], v[1], v[2]);
      handle.body.SetLinearVelocity(vec3Scratch);
    },

    addImpulse(handle, impulse) {
      bodies.ActivateBody(handle.id);
      vec3Scratch.Set(impulse[0], impulse[1], impulse[2]);
      handle.body.AddImpulse(vec3Scratch);
    },

    setPosition(handle, position, activate) {
      vec3Scratch.Set(0, 0, 0);
      handle.body.SetLinearVelocity(vec3Scratch);
      handle.body.SetAngularVelocity(vec3Scratch);
      rvec3Scratch.Set(position[0], position[1], position[2]);
      bodies.SetPosition(
        handle.id,
        rvec3Scratch,
        activate ? J.EActivation_Activate : J.EActivation_DontActivate
      );
    },

    setActive(handle, active) {
      if (active) {
        bodies.ActivateBody(handle.id);
      } else {
        vec3Scratch.Set(0, 0, 0);
        handle.body.SetLinearVelocity(vec3Scratch);
        handle.body.SetAngularVelocity(vec3Scratch);
        bodies.DeactivateBody(handle.id);
      }
    },

    freeze(handle) {
      vec3Scratch.Set(0, 0, 0);
      handle.body.SetLinearVelocity(vec3Scratch);
      handle.body.SetAngularVelocity(vec3Scratch);
      bodies.DeactivateBody(handle.id);
    },

    readVelocity(handle, out) {
      const v = handle.body.GetLinearVelocity();
      out[0] = v.GetX();
      out[1] = v.GetY();
      out[2] = v.GetZ();
    },

    readSlimeVertices(handle, out) {
      const origin = handle.body.GetPosition();
      const ox = origin.GetX();
      const oy = origin.GetY();
      const oz = origin.GetZ();
      for (let i = 0; i < handle.vertexCount; i++) {
        const at = handle.motion.GetVertex(i).mPosition;
        out[i * 3] = ox + at.GetX();
        out[i * 3 + 1] = oy + at.GetY();
        out[i * 3 + 2] = oz + at.GetZ();
      }
    },

    addBall(radiusM, position) {
      const shape = new J.SphereShapeSettings(radiusM).Create().Get();
      const creation = new J.BodyCreationSettings(
        shape,
        new J.RVec3(position[0], position[1], position[2]),
        new J.Quat(0, 0, 0, 1),
        J.EMotionType_Dynamic,
        LAYER_MOVING
      );
      creation.mFriction = FLOOR_FRICTION;
      creation.mRestitution = 0.3;
      const body = bodies.CreateBody(creation);
      J.destroy(creation);
      bodies.AddBody(body.GetID(), J.EActivation_Activate);

      const handle: TerrariumBody = { id: body.GetID(), body };
      handles.push(handle);
      return handle;
    },

    addFinger(radiusM, position) {
      const shape = new J.SphereShapeSettings(radiusM).Create().Get();
      const creation = new J.BodyCreationSettings(
        shape,
        new J.RVec3(position[0], position[1], position[2]),
        new J.Quat(0, 0, 0, 1),
        J.EMotionType_Kinematic,
        LAYER_MOVING
      );
      creation.mFriction = 0.4;
      const body = bodies.CreateBody(creation);
      J.destroy(creation);
      bodies.AddBody(body.GetID(), J.EActivation_Activate);
      const handle: TerrariumBody = { id: body.GetID(), body };
      handles.push(handle);
      return handle;
    },

    addPaddle(halfExtents, position, quaternion) {
      const shape = new J.BoxShapeSettings(
        new J.Vec3(halfExtents[0], halfExtents[1], halfExtents[2]),
        BOX_CONVEX_RADIUS
      )
        .Create()
        .Get();
      const creation = new J.BodyCreationSettings(
        shape,
        new J.RVec3(position[0], position[1], position[2]),
        new J.Quat(quaternion[0], quaternion[1], quaternion[2], quaternion[3]),
        J.EMotionType_Kinematic,
        LAYER_MOVING
      );
      // Rubber on wet glass: grippy enough to peel a slime off the pane.
      creation.mFriction = 0.6;
      const body = bodies.CreateBody(creation);
      J.destroy(creation);
      bodies.AddBody(body.GetID(), J.EActivation_Activate);
      const handle: TerrariumBody = { id: body.GetID(), body };
      handles.push(handle);
      return handle;
    },

    moveKinematic(handle, position, dt) {
      moveTarget.Set(position[0], position[1], position[2]);
      bodies.MoveKinematic(handle.id, moveTarget, handle.body.GetRotation(), dt);
    },

    steerSlimeVertices(handle, indices, worldTargets, dt, maxSpeed) {
      bodies.ActivateBody(handle.id);
      const origin = handle.body.GetPosition();
      const ox = origin.GetX();
      const oy = origin.GetY();
      const oz = origin.GetZ();
      // Targets are clamped to the enclosure before steering toward them —
      // the hand can press the slime against the glass, and no further.
      // (Under the old pin scheme an un-clamped write buried infinite-mass
      // vertices in the floor and crushed the body against it; steering
      // could not wedge like that, but aiming inside a wall would still
      // grind the cluster against contacts for nothing.)
      const skin = SLIME_VERTEX_RADIUS;
      handle.held.clear();
      for (const index of indices) handle.held.add(index);
      for (let i = 0; i < indices.length; i++) {
        const wx = Math.min(BOX_HALF_X - skin, Math.max(-BOX_HALF_X + skin, worldTargets[i * 3]));
        const wy = Math.max(FLOOR_Y + skin, worldTargets[i * 3 + 1]);
        const wz = Math.min(
          BOX_HALF_Z - skin,
          Math.max(-BOX_HALF_Z + skin, worldTargets[i * 3 + 2])
        );
        const vertex = handle.motion.GetVertex(indices[i]);
        const at = vertex.mPosition;
        let vx = (wx - ox - at.GetX()) / dt;
        let vy = (wy - oy - at.GetY()) / dt;
        let vz = (wz - oz - at.GetZ()) / dt;
        const speed = Math.hypot(vx, vy, vz);
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed;
          vx *= scale;
          vy *= scale;
          vz *= scale;
        }
        // The scratch Vec3 is written and handed over per property — the
        // setter copies, so one serves every vertex.
        vec3Scratch.Set(vx, vy, vz);
        vertex.mVelocity = vec3Scratch;
      }
    },

    capSlimeVertexSpeeds(handle, indices, maxSpeed) {
      for (const index of indices) {
        const vertex = handle.motion.GetVertex(index);
        const velocity = vertex.mVelocity;
        const vx = velocity.GetX();
        const vy = velocity.GetY();
        const vz = velocity.GetZ();
        const speed = Math.hypot(vx, vy, vz);
        if (speed <= maxSpeed) continue;
        const scale = maxSpeed / speed;
        vec3Scratch.Set(vx * scale, vy * scale, vz * scale);
        vertex.mVelocity = vec3Scratch;
      }
    },

    wakeSlime(handle) {
      bodies.ActivateBody(handle.id);
    },

    flipSlimeForTest(handle) {
      bodies.ActivateBody(handle.id);
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < handle.physVertexCount; i++) {
        const y = handle.motion.GetVertex(i).mPosition.GetY();
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const mid = (minY + maxY) / 2;
      let midZ = 0;
      for (let i = 0; i < handle.physVertexCount; i++) {
        midZ += handle.motion.GetVertex(i).mPosition.GetZ();
      }
      midZ /= handle.physVertexCount;
      // A *rotation* of 180° about the x axis, not a mirror: a mirror flips
      // the mesh's chirality, which maximally violates every dihedral bend
      // at once — a teleport no hand can produce. A rotation is exactly what
      // turning the pet over does.
      for (let i = 0; i < handle.physVertexCount; i++) {
        const vertex = handle.motion.GetVertex(i);
        const at = vertex.mPosition;
        vec3Scratch.Set(at.GetX(), 2 * mid - at.GetY(), 2 * midZ - at.GetZ());
        vertex.mPosition = vec3Scratch;
        vec3Scratch.Set(0, 0, 0);
        vertex.mVelocity = vec3Scratch;
      }
    },

    remove(handle) {
      const index = handles.indexOf(handle);
      if (index >= 0) handles.splice(index, 1);
      bodies.RemoveBody(handle.id);
      bodies.DestroyBody(handle.id);
    },

    removeSlime(handle) {
      const index = slimes.indexOf(handle);
      if (index >= 0) slimes.splice(index, 1);
      bodies.RemoveBody(handle.id);
      bodies.DestroyBody(handle.id);
    },

    readPose(handle, position, quaternion) {
      const at = handle.body.GetPosition();
      position[0] = at.GetX();
      position[1] = at.GetY();
      position[2] = at.GetZ();
      const rotation = handle.body.GetRotation();
      quaternion[0] = rotation.GetX();
      quaternion[1] = rotation.GetY();
      quaternion[2] = rotation.GetZ();
      quaternion[3] = rotation.GetW();
    },

    dispose() {
      for (const handle of [...handles]) {
        bodies.RemoveBody(handle.id);
        bodies.DestroyBody(handle.id);
      }
      for (const slime of slimes) {
        bodies.RemoveBody(slime.id);
        bodies.DestroyBody(slime.id);
      }
      slimes.length = 0;
      handles.length = 0;
      J.destroy(jolt);
    }
  };
}

// Physics modules must never hot-swap: a scene holding closures over an old
// world while new modules load beside it renders ghosts of retired physics
// (a stale tab once showed the long-dead elastic gumdrop over the beanbag
// build). Any edit here forces a clean reload; the pet persists via storage.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
