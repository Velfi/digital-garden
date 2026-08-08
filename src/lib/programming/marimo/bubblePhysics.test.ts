import { describe, expect, it } from 'vitest';
import {
  BUBBLE_MAX_RADIUS,
  BUBBLE_MIN_RADIUS,
  BUBBLE_POP_MIN_RADIUS,
  BUBBLE_SHEAR_THRESHOLD,
  FRAGMENT_COUNT,
  aspectRatio,
  attachedRadius,
  canFragment,
  clingDuration,
  eotvos,
  fragmentDecay,
  fragmentRadius,
  fragmentSpeed,
  releaseChance,
  sampleRadius,
  terminalRiseSpeed,
  wobbleOmega,
  wobbleRadius
} from './bubblePhysics';

describe('terminalRiseSpeed', () => {
  it('follows Stokes at the small end', () => {
    // Doubling the radius of a 50 micron bubble should very nearly quadruple
    // its speed: that regime is r-squared.
    const a = terminalRiseSpeed(0.00005);
    const b = terminalRiseSpeed(0.0001);
    expect(b / a).toBeGreaterThan(3.5);
    expect(b / a).toBeLessThan(4);
  });

  it('plateaus at the large end', () => {
    // Past a millimetre, size stops mattering. A 3 mm bubble is not three
    // times faster than a 1 mm one.
    const mm = terminalRiseSpeed(0.001);
    const fat = terminalRiseSpeed(0.003);
    expect(fat / mm).toBeLessThan(1.15);
    expect(fat).toBeLessThan(0.24);
  });

  it('lands near measured speeds across the range', () => {
    // Anchors from the standard clean-water rise-velocity curve, with generous
    // bounds because the published spread on this is itself wide.
    expect(terminalRiseSpeed(0.00005)).toBeGreaterThan(0.003);
    expect(terminalRiseSpeed(0.00005)).toBeLessThan(0.008);
    expect(terminalRiseSpeed(0.00025)).toBeGreaterThan(0.05);
    expect(terminalRiseSpeed(0.00025)).toBeLessThan(0.12);
    expect(terminalRiseSpeed(0.001)).toBeGreaterThan(0.18);
  });

  it('is monotone and finite at zero', () => {
    expect(terminalRiseSpeed(0)).toBe(0);
    let previous = -1;
    for (const r of [0, 1e-5, 1e-4, 5e-4, 1e-3, 5e-3]) {
      const v = terminalRiseSpeed(r);
      expect(v).toBeGreaterThan(previous);
      previous = v;
    }
  });
});

describe('aspectRatio', () => {
  it('keeps sub-millimetre bubbles spherical', () => {
    expect(aspectRatio(BUBBLE_MIN_RADIUS)).toBeGreaterThan(0.97);
  });

  it('flattens the big ones visibly', () => {
    const big = aspectRatio(BUBBLE_MAX_RADIUS);
    expect(big).toBeLessThan(0.9);
    expect(big).toBeGreaterThan(0.7);
  });

  it('never exceeds a sphere and never inverts', () => {
    for (const r of [0, 1e-5, 1e-3, 5e-3, 0.02]) {
      expect(aspectRatio(r)).toBeLessThanOrEqual(1);
      expect(aspectRatio(r)).toBeGreaterThan(0);
    }
  });

  it('is driven by Eotvos crossing one', () => {
    // The sphere-to-lens transition is where buoyancy overtakes surface
    // tension, which for air in water is a couple of millimetres across.
    expect(eotvos(0.0005)).toBeLessThan(1);
    expect(eotvos(0.002)).toBeGreaterThan(1);
  });
});

describe('wobble', () => {
  it('leaves small bubbles going straight up', () => {
    expect(wobbleRadius(0.0003)).toBe(0);
    expect(wobbleRadius(0.0007)).toBe(0);
  });

  it('starts spiralling past the instability onset', () => {
    expect(wobbleRadius(0.0012)).toBeGreaterThan(0);
    expect(wobbleRadius(0.0012)).toBeLessThan(0.0012);
  });

  it('saturates rather than running away', () => {
    expect(wobbleRadius(0.01)).toBeLessThan(0.01);
  });

  it('loops more slowly the bigger the bubble, at a few hertz', () => {
    expect(wobbleOmega(0.0008)).toBeGreaterThan(wobbleOmega(0.0015));
    // Measured path-wobble frequencies for millimetre bubbles are 4-8 Hz.
    for (const r of [0.0008, 0.001, 0.0015]) {
      const hz = wobbleOmega(r) / (2 * Math.PI);
      expect(hz).toBeGreaterThan(3);
      expect(hz).toBeLessThan(9);
    }
  });
});

describe('clingDuration', () => {
  it('holds every bubble long enough to be seen waiting', () => {
    for (const u of [0, 0.5, 1]) {
      expect(clingDuration(BUBBLE_MIN_RADIUS, u)).toBeGreaterThan(1);
    }
  });

  it('makes big bubbles wait much longer than small ones', () => {
    const small = clingDuration(BUBBLE_MIN_RADIUS, 0.5);
    const big = clingDuration(BUBBLE_MAX_RADIUS, 0.5);
    expect(big / small).toBeGreaterThan(5);
  });

  it('stays inside a watchable range', () => {
    expect(clingDuration(BUBBLE_MAX_RADIUS, 1)).toBeLessThan(30);
  });

  it('varies between sites of the same size', () => {
    const slow = clingDuration(0.0005, 1);
    const quick = clingDuration(0.0005, 0);
    expect(slow).toBeGreaterThan(quick * 1.5);
  });

  it('does not run away below the smallest bubble', () => {
    expect(clingDuration(0, 0.5)).toBe(clingDuration(BUBBLE_MIN_RADIUS, 0.5));
  });
});

describe('attachedRadius', () => {
  it('is visible immediately and finishes at full size', () => {
    const target = 0.001;
    expect(attachedRadius(target, 0, 10)).toBeGreaterThan(target * 0.25);
    expect(attachedRadius(target, 10, 10)).toBeCloseTo(target, 10);
  });

  it('grows fast then slows: volume is what is linear', () => {
    const target = 0.001;
    const firstHalf = attachedRadius(target, 5, 10) - attachedRadius(target, 0, 10);
    const secondHalf = attachedRadius(target, 10, 10) - attachedRadius(target, 5, 10);
    expect(firstHalf).toBeGreaterThan(secondHalf * 2);
    // Half the wait is half the gas, which is a cube root of the way in radius.
    expect(attachedRadius(target, 5, 10)).toBeCloseTo(target * Math.cbrt(0.5), 6);
  });

  it('never overshoots or reverses', () => {
    const target = 0.0008;
    let previous = 0;
    for (let t = 0; t <= 12; t++) {
      const r = attachedRadius(target, t, 10);
      expect(r).toBeLessThanOrEqual(target + 1e-12);
      expect(r).toBeGreaterThanOrEqual(previous);
      previous = r;
    }
  });

  it('treats a zero-length wait as already full', () => {
    expect(attachedRadius(0.001, 0, 0)).toBe(0.001);
  });
});

describe('releaseChance', () => {
  const mid = 0.0006;

  it('holds on while the marimo is drifting quietly', () => {
    expect(releaseChance(mid, 0, 0.016)).toBe(0);
    expect(releaseChance(mid, BUBBLE_SHEAR_THRESHOLD, 0.016)).toBe(0);
    // A ball rising or sinking under its own buoyancy carries its bubbles.
    expect(releaseChance(mid, 0.1, 0.016)).toBe(0);
  });

  it('strips the coat within a second of a real drag', () => {
    let held = 1;
    for (let i = 0; i < 60; i++) held *= 1 - releaseChance(mid, 0.3, 1 / 60);
    expect(held).toBeLessThan(0.1);
  });

  it('sheds the big ones first: cap area beats contact line', () => {
    const big = releaseChance(BUBBLE_MAX_RADIUS, 0.25, 0.016);
    const small = releaseChance(BUBBLE_MIN_RADIUS, 0.25, 0.016);
    expect(big).toBeGreaterThan(small * 2);
  });

  it('is a probability, whatever it is handed', () => {
    for (const [slip, dt] of [
      [0.5, 1],
      [10, 0.5],
      [0.02, 0],
      [-1, 0.016]
    ]) {
      const p = releaseChance(mid, slip, dt);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('compounds the same way whether the frame is split or not', () => {
    const whole = releaseChance(mid, 0.25, 0.2);
    const halves = 1 - (1 - releaseChance(mid, 0.25, 0.1)) ** 2;
    expect(halves).toBeCloseTo(whole, 12);
  });
});

describe('sampleRadius', () => {
  it('spans exactly the declared range', () => {
    expect(sampleRadius(0)).toBeCloseTo(BUBBLE_MIN_RADIUS, 10);
    expect(sampleRadius(1)).toBeCloseTo(BUBBLE_MAX_RADIUS, 10);
  });

  it('clamps out-of-range samples', () => {
    expect(sampleRadius(-3)).toBe(sampleRadius(0));
    expect(sampleRadius(7)).toBe(sampleRadius(1));
  });

  it('skews small: most bubbles are pinheads', () => {
    const mid = (BUBBLE_MIN_RADIUS + BUBBLE_MAX_RADIUS) / 2;
    let below = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) if (sampleRadius(i / n) < mid) below++;
    expect(below / n).toBeGreaterThan(0.75);
  });
});

describe('fragmentRadius', () => {
  it('conserves the gas: volume divides, radius takes the cube root', () => {
    const parent = 0.0012;
    const child = fragmentRadius(parent, FRAGMENT_COUNT);
    const volume = (r: number) => r * r * r;
    expect(FRAGMENT_COUNT * volume(child)).toBeCloseTo(volume(parent), 12);
    // Which is 63% across, emphatically not a quarter.
    expect(child / parent).toBeCloseTo(0.63, 2);
  });

  it('costs surface area, which is why it never happens unaided', () => {
    const parent = 0.0012;
    const child = fragmentRadius(parent, FRAGMENT_COUNT);
    const area = (r: number) => r * r;
    expect(FRAGMENT_COUNT * area(child)).toBeGreaterThan(area(parent) * 1.5);
  });
});

describe('canFragment', () => {
  it('ignores the small stuff, which is most of the jar', () => {
    expect(canFragment(BUBBLE_MIN_RADIUS)).toBe(false);
    expect(canFragment(BUBBLE_MAX_RADIUS)).toBe(true);

    let breakable = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (canFragment(sampleRadius(i / n))) breakable++;
    // A find rather than a given, but not so rare you never see one.
    expect(breakable / n).toBeGreaterThan(0.1);
    expect(breakable / n).toBeLessThan(0.3);
  });

  it('bottoms out after a couple of breaks, so a jar cannot be shattered', () => {
    // The deepest chain there is: start from the largest bubble the marimo
    // makes and keep breaking whatever comes out.
    let r = BUBBLE_MAX_RADIUS;
    let depth = 0;
    let total = 0;
    while (canFragment(r) && depth < 20) {
      depth++;
      total = total * FRAGMENT_COUNT + FRAGMENT_COUNT;
      r = fragmentRadius(r, FRAGMENT_COUNT);
    }
    expect(depth).toBeGreaterThan(0);
    expect(depth).toBeLessThanOrEqual(2);
    // Comfortably inside the pool, so nothing else in the jar has to be
    // evicted to pay for one bubble being taken apart as far as it will go.
    expect(total).toBeLessThan(64);
  });
});

describe('fragment spread', () => {
  it('spreads by about the radius of the bubble it came from', () => {
    // Speed times decay time is √(σ/ρR)·√(ρR³/σ) = R exactly, so the cloud is
    // the size of its parent with nothing left over to tune.
    for (const r of [0.0008, 0.0011, BUBBLE_MAX_RADIUS]) {
      const travel = fragmentSpeed(r) / fragmentDecay(r);
      expect(travel / r).toBeCloseTo(1.6, 6);
    }
  });

  it('scatters a big bubble wider and settles it slower', () => {
    expect(fragmentSpeed(0.0013)).toBeLessThan(fragmentSpeed(0.0008));
    expect(fragmentDecay(0.0013)).toBeLessThan(fragmentDecay(0.0008));
    // The break plays out over a good fraction of a second — visible, rather
    // than four bubbles simply being there on the next frame.
    expect(1 / fragmentDecay(BUBBLE_POP_MIN_RADIUS)).toBeGreaterThan(0.05);
    expect(1 / fragmentDecay(BUBBLE_MAX_RADIUS)).toBeLessThan(0.4);
  });
});
