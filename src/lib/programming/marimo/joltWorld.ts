import initJolt from 'jolt-physics';
import type Jolt from 'jolt-physics';
import {
  FLOOR_Y,
  RHO_WATER,
  STONE_DENSITY,
  STONE_FRICTION,
  STONE_RESTITUTION,
  TANK_HALF_X,
  TANK_HALF_Z,
  WATER_Y
} from './constants';

/**
 * The jar, as Jolt sees it.
 *
 * Everything about talking to the engine lives here: loading the module, the
 * layer tables, the static glass and gravel, and the tolerance tuning. Nothing
 * above this file knows that Jolt exists, and nothing in this file knows what a
 * marimo is.
 *
 * One decision governs the file: the simulation runs at true scale, in real
 * metres, under real gravity. A jar is 0.11 m across, a stone is 0.02, and
 * 9.81 m/s² means exactly what it says. There is no unit conversion anywhere —
 * a position handed in is the position the engine integrates, and a position
 * read back is where the thing is.
 *
 * What that costs is `tuneForCentimetres`. Jolt's tolerance defaults assume
 * bodies around a metre across — they are the numbers that make crates and
 * ragdolls robust — and on centimetre bodies several of them are bigger than
 * the object they are meant to protect. Each one is retuned there, with the
 * measured default beside it and the reason it cannot stand. That block is the
 * whole price of honesty, it is paid once, and every number in it is a length —
 * nothing about the *dynamics* is being tuned, only the engine's ideas of
 * "negligibly small".
 */

/**
 * The rounding on every stone's convex hull, metres.
 *
 * Half a millimetre. Jolt inflates a hull by this and shrinks the points to
 * compensate, which is what keeps contact normals stable on shapes with sharp
 * edges — and these have sharp edges, because flint is knapped. The default is
 * 5 cm, which is wider than most of the stones.
 */
const CONVEX_RADIUS = 0.0005;

/** The same idea for the static boxes. Their edges are never a contact feature. */
const BOX_CONVEX_RADIUS = 0.001;

/** How thick the invisible glass is. Only its inside face is ever touched. */
const WALL_THICKNESS = 0.05;

const LAYER_STATIC = 0;
const LAYER_MOVING = 1;
const LAYER_COUNT = 2;

/** A body the tank owns, with everything it needs to be read back each frame. */
export interface JoltBody {
  id: Jolt.BodyID;
  body: Jolt.Body;
  /** Density in kg/m^3. Drives the buoyancy factor, which is a ratio. */
  density: number;
  /** Sphere radius, for the marimo, so a rebuild only happens when it grows. */
  radiusM: number;
  /** Set while the pointer has hold of it, metres. */
  grabTarget: [number, number, number] | null;
}

export interface JoltWorld {
  /**
   * Advance the simulation. `waterY` moves during a water change; `flow` is the
   * water's own velocity at a point.
   */
  step(
    dt: number,
    waterY: number,
    flow: (x: number, y: number, z: number, out: [number, number, number]) => void
  ): void;

  /** A stone: a convex hull of `points`, metres, about its own centre. */
  addStone(
    points: readonly number[],
    position: readonly [number, number, number],
    quaternion: readonly [number, number, number, number]
  ): JoltBody | null;

  /**
   * The marimo: a sphere that Jolt owns like any other body.
   *
   * Its radius changes as the pet grows and its density changes as it fills
   * with gas, so both are pushed in every frame rather than fixed at creation.
   */
  addMarimo(radiusM: number, position: readonly [number, number, number]): JoltBody | null;
  setMarimoShape(handle: JoltBody, radiusM: number, density: number): void;

  remove(handle: JoltBody): void;
  /** Pose out, written into `position` and `quaternion`. */
  readPose(
    handle: JoltBody,
    position: [number, number, number],
    quaternion: [number, number, number, number]
  ): void;
  readVelocity(
    handle: JoltBody,
    linear: [number, number, number],
    angular: [number, number, number]
  ): void;
  setVelocity(handle: JoltBody, linear: readonly [number, number, number]): void;
  /**
   * Set the spin outright.
   *
   * For the hand, and only the hand. Rolling something between your palms is a
   * statement about a person, not about a fluid — there is no force in the jar
   * that does it and no reason for the engine to have an opinion.
   */
  setSpin(handle: JoltBody, angular: readonly [number, number, number]): void;
  /**
   * A twist, given as an angular acceleration in rad/s²; the body's own inertia
   * makes it newton-metres.
   *
   * The conversion goes through the full world-space inertia tensor —
   * `torque = I·α` — not through a diagonal. Both shortcuts were tried and both
   * are wrong ways that tests caught: raw torque is a unit error that hides
   * until a body with a different inertia comes along (they vary here by five
   * orders of magnitude), and Jolt's inertia *diagonal* lives in the principal-
   * axis frame, which for a lumpy hull points nowhere near the axes the caller
   * is thinking in.
   *
   * Dropped while the body sleeps. Jolt accumulates applied torque, and a
   * sleeping body neither consumes nor clears it — feed one at 240 Hz and it
   * wakes someday with the whole backlog at once.
   */
  addTorque(handle: JoltBody, x: number, y: number, z: number): void;
  /**
   * True if the body ended the step resting on something — anything, with a
   * normal pointing up. Answered by a contact listener rather than by a probe,
   * so it is the engine's own opinion about what is touching what.
   */
  isSupported(handle: JoltBody): boolean;
  /** Wake a body that has gone to sleep. */
  wake(handle: JoltBody): void;
  /**
   * Put a body to sleep where it stands.
   *
   * For the pop, which needs a stone to hang in the air for four hundred
   * milliseconds while it turns from a picture into a rock. Sleeping is exactly
   * that — a body the engine does not integrate — so this needs no special case
   * anywhere in the step.
   */
  freeze(handle: JoltBody): void;
  asleep(handle: JoltBody): boolean;
  dispose(): void;
}

/**
 * Load the engine.
 *
 * Cached, because the module is two megabytes of WebAssembly and the page can
 * mount more than one tank. The promise is shared rather than the result, so
 * two tanks starting at once wait on one download rather than racing.
 */
let joltModule: Promise<typeof Jolt> | null = null;
export function loadJolt(): Promise<typeof Jolt> {
  if (!joltModule) joltModule = initJolt();
  return joltModule;
}

/**
 * Bring the engine's tolerances down to the size of the things in the jar.
 *
 * Every field here is a length or a speed. The defaults beside them were read
 * out of this exact binary (they are Jolt 5.x's stock values), and each is
 * sized for bodies about a metre across. The retuned values keep the same
 * *proportions* — roughly defaults ÷ 100 against bodies ÷ 100 — so the engine's
 * behaviour per body-size is unchanged; only its idea of "too small to matter"
 * is.
 *
 * Nothing dimensionless is touched. Baumgarte, the solver iteration counts and
 * the linear-cast fractions are ratios, and ratios do not care what a metre is.
 */
function tuneForCentimetres(physics: Jolt.PhysicsSystem): void {
  const s = physics.GetPhysicsSettings();

  // Default 0.02 m. How far ahead of a moving body the engine looks for
  // contacts. Two centimetres of clairvoyance around a two-centimetre stone
  // makes everything collide before it visibly touches; but it must still cover
  // a step of travel, and terminal velocity in the jar is ~0.5 m/s ≈ 2.1 mm per
  // 240 Hz step. 2.5 mm covers it with margin, and linear casting (below)
  // backstops anything faster.
  s.mSpeculativeContactDistance = 0.0025;

  // Default 0.02 m. Overlap the solver tolerates before pushing back. Left at
  // the default, stones sink two centimetres into the floor — deeper than a
  // slate is thick — and rest visibly buried. 0.2 mm is beneath a pixel.
  s.mPenetrationSlop = 0.0002;

  // Default 0.2 m. The deepest overlap position correction will remove in one
  // go. It only exists to stop explosive corrections, and a fifth of a metre
  // in a tenth-of-a-metre jar is no cap at all.
  s.mMaxPenetrationDistance = 0.002;

  // Default 1e-3 m. How close two contact points must be to count as the same
  // point when manifolds are reduced and matched between steps.
  s.mManifoldTolerance = 1e-4;

  // Default (1e-3 m)². How far a body pair may move before its cached collision
  // result from last step stops being reusable.
  s.mBodyPairCacheMaxDeltaPositionSq = 1e-8;

  // Default (0.01 m)². How far a contact point may drift and still inherit its
  // warm-start impulse. A centimetre is half a stone; a millimetre is a feature.
  s.mContactPointPreserveLambdaMaxDistSq = 1e-6;

  // Default 1 m/s. Below this impact speed, restitution is not applied at all.
  // Nothing in the jar ever reaches 1 m/s, so the default silently deletes
  // bounce from the whole world; 0.05 m/s restores it for real knocks while
  // still letting resting contacts die quietly.
  s.mMinVelocityForRestitution = 0.05;

  // Default 0.03 m/s. The point-velocity below which a body may fall asleep.
  // Three centimetres per second is a third of the jar per second — a stone
  // moving that fast is being *watched*. Three millimetres per second is the
  // hand-tuned threshold the old solver used, and it read right.
  s.mPointVelocitySleepThreshold = 0.003;

  physics.SetPhysicsSettings(s);
}

export function createJoltWorld(J: typeof Jolt): JoltWorld {
  // --- the world ------------------------------------------------------------
  const settings = new J.JoltSettings();
  settings.mMaxBodies = 64;
  settings.mMaxBodyPairs = 512;
  settings.mMaxContactConstraints = 512;

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

  // --- the jar --------------------------------------------------------------
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
    creation.mFriction = STONE_FRICTION;
    creation.mRestitution = STONE_RESTITUTION;
    bodies.CreateAndAddBody(creation, J.EActivation_DontActivate);
    J.destroy(creation);
  }

  // The gravel bed, and four walls tall enough that nothing can be lifted over
  // one. The jar has no lid: a stone in hand is allowed out of the water.
  const wallHeight = (WATER_Y - FLOOR_Y) * 2;
  addWall(0, FLOOR_Y - WALL_THICKNESS / 2, 0, TANK_HALF_X * 2, WALL_THICKNESS / 2, TANK_HALF_Z * 2);
  addWall(
    TANK_HALF_X + WALL_THICKNESS / 2,
    FLOOR_Y + wallHeight / 2,
    0,
    WALL_THICKNESS / 2,
    wallHeight / 2,
    TANK_HALF_Z * 2
  );
  addWall(
    -TANK_HALF_X - WALL_THICKNESS / 2,
    FLOOR_Y + wallHeight / 2,
    0,
    WALL_THICKNESS / 2,
    wallHeight / 2,
    TANK_HALF_Z * 2
  );
  addWall(
    0,
    FLOOR_Y + wallHeight / 2,
    TANK_HALF_Z + WALL_THICKNESS / 2,
    TANK_HALF_X * 2,
    wallHeight / 2,
    WALL_THICKNESS / 2
  );
  addWall(
    0,
    FLOOR_Y + wallHeight / 2,
    -TANK_HALF_Z - WALL_THICKNESS / 2,
    TANK_HALF_X * 2,
    wallHeight / 2,
    WALL_THICKNESS / 2
  );

  // --- scratch --------------------------------------------------------------
  // Every one of these is a handle into WASM memory and has to be freed by hand,
  // so they are made once and reused rather than allocated per body per frame.
  const surfacePoint = new J.RVec3(0, 0, 0);
  const surfaceNormal = new J.Vec3(0, 1, 0);
  const fluidVelocity = new J.Vec3(0, 0, 0);
  const gravityVector = new J.Vec3(0, -9.81, 0);
  const forceVector = new J.Vec3(0, 0, 0);
  const inertiaScratch = new J.Mat44();
  const flowScratch: [number, number, number] = [0, 0, 0];

  const handles: JoltBody[] = [];

  // --- what is standing on what --------------------------------------------
  /**
   * Bodies that ended the last step with something under them.
   *
   * Jolt reports every contact it resolves, which is a better answer than any
   * probe: it is the same set of touches the solver acted on, so a marimo that
   * the engine believes is resting on a rock is one this agrees is resting on a
   * rock.
   *
   * Only *active* bodies are re-decided each step. A sleeping one reports no
   * contacts at all — that is the point of sleeping — so its last answer is
   * kept, which is also the true one: a body that went to sleep resting on
   * something is still resting on it.
   */
  const supported = new Set<number>();
  const touchingNow = new Set<number>();

  function noteContact(bodyPtr1: number, bodyPtr2: number, manifoldPtr: number): void {
    const manifold = J.wrapPointer(manifoldPtr, J.ContactManifold);
    const normalY = manifold.mWorldSpaceNormal.GetY();
    // The manifold's normal points from body 1 to body 2, so whichever way it
    // is leaning, one of the pair is being held up by the other.
    const first = J.wrapPointer(bodyPtr1, J.Body);
    const second = J.wrapPointer(bodyPtr2, J.Body);
    if (normalY < -SUPPORT_NORMAL_Y) {
      touchingNow.add(first.GetID().GetIndexAndSequenceNumber());
    } else if (normalY > SUPPORT_NORMAL_Y) {
      touchingNow.add(second.GetID().GetIndexAndSequenceNumber());
    }
  }

  const listener = new J.ContactListenerJS();
  listener.OnContactValidate = () => J.ValidateResult_AcceptAllContactsForThisBodyPair;
  listener.OnContactAdded = (body1, body2, manifold) => noteContact(body1, body2, manifold);
  listener.OnContactPersisted = (body1, body2, manifold) => noteContact(body1, body2, manifold);
  listener.OnContactRemoved = () => {};
  physics.SetContactListener(listener);

  function makeBody(
    shape: Jolt.Shape,
    density: number,
    position: readonly [number, number, number],
    quaternion: readonly [number, number, number, number]
  ): JoltBody {
    const creation = new J.BodyCreationSettings(
      shape,
      new J.RVec3(position[0], position[1], position[2]),
      new J.Quat(quaternion[0], quaternion[1], quaternion[2], quaternion[3]),
      J.EMotionType_Dynamic,
      LAYER_MOVING
    );
    creation.mFriction = STONE_FRICTION;
    creation.mRestitution = STONE_RESTITUTION;
    // The buoyancy impulse carries the drag, so the body itself is undamped —
    // damping on top would be the water counted twice.
    creation.mLinearDamping = 0;
    creation.mAngularDamping = 0;
    // Sharp-edged hulls resting on a flat floor are exactly the case internal
    // edge removal is for; without it a stone can catch on the seam between two
    // triangles of its own hull and jitter.
    creation.mEnhancedInternalEdgeRemoval = true;
    // Swept collision. A slate is four millimetres thin, and a stone at
    // terminal velocity crosses two millimetres per step — those are close
    // enough that discrete stepping is trusting to luck. The cast costs a
    // fraction of a millisecond across four stones and removes tunnelling as a
    // possibility rather than an improbability.
    creation.mMotionQuality = J.EMotionQuality_LinearCast;

    const body = bodies.CreateBody(creation);
    J.destroy(creation);
    bodies.AddBody(body.GetID(), J.EActivation_Activate);

    const handle: JoltBody = { id: body.GetID(), body, density, radiusM: 0, grabTarget: null };
    handles.push(handle);
    return handle;
  }

  return {
    addStone(points, position, quaternion) {
      const hullSettings = new J.ConvexHullShapeSettings();
      hullSettings.mMaxConvexRadius = CONVEX_RADIUS;
      const cloud = hullSettings.mPoints;
      for (let i = 0; i + 2 < points.length; i += 3) {
        cloud.push_back(new J.Vec3(points[i], points[i + 1], points[i + 2]));
      }

      const result = hullSettings.Create();
      if (result.HasError()) {
        J.destroy(hullSettings);
        return null;
      }
      const shape = result.Get();
      J.destroy(hullSettings);

      // Jolt works out the mass and the full inertia tensor from the hull and
      // the density, which is a good deal better than anything that could be
      // written here: it is the real integral over the real solid.
      shape.GetMassProperties();
      return makeBody(shape, STONE_DENSITY, position, quaternion);
    },

    addMarimo(radiusM, position) {
      const shape = new J.SphereShapeSettings(radiusM).Create().Get();
      const handle = makeBody(shape, RHO_WATER, position, [0, 0, 0, 1]);
      handle.radiusM = radiusM;
      return handle;
    },

    setMarimoShape(handle, radiusM, density) {
      handle.density = density;
      // Only when it has actually grown. A marimo puts on a fifth of a
      // millimetre a day, and rebuilding the shape every frame would throw away
      // the body's contact cache sixty times a second for nothing.
      if (Math.abs(radiusM - handle.radiusM) < 1e-5) return;
      handle.radiusM = radiusM;

      const shape = new J.SphereShapeSettings(radiusM).Create().Get();
      // Mass properties recomputed from the shape, which puts Jolt's default
      // density of 1000 on it. That is very nearly the marimo's own — the pet
      // lives between about 940 and 1035, which is the whole reason it hovers —
      // so the mass is right to a few per cent and the inertia with it. What
      // must be exact is the *ratio* in the buoyancy factor, and that is taken
      // from `density` above rather than from the shape.
      bodies.SetShape(handle.id, shape, true, J.EActivation_Activate);
    },

    remove(handle) {
      const index = handles.indexOf(handle);
      if (index >= 0) handles.splice(index, 1);
      bodies.RemoveBody(handle.id);
      bodies.DestroyBody(handle.id);
    },

    step(dt, waterY, flow) {
      surfacePoint.Set(0, waterY, 0);

      for (const handle of handles) {
        const { body } = handle;
        if (!body.IsActive()) continue;

        const position = body.GetPosition();
        flow(position.GetX(), position.GetY(), position.GetZ(), flowScratch);
        fluidVelocity.Set(flowScratch[0], flowScratch[1], flowScratch[2]);

        // Real buoyancy, from the engine: it clips the body's shape against the
        // surface plane every step and integrates the pressure over what is
        // under it. That is why a stone tips as it goes in, and why one lifted
        // half out gets heavier as it breaks the surface — neither is written
        // down anywhere, they are just what the integral does.
        //
        // The factor is the ratio of the fluid's density to the body's, so it
        // is scale-free: 0.38 for quartz, and a shade over 1 for a marimo full
        // of oxygen, which is the whole of why one sinks and the other rises.
        body.ApplyBuoyancyImpulse(
          surfacePoint,
          surfaceNormal,
          RHO_WATER / handle.density,
          BUOYANCY_LINEAR_DRAG,
          BUOYANCY_ANGULAR_DRAG,
          fluidVelocity,
          gravityVector,
          dt
        );

        if (handle.grabTarget) {
          // A critically-damped spring in the hand. The stiffness and damping
          // are per unit mass, and the body's own mass scales the force, so a
          // big stone and a small one arrive at the pointer in the same time.
          const motion = body.GetMotionProperties();
          const mass = 1 / Math.max(motion.GetInverseMass(), 1e-9);
          const velocity = body.GetLinearVelocity();
          for (let axis = 0; axis < 3; axis++) {
            const at =
              axis === 0 ? position.GetX() : axis === 1 ? position.GetY() : position.GetZ();
            const to = handle.grabTarget[axis];
            const speed =
              axis === 0 ? velocity.GetX() : axis === 1 ? velocity.GetY() : velocity.GetZ();
            const accel = (to - at) * GRAB_STIFFNESS - speed * GRAB_DAMPING;
            forceVector.Set(
              axis === 0 ? accel * mass : 0,
              axis === 1 ? accel * mass : 0,
              axis === 2 ? accel * mass : 0
            );
            body.AddForce(forceVector);
          }
        }
      }

      // One collision step. At 240 Hz nothing in the jar moves more than a
      // fraction of its own size per step, which is the condition that makes
      // more than one pointless.
      touchingNow.clear();
      jolt.Step(dt, 1);

      for (const handle of handles) {
        if (!handle.body.IsActive()) continue;
        const id = handle.id.GetIndexAndSequenceNumber();
        if (touchingNow.has(id)) supported.add(id);
        else supported.delete(id);
      }
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

    readVelocity(handle, linear, angular) {
      const v = handle.body.GetLinearVelocity();
      linear[0] = v.GetX();
      linear[1] = v.GetY();
      linear[2] = v.GetZ();
      const w = handle.body.GetAngularVelocity();
      angular[0] = w.GetX();
      angular[1] = w.GetY();
      angular[2] = w.GetZ();
    },

    setVelocity(handle, linear) {
      forceVector.Set(linear[0], linear[1], linear[2]);
      handle.body.SetLinearVelocity(forceVector);
    },

    setSpin(handle, angular) {
      forceVector.Set(angular[0], angular[1], angular[2]);
      handle.body.SetAngularVelocity(forceVector);
    },

    addTorque(handle, x, y, z) {
      const { body } = handle;
      if (!body.IsActive()) return;
      // I·α, with I recovered by inverting the world-space inverse inertia — a
      // dynamic body's tensor is full-rank by construction, so the inverse
      // exists.
      //
      // The shape of this code is load-bearing. Values returned by value from
      // the bindings are Emscripten pool temporaries: valid until the next call
      // that returns the same type, never to be `destroy`ed, and never to be
      // chained — `GetInverseInertia().Inversed3x3()` reads a slot the second
      // call is already reusing. So the inverse goes straight into a matrix we
      // own, and the product is read out into our own vector before anything
      // else touches the pool.
      inertiaScratch.SetInversed3x3(body.GetInverseInertia());
      forceVector.Set(x, y, z);
      const torque = inertiaScratch.MulVec3(forceVector);
      forceVector.Set(torque.GetX(), torque.GetY(), torque.GetZ());
      body.AddTorque(forceVector);
    },

    isSupported(handle) {
      return supported.has(handle.id.GetIndexAndSequenceNumber());
    },

    wake(handle) {
      bodies.ActivateBody(handle.id);
    },

    freeze(handle) {
      forceVector.Set(0, 0, 0);
      handle.body.SetLinearVelocity(forceVector);
      handle.body.SetAngularVelocity(forceVector);
      bodies.DeactivateBody(handle.id);
    },

    asleep(handle) {
      return !handle.body.IsActive();
    },

    dispose() {
      for (const handle of [...handles]) {
        bodies.RemoveBody(handle.id);
        bodies.DestroyBody(handle.id);
      }
      handles.length = 0;
      J.destroy(jolt);
    }
  };
}

/**
 * Drag coefficients for `ApplyBuoyancyImpulse`.
 *
 * Jolt's own units, which are rates: a linear drag of 1 roughly halves the
 * speed of a fully submerged body every second, whatever its size. A blunt wet
 * rock is draggier than a streamlined one and barely spins in water at all,
 * which is what the second number says.
 */
const BUOYANCY_LINEAR_DRAG = 0.9;
const BUOYANCY_ANGULAR_DRAG = 0.6;

/**
 * Grab spring, per unit mass. `ω = √640 ≈ 25 rad/s` with damping `50 ≈ 2ω`:
 * critically damped at about 4 Hz, and dimensionally scale-free.
 */
const GRAB_STIFFNESS = 640;
const GRAB_DAMPING = 50;

/**
 * How far off vertical a contact normal may be and still count as support.
 *
 * Half a right angle. Steeper than that and the body is leaning on something
 * rather than standing on it — which for the marimo is the difference between
 * resting on a rock, where it will slowly grow a flat side, and merely being up
 * against one.
 */
const SUPPORT_NORMAL_Y = 0.5;
