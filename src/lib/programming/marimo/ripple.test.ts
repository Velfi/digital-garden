import { describe, expect, it } from 'vitest';
import { TANK_HALF_X, TANK_HALF_Z } from './constants';
import { DEFAULT_RIPPLE, rippleAt, wavesAcross, type RippleParams } from './ripple';

/**
 * The look of the ripples is judged at `/marimo/ripples`, not here. These cover
 * the parts that stay true whatever they end up looking like: that the slope the
 * shader uses for its normal really is the derivative of the height it draws,
 * that the surface averages flat rather than lifting the whole waterline, and
 * that the waves are small enough to fit in the jar.
 */

function withParams(overrides: Partial<RippleParams>): RippleParams {
  return { ...DEFAULT_RIPPLE, ...overrides };
}

describe('rippleAt slope', () => {
  it('matches a finite difference of the height', () => {
    // The domain drag deliberately omits a chain-rule term from the gradient,
    // so this has to be checked with the drag off. That is the only place the
    // analytic slope is not exact, and it is why `chop` is its own knob.
    const params = withParams({ chop: 0 });
    const eps = 1e-5;

    for (const [x, z, t] of [
      [0, 0, 0],
      [0.021, -0.014, 0.7],
      [-0.038, 0.032, 3.3],
      [0.05, 0.044, 11.9]
    ]) {
      const dx =
        (rippleAt(params, x + eps, z, t, 1).height - rippleAt(params, x - eps, z, t, 1).height) /
        (2 * eps);
      const dz =
        (rippleAt(params, x, z + eps, t, 1).height - rippleAt(params, x, z - eps, t, 1).height) /
        (2 * eps);

      const sample = rippleAt(params, x, z, t, 1);
      expect(Math.abs(sample.slopeX - dx)).toBeLessThan(1e-5);
      expect(Math.abs(sample.slopeZ - dz)).toBeLessThan(1e-5);
    }
  });
});

describe('rippleAt height', () => {
  it('averages flat, so the waterline does not drift', () => {
    // A sum of crest-sharpened waves has a positive mean unless it is subtracted
    // back out; if that were missed the whole surface would sit a fraction of a
    // millimetre high, which is invisible on its own but pushes the meniscus and
    // the reflection plane out of agreement with the physics.
    const params = withParams({ chop: 0 });
    const span = 0.4;
    const steps = 160;
    let total = 0;
    let count = 0;

    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const x = (i / steps - 0.5) * span;
        const z = (j / steps - 0.5) * span;
        total += rippleAt(params, x, z, 2.5, 1).height;
        count++;
      }
    }

    const mean = total / count;
    expect(Math.abs(mean)).toBeLessThan(0.02 * (params.amplitudeMm / 1000));
  });

  it('repeats over one wavelength along its own direction', () => {
    // The returning legs come back turned, so a step along the outgoing
    // direction is a whole wave for that leg and not for the others, and the sum
    // has no reason to repeat. Squaring the return onto the exact reverse gives
    // every leg the same wave vector up to sign, which is the case where the
    // wavelength parameter has to mean exactly what it says.
    for (const reflection of [0, 1]) {
      const params = withParams({
        octaves: 1,
        chop: 0,
        steepness: 0.4,
        reflection,
        reflectionTurnDeg: 0
      });
      const angle = (params.baseAngleDeg * Math.PI) / 180;
      const lambda = params.wavelengthMm / 1000;

      const here = rippleAt(params, 0.01, -0.02, 1.4, 1).height;
      const oneWaveOn = rippleAt(
        params,
        0.01 + Math.cos(angle) * lambda,
        -0.02 + Math.sin(angle) * lambda,
        1.4,
        1
      ).height;

      expect(oneWaveOn).toBeCloseTo(here, 9);
    }
  });

  it('stays near the requested peak-to-trough', () => {
    const params = DEFAULT_RIPPLE;
    let low = Infinity;
    let high = -Infinity;

    for (let i = 0; i < 400; i++) {
      for (let j = 0; j < 40; j++) {
        const h = rippleAt(params, i * 0.0007 - 0.14, j * 0.0031 - 0.06, j * 0.37, 1).height;
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
    }

    // Approximate by construction: the normalisation divides by the sum of the
    // octave weights, which only bounds the total loosely.
    const nominal = params.amplitudeMm / 1000;
    expect(high - low).toBeGreaterThan(nominal * 0.6);
    expect(high - low).toBeLessThan(nominal * 1.15);
  });
});

describe('agitation', () => {
  it('scales the whole field between idle and full', () => {
    const params = DEFAULT_RIPPLE;
    const still = rippleAt(params, 0.013, 0.007, 4.2, 0);
    const moving = rippleAt(params, 0.013, 0.007, 4.2, 1);

    expect(still.height / moving.height).toBeCloseTo(params.idleFraction, 6);
    expect(still.slopeX / moving.slopeX).toBeCloseTo(params.idleFraction, 6);
  });

  it('clamps out of range', () => {
    const params = DEFAULT_RIPPLE;
    expect(rippleAt(params, 0.01, 0.01, 1, -3)).toEqual(rippleAt(params, 0.01, 0.01, 1, 0));
    expect(rippleAt(params, 0.01, 0.01, 1, 8)).toEqual(rippleAt(params, 0.01, 0.01, 1, 1));
  });
});

describe('standing rather than travelling', () => {
  /**
   * The regression this one exists for is the surface sliding steadily off
   * across the jar for ever, like a scrolling texture rather than water.
   *
   * A pattern that only translates satisfies the optical flow constraint
   * `dh/dt + v . grad h = 0` exactly for one velocity `v`, so fitting a single
   * `v` by least squares accounts for all of the field's motion. Anything that
   * genuinely rises and falls in place leaves a residual no velocity removes.
   * A single octave is what this has to be measured on: the whole stack cannot
   * translate rigidly anyway, because each octave points somewhere different,
   * yet the loudest one marching is exactly what the eye picks up.
   */
  function conveyorShare(params: RippleParams): number {
    const span = 0.11;
    const steps = 40;
    const dx = 1e-5;
    const dt = 2e-3;
    const t = 3;

    let xx = 0;
    let xz = 0;
    let zz = 0;
    let xt = 0;
    let zt = 0;
    let tt = 0;

    const h = (x: number, z: number, at: number) => rippleAt(params, x, z, at, 1).height;

    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const x = (i / (steps - 1) - 0.5) * span;
        const z = (j / (steps - 1) - 0.5) * span;
        // Finite differences throughout: `chop` leaves a chain-rule term out of
        // the analytic slope, and this needs the true gradient.
        const gx = (h(x + dx, z, t) - h(x - dx, z, t)) / (2 * dx);
        const gz = (h(x, z + dx, t) - h(x, z - dx, t)) / (2 * dx);
        const gt = (h(x, z, t + dt) - h(x, z, t - dt)) / (2 * dt);

        xx += gx * gx;
        xz += gx * gz;
        zz += gz * gz;
        xt += gx * gt;
        zt += gz * gt;
        tt += gt * gt;
      }
    }

    const det = xx * zz - xz * xz;
    const vx = -(zz * xt - xz * zt) / det;
    const vz = -(xx * zt - xz * xt) / det;
    const residual = tt + 2 * (vx * xt + vz * zt) + (vx * vx * xx + 2 * vx * vz * xz + vz * vz * zz);
    return 1 - residual / tt;
  }

  it('is a pure conveyor with nothing coming back off the glass', () => {
    // The state the bug was in, kept as the control: turn the reflection off and
    // an octave is a plane wave train, which is nothing but translation.
    const share = conveyorShare(withParams({ octaves: 1, chop: 0, reflection: 0 }));
    expect(share).toBeGreaterThan(0.99);
  });

  it('is mostly not a conveyor at the shipped settings', () => {
    const share = conveyorShare(withParams({ octaves: 1, chop: 0 }));
    expect(share).toBeLessThan(0.3);
  });

  it('does not blink the whole surface flat', () => {
    // A wave returning exactly along its own line makes a textbook standing
    // wave, and a standing wave is flat twice a period. The return comes back
    // turned so the legs cannot all cancel at once; this holds the surface to a
    // roughly steady amount of relief.
    const span = 0.11;
    const steps = 32;
    let lowest = Infinity;
    let highest = 0;

    for (let n = 0; n < 48; n++) {
      const t = 3 + (n / 48) * 1.2;
      let square = 0;
      for (let i = 0; i < steps; i++) {
        for (let j = 0; j < steps; j++) {
          const x = (i / (steps - 1) - 0.5) * span;
          const z = (j / (steps - 1) - 0.5) * span;
          square += rippleAt(DEFAULT_RIPPLE, x, z, t, 1).height ** 2;
        }
      }
      const rms = Math.sqrt(square / (steps * steps));
      lowest = Math.min(lowest, rms);
      highest = Math.max(highest, rms);
    }

    expect(highest / lowest).toBeLessThan(1.5);
  });
});

describe('the spectrum', () => {
  /**
   * The other half of the "it looks like a repeating pattern" regression. The
   * waves can stand perfectly still and it will still read as corrugated iron if
   * the octaves are far enough apart to be told from one another, because then
   * the eye is looking at a handful of gratings rather than at a surface. Both
   * of these are look thresholds rather than physics, but they are the two
   * numbers that decide it, and the tank camera's grazing angle is unforgiving
   * about both.
   */
  it('spreads the amplitude rather than letting one octave carry it', () => {
    const params = DEFAULT_RIPPLE;
    let total = 0;
    let amp = 1;
    for (let i = 0; i < params.octaves; i++) {
      total += amp;
      amp *= params.ampStep;
    }

    expect(1 / total).toBeLessThan(0.4);
  });

  it('packs the octaves close enough to run into each other', () => {
    expect(DEFAULT_RIPPLE.freqStep).toBeLessThan(1.6);

    // And still reaches the short ripples: the fine detail is what stops the
    // longest wave being the only thing on the water.
    const shortestMm = DEFAULT_RIPPLE.wavelengthMm / DEFAULT_RIPPLE.freqStep ** (DEFAULT_RIPPLE.octaves - 1);
    expect(shortestMm).toBeLessThan(8);
  });
});

describe('fitting the jar', () => {
  /**
   * The regression this file exists for. An earlier surface used wave vectors of
   * about 44 rad/m — a 14 cm wavelength — in a jar 11 cm across, so less than one
   * full wave crossed the water and it read as a sheet slowly tilting rather than
   * as ripples. Anything under about three waves on the short axis looks wrong.
   */
  it('puts several waves across the water on both axes', () => {
    expect(wavesAcross(DEFAULT_RIPPLE, TANK_HALF_X * 2)).toBeGreaterThanOrEqual(3);
    expect(wavesAcross(DEFAULT_RIPPLE, TANK_HALF_Z * 2)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the surface shallow enough not to break the waterline', () => {
    // Amplitude is a fraction of a millimetre against 105 mm of water. If this
    // ever grew to a few millimetres the surface would poke through the glass rim
    // and the reflection plane would visibly separate from the mesh.
    expect(DEFAULT_RIPPLE.amplitudeMm).toBeLessThan(3);
  });
});
