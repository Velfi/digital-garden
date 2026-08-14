import { describe, expect, it } from 'vitest';
import {
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  CLIMB_MAX_HEIGHT_FRAC,
  CLIMB_MIN_MOISTURE,
  FLOOR_Y
} from './constants';
import { createClimbPlanner, type ClimbInputs } from './climb';

/**
 * The planner alone — the will without a body. The harness plays the part of
 * the physics by parking the body's centre wherever the anchor leads it,
 * which is what a healthy trip looks like from the planner's seat.
 */

const DT = 1 / 30;

function inputs(overrides: Partial<ClimbInputs> = {}): ClimbInputs {
  return {
    center: [0, FLOOR_Y + 0.01, 0],
    handBusy: false,
    zest: 1,
    moisture: 0.8,
    speed: 1,
    food: null,
    ...overrides
  };
}

/** Run until a predicate on the drive holds, following the anchor. */
function runUntil(
  planner: ReturnType<typeof createClimbPlanner>,
  seconds: number,
  base: Partial<ClimbInputs>,
  done?: (drive: ReturnType<(typeof planner)['step']>) => boolean
) {
  let center: [number, number, number] = [0, FLOOR_Y + 0.01, 0];
  let last = planner.step(DT, inputs({ ...base, center }));
  for (let t = 0; t < seconds; t += DT) {
    last = planner.step(DT, inputs({ ...base, center }));
    if (last.active) center = [last.anchor[0], last.anchor[1], last.anchor[2]];
    if (done?.(last)) return last;
  }
  return last;
}

describe('the climb planner', () => {
  it('is deterministic for a seed', () => {
    const a = createClimbPlanner(1234);
    const b = createClimbPlanner(1234);
    let centerA: [number, number, number] = [0, FLOOR_Y + 0.01, 0];
    let centerB: [number, number, number] = [0, FLOOR_Y + 0.01, 0];
    for (let t = 0; t < 240; t += DT) {
      const da = a.step(DT, inputs({ center: centerA }));
      const db = b.step(DT, inputs({ center: centerB }));
      expect(da.mode).toBe(db.mode);
      expect(da.anchor[0]).toBeCloseTo(db.anchor[0], 12);
      expect(da.anchor[1]).toBeCloseTo(db.anchor[1], 12);
      if (da.active) centerA = [da.anchor[0], da.anchor[1], da.anchor[2]];
      if (db.active) centerB = [db.anchor[0], db.anchor[1], db.anchor[2]];
    }
  });

  it('with no zest, never stirs', () => {
    const planner = createClimbPlanner(7);
    const last = runUntil(planner, 300, { zest: 0 });
    expect(last.mode).toBe('idle');
    expect(last.active).toBe(false);
  });

  it('too dry to grip, it wanders but never takes to the glass', () => {
    const planner = createClimbPlanner(99);
    let sawTrip = false;
    runUntil(planner, 600, { moisture: CLIMB_MIN_MOISTURE * 0.5 }, (drive) => {
      if (drive.active) sawTrip = true;
      expect(drive.pane).toBe(null);
      return false;
    });
    expect(sawTrip).toBe(true);
  });

  it('damp and left alone, it eventually climbs a pane', () => {
    const planner = createClimbPlanner(42);
    const climbing = runUntil(planner, 900, {}, (drive) => drive.pane !== null);
    expect(climbing.pane).not.toBe(null);
    // And given a while longer it gets meaningfully off the floor. The bar
    // sits just under the shortest climb the planner can draw (v ≥ 0.216 of
    // an 80 mm pane), so this waits for altitude, not luck.
    const high = runUntil(
      planner,
      600,
      {},
      (drive) => drive.pane !== null && drive.anchor[1] > FLOOR_Y + 0.016
    );
    expect(high.anchor[1]).toBeGreaterThan(FLOOR_Y + 0.016);
  });

  it('keeps its anchor inside the box and under the climb ceiling', () => {
    const planner = createClimbPlanner(3);
    runUntil(planner, 1200, {}, (drive) => {
      expect(Math.abs(drive.anchor[0])).toBeLessThanOrEqual(BOX_HALF_X + 1e-9);
      expect(Math.abs(drive.anchor[2])).toBeLessThanOrEqual(BOX_HALF_Z + 1e-9);
      expect(drive.anchor[1]).toBeLessThanOrEqual(
        FLOOR_Y + BOX_HEIGHT * CLIMB_MAX_HEIGHT_FRAC + 0.01
      );
      return false;
    });
  });

  it('yields to the hand at once and settles before trying again', () => {
    const planner = createClimbPlanner(42);
    runUntil(planner, 900, {}, (drive) => drive.active);
    const interrupted = planner.step(DT, inputs({ handBusy: true }));
    expect(interrupted.active).toBe(false);
    expect(interrupted.mode).toBe('settle');
    // Held down, it stays down.
    for (let t = 0; t < 30; t += DT) {
      expect(planner.step(DT, inputs({ handBusy: true })).active).toBe(false);
    }
  });

  it('a flake on the floor interrupts idling at once and draws the anchor to it', () => {
    const planner = createClimbPlanner(7);
    const food: [number, number, number] = [0.035, FLOOR_Y + 0.002, 0.02];
    // Fresh out of the box the idle clock has 20-55 s on it; food skips it.
    const first = planner.step(DT, inputs({ food }));
    expect(first.active).toBe(true);
    expect(first.mode).toBe('amble');
    expect(first.pane).toBe(null);
    // And the trip actually goes there.
    const arrived = runUntil(
      planner,
      60,
      { food },
      (drive) =>
        drive.active && Math.hypot(drive.anchor[0] - food[0], drive.anchor[2] - food[2]) < 0.006
    );
    expect(Math.hypot(arrived.anchor[0] - food[0], arrived.anchor[2] - food[2])).toBeLessThan(
      0.006
    );
  });

  it('comes down off the glass for a meal', () => {
    const planner = createClimbPlanner(42);
    const onGlass = runUntil(
      planner,
      900,
      {},
      (drive) => drive.mode === 'ascend' || drive.mode === 'dwell'
    );
    const lured = planner.step(
      DT,
      inputs({
        food: [0, FLOOR_Y + 0.002, 0],
        // The body is where the trip left it, or the lost-body release
        // fires before the lure gets a look in.
        center: [onGlass.anchor[0], onGlass.anchor[1], onGlass.anchor[2]]
      })
    );
    expect(lured.mode).toBe('descend');
  });

  it('an unhungry slime is offered nothing and stirs for nothing', () => {
    // The contract is the scene's: no hunger, no food input. With food null
    // the planner idles its full clock — the drive stays inactive well past
    // the point the enticed planner above had already set out.
    const planner = createClimbPlanner(7);
    const early = runUntil(planner, 5, {}, (drive) => drive.active);
    expect(early.active).toBe(false);
  });

  it('lets go of a trip when the body is carried away from its anchor', () => {
    const planner = createClimbPlanner(42);
    runUntil(planner, 900, {}, (drive) => drive.active);
    const lost = planner.step(DT, inputs({ center: [0, FLOOR_Y + 0.07, 0] }));
    expect(lost.active).toBe(false);
  });
});
