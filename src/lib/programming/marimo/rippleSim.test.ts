import { describe, expect, it } from 'vitest';
import { BUBBLE_MAX_RADIUS, BUBBLE_MIN_RADIUS } from './bubblePhysics';
import {
  DEFAULT_RIPPLE_SIM,
  RIPPLE_BURST_STEPS,
  RIPPLE_CELL,
  RIPPLE_CFL_LIMIT,
  RIPPLE_LEVEL_TAU,
  RIPPLE_STEP_SEC,
  burstDrop,
  cflNumber,
  rippleKernel,
  createRippleField,
  rippleCoefficients,
  rippleRms,
  stepRippleField,
  type RippleDrop,
  type RippleField,
  type RippleSimParams
} from './rippleSim';

/**
 * The look of the water is judged at `/marimo/ripples`, not here. These cover
 * what has to be true of the stepper whatever it ends up looking like: that it
 * does not explode, that a disturbance travels at the speed it was asked for,
 * that the glass sends waves back, and that the water goes still when nothing is
 * pushing it.
 */

function withParams(overrides: Partial<RippleSimParams>): RippleSimParams {
  return { ...DEFAULT_RIPPLE_SIM, ...overrides };
}

/** Drop a pulse in the middle and let it run. */
function pulsed(params: RippleSimParams, cols = 96, rows = 96): RippleField {
  const field = createRippleField(cols, rows);
  const centre = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  field.now[centre] = 1;
  return field;
}

function run(field: RippleField, params: RippleSimParams, steps: number, drops: RippleDrop[] = []) {
  const coefficients = rippleCoefficients(params);
  for (let n = 0; n < steps; n++) stepRippleField(field, coefficients, drops);
}

describe('stability', () => {
  it('keeps the shipped settings under the Courant limit', () => {
    // The one number that decides whether this is a simulation or a screenful of
    // NaN. Half the limit, so a burst of catch-up substeps has room.
    expect(cflNumber(DEFAULT_RIPPLE_SIM)).toBeLessThan(RIPPLE_CFL_LIMIT);
    expect(cflNumber(DEFAULT_RIPPLE_SIM)).toBeCloseTo(0.5, 2);
  });

  it('stays finite and bounded over a long run', () => {
    const field = pulsed(DEFAULT_RIPPLE_SIM);
    run(field, DEFAULT_RIPPLE_SIM, 4000);

    for (const h of field.now) expect(Number.isFinite(h)).toBe(true);
    // Started from a unit spike and nothing has driven it since, so every height
    // has to be well under that.
    expect(Math.max(...field.now)).toBeLessThan(1);
  });

  it('blows up above the limit, which is what the headroom is for', () => {
    // Not a wish — a property of the scheme. Worth pinning so that raising the
    // speed slider past the limit fails here rather than in someone's browser.
    const reckless = withParams({ speedMmPerSec: 400, decaySec: 1e6, viscosity: 0 });
    expect(cflNumber(reckless)).toBeGreaterThan(RIPPLE_CFL_LIMIT);

    const field = pulsed(reckless);
    run(field, reckless, 400);

    // Whether it ends up enormous or ends up NaN is not the point and is not
    // worth pinning; what matters is that it is no longer a bounded surface.
    const bounded = field.now.every((h) => Number.isFinite(h) && Math.abs(h) < 1e3);
    expect(bounded).toBe(false);
  });
});

describe('waves', () => {
  it('carries a disturbance at the speed it was given', () => {
    // Timed by when the wave arrives at a probe rather than by how far it has
    // spread: a spreading pulse has a long, tiny precursor whose extent depends
    // entirely on where the threshold is put, and arrival does not.
    const params = withParams({ decaySec: 1e6, viscosity: 0 });
    const cols = 200;
    const rows = 64;
    const field = createRippleField(cols, rows);

    const row = Math.floor(rows / 2);
    const source = 20;
    const probe = source + 48;
    const distanceMm = (probe - source) * RIPPLE_CELL * 1000;

    const coefficients = rippleCoefficients(params);
    const drop = {
      x: (source + 0.5) * RIPPLE_CELL - (cols * RIPPLE_CELL) / 2,
      z: (row + 0.5) * RIPPLE_CELL - (rows * RIPPLE_CELL) / 2,
      radius: 0.003,
      strength: 0.05
    };

    const trace: number[] = [];
    for (let n = 0; n < 400; n++) {
      stepRippleField(field, coefficients, n < 10 ? [drop] : []);
      trace.push(Math.abs(field.now[row * cols + probe]));
    }

    const peak = Math.max(...trace);
    const arrival = trace.findIndex((h) => h > peak * 0.25);
    const speedMmPerSec = distanceMm / (arrival * RIPPLE_STEP_SEC);

    expect(arrival).toBeGreaterThan(0);
    expect(speedMmPerSec).toBeGreaterThan(params.speedMmPerSec * 0.75);
    expect(speedMmPerSec).toBeLessThan(params.speedMmPerSec * 1.25);
  });

  it('sends waves back off the glass instead of swallowing them', () => {
    const params = withParams({ decaySec: 1e6, viscosity: 0 });
    const cols = 64;
    const rows = 64;

    // A pulse near the left wall, given long enough to reach it and come back.
    const field = createRippleField(cols, rows);
    field.now[Math.floor(rows / 2) * cols + 8] = 1;

    const before = rippleRms(field);
    run(field, params, 600);
    const after = rippleRms(field);

    // Nothing damps it and nothing leaves, so the energy is still in the jar.
    // An absorbing boundary would have drained most of it by now.
    expect(after).toBeGreaterThan(before * 0.5);

    // And it did not simply sit there: the pulse has spread off its start.
    expect(Math.abs(field.now[Math.floor(rows / 2) * cols + 8])).toBeLessThan(0.5);
  });
});

describe('damping', () => {
  it('lets undriven water fall still on roughly the time asked for', () => {
    const params = withParams({ decaySec: 2 });
    const field = pulsed(params);

    run(field, params, 40); // Let the spike spread into actual waves first.
    const start = rippleRms(field);

    run(field, params, Math.round(2 / RIPPLE_STEP_SEC));
    const afterOneLife = rippleRms(field);

    // Within a factor of two of 1/e. Loose on purpose: `decaySec` sets the drag
    // on the surface's velocity, and viscosity takes its own cut on top.
    expect(afterOneLife / start).toBeLessThan(0.6);
    expect(afterOneLife / start).toBeGreaterThan(0.05);
  });

  it('kills the shortest thing the grid can hold', () => {
    // Every other cell up, every other cell down. Nothing physical looks like
    // this; it is what an unviscous grid rings at, and it reads as a buzz.
    const params = withParams({ decaySec: 1e6 });
    const cols = 48;
    const rows = 48;
    const field = createRippleField(cols, rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) field.now[j * cols + i] = (i + j) % 2 === 0 ? 1 : -1;

    const before = rippleRms(field);
    run(field, params, 240); // One second.
    expect(rippleRms(field) / before).toBeLessThan(0.2);
  });
});

describe('the water line', () => {
  /**
   * The regression these exist for: the surface never settling.
   *
   * With a wall all the way round, the wave equation conserves the mean of the
   * field exactly — a level surface has no velocity for the drag to work on and
   * no curvature to spread. So the mean is the one thing the damping cannot
   * reach, and any source that adds volume moves the water line permanently. The
   * old kernel was positive everywhere, so every bubble did.
   */
  it('moves water about without inventing any', () => {
    // The kernel integrated over its own disc, which is what a source adds to
    // the jar. Weighted by radius, because it is spread over a disc.
    let volume = 0;
    const steps = 20000;
    for (let n = 0; n < steps; n++) {
      const t = (n + 0.5) / steps;
      volume += rippleKernel(t) * 2 * t * (1 / steps);
    }
    expect(Math.abs(volume)).toBeLessThan(1e-6);

    // And it is a lift with a ring around it, not a lift with a hole in it.
    expect(rippleKernel(0)).toBeGreaterThan(0);
    expect(rippleKernel(0.8)).toBeLessThan(0);
    // Smooth to zero at the rim, so a moving source leaves no step behind it.
    expect(Math.abs(rippleKernel(1))).toBe(0);
  });

  it('leaves the water line where it found it', () => {
    const coefficients = rippleCoefficients(DEFAULT_RIPPLE_SIM);
    const field = createRippleField();
    const mean = () => {
      let sum = 0;
      for (const h of field.now) sum += h;
      return sum / field.now.length;
    };

    for (let bubble = 0; bubble < 20; bubble++) {
      for (let n = 0; n < 5; n++) {
        stepRippleField(field, coefficients, [
          {
            x: (((bubble * 37) % 100) / 100 - 0.5) * 0.08,
            z: (((bubble * 53) % 100) / 100 - 0.5) * 0.06,
            radius: 0.001,
            strength: (n < 2 ? 1 : -1) * 0.09
          }
        ]);
      }
      for (let n = 0; n < 40; n++) stepRippleField(field, coefficients, []);
    }

    // Nanometres. Left as it was this was tens of micrometres and climbing with
    // every bubble, for as long as the tab stayed open.
    expect(Math.abs(mean())).toBeLessThan(1e-4);
  });

  it('needs more precision than a half float has', () => {
    // Not a preference. The scheme works by multiplying the state by numbers
    // very close to one, and if the format cannot tell those numbers from one,
    // the damping does not happen. Both of these are under a half's relative
    // spacing of 4.88e-4, which is why the targets are FloatType.
    const coefficients = rippleCoefficients(DEFAULT_RIPPLE_SIM);
    const halfUlp = 2 ** -11;
    expect(coefficients.drag).toBeLessThan(halfUlp * 2);
    expect(1 - coefficients.levelKeep).toBeLessThan(halfUlp * 2);

    // Float32 has room to spare for both, which is the claim being made.
    const floatUlp = 2 ** -24;
    expect(coefficients.drag).toBeGreaterThan(floatUlp * 1000);
    expect(1 - coefficients.levelKeep).toBeGreaterThan(floatUlp * 1000);
  });

  it('settles to flat, and stays flat, at the precision it is given', () => {
    const coefficients = rippleCoefficients(DEFAULT_RIPPLE_SIM);
    const slopeOf = (field: RippleField) => {
      let total = 0;
      for (let j = 1; j < field.rows - 1; j++)
        for (let i = 1; i < field.cols - 1; i++)
          total += (field.now[j * field.cols + i + 1] - field.now[j * field.cols + i - 1]) ** 2;
      return Math.sqrt(total / (field.cols * field.rows));
    };

    const settle = (round: (x: number) => number) => {
      const field = createRippleField(64, 64);
      for (let n = 0; n < 5; n++) {
        stepRippleField(field, coefficients, [
          { x: 0, z: 0, radius: 0.004, strength: n < 2 ? 0.2 : -0.2 }
        ]);
      }
      for (let n = 0; n < 20 / RIPPLE_STEP_SEC; n++) {
        stepRippleField(field, coefficients, []);
        for (let i = 0; i < field.now.length; i++) {
          field.now[i] = round(field.now[i]);
          field.prev[i] = round(field.prev[i]);
        }
      }
      return slopeOf(field);
    };

    // Twenty untouched seconds, against a settle time of four and a half.
    expect(settle(Math.fround)).toBeLessThan(1e-9);
    // And the same run at half, which is what a HalfFloatType target would do:
    // it stops damping and the surface keeps moving for ever. Pinned so that
    // going back to half fails here rather than being noticed a week later.
    expect(settle(Math.f16round)).toBeGreaterThan(1e-7);
  });

  it('bleeds off drift slower than ripples die, so it never shapes them', () => {
    expect(RIPPLE_LEVEL_TAU).toBeGreaterThan(DEFAULT_RIPPLE_SIM.decaySec * 1.5);
  });
});

describe('being pushed', () => {
  it('does nothing at all when nothing pushes it', () => {
    const field = createRippleField(32, 32);
    run(field, DEFAULT_RIPPLE_SIM, 500);
    expect(rippleRms(field)).toBe(0);
  });

  it('makes ripples where something touches the water', () => {
    const field = createRippleField(96, 96);
    const drop: RippleDrop = { x: 0, z: 0, radius: 0.006, strength: 0.02 };

    run(field, DEFAULT_RIPPLE_SIM, 20, [drop]);
    run(field, DEFAULT_RIPPLE_SIM, 120);

    expect(rippleRms(field)).toBeGreaterThan(1e-3);

    // The ripple left home rather than staying a bump under the source.
    const cols = 96;
    const mid = Math.floor(cols / 2);
    const away = Math.abs(field.now[mid * cols + mid + 20]);
    expect(away).toBeGreaterThan(1e-4);
  });

  it('rings and then settles after a bubble bursts', () => {
    const params = DEFAULT_RIPPLE_SIM;
    const coefficients = rippleCoefficients(params);
    const field = createRippleField();

    // The biggest bubble the jar makes, lifting the film and then letting the
    // cavity fall back in — raised the way the scene raises it. The big one,
    // because this is about how far a ring gets, and the small ones do not get
    // anywhere: a ring that tight is short wavelength and viscosity has it
    // before it has crossed a finger's width. That is the water being right,
    // not the test being lenient — see the ring test below for the sizes.
    for (let left = RIPPLE_BURST_STEPS; left > 0; left--) {
      stepRippleField(field, coefficients, [burstDrop(0.01, -0.008, BUBBLE_MAX_RADIUS, left)]);
    }

    // Whole-jar RMS is the wrong measure of a half-millimetre bubble; what it
    // leaves is a small ring, so the peak is what says it rang at all.
    const peak = () => Math.max(...Array.from(field.now, Math.abs));
    const rang = peak();
    expect(rang).toBeGreaterThan(0.02);
    expect(rang).toBeLessThan(1);

    // It travels: a ring 20 mm out that was flat when the bubble went.
    const cols = field.cols;
    const centre = { i: Math.round(cols / 2 + 0.01 / RIPPLE_CELL), j: Math.round(field.rows / 2 - 0.008 / RIPPLE_CELL) };
    const probe = centre.j * cols + centre.i + Math.round(0.02 / RIPPLE_CELL);
    let reached = 0;
    for (let n = 0; n < 120; n++) {
      stepRippleField(field, coefficients, []);
      reached = Math.max(reached, Math.abs(field.now[probe]));
    }
    expect(reached).toBeGreaterThan(rang * 0.02);

    // And ten seconds later the jar is glass again, because nothing is keeping
    // it going. That is the whole reason there is no ambient forcing.
    for (let n = 0; n < 10 / RIPPLE_STEP_SEC; n++) stepRippleField(field, coefficients, []);
    // Micrometres. Stated absolutely rather than as a fraction, because what
    // matters is that there is nothing left for the shader to find a normal in.
    expect(peak()).toBeLessThan(0.005);
  });

  /**
   * What a burst is worth has to come from the bubble, and it did not.
   *
   * The scene used to floor the burst radius at 1.5 mm before deriving the push
   * from it — above the whole range the jar makes, so every bubble in the tank
   * landed as the same maximum-strength source and left the same 1.25 mm ring.
   * That is both far too loud for a fizz and the death of the size spread the
   * bubbles go to the trouble of having. The floor belongs on the ring the grid
   * is asked to draw, not on what the bubble is worth.
   */
  it('leaves a ring that grows with the bubble, and a quiet one', () => {
    const coefficients = rippleCoefficients(DEFAULT_RIPPLE_SIM);

    const ring = (radius: number) => {
      const field = createRippleField();
      for (let left = RIPPLE_BURST_STEPS; left > 0; left--) {
        stepRippleField(field, coefficients, [burstDrop(0, 0, radius, left)]);
      }
      for (let n = 0; n < 0.1 / RIPPLE_STEP_SEC; n++) stepRippleField(field, coefficients, []);
      return Math.max(...Array.from(field.now, Math.abs));
    };

    const small = ring(BUBBLE_MIN_RADIUS);
    const big = ring(BUBBLE_MAX_RADIUS);

    // The spread is the point: the rare big one is worth several of the fizz.
    expect(big).toBeGreaterThan(small * 4);

    // And the loudest of them is still quieter than a stir, which peaks near
    // 0.8 mm. A bubble is something you notice; a stir is something you did.
    expect(big).toBeLessThan(0.5);
    expect(small).toBeGreaterThan(0.005);
  });

  /**
   * The two halves of a burst have to cancel.
   *
   * `rippleKernel` displaces no water, so a balanced burst leaves the jar's mean
   * height where it found it. An unbalanced one — an odd step count, or a split
   * that is not down the middle — leaves a kernel-shaped dent that the wave
   * equation cannot take back, once per bubble, for as long as the tab is open.
   */
  it('gives the water back what a burst borrowed', () => {
    expect(RIPPLE_BURST_STEPS % 2).toBe(0);

    const coefficients = rippleCoefficients(DEFAULT_RIPPLE_SIM);
    const field = createRippleField();
    let lifted = 0;
    for (let left = RIPPLE_BURST_STEPS; left > 0; left--) {
      const drop = burstDrop(0.004, -0.002, BUBBLE_MAX_RADIUS, left);
      lifted += drop.strength;
      stepRippleField(field, coefficients, [drop]);
    }
    expect(lifted).toBeCloseTo(0, 12);

    const mean = Array.from(field.now).reduce((a, b) => a + b, 0) / field.now.length;
    // Nanometres, and all of it the grid's rounding of a kernel that integrates
    // to zero. The push itself contributes nothing, which is the point.
    expect(Math.abs(mean)).toBeLessThan(1e-5);
  });
});
