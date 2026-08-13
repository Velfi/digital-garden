import { describe, expect, it } from 'vitest';
import { STONE_MAX_IN_TANK, TANK_HALF_X, WATER_Y } from './constants';
import { MARIMO_DECOR_VERSION, newDecor, validateDecor, validateStone } from './decor';
import { STONE_KINDS, stoneKindById } from './stones';

const kind = STONE_KINDS[0].id;
const good = { k: kind, s: 42, p: [0.01, -0.03, -0.02], q: [0, 0, 0, 1] };

describe('validateStone', () => {
  it('takes a good one, and fills in the size it predates', () => {
    // The size choice came after the stones did. A file written before it must
    // not lose its rocks over a field that did not exist when it was saved.
    expect(validateStone(good)).toEqual({ ...good, z: 'medium' });
    expect(validateStone({ ...good, z: 'large' })?.z).toBe('large');
    expect(validateStone({ ...good, z: 'enormous' })?.z).toBe('medium');
  });

  it('rejects a kind that is not in the catalogue', () => {
    // The quarry closing has to be survivable: a kind dropped from the box in
    // some later version must not resurrect as an untextured blob.
    expect(validateStone({ ...good, k: 'obsidian' })).toBeNull();
  });

  it('rejects coordinates outside the jar', () => {
    expect(validateStone({ ...good, p: [TANK_HALF_X * 3, -0.03, 0] })).toBeNull();
    expect(validateStone({ ...good, p: [0, -0.03, NaN] })).toBeNull();
    expect(validateStone({ ...good, p: [0, 5, 0] })).toBeNull();
    expect(validateStone({ ...good, p: [0, -0.03] })).toBeNull();
  });

  it('rejects an orientation that is not a rotation', () => {
    // A quaternion of the wrong length is a scale as well as a turn, and would
    // come back as a stone that had swollen or shrivelled in the night.
    expect(validateStone({ ...good, q: [0, 0, 0, 0] })).toBeNull();
    expect(validateStone({ ...good, q: [0, 0, 0] })).toBeNull();
    expect(validateStone({ ...good, q: [2, 0, 0, 0] })).toBeNull();
  });

  it('renormalises an orientation that has been rounded', () => {
    // Serialising to six figures can leave the length a hair off one, and
    // throwing a stone away over that would be absurd.
    const stone = validateStone({ ...good, q: [0, 0.707107, 0, 0.707107] });
    expect(stone).not.toBeNull();
    const q = stone!.q;
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 9);
  });

  it('rejects a missing seed rather than inventing one', () => {
    expect(validateStone({ ...good, s: 'nope' })).toBeNull();
    expect(validateStone(null)).toBeNull();
  });
});

describe('validateDecor', () => {
  it('reads back what it was given', () => {
    const decor = {
      v: MARIMO_DECOR_VERSION,
      sheetSeed: 7,
      kind,
      size: 'large' as const,
      gen: [1, 0, 2, 0],
      stones: [{ ...good, z: 'large' as const }]
    };
    expect(validateDecor(decor)).toEqual(decor);
  });

  it('falls back per field rather than throwing the box away', () => {
    // The opposite policy to the pet's. One unreadable preference must not cost
    // you the stones, and one unreadable stone must not cost you the rest.
    const decor = validateDecor({
      v: MARIMO_DECOR_VERSION,
      sheetSeed: 3,
      kind: 'obsidian',
      size: 'enormous',
      gen: ['x', 2, -1, 4],
      stones: []
    });
    expect(stoneKindById(decor.kind)).not.toBeNull();
    expect(decor.size).toBe('medium');
    expect(decor.gen).toEqual([0, 2, 0, 4]);
  });

  it('keeps the good stones and drops the bad ones', () => {
    // The whole reason this file is not the pet's: one unreadable rock is not
    // grounds for emptying the jar.
    const decor = validateDecor({
      v: MARIMO_DECOR_VERSION,
      sheetSeed: 7,
      gen: [0, 0, 0, 0],
      stones: [good, { k: 'nonsense' }, { ...good, s: 9 }]
    });
    expect(decor.stones.map((stone) => stone.s)).toEqual([42, 9]);
  });

  it('never throws, whatever it is handed', () => {
    for (const raw of [null, undefined, 4, 'x', [], {}, { v: 99 }, { v: 1, stones: 'no' }]) {
      expect(() => validateDecor(raw)).not.toThrow();
      expect(validateDecor(raw).stones).toEqual([]);
    }
  });

  it('empties the box on a version it does not know', () => {
    expect(validateDecor({ v: 99, stones: [good] }).stones).toEqual([]);
  });

  it('will not overfill the jar', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...good, s: i }));
    const decor = validateDecor({
      v: MARIMO_DECOR_VERSION,
      sheetSeed: 1,
      gen: [0, 0, 0, 0],
      stones: many
    });
    expect(decor.stones.length).toBe(STONE_MAX_IN_TANK);
  });

  it('hands back a usable box for a first visit', () => {
    const fresh = newDecor(5);
    expect(fresh.v).toBe(MARIMO_DECOR_VERSION);
    expect(fresh.sheetSeed).toBe(5);
    expect(fresh.stones).toEqual([]);
    expect(fresh.gen).toEqual([0, 0, 0, 0]);
    expect(stoneKindById(fresh.kind)).not.toBeNull();
  });
});

describe('migrating a v1 box', () => {
  it('brings its stones forward rather than emptying it', () => {
    // v1 predates the stones being able to move, so it stored an x, a z and a
    // yaw. Losing a jarful of rocks over a schema change would be the same
    // mistake `persist.ts` goes to such lengths to avoid with the pet.
    const decor = validateDecor({
      v: 1,
      sheetSeed: 12,
      peeled: { [kind]: 2 },
      stones: [{ k: kind, s: 7, x: 0.01, z: -0.02, y: Math.PI }]
    });

    expect(decor.sheetSeed).toBe(12);
    expect(decor.stones.length).toBe(1);

    const [stone] = decor.stones;
    expect(stone.s).toBe(7);
    expect(stone.p[0]).toBeCloseTo(0.01, 6);
    expect(stone.p[2]).toBeCloseTo(-0.02, 6);
    // The height is not in a v1 file, so it comes back at the surface and is
    // allowed to fall to wherever the physics now says it belongs.
    expect(stone.p[1]).toBeCloseTo(WATER_Y, 6);
    // Its yaw survives: a half-turn about the vertical.
    expect(stone.q[1]).toBeCloseTo(1, 5);
  });
});
