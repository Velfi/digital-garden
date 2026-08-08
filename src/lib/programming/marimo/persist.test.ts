import { describe, expect, it } from 'vitest';
import {
  MARIMO_STATE_VERSION,
  migrate,
  newMarimo,
  parseMarimo,
  serializeMarimo,
  validateMarimoState
} from './persist';
import { catchUpToNow } from './catchUp';
import {
  DENT_UNIT_NORM,
  SH_COUNT,
  capShape,
  dentCoefficients,
  shapeMagnitude
} from './sphericalHarmonics';
import { BIAS_MAX, DENT_MAX, MAX_FACETS } from './constants';

const T0 = 1_700_000_000_000;

describe('newMarimo', () => {
  it('produces a state that validates', () => {
    const state = newMarimo(T0, 1);
    expect(validateMarimoState(state)).not.toBeNull();
    expect(state.dent).toBe(0);
    expect(state.bias).toHaveLength(SH_COUNT);
    expect(shapeMagnitude(state.bias)).toBe(0);
    expect(state.v).toBe(MARIMO_STATE_VERSION);
  });
});

describe('validateMarimoState', () => {
  const cases: Array<[string, (s: Record<string, unknown>) => void]> = [
    ['NaN radius', (s) => (s.radiusMm = Number.NaN)],
    ['infinite radius', (s) => (s.radiusMm = Number.POSITIVE_INFINITY)],
    ['negative radius', (s) => (s.radiusMm = -1)],
    ['absurd radius', (s) => (s.radiusMm = 1e9)],
    ['out-of-range vigor', (s) => (s.vigor = 1.4)],
    ['out-of-range gas', (s) => (s.gas = -0.01)],
    ['out-of-range fouling', (s) => (s.fouling = 2)],
    ['negative dent', (s) => (s.dent = -0.01)],
    ['dent beyond the clamp', (s) => (s.dent = 0.9)],
    ['non-numeric dent', (s) => (s.dent = 'flat')],
    ['wrong restDir length', (s) => (s.restDir = [0, 1])],
    ['degenerate restDir', (s) => (s.restDir = [0, 0, 0])],
    ['too many rings', (s) => (s.rings = new Array(500).fill({ r: 1, v: 1 }))],
    ['malformed ring', (s) => (s.rings = [{ r: 'a', v: 1 }])],
    ['NaN timestamp', (s) => (s.lastTickAt = Number.NaN)],
    ['wrong version', (s) => (s.v = 99)],
    ['missing version', (s) => delete s.v],
    ['missing bias', (s) => delete s.bias],
    ['short bias', (s) => (s.bias = [0, 0, 0])],
    ['non-numeric bias', (s) => (s.bias = new Array(SH_COUNT).fill('flat'))],
    ['NaN in bias', (s) => ((s.bias as number[])[7] = Number.NaN)],
    // Would turn the ball inside out if it were let through.
    ['bias past the cap', (s) => (s.bias = dentCoefficients(0, -1, 0, 0.9))]
  ];

  for (const [label, corrupt] of cases) {
    it(`rejects ${label}`, () => {
      const state = newMarimo(T0, 1) as unknown as Record<string, unknown>;
      corrupt(state);
      expect(validateMarimoState(state)).toBeNull();
    });
  }

  it('rejects non-objects', () => {
    for (const junk of [null, undefined, 42, 'nope', [], true]) {
      expect(validateMarimoState(junk)).toBeNull();
    }
  });

  it('accepts a well-formed lived-in state', () => {
    const state = newMarimo(T0, 1);
    catchUpToNow(state, T0 + 45 * 86_400_000);
    expect(validateMarimoState(state)).not.toBeNull();
  });
});

describe('migrate', () => {
  it('passes the current version through', () => {
    const state = newMarimo(T0, 1);
    expect(migrate(state)).toBe(state);
  });

  it('discards unknown versions rather than guessing', () => {
    expect(migrate({ v: 0 })).toBeNull();
    expect(migrate({ v: 7 })).toBeNull();
    expect(migrate({})).toBeNull();
    expect(migrate(null)).toBeNull();
  });

  it('brings a v1 marimo forward as a round one', () => {
    // v1 had no permanent shape, so a marimo that grew up under those rules was
    // round by definition. Nothing is invented on its behalf.
    const v1 = { ...newMarimo(T0, 1), v: 1 } as Record<string, unknown>;
    delete v1.bias;

    const migrated = validateMarimoState(migrate(v1));
    expect(migrated).not.toBeNull();
    expect(migrated!.v).toBe(MARIMO_STATE_VERSION);
    expect(shapeMagnitude(migrated!.bias)).toBe(0);
  });

  it('keeps the rest of a v1 marimo intact', () => {
    const v1 = { ...newMarimo(T0, 4242), v: 1, radiusMm: 21.5, dent: 0.08 } as Record<
      string,
      unknown
    >;
    delete v1.bias;

    const migrated = validateMarimoState(migrate(v1))!;
    expect(migrated.radiusMm).toBe(21.5);
    expect(migrated.dent).toBe(0.08);
    expect(migrated.seed).toBe(4242);
    expect(migrated.bornAt).toBe(T0);
  });

  it('brings a v2 marimo forward with its shape and no faces', () => {
    // v2 kept the baked-in flatness in `bias`, which carries over as it stands.
    // Nothing invents facets for it; it starts collecting them from here.
    const v2 = { ...newMarimo(T0, 77), v: 2, bias: dentCoefficients(0, -1, 0, 0.12) } as Record<
      string,
      unknown
    >;
    delete v2.facets;

    const migrated = validateMarimoState(migrate(v2))!;
    expect(migrated.v).toBe(MARIMO_STATE_VERSION);
    expect(migrated.facets).toEqual([]);
    expect(migrated.bias).toEqual(dentCoefficients(0, -1, 0, 0.12));
  });

  it('clamps a deep v2 flat spot rather than throwing the marimo away', () => {
    // DENT_MAX came down when the flat spot became a plane cut, so a stored
    // marimo can be over the new limit. Rejecting it would hatch a fresh one
    // over the top of a pet that may be months old — the one unforgivable
    // outcome in this file.
    const v2 = { ...newMarimo(T0, 9), v: 2, dent: 0.16 } as Record<string, unknown>;

    const migrated = validateMarimoState(migrate(v2));
    expect(migrated).not.toBeNull();
    expect(migrated!.dent).toBe(DENT_MAX);
    expect(migrated!.seed).toBe(9);
  });
});

describe('facets', () => {
  function withFacets(facets: unknown): unknown {
    return { ...newMarimo(T0, 3), facets };
  }

  it('round-trips the faces a marimo has grown', () => {
    const state = newMarimo(T0, 3);
    state.facets = [
      { d: [0, -1, 0], depth: 0.09 },
      { d: [0.6, 0.8, 0], depth: 0.031 }
    ];
    const restored = parseMarimo(serializeMarimo(state))!;
    expect(restored.facets).toHaveLength(2);
    expect(restored.facets[0].depth).toBeCloseTo(0.09, 6);
    expect(restored.facets[1].d[1]).toBeCloseTo(0.8, 6);
  });

  it('normalises a stored axis that serialisation nudged off unit length', () => {
    const restored = validateMarimoState(withFacets([{ d: [0, -1.0004, 0], depth: 0.05 }]))!;
    expect(Math.hypot(...restored.facets[0].d)).toBeCloseTo(1, 12);
  });

  it('refuses shapes it could not draw', () => {
    expect(validateMarimoState(withFacets('lots'))).toBeNull();
    expect(validateMarimoState(withFacets([{ d: [0, -1, 0], depth: 0.9 }]))).toBeNull();
    expect(validateMarimoState(withFacets([{ d: [0, 0, 0], depth: 0.05 }]))).toBeNull();
    expect(validateMarimoState(withFacets([{ d: [0, -1], depth: 0.05 }]))).toBeNull();
    expect(validateMarimoState(withFacets([{ depth: 0.05 }]))).toBeNull();
    expect(
      validateMarimoState(
        withFacets(Array.from({ length: MAX_FACETS + 1 }, () => ({ d: [0, -1, 0], depth: 0.05 })))
      )
    ).toBeNull();
  });
});

describe('serialisation', () => {
  it('round-trips within serializer precision', () => {
    const state = newMarimo(T0, 987654321);
    catchUpToNow(state, T0 + 12 * 86_400_000);

    const restored = parseMarimo(serializeMarimo(state));
    expect(restored).not.toBeNull();
    expect(restored!.radiusMm).toBeCloseTo(state.radiusMm, 4);
    expect(restored!.vigor).toBeCloseTo(state.vigor, 5);
    expect(restored!.gas).toBeCloseTo(state.gas, 5);
    expect(restored!.fouling).toBeCloseTo(state.fouling, 5);
    expect(restored!.dent).toBeCloseTo(state.dent, 5);
    expect(restored!.restDir).toEqual(state.restDir);
    for (let k = 0; k < SH_COUNT; k++) {
      expect(restored!.bias[k]).toBeCloseTo(state.bias[k], 5);
    }
  });

  it('round-trips a marimo sitting exactly on the bias cap', () => {
    // Serialisation rounds to six significant figures, which can nudge a capped
    // marimo a hair over the cap. Validation has to tolerate that, or a marimo
    // left still for long enough would fail to load.
    const state = newMarimo(T0, 5);
    state.bias = capShape(dentCoefficients(0.3, -0.9, 0.31, 1), BIAS_MAX);

    const restored = parseMarimo(serializeMarimo(state));
    expect(restored).not.toBeNull();
    expect(shapeMagnitude(restored!.bias)).toBeCloseTo(BIAS_MAX * DENT_UNIT_NORM, 5);
  });

  it('keeps timestamps and the seed exact', () => {
    // Rounding these to significant figures would move the pet through time.
    const state = newMarimo(T0, 3735928559);
    state.lastTickAt = T0 + 1234567;
    state.lastWaterChangeAt = T0 + 987;
    const restored = parseMarimo(serializeMarimo(state))!;
    expect(restored.bornAt).toBe(state.bornAt);
    expect(restored.lastTickAt).toBe(state.lastTickAt);
    expect(restored.lastWaterChangeAt).toBe(state.lastWaterChangeAt);
    expect(restored.seed).toBe(state.seed);
  });

  it('stays small enough for localStorage', () => {
    const state = newMarimo(T0, 1);
    catchUpToNow(state, T0 + 5 * 365 * 86_400_000);
    expect(serializeMarimo(state).length).toBeLessThan(4000);
  });

  it('returns null for unparseable input instead of throwing', () => {
    expect(parseMarimo('not json')).toBeNull();
    expect(parseMarimo('{}')).toBeNull();
    expect(parseMarimo('[]')).toBeNull();
  });
});
