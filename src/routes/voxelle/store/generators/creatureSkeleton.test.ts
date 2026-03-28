import { describe, expect, it } from 'vitest';
import type { FaceNormal } from '../core';
import {
  buildCreatureAnchorCenter,
  buildInsectaBodyFrame,
  childBoneTranslated,
  creatureForwardSideFromNormal,
  makeResolvedCreatureBone,
  resolveLocalBoneSpecs
} from './creatureSkeleton';

describe('creatureSkeleton', () => {
  it('forward/side convention: second tangent is forward (floor +Y)', () => {
    const normal: FaceNormal = [0, 1, 0];
    const { forward, side } = creatureForwardSideFromNormal(normal);
    expect(forward).toEqual([0, 0, 1]);
    expect(side).toEqual([1, 0, 0]);
  });

  it('buildCreatureAnchorCenter offsets along forward then side', () => {
    const place = [10, 20, 30] as const;
    const forward = [0, 0, 1] as const;
    const side = [1, 0, 0] as const;
    const c = buildCreatureAnchorCenter(place, forward, side, 2, -1);
    expect(c).toEqual([9, 20, 32]);
  });

  it('buildInsectaBodyFrame applies yaw in tangent plane', () => {
    const place = [0, 5, 0] as const;
    const normal: FaceNormal = [0, 1, 0];
    const z = buildInsectaBodyFrame(place, normal, 0, 0, 0);
    const y45 = buildInsectaBodyFrame(place, normal, 0, 0, 45);
    expect(z.forward[0]).toBeCloseTo(0, 5);
    expect(z.forward[2]).toBeCloseTo(1, 5);
    expect(y45.forward[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(y45.forward[2]).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('resolveLocalBoneSpecs chains translations in parent frame', () => {
    const root = makeResolvedCreatureBone(
      'root',
      null,
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    );
    const map = resolveLocalBoneSpecs(root.origin, root.forward, root.side, root.up, [
      { id: 'a', parentId: null, localForward: 0, localSide: 0, localUp: 0 },
      { id: 'b', parentId: 'a', localForward: 2, localSide: 0, localUp: 0 }
    ]);
    expect(map.get('a')!.origin).toEqual([0, 0, 0]);
    expect(map.get('b')!.origin).toEqual([2, 0, 0]);
  });

  it('childBoneTranslated matches parent basis offset', () => {
    const p = makeResolvedCreatureBone(
      'p',
      null,
      [1, 2, 3],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    );
    const c = childBoneTranslated(p, 'c', 0, 4, 0);
    expect(c.origin).toEqual([1, 6, 3]);
    expect(c.forward).toEqual(p.forward);
  });
});
