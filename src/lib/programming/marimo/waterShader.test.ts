import { describe, expect, it } from 'vitest';
import { levelScale, whiteBalance, type RoomToneId } from './lighting';
import {
  IOR_AIR,
  IOR_WATER,
  applyLighting,
  createLightUniforms,
  createRoomUniforms,
  createWaterUniforms,
  criticalAngle,
  fresnelReflectance,
  transmittance,
  waterCoefficients,
  type SceneUniforms
} from './waterShader';

describe('waterCoefficients', () => {
  it('makes clean water very slightly blue-absorbing overall', () => {
    // Pure water eats red hardest, so with almost no dissolved matter the
    // transmitted light should lean blue.
    const clean = waterCoefficients(0);
    expect(clean.sigmaA[0]).toBeGreaterThan(clean.sigmaA[1]);
  });

  it('flips the bias as it fouls, because yellow substance eats blue', () => {
    // This hue reversal is the whole point of splitting the coefficients per
    // channel: fouling should not merely darken the water, it should turn it.
    const foul = waterCoefficients(1);
    expect(foul.sigmaA[2]).toBeGreaterThan(foul.sigmaA[0] * 3);
  });

  it('is monotone in fouling on every channel', () => {
    for (let i = 0; i < 3; i++) {
      let previous = -Infinity;
      for (const f of [0, 0.25, 0.5, 0.75, 1]) {
        const c = waterCoefficients(f);
        const total = c.sigmaA[i] + c.sigmaS[i];
        expect(total).toBeGreaterThan(previous);
        previous = total;
      }
    }
  });

  it('clamps out-of-range fouling', () => {
    expect(waterCoefficients(-5)).toEqual(waterCoefficients(0));
    expect(waterCoefficients(9)).toEqual(waterCoefficients(1));
  });

  it('leaves the marimo clearly visible in clean water and hazed when foul', () => {
    // The jar gives about a 4.5 cm path from the camera to the marimo. These
    // bounds are what keep the tuning honest: readable when cared for, obscured
    // but not erased when neglected.
    const near = 0.045;
    const clean = transmittance(waterCoefficients(0), near);
    const foul = transmittance(waterCoefficients(1), near);
    for (let i = 0; i < 3; i++) {
      expect(clean[i]).toBeGreaterThan(0.6);
      expect(foul[i]).toBeLessThan(0.35);
      expect(foul[i]).toBeGreaterThan(0.005);
    }
  });
});

describe('fresnelReflectance', () => {
  it('is about 2% head-on at an air/water interface', () => {
    expect(fresnelReflectance(1, IOR_AIR, IOR_WATER)).toBeCloseTo(0.02, 2);
  });

  it('goes to unity at grazing incidence', () => {
    expect(fresnelReflectance(0, IOR_AIR, IOR_WATER)).toBeCloseTo(1, 6);
  });

  it('is total beyond the critical angle going water to air', () => {
    const critical = criticalAngle();
    expect(fresnelReflectance(Math.cos(critical + 0.05), IOR_WATER, IOR_AIR)).toBe(1);
    expect(fresnelReflectance(Math.cos(critical - 0.05), IOR_WATER, IOR_AIR)).toBeLessThan(1);
  });

  it('already reads high just inside the critical angle', () => {
    // The shader applies Schlick to the *transmitted* angle when going dense to
    // rare. Applying it to the incident angle instead — the usual formulation —
    // gives a couple of percent right up to the critical angle, so the rim of
    // the mirror region would appear from nowhere with no bright edge.
    const critical = criticalAngle();
    const cos = Math.cos(critical - 0.02);
    const actual = fresnelReflectance(cos, IOR_WATER, IOR_AIR);

    const r0 = ((IOR_WATER - IOR_AIR) / (IOR_WATER + IOR_AIR)) ** 2;
    const naive = r0 + (1 - r0) * (1 - cos) ** 5;

    expect(actual).toBeGreaterThan(0.25);
    expect(actual).toBeGreaterThan(naive * 5);
  });

  it('rises monotonically with angle', () => {
    let previous = -1;
    for (const angle of [0, 0.3, 0.6, 0.9, 1.2, 1.5]) {
      const r = fresnelReflectance(Math.cos(angle), IOR_AIR, IOR_WATER);
      expect(r).toBeGreaterThan(previous);
      previous = r;
    }
  });
});

describe('criticalAngle', () => {
  it('is 48.6 degrees for water to air', () => {
    expect((criticalAngle() * 180) / Math.PI).toBeCloseTo(48.6, 1);
  });

  it('does not exist going air to water', () => {
    expect(criticalAngle(IOR_AIR, IOR_WATER)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('applyLighting', () => {
  function lit(tone: RoomToneId, level: number = levelScale('normal')): SceneUniforms {
    const uniforms: SceneUniforms = {
      water: createWaterUniforms(),
      room: createRoomUniforms(),
      light: createLightUniforms()
    };
    applyLighting(uniforms, { balance: whiteBalance('desk-lamp'), level, tone });
    return uniforms;
  }

  it('lifts the whole room together, not just the walls', () => {
    const dark = lit('dark');
    const cream = lit('cream');

    // A backdrop that came up on its own would be a composite: a bright wall
    // with an unlit jar cut out in front of it. Every route the bounced light
    // takes to the tank has to come up with it.
    expect(cream.room.uRoomHorizon.value.x).toBeGreaterThan(dark.room.uRoomHorizon.value.x);
    expect(cream.room.uRoomZenith.value.x).toBeGreaterThan(dark.room.uRoomZenith.value.x);
    expect(cream.room.uRoomFloor.value.x).toBeGreaterThan(dark.room.uRoomFloor.value.x);
    expect(cream.light.uFillColour.value.length()).toBeGreaterThan(
      dark.light.uFillColour.value.length()
    );
    expect(cream.water.uScatterColour.value.length()).toBeGreaterThan(
      dark.water.uScatterColour.value.length()
    );
    // Including the bottom of the column: with walls around it, the bed is lit
    // from the sides and is no longer at the far end of a single beam.
    expect(cream.water.uShadeFloor.value).toBeGreaterThan(dark.water.uShadeFloor.value);
    // And the plinth, which is the surface the change reaches hardest.
    expect(cream.room.uPedestalColour.value.r).toBeGreaterThan(dark.room.uPedestalColour.value.r);
    expect(cream.room.uPedestalFalloff.value).toBeGreaterThan(dark.room.uPedestalFalloff.value);
  });

  it('leaves the bulb alone', () => {
    // Painting the walls does not change what is in the lamp. Only light that
    // has bounced off something may differ between the two rooms.
    const dark = lit('dark');
    const cream = lit('cream');
    expect(cream.room.uLampColour.value).toEqual(dark.room.uLampColour.value);
    expect(cream.light.uKeyColour.value).toEqual(dark.light.uKeyColour.value);
    expect(cream.water.uExposure.value).toBe(dark.water.uExposure.value);
  });

  it('keeps the cream backdrop off the ceiling at the brightest level', () => {
    // The horizon is the value the whole tank is seen against. Turned all the
    // way up it has to stay short of 1.0, or the backdrop flattens to paper and
    // takes the corner of the jar with it.
    const { water, room } = lit('cream', levelScale('bright'));
    const exposed = room.uRoomHorizon.value.clone().multiplyScalar(water.uExposure.value);
    expect(Math.max(exposed.x, exposed.y, exposed.z)).toBeLessThan(1);
    expect(Math.max(exposed.x, exposed.y, exposed.z)).toBeGreaterThan(0.8);
  });

  it('does not drift as the switch is flicked back and forth', () => {
    // Every value is written fresh from the table, never multiplied onto what
    // was there before — so a round trip is the identity, not an approximation.
    const uniforms = lit('dark');
    const before = uniforms.room.uRoomHorizon.value.clone();
    const balance = whiteBalance('candle');

    for (const tone of ['cream', 'dark', 'cream', 'dark'] as const) {
      applyLighting(uniforms, { balance, level: levelScale('bright'), tone });
    }
    applyLighting(uniforms, {
      balance: whiteBalance('desk-lamp'),
      level: levelScale('normal'),
      tone: 'dark'
    });

    expect(uniforms.room.uRoomHorizon.value.x).toBeCloseTo(before.x, 12);
    expect(uniforms.room.uRoomHorizon.value.y).toBeCloseTo(before.y, 12);
    expect(uniforms.room.uRoomHorizon.value.z).toBeCloseTo(before.z, 12);
  });
});
