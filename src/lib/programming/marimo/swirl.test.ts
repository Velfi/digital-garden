import { describe, expect, it } from 'vitest';
import { newSwirl, stepSwirl, stirSwirl, waterVelocityAt } from './swirl';
import {
  FLOOR_Y,
  SWIRL_MAX_VY,
  TANK_HALF_X,
  TANK_HALF_Z,
  WATER_DRIFT_TAU,
  WATER_SPIN_TAU,
  WATER_Y
} from './constants';

const TANK_RADIUS = Math.min(TANK_HALF_X, TANK_HALF_Z);
const out: [number, number, number] = [0, 0, 0];

function vyAt(swirl: ReturnType<typeof newSwirl>, r: number, y: number): number {
  return waterVelocityAt(swirl, r, y, 0, out)[1];
}

describe('swirl', () => {
  const drifting = () => {
    const swirl = newSwirl();
    stirSwirl(swirl, 0, SWIRL_MAX_VY);
    return swirl;
  };

  it('carries no net water through a horizontal slice', () => {
    // The jar is closed: whatever goes up the core comes back down outside it.
    // Flux = ∫ vy(r) 2πr dr, by midpoint rule over the disc.
    const swirl = drifting();
    const y = (FLOOR_Y + WATER_Y) / 2;
    const steps = 4000;
    const dr = TANK_RADIUS / steps;
    let flux = 0;
    for (let i = 0; i < steps; i++) {
      const r = (i + 0.5) * dr;
      flux += vyAt(swirl, r, y) * 2 * Math.PI * r * dr;
    }
    const scale = SWIRL_MAX_VY * Math.PI * TANK_RADIUS ** 2;
    expect(Math.abs(flux) / scale).toBeLessThan(1e-4);
  });

  it('rises up the middle and sinks at the rim', () => {
    const swirl = drifting();
    const y = (FLOOR_Y + WATER_Y) / 2;
    expect(vyAt(swirl, 0, y)).toBeGreaterThan(0);
    expect(vyAt(swirl, TANK_RADIUS * 0.95, y)).toBeLessThan(0);
  });

  it('has no vertical flow at the gravel or the surface', () => {
    const swirl = drifting();
    expect(vyAt(swirl, 0, FLOOR_Y)).toBeCloseTo(0, 9);
    expect(vyAt(swirl, 0, WATER_Y)).toBeCloseTo(0, 9);
    // And it tapers, rather than cutting off — this is what stops a hard drag
    // from carrying the marimo the whole way up and pinning it to the surface.
    const nearSurface = WATER_Y - 0.1 * (WATER_Y - FLOOR_Y);
    expect(vyAt(swirl, 0, nearSurface)).toBeLessThan(0.4 * SWIRL_MAX_VY);
  });

  it('never exceeds the clamp however hard you drag', () => {
    const swirl = newSwirl();
    for (let i = 0; i < 200; i++) stirSwirl(swirl, 0, 1);
    expect(swirl.vy).toBeCloseTo(SWIRL_MAX_VY, 9);
  });

  it('lets the overturning die well before the spin does', () => {
    const swirl = newSwirl();
    stirSwirl(swirl, 1, SWIRL_MAX_VY);
    expect(WATER_DRIFT_TAU).toBeLessThan(WATER_SPIN_TAU / 2);

    stepSwirl(swirl, WATER_DRIFT_TAU);
    expect(swirl.vy).toBeCloseTo(SWIRL_MAX_VY * Math.exp(-1), 9);
    expect(swirl.omegaY).toBeGreaterThan(0.7);
  });

  it('closes the cell instead of pushing water through the glass', () => {
    const swirl = drifting();
    const y = FLOOR_Y + 0.25 * (WATER_Y - FLOOR_Y);
    const atWall = waterVelocityAt(swirl, TANK_RADIUS, y, 0, out)[0];
    expect(atWall).toBeCloseTo(0, 9);
    // Below mid-depth the core flow is still accelerating upward, so continuity
    // demands water move inward along the floor to feed it.
    expect(waterVelocityAt(swirl, TANK_RADIUS * 0.5, y, 0, out)[0]).toBeLessThan(0);
  });
});
