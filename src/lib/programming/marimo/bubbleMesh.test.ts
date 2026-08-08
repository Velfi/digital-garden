import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBubbles, type ScreenProjector } from './bubbleMesh';
import { createLightUniforms, createRoomUniforms, createWaterUniforms } from './waterShader';
import {
  BUBBLE_MAX_RADIUS,
  BUBBLE_POP_MIN_RADIUS,
  FRAGMENT_COUNT,
  riseSpeed
} from './bubblePhysics';

/**
 * The clinging half of the bubble life cycle, driven headlessly.
 *
 * Nothing here touches a GL context — the pool is plain typed arrays and the
 * material is only constructed, never compiled — so the actual update loop can
 * be run for a simulated minute and asked where the bubbles ended up.
 */

const BALL_R = 0.012;
const BALL: [number, number, number] = [0, -0.02, 0];
const DT = 1 / 60;

function makeBubbles() {
  return createBubbles(createWaterUniforms(), createRoomUniforms(), createLightUniforms(), {
    value: new THREE.Color(0x8fbf6a)
  });
}

const stillWater = (_x: number, _y: number, _z: number, out: [number, number, number]) => {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
};

interface Snapshot {
  clinging: number;
  /** Alive but no longer held: on its way up. */
  free: number;
  /** Cosine between straight up and each clinging bubble's seat on the ball. */
  seatCos: number[];
  radii: number[];
}

function look(bubbles: ReturnType<typeof makeBubbles>): Snapshot {
  const geometry = bubbles.points.geometry as THREE.InstancedBufferGeometry;
  const centres = geometry.getAttribute('iCentre').array as Float32Array;
  const radii = geometry.getAttribute('iRadius').array as Float32Array;
  const snapshot: Snapshot = {
    clinging: bubbles.clingingCount(),
    free: 0,
    seatCos: [],
    radii: []
  };

  for (let i = 0; i < radii.length; i++) {
    if (radii[i] <= 0) continue;
    snapshot.radii.push(radii[i]);
    const dx = centres[i * 3] - BALL[0];
    const dy = centres[i * 3 + 1] - BALL[1];
    const dz = centres[i * 3 + 2] - BALL[2];
    const d = Math.hypot(dx, dy, dz);
    // Anything still inside the coat's shell is being held in it. Only read
    // where nothing has just been let go, since a bubble that has not yet
    // climbed clear of the fur is indistinguishable from one still stuck in it.
    if (d < BALL_R * 1.06 + BUBBLE_MAX_RADIUS) snapshot.seatCos.push(dy / d);
  }
  snapshot.free = snapshot.radii.length - snapshot.clinging;
  return snapshot;
}

/** Run the jar for `seconds`, optionally turning or dragging the ball. */
function run(
  bubbles: ReturnType<typeof makeBubbles>,
  seconds: number,
  { spin = 0, axis = [0.3, 1, 0.1], slip = 0, rate = 0.8 } = {}
) {
  const turn = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
  const quaternion = new THREE.Quaternion();
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) {
    quaternion.setFromAxisAngle(turn, spin * f * DT);
    bubbles.setBall(
      BALL[0],
      BALL[1],
      BALL[2],
      BALL_R,
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w
    );
    bubbles.trickle(BALL[0], BALL[1], BALL[2], BALL_R, DT, rate);
    bubbles.shear(slip, DT);
    bubbles.update(DT, stillWater);
  }
}

describe('clinging bubbles', () => {
  it('grows on the coat instead of appearing already free', () => {
    const bubbles = makeBubbles();
    run(bubbles, 1, { rate: 6 });
    const seen = look(bubbles);
    // Even the most impatient site holds on for longer than a second, so a
    // second of fizz is several bubbles and not one of them has left yet.
    expect(seen.clinging).toBeGreaterThan(3);
    expect(seen.free).toBe(0);
    // And they are visible while they wait, well short of full size.
    expect(Math.min(...seen.radii)).toBeGreaterThan(0);
    expect(Math.max(...seen.radii)).toBeLessThan(BUBBLE_MAX_RADIUS);
    bubbles.dispose();
  });

  it('lets go on its own, so the jar reaches a mix of both', () => {
    const bubbles = makeBubbles();
    run(bubbles, 40, { rate: 2 });
    const seen = look(bubbles);
    expect(seen.clinging).toBeGreaterThan(0);
    expect(seen.free).toBeGreaterThan(0);
    bubbles.dispose();
  });

  it('stays on the spot it grew from', () => {
    const bubbles = makeBubbles();
    // One batch, seeded together, so every seat is the same age. A second is
    // safely inside even the shortest wait: none of them leaves mid-look.
    bubbles.setBall(BALL[0], BALL[1], BALL[2], BALL_R);
    bubbles.trickle(BALL[0], BALL[1], BALL[2], BALL_R, 10, 0.8);
    bubbles.update(DT, stillWater);

    const start = look(bubbles).seatCos;
    expect(start.length).toBeGreaterThan(4);
    run(bubbles, 1, { rate: 0 });
    const end = look(bubbles).seatCos;

    // Not one of them has wandered over the coat, up or down.
    expect(end.length).toBe(start.length);
    for (let i = 0; i < start.length; i++) expect(end[i]).toBeCloseTo(start[i], 6);
    bubbles.dispose();
  });

  it('rides a turning ball, keeping its seat as the marimo rolls', () => {
    const bubbles = makeBubbles();
    // Turning about the vertical, which never carries a seat underneath: the
    // bubbles go round with the ball and stay exactly as high on it as they
    // were, rather than being flung off or left hanging in the water.
    run(bubbles, 6, { spin: 0.6, axis: [0, 1, 0], rate: 6 });
    const seen = look(bubbles);
    expect(seen.clinging).toBeGreaterThan(3);
    for (const cos of seen.seatCos) expect(cos).toBeGreaterThan(0.15);
    bubbles.dispose();
  });

  it('drops what has been rolled underneath it', () => {
    const bubbles = makeBubbles();
    run(bubbles, 3, { rate: 6 });
    expect(look(bubbles).clinging).toBeGreaterThan(3);
    // Half a turn about a horizontal axis puts every seat on the underside.
    run(bubbles, 3, { spin: 1.2, axis: [1, 0, 0], rate: 0 });
    expect(look(bubbles).clinging).toBe(0);
    bubbles.dispose();
  });

  it('stays put on a marimo drifting under its own buoyancy', () => {
    const bubbles = makeBubbles();
    run(bubbles, 8, { slip: 0.1, rate: 6 });
    expect(look(bubbles).clinging).toBeGreaterThan(3);
    bubbles.dispose();
  });

  it('sheds when dragged through the water', () => {
    const bubbles = makeBubbles();
    run(bubbles, 3, { rate: 6 });
    expect(look(bubbles).clinging).toBeGreaterThan(3);
    run(bubbles, 3, { slip: 0.3, rate: 0 });
    expect(look(bubbles).clinging).toBe(0);
    bubbles.dispose();
  });

  it('releases everything at once when squeezed, at whatever size it had', () => {
    const bubbles = makeBubbles();
    run(bubbles, 3, { rate: 6 });
    const held = look(bubbles);
    expect(held.clinging).toBeGreaterThan(3);

    bubbles.release(1);
    const after = look(bubbles);
    // Every one of them, and none lost in the handover.
    expect(after.clinging).toBe(0);
    expect(after.free).toBe(held.free + held.clinging);
    // Torn off early means torn off small: nothing leaves at full size.
    expect(Math.max(...after.radii)).toBeLessThan(BUBBLE_MAX_RADIUS);

    // And they go up from there rather than sitting where they were let go.
    const heights = () =>
      (bubbles.points.geometry.getAttribute('iCentre').array as Float32Array).filter(
        (_v, index) => index % 3 === 1
      );
    const before = Array.from(heights());
    run(bubbles, 1, { rate: 0 });
    const risen = Array.from(heights()).filter((y, i) => y > before[i] + 1e-6);
    expect(risen.length).toBeGreaterThanOrEqual(after.free);
    bubbles.dispose();
  });

  it('sends released bubbles up, not through the ball', () => {
    const bubbles = makeBubbles();
    run(bubbles, 6, { rate: 6 });
    const before = look(bubbles);
    expect(before.clinging).toBeGreaterThan(3);
    bubbles.release(1);
    run(bubbles, 3, { rate: 0 });

    const geometry = bubbles.points.geometry as THREE.InstancedBufferGeometry;
    const centres = geometry.getAttribute('iCentre').array as Float32Array;
    const radii = geometry.getAttribute('iRadius').array as Float32Array;
    for (let i = 0; i < radii.length; i++) {
      if (radii[i] <= 0) continue;
      const dx = centres[i * 3] - BALL[0];
      const dy = centres[i * 3 + 1] - BALL[1];
      const dz = centres[i * 3 + 2] - BALL[2];
      // Every survivor is clear of the ball, and clear of it upward.
      expect(Math.hypot(dx, dy, dz)).toBeGreaterThan(BALL_R);
      expect(dy).toBeGreaterThan(0);
    }
    bubbles.dispose();
  });

  it('leaves a burst free from the start: vented gas is already loose', () => {
    const bubbles = makeBubbles();
    bubbles.setBall(BALL[0], BALL[1], BALL[2], BALL_R);
    bubbles.burst(BALL[0], BALL[1], BALL[2], BALL_R, 12);
    // Long enough for the slowest of them to clear the coat, short enough that
    // the quickest has not yet reached the surface and popped.
    run(bubbles, 0.6, { rate: 0 });
    const seen = look(bubbles);
    expect(seen.free).toBe(12);
    expect(seen.clinging).toBe(0);
    bubbles.dispose();
  });
});

// ------------------------------------------------------------------- popping

/**
 * A stand-in camera at `+z` looking down the axis, which is all `pick` ever
 * wanted: somewhere to put a bubble on screen and a scale that falls off as
 * 1/depth the way a real perspective projection does.
 */
const CAMERA_Z = 0.12;
const SCREEN = { w: 800, h: 600 };

const project: ScreenProjector = (x, y, z, out) => {
  const depth = CAMERA_Z - z;
  if (depth <= 0.001) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const scale = 480 / depth;
  out[0] = SCREEN.w / 2 + x * scale;
  out[1] = SCREEN.h / 2 - y * scale;
  out[2] = scale;
};

const PAD_PX = 9;

interface Live {
  index: number;
  x: number;
  y: number;
  z: number;
  r: number;
}

function live(bubbles: ReturnType<typeof makeBubbles>): Live[] {
  const geometry = bubbles.points.geometry as THREE.InstancedBufferGeometry;
  const centres = geometry.getAttribute('iCentre').array as Float32Array;
  const radii = geometry.getAttribute('iRadius').array as Float32Array;
  const out: Live[] = [];
  for (let i = 0; i < radii.length; i++) {
    if (radii[i] <= 0) continue;
    out.push({ index: i, x: centres[i * 3], y: centres[i * 3 + 1], z: centres[i * 3 + 2], r: radii[i] });
  }
  return out;
}

/**
 * A jar holding exactly one free bubble, big enough to break. Sizes are rolled
 * per bubble and only the top fifth clears the threshold, so this rerolls a
 * one-bubble jar until it gets one — which it does within a handful of goes.
 */
function oneBreakableBubble(): { bubbles: ReturnType<typeof makeBubbles>; bubble: Live } {
  for (let attempt = 0; attempt < 400; attempt++) {
    const bubbles = makeBubbles();
    bubbles.setBall(BALL[0], BALL[1], BALL[2], BALL_R);
    bubbles.burst(BALL[0], BALL[1], BALL[2], BALL_R, 1);
    const [bubble] = live(bubbles);
    if (bubble && bubble.r >= BUBBLE_POP_MIN_RADIUS) return { bubbles, bubble };
    bubbles.dispose();
  }
  throw new Error('no breakable bubble in 400 tries');
}

/**
 * The same camera with every bubble but one hidden behind it. Handles are
 * opaque by design, so this is how a test says *which* bubble it expects: a
 * pick that can only have found one bubble, to compare a crowded pick against.
 */
function only(target: Live): ScreenProjector {
  return (x, y, z, out) => {
    if (x === target.x && y === target.y && z === target.z) project(x, y, z, out);
    else {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
    }
  };
}

/**
 * A jar holding exactly one bubble, still on the coat and grown big enough to
 * break. One site, watched until it crosses the threshold — so `clingingCount`
 * alone says exactly what it is, with nothing to infer from where it sits.
 */
function oneBreakableClingingBubble(): {
  bubbles: ReturnType<typeof makeBubbles>;
  bubble: Live;
} {
  for (let attempt = 0; attempt < 400; attempt++) {
    const bubbles = makeBubbles();
    bubbles.setBall(BALL[0], BALL[1], BALL[2], BALL_R);
    // dt * rate of exactly 1: one nucleation site and no more.
    bubbles.trickle(BALL[0], BALL[1], BALL[2], BALL_R, 10, 0.1);

    for (let f = 0; f < 60 * 60; f++) {
      if (bubbles.clingingCount() !== 1) break;
      const [bubble] = live(bubbles);
      if (bubble && bubble.r >= BUBBLE_POP_MIN_RADIUS) return { bubbles, bubble };
      bubbles.setBall(BALL[0], BALL[1], BALL[2], BALL_R);
      bubbles.update(DT, stillWater);
    }
    // That site was destined for a small bubble and has since let go of it.
    bubbles.dispose();
  }
  throw new Error('no breakable clinging bubble in 400 tries');
}

/** The one handle for a named bubble, with every other bubble hidden. */
function pickAt(bubbles: ReturnType<typeof makeBubbles>, at: Live) {
  const out: [number, number, number] = [0, 0, 0];
  project(at.x, at.y, at.z, out);
  const found = bubbles.pick(only(at), out[0], out[1], PAD_PX);
  expect(found.length).toBe(1);
  return found[0];
}

describe('picking a bubble', () => {
  it('finds the one under the pointer', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    expect(bubbles.pop(pickAt(bubbles, bubble))).toBe(FRAGMENT_COUNT);
    bubbles.dispose();
  });

  it('finds nothing in empty water', () => {
    const { bubbles } = oneBreakableBubble();
    expect(bubbles.pick(project, 5, 5, PAD_PX)).toEqual([]);
    bubbles.dispose();
  });

  it('gives the small ones a target bigger than they are', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    const out: [number, number, number] = [0, 0, 0];
    project(bubble.x, bubble.y, bubble.z, out);
    // A whisker inside the pad but well outside the bubble's own silhouette,
    // which at this distance is only a few pixels across.
    const onScreenRadius = bubble.r * out[2];
    expect(onScreenRadius).toBeLessThan(PAD_PX);
    expect(bubbles.pick(project, out[0] + PAD_PX - 1, out[1], PAD_PX)).toHaveLength(1);
    expect(bubbles.pick(project, out[0] + PAD_PX + 2, out[1], PAD_PX)).toHaveLength(0);
    bubbles.dispose();
  });

  it('takes every bubble under the tap, not a favourite among them', () => {
    // A break leaves four fragments clustered around where the parent was, so
    // aiming back at that spot is aiming at all four at once.
    const { bubbles, bubble } = oneBreakableBubble();
    bubbles.pop(pickAt(bubbles, bubble));

    const out: [number, number, number] = [0, 0, 0];
    project(bubble.x, bubble.y, bubble.z, out);
    const [aimX, aimY] = out;

    const covering = live(bubbles).filter((b) => {
      project(b.x, b.y, b.z, out);
      const reach = Math.max(b.r * out[2], PAD_PX);
      return Math.hypot(aimX - out[0], aimY - out[1]) <= reach;
    });
    expect(covering.length).toBeGreaterThan(1);

    const picked = bubbles.pick(project, aimX, aimY, PAD_PX);
    expect(picked).toHaveLength(covering.length);
    // Every one of them individually, and no duplicates.
    expect(new Set(picked).size).toBe(picked.length);
    for (const b of covering) expect(picked).toContain(pickAt(bubbles, b));
    bubbles.dispose();
  });

  it('ignores what is behind the camera', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    const behind: ScreenProjector = (_x, _y, _z, out) => {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
    };
    const at: [number, number, number] = [0, 0, 0];
    project(bubble.x, bubble.y, bubble.z, at);
    expect(bubbles.pick(behind, at[0], at[1], PAD_PX)).toEqual([]);
    bubbles.dispose();
  });
});

describe('breaking a bubble', () => {
  it('trades one bubble for four smaller ones, keeping the gas', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    expect(bubbles.pop(pickAt(bubbles, bubble))).toBe(FRAGMENT_COUNT);

    const after = live(bubbles);
    expect(after.length).toBe(FRAGMENT_COUNT);
    const volume = (r: number) => r * r * r;
    const total = after.reduce((sum, b) => sum + volume(b.r), 0);
    expect(total).toBeCloseTo(volume(bubble.r), 12);
    for (const b of after) expect(b.r).toBeLessThan(bubble.r);
    bubbles.dispose();
  });

  it('leaves the small ones alone', () => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const bubbles = makeBubbles();
      bubbles.setBall(BALL[0], BALL[1], BALL[2], BALL_R);
      bubbles.burst(BALL[0], BALL[1], BALL[2], BALL_R, 1);
      const [bubble] = live(bubbles);
      if (bubble && bubble.r < BUBBLE_POP_MIN_RADIUS) {
        // Found by the pointer, since it is a perfectly ordinary bubble — and
        // then simply not broken, which is the whole of the rule.
        expect(bubbles.pop(pickAt(bubbles, bubble))).toBe(0);
        expect(live(bubbles).length).toBe(1);
        bubbles.dispose();
        return;
      }
      bubbles.dispose();
    }
    throw new Error('no small bubble in 400 tries');
  });

  it('pushes the fragments apart by about the radius they came from', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    bubbles.pop(pickAt(bubbles, bubble));

    const start = live(bubbles);
    const spread = (from: Live[]) => {
      const cx = from.reduce((s, b) => s + b.x, 0) / from.length;
      const cy = from.reduce((s, b) => s + b.y, 0) / from.length;
      const cz = from.reduce((s, b) => s + b.z, 0) / from.length;
      return from.reduce((s, b) => s + Math.hypot(b.x - cx, b.y - cy, b.z - cz), 0) / from.length;
    };
    const opening = spread(start);
    // Several times the longest decay time, and short enough that nothing has
    // yet climbed to the surface and burst.
    run(bubbles, 0.5, { rate: 0 });
    const settledSet = live(bubbles);
    expect(settledSet.length).toBe(FRAGMENT_COUNT);
    const settled = spread(settledSet);

    expect(settled).toBeGreaterThan(opening);
    // Ends up a parent radius or so out, from √(σ/ρR)·√(ρR³/σ) = R and nothing
    // else, and having taken long enough about it to be watched.
    expect(settled / bubble.r).toBeGreaterThan(1);
    expect(settled / bubble.r).toBeLessThan(3);
    bubbles.dispose();
  });

  it('carries the cloud nowhere: four even directions have no net push', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    bubbles.pop(pickAt(bubbles, bubble));
    const after = live(bubbles);
    const cx = after.reduce((s, b) => s + b.x, 0) / after.length;
    const cz = after.reduce((s, b) => s + b.z, 0) / after.length;
    // Sideways, where nothing else acts. Vertically the fragments start rising
    // the moment they exist, so that axis is not the cloud's alone.
    expect(Math.abs(cx - bubble.x)).toBeLessThan(bubble.r * 1e-3);
    expect(Math.abs(cz - bubble.z)).toBeLessThan(bubble.r * 1e-3);
    bubbles.dispose();
  });

  it('gives the fragments their own physics, not the parent’s', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    const parentSpeed = riseSpeed(bubble.r);
    bubbles.pop(pickAt(bubbles, bubble));
    // Long enough for the opening push to have all but died away, so what is
    // left is a rise read off the fragment's own size — and short enough that
    // none of them has reached the surface, where they would stop being.
    run(bubbles, 0.8, { rate: 0 });
    const before = live(bubbles).map((b) => b.y);
    run(bubbles, 0.2, { rate: 0 });
    const after = live(bubbles).map((b) => b.y);
    expect(before.length).toBe(FRAGMENT_COUNT);
    expect(after.length).toBe(FRAGMENT_COUNT);

    const expected = riseSpeed(live(bubbles)[0].r);
    for (let i = 0; i < before.length; i++) {
      const climbing = (after[i] - before[i]) / 0.2;
      // Each of them rises at the speed its own radius earns — slower than the
      // bubble they came out of, which is bigger than any of them. Within a
      // percent rather than exactly: the opening push is exponential and never
      // quite reaches zero.
      expect(Math.abs(climbing / expected - 1)).toBeLessThan(0.01);
      expect(climbing).toBeLessThan(parentSpeed);
      expect(climbing).toBeGreaterThan(0);
    }
    bubbles.dispose();
  });

  it('refuses a handle whose bubble has moved on', () => {
    const { bubbles, bubble } = oneBreakableBubble();
    const handle = pickAt(bubbles, bubble);
    expect(bubbles.pop(handle)).toBe(FRAGMENT_COUNT);
    // The parent's slot has been handed to one of its own children by now, and
    // that child is emphatically not what was pressed on.
    expect(bubbles.pop(handle)).toBe(0);
    expect(bubbles.pop(-1)).toBe(0);
    expect(bubbles.pop(9e15)).toBe(0);
    expect(live(bubbles).length).toBe(FRAGMENT_COUNT);
    bubbles.dispose();
  });

  it('breaks a bubble off the coat, filament and all', () => {
    const { bubbles, bubble } = oneBreakableClingingBubble();
    expect(bubbles.clingingCount()).toBe(1);
    expect(bubbles.pop(pickAt(bubbles, bubble))).toBe(FRAGMENT_COUNT);

    // Being torn off the filament is the least of what just happened to it,
    // and not one of the fragments inherits its seat.
    expect(bubbles.clingingCount()).toBe(0);
    expect(live(bubbles).length).toBe(FRAGMENT_COUNT);
    bubbles.dispose();
  });
});

describe('the pool under pressure', () => {
  it('spends dead slots before it evicts anything', () => {
    const bubbles = makeBubbles();
    bubbles.setBall(BALL[0], BALL[1], BALL[2], BALL_R);
    bubbles.burst(BALL[0], BALL[1], BALL[2], BALL_R, 40);
    expect(live(bubbles).length).toBe(40);
    bubbles.burst(BALL[0], BALL[1], BALL[2], BALL_R, 40);
    expect(live(bubbles).length).toBe(80);
    bubbles.dispose();
  });

  it('takes the oldest bubble in the water before one on the coat', () => {
    const bubbles = makeBubbles();
    // A coat full of held bubbles, then the pool swamped with loose ones.
    run(bubbles, 30, { rate: 3 });
    const held = bubbles.clingingCount();
    expect(held).toBeGreaterThan(4);

    for (let i = 0; i < 12; i++) {
      bubbles.burst(BALL[0], BALL[1], BALL[2], BALL_R, 40);
    }
    // Held bubbles do not age, so they are never the lowest life in the pool
    // while anything at all is loose: not one of them was stepped on.
    expect(bubbles.clingingCount()).toBe(held);
    bubbles.dispose();
  });
});
