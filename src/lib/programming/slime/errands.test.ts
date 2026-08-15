import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createErrandArbiter,
  patienceSec,
  RESUME_GLANCE_SEC,
  type ErrandInputs,
  type ErrandKind,
  type ErrandOutputs
} from './errands';

/**
 * The arbiter alone — the appointment book without a body. The harness
 * plays the scene's part: it answers quarry picks and reports arrivals.
 */

const DT = 1 / 30;

function inputs(overrides: Partial<ErrandInputs> = {}): ErrandInputs {
  return {
    dt: DT,
    mood: { valence: 0.7, arousal: 0.5 },
    willFree: true,
    foodClaimed: false,
    eating: false,
    ballOut: false,
    ballJustTossed: false,
    rockCount: 3,
    moisture: 0.8,
    canFeed: false,
    reducedMotion: false,
    quarryPick: -1,
    quarryLost: false,
    perchArrived: false,
    chaseBoostSec: 0,
    ...overrides
  };
}

/** Step for `seconds`, answering every quarry pick with `pick`. */
function runFor(
  arbiter: ReturnType<typeof createErrandArbiter>,
  seconds: number,
  base: Partial<ErrandInputs> = {},
  pick = 4,
  each?: (out: ErrandOutputs, t: number) => void
): ErrandOutputs {
  let quarryPick = -1;
  let out: ErrandOutputs = arbiter.update(inputs(base));
  for (let t = 0; t < seconds; t += DT) {
    out = arbiter.update(inputs({ ...base, quarryPick }));
    quarryPick = out.wantQuarryPick ? pick : -1;
    each?.(out, t);
  }
  return out;
}

describe('the errand arbiter', () => {
  it('is deterministic for a seed', () => {
    const a = createErrandArbiter(1234);
    const b = createErrandArbiter(1234);
    let pickA = -1;
    let pickB = -1;
    for (let t = 0; t < 240; t += DT) {
      const oa = a.update(inputs({ quarryPick: pickA }));
      const ob = b.update(inputs({ quarryPick: pickB }));
      expect(oa.errand?.kind).toBe(ob.errand?.kind);
      expect(oa.errand?.ambleTarget?.[0]).toBe(ob.errand?.ambleTarget?.[0]);
      expect(oa.errand?.rockIndex).toBe(ob.errand?.rockIndex);
      expect(oa.hop?.dx).toBe(ob.hop?.dx);
      pickA = oa.wantQuarryPick ? 4 : -1;
      pickB = ob.wantQuarryPick ? 4 : -1;
    }
  });

  it('a glum slime never stirs', () => {
    const seen = new Set<ErrandKind>();
    runFor(createErrandArbiter(7), 600, { mood: { valence: 0.1, arousal: 0.5 } }, 4, (out) => {
      if (out.errand) seen.add(out.errand.kind);
      expect(out.hop).toBeNull();
    });
    expect(seen.size).toBe(0);
  });

  it('too dry to grip, it never perches', () => {
    runFor(createErrandArbiter(9), 600, { moisture: 0.2 }, 4, (out) => {
      expect(out.errand?.kind).not.toBe('perch');
    });
  });

  it('a hungry slime never plays chase', () => {
    runFor(createErrandArbiter(11), 600, { canFeed: true }, 4, (out) => {
      expect(out.errand?.kind).not.toBe('chase');
    });
  });

  it('with the ball out it plays instead of chasing', () => {
    const seen = new Set<ErrandKind>();
    runFor(createErrandArbiter(13), 600, { ballOut: true }, 4, (out) => {
      if (out.errand) seen.add(out.errand.kind);
    });
    expect(seen.has('play')).toBe(true);
    expect(seen.has('chase')).toBe(false);
  });

  it('a claimed meal silences every errand at once', () => {
    const arbiter = createErrandArbiter(17);
    runFor(arbiter, 120); // long enough for something to be afoot
    const out = arbiter.update(inputs({ foodClaimed: true }));
    expect(out.errand).toBeNull();
    expect(out.hop).toBeNull();
  });

  it('resumes the same amble after a short interruption, glance first', () => {
    const arbiter = createErrandArbiter(21);
    // Walk until an amble starts (keep perch/chase/play out of the way).
    const quiet = { rockCount: 0, canFeed: true, mood: { valence: 0.7, arousal: 0.5 } };
    let target: readonly [number, number] | null = null;
    for (let t = 0; t < 600 && !target; t += DT) {
      const out = arbiter.update(inputs(quiet));
      if (out.errand?.kind === 'amble') target = out.errand.ambleTarget;
    }
    expect(target).not.toBeNull();
    // The hand takes it for 5 seconds.
    for (let t = 0; t < 5; t += DT) {
      expect(arbiter.update(inputs({ ...quiet, willFree: false })).errand).toBeNull();
    }
    // Freed: first the glance at the very same spot...
    let out = arbiter.update(inputs(quiet));
    expect(out.errand).toBeNull();
    expect(out.resumeGlance?.kind).toBe('amble');
    expect(out.resumeGlance?.ambleTarget).toEqual(target);
    // ...for about the glance length, then the errand itself, same target.
    let glanceFrames = 0;
    while (out.resumeGlance) {
      glanceFrames += 1;
      out = arbiter.update(inputs(quiet));
    }
    expect(glanceFrames * DT).toBeGreaterThan(RESUME_GLANCE_SEC - 3 * DT);
    expect(glanceFrames * DT).toBeLessThan(RESUME_GLANCE_SEC + 3 * DT);
    expect(out.errand?.kind).toBe('amble');
    expect(out.errand?.ambleTarget).toEqual(target);
  });

  it('the suspended bout clock is frozen, not spent', () => {
    const arbiter = createErrandArbiter(21); // same walk as above
    const quiet = { rockCount: 0, canFeed: true, mood: { valence: 0.7, arousal: 0.5 } };
    let started = false;
    for (let t = 0; t < 600 && !started; t += DT) {
      started = arbiter.update(inputs(quiet)).errand?.kind === 'amble';
    }
    // Suspend immediately, wait 5 s, resume: nearly the whole bout should
    // still run (ambles are 4–9 s; only a frame or two was spent).
    for (let t = 0; t < 5; t += DT) arbiter.update(inputs({ ...quiet, willFree: false }));
    let liveSec = 0;
    for (let t = 0; t < 30; t += DT) {
      if (arbiter.update(inputs(quiet)).errand?.kind === 'amble') liveSec += DT;
    }
    expect(liveSec).toBeGreaterThan(3.5);
  });

  it('past its patience the wish expires, with no immediate restart', () => {
    const arbiter = createErrandArbiter(21);
    const quiet = { rockCount: 0, canFeed: true, mood: { valence: 0.7, arousal: 0.5 } };
    let started = false;
    for (let t = 0; t < 600 && !started; t += DT) {
      started = arbiter.update(inputs(quiet)).errand?.kind === 'amble';
    }
    const wait = patienceSec(0.7) + 1;
    for (let t = 0; t < wait; t += DT) arbiter.update(inputs({ ...quiet, willFree: false }));
    const out = arbiter.update(inputs(quiet));
    expect(out.resumeGlance).toBeNull();
    expect(out.errand).toBeNull();
    expect(arbiter.peek().suspended).toBeNull();
  });

  it('patience scales with valence', () => {
    expect(patienceSec(0.9)).toBeGreaterThan(patienceSec(0.2));
    const holds = (valence: number, waitSec: number): boolean => {
      const arbiter = createErrandArbiter(21);
      const quiet = { rockCount: 0, canFeed: true, mood: { valence: 0.7, arousal: 0.5 } };
      let started = false;
      for (let t = 0; t < 600 && !started; t += DT) {
        started = arbiter.update(inputs(quiet)).errand?.kind === 'amble';
      }
      const held = { ...quiet, willFree: false, mood: { valence, arousal: 0.5 } };
      for (let t = 0; t < waitSec; t += DT) arbiter.update(inputs(held));
      return arbiter.peek().suspended !== null;
    };
    // 20 s outlasts a glum slime's patience but not a content one's.
    expect(holds(0.9, 20)).toBe(true);
    expect(holds(0.1, 20)).toBe(false);
  });

  it('a resumed chase asks for a fresh quarry, and lapses on none', () => {
    const arbiter = createErrandArbiter(31);
    // Walk to a chase (no ball, full belly, rocks removed to avoid perch).
    const quiet = { rockCount: 0 };
    let chasing = false;
    let pick = -1;
    for (let t = 0; t < 900 && !chasing; t += DT) {
      const out = arbiter.update(inputs({ ...quiet, quarryPick: pick }));
      pick = out.wantQuarryPick ? 4 : -1;
      chasing = out.errand?.kind === 'chase';
    }
    expect(chasing).toBe(true);
    for (let t = 0; t < 3; t += DT) arbiter.update(inputs({ ...quiet, willFree: false }));
    // Freed: glance, then the resume must ask before giving chase.
    let asked = false;
    let out: ErrandOutputs;
    for (let t = 0; t < 2; t += DT) {
      out = arbiter.update(inputs({ ...quiet, quarryPick: -1 }));
      if (out.wantQuarryPick) asked = true;
    }
    expect(asked).toBe(true);
    // Everyone was eaten: the bout lapses rather than chasing a ghost.
    expect(arbiter.peek().current?.kind).not.toBe('chase');
  });

  it('never hops under reduced motion', () => {
    // Even at popcorn-grade excitement.
    runFor(
      createErrandArbiter(37),
      600,
      { reducedMotion: true, mood: { valence: 0.9, arousal: 0.9 } },
      4,
      (out) => expect(out.hop).toBeNull()
    );
  });

  it('hops come in bursts when thrilled', () => {
    let hops = 0;
    runFor(createErrandArbiter(37), 600, { mood: { valence: 0.9, arousal: 0.9 } }, 4, (out) => {
      if (out.hop) hops += 1;
    });
    expect(hops).toBeGreaterThan(4);
  });

  it('the story does not depend on how time is sliced', () => {
    // The same 90 seconds, chopped into arbitrary frame lengths, must tell
    // the same story: same errand kinds in the same order, same targets,
    // start times within a coarse frame of each other.
    type Event = { at: number; kind: ErrandKind | null; x: number };
    const story = (dts: number[]): Event[] => {
      const arbiter = createErrandArbiter(55);
      const events: Event[] = [];
      let t = 0;
      let last: ErrandKind | null = null;
      let pick = -1;
      for (const dt of dts) {
        t += dt;
        const out = arbiter.update(inputs({ dt, quarryPick: pick }));
        pick = out.wantQuarryPick ? 4 : -1;
        const kind = out.errand?.kind ?? null;
        if (kind !== last) {
          events.push({ at: t, kind, x: out.errand?.ambleTarget?.[0] ?? 0 });
          last = kind;
        }
      }
      return events;
    };
    const fine: number[] = [];
    for (let t = 0; t < 90; t += 1 / 120) fine.push(1 / 120);
    const reference = story(fine);
    expect(reference.length).toBeGreaterThan(1);
    fc.assert(
      // Frame lengths from a 120 Hz monitor down to a struggling 24 fps —
      // much coarser and two independent clocks due within one frame can
      // legitimately merge, which is quantization, not a bug.
      fc.property(fc.infiniteStream(fc.double({ min: 1 / 120, max: 1 / 24, noNaN: true })), (steps) => {
        const dts: number[] = [];
        let total = 0;
        for (const dt of steps) {
          dts.push(dt);
          total += dt;
          if (total >= 90) break;
        }
        // Ignore the ragged edge: a transition due right at the window's
        // end can land on either side of it depending on the slicing.
        const trim = (evts: Event[]) => evts.filter((e) => e.at < 85);
        const events = trim(story(dts));
        const wanted = trim(reference);
        expect(events.length).toBe(wanted.length);
        for (let i = 0; i < events.length; i++) {
          expect(events[i].kind).toBe(wanted[i].kind);
          expect(events[i].x).toBeCloseTo(wanted[i].x, 10);
          // Transitions land on step boundaries; drift compounds a little
          // across bouts, so the tolerance is a few coarse frames.
          expect(Math.abs(events[i].at - wanted[i].at)).toBeLessThan(0.5);
        }
      }),
      { numRuns: 25 }
    );
  });
});
