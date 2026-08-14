import { describe, expect, it } from 'vitest';
import { SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH } from './constants';
import {
  COND_HEIGHT,
  COND_WIDTH,
  createCondensationField,
  FOG_MOISTURE_TOE,
  runnelU,
  RUNNELS_PER_PANE
} from './condensation';
import { PANE_ZP } from './grimeMap';

/** Step in small ticks, the way the render loop does. */
function run(
  field: ReturnType<typeof createCondensationField>,
  seconds: number,
  moisture: number,
  motionScale = 1
) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) field.step(dt, moisture, motionScale);
}

/** The field value at pane (u, v). */
function fogAt(field: ReturnType<typeof createCondensationField>, pane: number, u: number, v: number) {
  const tu = Math.min(COND_WIDTH - 1, Math.floor(u * COND_WIDTH));
  const tv = Math.min(COND_HEIGHT - 1, Math.floor(v * COND_HEIGHT));
  return field.data[pane][tv * COND_WIDTH + tu];
}

describe('condensation field', () => {
  it('stays clear at ambient dryness', () => {
    const field = createCondensationField(() => 0.5);
    run(field, 60, 0.03);
    expect(field.fog).toBeLessThan(0.01);
    expect(field.meanOn(PANE_ZP)).toBeLessThan(0.01);
    expect(field.runnels.length).toBe(0);
  });

  it('fogs within a minute of high moisture and clears slowly after', () => {
    const field = createCondensationField(() => 0.99); // never spawns
    run(field, 60, 1);
    expect(field.fog).toBeGreaterThan(0.9);
    expect(field.meanOn(PANE_ZP)).toBeGreaterThan(0.5);
    run(field, 20, FOG_MOISTURE_TOE - 0.1);
    // Still visibly fogged after 20 dry seconds — the clear tau is minutes.
    expect(field.fog).toBeGreaterThan(0.5);
  });

  it('sheds runnels when fogged, and each carves a streak into the field', () => {
    let calls = 0;
    // Deterministic rng that lets the spawn gate pass now and then.
    const rng = () => {
      calls += 1;
      return (calls % 97) / 97;
    };
    const field = createCondensationField(rng);
    run(field, 120, 1);
    expect(field.runnels.length).toBeGreaterThan(0);
    const r = field.runnels[0];
    expect(r.head).toBeGreaterThanOrEqual(0);
    expect(r.head).toBeLessThanOrEqual(1);
    // Just above the head, on the path, the streak is cleared well below
    // the fog level beside it.
    const v = Math.min(0.95, r.head + 0.05);
    const onPath = fogAt(field, r.pane, runnelU(r, v), v);
    const beside = fogAt(field, r.pane, runnelU(r, v) + 0.2, v);
    expect(onPath).toBeLessThan(beside * 0.5);
  });

  it('never exceeds the per-pane shader budget', () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return (calls % 13) / 13; // spawn-happy
    };
    const field = createCondensationField(rng);
    run(field, 300, 1);
    for (let pane = 0; pane < 4; pane++) {
      const onPane = field.runnels.filter((r) => r.pane === pane).length;
      expect(onPane).toBeLessThanOrEqual(RUNNELS_PER_PANE);
    }
  });

  it('retires a landed runnel, and fog re-forms over its streak', () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      // One guaranteed spawn on the first gate check, then never again.
      return calls < 4 ? 0 : 0.999;
    };
    const field = createCondensationField(rng);
    run(field, 5, 1);
    expect(field.runnels.length).toBe(1);
    const { pane, u, seed } = field.runnels[0];
    // Long enough for the slowest descent plus the bead's linger.
    run(field, 70, 1);
    expect(field.runnels.length).toBe(0);
    // And after minutes of sustained humidity, the streak has hazed back.
    run(field, 240, 1);
    const x = runnelU({ u, seed }, 0.5);
    expect(fogAt(field, pane, x, 0.5)).toBeGreaterThan(0.8);
  });

  it('spawns nothing under zero motion scale', () => {
    const field = createCondensationField(() => 0.0001);
    run(field, 60, 1, 0);
    expect(field.runnels.length).toBe(0);
  });

  it('is cleared by the squeegee, and re-fogs on the regrow clock', () => {
    const field = createCondensationField(() => 0.99);
    run(field, 60, 1);
    field.wipe(PANE_ZP, 0.5, 0.9, 0.5, 0.1, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
    const wiped = fogAt(field, PANE_ZP, 0.5, 0.5);
    const beside = fogAt(field, PANE_ZP, 0.9, 0.5);
    expect(wiped).toBeLessThan(0.2);
    expect(beside).toBeGreaterThan(0.7);
    // Still humid: the lane hazes back over within a couple of minutes.
    run(field, 180, 1);
    expect(fogAt(field, PANE_ZP, 0.5, 0.5)).toBeGreaterThan(0.8);
  });

  it('fells a runnel the blade runs over', () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return calls < 4 ? 0 : 0.999; // one spawn, then quiet
    };
    const field = createCondensationField(rng);
    run(field, 3, 1);
    expect(field.runnels.length).toBe(1);
    const r = field.runnels[0];
    // A vertical stroke down the runnel's own lane takes the droplet with it.
    const x = runnelU(r, r.head);
    field.wipe(r.pane, x, 1, x, 0, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
    expect(field.runnels.length).toBe(0);
  });

  it('a stroke elsewhere leaves the runnel alone', () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return calls < 4 ? 0 : 0.999;
    };
    const field = createCondensationField(rng);
    run(field, 3, 1);
    expect(field.runnels.length).toBe(1);
    const r = field.runnels[0];
    const farU = runnelU(r, r.head) > 0.5 ? 0.1 : 0.9;
    field.wipe(r.pane, farU, 1, farU, 0, SQUEEGEE_WIPE_HALF_WIDTH, SQUEEGEE_WIPE_STRENGTH);
    expect(field.runnels.length).toBe(1);
  });
});
