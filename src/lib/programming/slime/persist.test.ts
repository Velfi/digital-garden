import { describe, expect, it } from 'vitest';
import { newSlime, parseSlime, serializeSlime, validateSlimeState } from './persist';

describe('persisting the slime', () => {
  it('a fresh arrival is a dormant sclerotium', () => {
    const state = newSlime(123);
    expect(state.stage).toBe('sclerotium');
    expect(state.revival).toBe(0);
    expect(state.revivals).toBe(0);
  });

  it('round-trips exactly enough', () => {
    const state = newSlime(456, 42);
    state.stage = 'active';
    state.moisture = 0.123456789;
    state.radiusMm = 27.654321;
    const back = parseSlime(serializeSlime(state));
    expect(back).not.toBeNull();
    expect(back!.seed).toBe(42);
    expect(back!.bornAt).toBe(456);
    expect(back!.stage).toBe('active');
    expect(back!.moisture).toBeCloseTo(state.moisture, 5);
    expect(back!.radiusMm).toBeCloseTo(state.radiusMm, 4);
  });

  it('rejects corruption rather than repairing it', () => {
    expect(parseSlime('not json')).toBeNull();
    expect(parseSlime('{"v":99}')).toBeNull();
    expect(validateSlimeState({ ...newSlime(0), moisture: 7 })).toBeNull();
    expect(validateSlimeState({ ...newSlime(0), stage: 'zombie' })).toBeNull();
    expect(validateSlimeState({ ...newSlime(0), radiusMm: -1 })).toBeNull();
    expect(validateSlimeState({ ...newSlime(0), sparkle: 2 })).toBeNull();
  });

  it('migrates a v1 pet forward with no sparkle yet', () => {
    const v1 = { ...newSlime(789, 7) } as Record<string, unknown>;
    delete v1.sparkle;
    delete v1.breed;
    v1.v = 1;
    const back = parseSlime(JSON.stringify(v1));
    expect(back).not.toBeNull();
    expect(back!.seed).toBe(7);
    expect(back!.sparkle).toBe(0);
    expect(back!.breed).toBeNull();
  });

  it('migrates a v2 pet forward as an unregistered pedigree', () => {
    const v2 = { ...newSlime(789, 7) } as Record<string, unknown>;
    delete v2.breed;
    v2.v = 2;
    const back = parseSlime(JSON.stringify(v2));
    expect(back).not.toBeNull();
    expect(back!.breed).toBeNull();
  });

  it('keeps a stamped breed, and demotes a retired one instead of re-shipping', () => {
    const state = newSlime(456, 42);
    state.breed = 'rosewash';
    expect(parseSlime(serializeSlime(state))!.breed).toBe('rosewash');

    const retired: Record<string, unknown> = { ...state, breed: 'chimera-deluxe' };
    const back = validateSlimeState(retired);
    expect(back).not.toBeNull();
    expect(back!.breed).toBeNull();
  });
});
