/**
 * Documentation-as-code for the growth rate.
 *
 * The post quotes real numbers at the reader, and the sim uses a compressed
 * version of the same figures. These helpers exist so the two can't drift:
 * `timeScale.test.ts` pins the headline value, so changing
 * MARIMO_TIME_COMPRESSION without updating the prose fails the suite.
 */

import { GROWTH_MM_PER_SEC, MARIMO_TIME_COMPRESSION, REAL_RADIUS_MM_PER_YEAR } from './constants';

/** Diameter gained per real day at perfect health, in mm. */
export function mmDiameterPerRealDay(): number {
  return GROWTH_MM_PER_SEC * 2 * 86400;
}

/** Diameter gained over `days` real days at a given health, in mm. */
export function mmDiameterOverRealDays(days: number, health = 1): number {
  return mmDiameterPerRealDay() * days * health;
}

/** How many marimo-years a stretch of real days represents. */
export function realDaysToSimYears(days: number): number {
  return (days / 365.25) * MARIMO_TIME_COMPRESSION;
}

/** What a real marimo in Lake Akan manages, for comparison in the prose. */
export function realMmDiameterPerYear(): number {
  return REAL_RADIUS_MM_PER_YEAR * 2;
}
