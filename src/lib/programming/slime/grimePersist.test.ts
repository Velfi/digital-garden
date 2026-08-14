import { describe, expect, it } from 'vitest';
import {
  GRIME_AWAY_CLIMB_INTERVAL_SEC,
  GRIME_AWAY_MAX_CLIMBS,
  GRIME_TAU_SEC
} from './constants';
import { PANE_COUNT, PANE_ZP, createGrimeField } from './grimeMap';
import {
  awayActivity,
  deserializeGrime,
  serializeGrime,
  simulateGrimeAway
} from './grimePersist';

function dirtied(): ReturnType<typeof createGrimeField> {
  const field = createGrimeField();
  for (let pane = 0; pane < PANE_COUNT; pane++) {
    for (let n = 0; n < 30; n++) field.splat(pane, 0.3 + pane * 0.1, 0.4, 0.3, 0.05);
  }
  return field;
}

describe('the grime blob', () => {
  it('round-trips within quantisation', () => {
    const a = dirtied();
    const b = createGrimeField();
    expect(deserializeGrime(serializeGrime(a), b)).toBe(true);
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      for (let i = 0; i < a.data[pane].length; i++) {
        expect(Math.abs(a.data[pane][i] - b.data[pane][i])).toBeLessThan(1 / 255 + 1e-9);
      }
    }
  });

  it('rejects garbage, wrong versions and wrong shapes, leaving the field alone', () => {
    const field = createGrimeField();
    field.splat(PANE_ZP, 0.5, 0.5, 0.3, 0.05);
    const before = field.data[PANE_ZP].slice();
    const good = JSON.parse(serializeGrime(createGrimeField()));

    for (const raw of [
      'not json',
      '{}',
      JSON.stringify({ ...good, v: 99 }),
      JSON.stringify({ ...good, w: 64 }),
      JSON.stringify({ ...good, panes: good.panes.slice(0, 2) }),
      JSON.stringify({ ...good, panes: [...good.panes.slice(0, 3), 'AAAA'] })
    ]) {
      expect(deserializeGrime(raw, field)).toBe(false);
    }
    expect(field.data[PANE_ZP]).toEqual(before);
  });
});

describe('the absence', () => {
  it('does nothing for zero or negative elapsed', () => {
    const field = dirtied();
    const before = field.data.map((d) => d.slice());
    simulateGrimeAway(field, 0, 1, 42);
    simulateGrimeAway(field, -60, 1, 42);
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      expect(field.data[pane]).toEqual(before[pane]);
    }
  });

  it('decays on the dried tau, not the wet one', () => {
    // An hour away on the live tau would scrub the panes to 5%; dried film
    // barely notices an hour.
    const field = dirtied();
    const before = field.meanOn(PANE_ZP);
    simulateGrimeAway(field, 3600, 0, 42);
    expect(field.meanOn(PANE_ZP)).toBeGreaterThan(before * 0.9);
    expect(field.meanOn(PANE_ZP)).toBeLessThan(before);
    // The wet tau really would have scrubbed it.
    expect(Math.exp(-3600 / GRIME_TAU_SEC)).toBeLessThan(0.06);
  });

  it('an active absence gums the walls; a dormant one only fades them', () => {
    const active = createGrimeField();
    const dormant = createGrimeField();
    const away = GRIME_AWAY_CLIMB_INTERVAL_SEC * 8;
    simulateGrimeAway(active, away, awayActivity('active', 0.8), 42);
    simulateGrimeAway(dormant, away, awayActivity('sclerotium', 0.8), 42);

    let activeTotal = 0;
    let dormantTotal = 0;
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      activeTotal += active.meanOn(pane);
      dormantTotal += dormant.meanOn(pane);
    }
    expect(activeTotal).toBeGreaterThan(0.005);
    expect(dormantTotal).toBe(0);
  });

  it('replays the same past for the same seed, a different one for another', () => {
    const a = createGrimeField();
    const b = createGrimeField();
    const c = createGrimeField();
    const away = GRIME_AWAY_CLIMB_INTERVAL_SEC * 6;
    simulateGrimeAway(a, away, 1, 42);
    simulateGrimeAway(b, away, 1, 42);
    simulateGrimeAway(c, away, 1, 43);
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      expect(a.data[pane]).toEqual(b.data[pane]);
    }
    let differs = false;
    for (let pane = 0; pane < PANE_COUNT && !differs; pane++) {
      for (let i = 0; i < a.data[pane].length; i++) {
        if (a.data[pane][i] !== c.data[pane][i]) {
          differs = true;
          break;
        }
      }
    }
    expect(differs).toBe(true);
  });

  it('a month away is bounded: capped climbs, no runaway loop', () => {
    const field = createGrimeField();
    simulateGrimeAway(field, 30 * 24 * 3600, 1, 42);
    // Can't count climbs directly; but the field stays sane and non-empty,
    // and the cap guarantees the loop ran at most GRIME_AWAY_MAX_CLIMBS + 1
    // gaps. Peak never exceeds saturation.
    let peak = 0;
    let total = 0;
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      total += field.meanOn(pane);
      for (const value of field.data[pane]) peak = Math.max(peak, value);
    }
    expect(peak).toBeLessThanOrEqual(1);
    expect(total).toBeGreaterThan(0);
    expect(GRIME_AWAY_MAX_CLIMBS).toBeLessThan(64);
  });
});
