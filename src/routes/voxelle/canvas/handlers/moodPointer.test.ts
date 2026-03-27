import type { Intersection } from 'three';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as atmosphere from '../../store/atmosphere';
import { applyMoodFaceClickPointerDown } from './moodPointer';
import type { MoodFaceClickDeps } from './moodPointer';

function baseCtx(over: Partial<MoodFaceClickDeps> = {}): MoodFaceClickDeps {
  return {
    tool: 'atmosphere',
    addPanelOpen: false,
    getIntersection: () => null,
    updatePointerFromEvent: vi.fn(),
    getFaceNormalFromHit: () => null,
    scheduleRender: vi.fn(),
    ...over
  };
}

describe('applyMoodFaceClickPointerDown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sets atmosphere plane from hit when tool is atmosphere', () => {
    const spy = vi.spyOn(atmosphere, 'setAtmospherePlaneFromWorldPointAndNormal');
    const hit = {
      point: { x: 1, y: 2, z: 3 }
    } as Intersection;
    applyMoodFaceClickPointerDown(
      baseCtx({
        getIntersection: () => hit,
        getFaceNormalFromHit: () => [0, 1, 0]
      }),
      { button: 0 } as PointerEvent
    );
    expect(spy).toHaveBeenCalledWith(1, 2, 3, 0, 1, 0);
  });

  it('does nothing without a hit', () => {
    const spy = vi.spyOn(atmosphere, 'setAtmospherePlaneFromWorldPointAndNormal');
    applyMoodFaceClickPointerDown(baseCtx(), { button: 0 } as PointerEvent);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing when add panel is open', () => {
    const spy = vi.spyOn(atmosphere, 'setAtmospherePlaneFromWorldPointAndNormal');
    const hit = { point: { x: 0, y: 0, z: 0 } } as Intersection;
    applyMoodFaceClickPointerDown(
      baseCtx({
        addPanelOpen: true,
        getIntersection: () => hit,
        getFaceNormalFromHit: () => [0, 0, 1]
      }),
      { button: 0 } as PointerEvent
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores non-face-click mood tools', () => {
    const spy = vi.spyOn(atmosphere, 'setAtmospherePlaneFromWorldPointAndNormal');
    const hit = { point: { x: 1, y: 1, z: 1 } } as Intersection;
    applyMoodFaceClickPointerDown(
      baseCtx({
        tool: 'grain',
        getIntersection: () => hit,
        getFaceNormalFromHit: () => [1, 0, 0]
      }),
      { button: 0 } as PointerEvent
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
