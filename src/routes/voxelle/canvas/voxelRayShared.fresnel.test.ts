import { describe, expect, it } from 'vitest';
import {
  fresnelSchlickReflectance,
  GLASS_IOR,
  WATER_IOR
} from './voxelRayShared';

describe('fresnelSchlickReflectance', () => {
  it('matches normal-incidence R0 for air–glass', () => {
    const r0 = Math.pow((1 - GLASS_IOR) / (1 + GLASS_IOR), 2);
    expect(fresnelSchlickReflectance(1, 1, GLASS_IOR)).toBeCloseTo(r0, 6);
  });

  it('uses different R0 for water–glass than air–glass', () => {
    const airGlass = fresnelSchlickReflectance(1, 1, GLASS_IOR);
    const waterGlass = fresnelSchlickReflectance(1, WATER_IOR, GLASS_IOR);
    expect(waterGlass).not.toBeCloseTo(airGlass, 3);
    expect(waterGlass).toBeLessThan(airGlass);
  });

  it('uses different R0 for air–water than air–glass', () => {
    const airWater = fresnelSchlickReflectance(1, 1, WATER_IOR);
    const airGlass = fresnelSchlickReflectance(1, 1, GLASS_IOR);
    expect(airWater).not.toBeCloseTo(airGlass, 2);
  });

  it('goes to 1 at grazing incidence', () => {
    expect(fresnelSchlickReflectance(0, 1, GLASS_IOR)).toBeCloseTo(1, 6);
  });
});
