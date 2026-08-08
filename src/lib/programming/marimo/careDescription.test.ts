import { describe, expect, it } from 'vitest';
import {
  describeAbsence,
  describeAge,
  describeCondition,
  describePet,
  describeSize,
  restingFlatness
} from './careDescription';
import { newMarimo } from './persist';
import type { MarimoState } from './types';

const T0 = 1_700_000_000_000;

function state(overrides: Partial<MarimoState> = {}): MarimoState {
  return Object.assign(newMarimo(T0, 1), overrides);
}

function withFlatSpot(amount: number): MarimoState {
  return state({ dent: amount });
}

describe('describeCondition', () => {
  it('always returns between one and three clauses', () => {
    const samples = [
      state(),
      state({ fouling: 0.9, vigor: 0.2 }),
      state({ fouling: 0.4 }),
      state({ vigor: 0.5 }),
      state({ vigor: 0.95, turnCredit: 0.8 }),
      state({ gas: 0.9 }),
      withFlatSpot(0.13),
      withFlatSpot(0.05),
      state({ fouling: 1, vigor: 0.12, gas: 0, turnCredit: 0 })
    ];
    for (const s of samples) {
      const clauses = describeCondition(s);
      expect(clauses.length).toBeGreaterThanOrEqual(1);
      expect(clauses.length).toBeLessThanOrEqual(3);
      for (const c of clauses) expect(c.length).toBeGreaterThan(0);
    }
  });

  it('leads with the water when it is bad', () => {
    expect(describeCondition(state({ fouling: 0.9 }))[0]).toMatch(/cloudy/i);
    expect(describeCondition(state({ fouling: 0.45 }))[0]).toMatch(/cloud/i);
  });

  it('mentions browning only when vigor is low', () => {
    expect(describeCondition(state({ vigor: 0.2 })).join(' ')).toMatch(/brown/i);
    expect(describeCondition(state({ vigor: 1 })).join(' ')).not.toMatch(/brown/i);
  });

  it('mentions the flat spot in proportion to how flat it is', () => {
    expect(describeCondition(withFlatSpot(0.13)).join(' ')).toMatch(/flat side/i);
    expect(describeCondition(withFlatSpot(0.06)).join(' ')).toMatch(/starting to flatten/i);
    expect(describeCondition(withFlatSpot(0.01)).join(' ')).not.toMatch(/flat/i);
  });

  it('is deterministic', () => {
    const s = state({ fouling: 0.5, vigor: 0.4 });
    expect(describeCondition(s)).toEqual(describeCondition(s));
  });
});

describe('restingFlatness', () => {
  it('reports the depth of the dent at the contact point', () => {
    expect(restingFlatness(withFlatSpot(0.12))).toBeCloseTo(0.12, 6);
    expect(restingFlatness(state())).toBe(0);
  });
});

describe('describeSize', () => {
  it('reports diameter, not radius', () => {
    expect(describeSize(state({ radiusMm: 13.25 }))).toBe('26.5 mm across');
  });
});

describe('describeAbsence', () => {
  it('says nothing for a short absence', () => {
    expect(describeAbsence(600, 1)).toBeNull();
    expect(describeAbsence(3 * 3600, 5)).toBeNull();
  });

  it('says nothing when almost nothing happened', () => {
    expect(describeAbsence(48 * 3600, 0)).toBeNull();
  });

  it('reports surfacings after a real absence', () => {
    const line = describeAbsence(30 * 86400, 63);
    expect(line).toMatch(/63 times/);
    expect(line).toMatch(/30 days/);
  });

  it('uses hours for a same-day absence', () => {
    expect(describeAbsence(9 * 3600, 4)).toMatch(/9 hours/);
  });
});

describe('describeAge', () => {
  const DAY = 86_400_000;

  it('covers the whole range with no gaps', () => {
    expect(describeAge(T0, T0)).toBe('hatched today');
    expect(describeAge(T0, T0 + 0.9 * DAY)).toBe('hatched today');
    expect(describeAge(T0, T0 + 1.2 * DAY)).toBe('a day old');
    expect(describeAge(T0, T0 + 9 * DAY)).toBe('9 days old');
    expect(describeAge(T0, T0 + 59 * DAY)).toBe('59 days old');
    expect(describeAge(T0, T0 + 90 * DAY)).toBe('3 months old');
    expect(describeAge(T0, T0 + 400 * DAY)).toBe('a year old');
    expect(describeAge(T0, T0 + 800 * DAY)).toBe('2 years old');
  });

  it('does not go negative when the clock has moved backwards', () => {
    // DST, a flight, an NTP resync — the same case `catchUpToNow` forgives.
    expect(describeAge(T0, T0 - 5 * DAY)).toBe('hatched today');
  });
});

describe('describePet', () => {
  it('names both the things worth knowing before throwing it away', () => {
    const line = describePet(state({ radiusMm: 15 }), T0 + 12 * 86_400_000);
    expect(line).toBe('30.0 mm across, 12 days old');
  });
});
