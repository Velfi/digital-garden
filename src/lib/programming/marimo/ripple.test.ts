import { describe, expect, it } from 'vitest';
import {
  RIPPLE_GLSL,
  createRippleUniforms,
  writeRippleUniforms,
  rippleReliefScale
} from './ripple';
import { DEFAULT_RIPPLE_SIM, RIPPLE_CELL, RIPPLE_COLS, RIPPLE_ROWS } from './rippleSim';

/**
 * What the surface is doing is tested in `rippleSim.test.ts`, where the stepper
 * is. This file is about the lookup — the map from a point on the water to a
 * point in the field, and the two scale factors that turn millimetres of grid
 * into metres of relief and into a slope. They are easy to get wrong by a factor
 * of two or a thousand and impossible to spot by eye, because a surface with the
 * wrong slope scale still looks like a surface.
 */

describe('the world-to-grid map', () => {
  it('puts the middle of the jar in the middle of the field', () => {
    const uniforms = createRippleUniforms();
    const span = uniforms.uRippleSpan.value;

    // The GLSL is `p / uRippleSpan + 0.5`, so the centre has to land on 0.5 and
    // the corners on the edges of the texture.
    expect(0 / span.x + 0.5).toBeCloseTo(0.5, 12);
    expect(((RIPPLE_COLS * RIPPLE_CELL) / 2 / span.x + 0.5) as number).toBeCloseTo(1, 12);
    expect((-(RIPPLE_ROWS * RIPPLE_CELL) / 2 / span.y + 0.5) as number).toBeCloseTo(0, 12);
  });

  it('covers the jar with square cells', () => {
    const uniforms = createRippleUniforms();
    const span = uniforms.uRippleSpan.value;
    const cellX = span.x / RIPPLE_COLS;
    const cellY = span.y / RIPPLE_ROWS;

    // The stepper's laplacian is the five-point one, which assumes the grid has
    // the same pitch on both axes. Nothing enforces that but this.
    expect(cellX).toBeCloseTo(cellY, 12);
  });

  it('steps one texel per cell', () => {
    const uniforms = createRippleUniforms();
    expect(uniforms.uRippleTexel.value.x).toBeCloseTo(1 / RIPPLE_COLS, 12);
    expect(uniforms.uRippleTexel.value.y).toBeCloseTo(1 / RIPPLE_ROWS, 12);
  });
});

describe('the scale factors', () => {
  it('reads a millimetre of field as a millimetre of water', () => {
    const uniforms = createRippleUniforms({ ...DEFAULT_RIPPLE_SIM, reliefScale: 1 });
    // The field is millimetres and the scene is metres.
    expect(uniforms.uRippleRelief.value).toBeCloseTo(0.001, 12);
    expect(rippleReliefScale(DEFAULT_RIPPLE_SIM)).toBeCloseTo(0.001, 12);
  });

  it('turns a central difference into the slope it actually is', () => {
    const uniforms = createRippleUniforms({ ...DEFAULT_RIPPLE_SIM, reliefScale: 1 });

    // A ramp climbing exactly one millimetre per millimetre is a slope of 1. Two
    // cells apart, that difference is `2 * cell` millimetres.
    const cellMm = RIPPLE_CELL * 1000;
    const difference = 2 * cellMm;
    expect(difference * uniforms.uRippleSlope.value).toBeCloseTo(1, 12);
  });

  it('keeps height and slope in step when the relief is scaled', () => {
    const uniforms = createRippleUniforms();
    for (const reliefScale of [0, 0.5, 2.5]) {
      writeRippleUniforms(uniforms, { ...DEFAULT_RIPPLE_SIM, reliefScale });
      // Drawing the water twice as deep has to tilt it twice as hard, or the
      // normals stop belonging to the surface they are drawn on.
      expect(uniforms.uRippleRelief.value).toBeCloseTo(reliefScale / 1000, 12);
      expect(uniforms.uRippleSlope.value * (2 * RIPPLE_CELL * 1000)).toBeCloseTo(reliefScale, 12);
    }
  });
});

describe('the shader', () => {
  it('declares every uniform the lookup writes', () => {
    const uniforms = createRippleUniforms();
    for (const name of Object.keys(uniforms)) {
      expect(RIPPLE_GLSL).toContain(name);
    }
  });
});
