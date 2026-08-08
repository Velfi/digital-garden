import { describe, expect, it } from 'vitest';
import {
  mmDiameterOverRealDays,
  mmDiameterPerRealDay,
  realDaysToSimYears,
  realMmDiameterPerYear
} from './timeScale';
import { MARIMO_TIME_COMPRESSION } from './constants';

describe('time scale', () => {
  it('pins the headline growth rate quoted in the post', () => {
    // If this fails, MARIMO_TIME_COMPRESSION changed and the prose needs
    // updating too. That is the entire point of this test.
    expect(mmDiameterPerRealDay()).toBeCloseTo(0.207, 3);
  });

  it('matches the real Lake Akan figure the post cites', () => {
    expect(realMmDiameterPerYear()).toBeCloseTo(12.6, 6);
  });

  it('agrees with the horizons in the plan', () => {
    expect(mmDiameterOverRealDays(7)).toBeCloseTo(1.45, 2);
    expect(mmDiameterOverRealDays(30)).toBeCloseTo(6.2, 1);
  });

  it('scales linearly with health', () => {
    expect(mmDiameterOverRealDays(10, 0.5)).toBeCloseTo(mmDiameterOverRealDays(5, 1), 9);
  });

  it('converts real days to marimo years at the compression factor', () => {
    expect(realDaysToSimYears(365.25)).toBeCloseTo(MARIMO_TIME_COMPRESSION, 9);
  });
});
