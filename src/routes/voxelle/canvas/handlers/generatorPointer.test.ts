import type { Intersection } from 'three';
import { describe, it, expect, vi } from 'vitest';
import { applyGeneratorFaceClickPointerDown, tryHandleGeneratorToolRmb } from './generatorPointer';
import type { GeneratorPrimaryPointerUpDeps, GeneratorRmbDeps } from './generatorPointer';

function baseRmbCtx(over: Partial<GeneratorRmbDeps> = {}): GeneratorRmbDeps {
  return {
    tool: 'voxel',
    piscinaPhase: 'pick',
    insectaPhase: 'pick',
    render: vi.fn(),
    randomSeed32: () => 0x12345678,
    setNextRockSeed: vi.fn(),
    setNextGrassSeed: vi.fn(),
    setNextFloraSeed: vi.fn(),
    setNextPiscinaSeed: vi.fn(),
    setNextInsectaSeed: vi.fn(),
    setNextAshlarSeed: vi.fn(),
    getAshlarPlacementSeed: () => 0,
    getIntersection: () => null,
    getAddPosition: () => null,
    getFaceNormalFromHit: () => null,
    updatePreviewMesh: vi.fn(),
    setRollOverVisible: vi.fn(),
    shouldCancelActiveGesture: false,
    cancelDrag: vi.fn(),
    ...over
  };
}

function rmbEvent(): PointerEvent {
  return { button: 2, preventDefault: vi.fn() } as unknown as PointerEvent;
}

describe('tryHandleGeneratorToolRmb', () => {
  it('reseeds rocks on right-click', () => {
    const setNextRockSeed = vi.fn();
    const render = vi.fn();
    const handled = tryHandleGeneratorToolRmb(
      baseRmbCtx({ tool: 'rocks', setNextRockSeed, render }),
      rmbEvent()
    );
    expect(handled).toBe(true);
    expect(setNextRockSeed).toHaveBeenCalledWith(0x12345678);
    expect(render).toHaveBeenCalled();
  });

  it('returns false for left click', () => {
    expect(
      tryHandleGeneratorToolRmb(baseRmbCtx({ tool: 'rocks' }), { button: 0 } as PointerEvent)
    ).toBe(false);
  });

  it('cancels gesture when shouldCancelActiveGesture', () => {
    const cancelDrag = vi.fn();
    const handled = tryHandleGeneratorToolRmb(
      baseRmbCtx({ tool: 'paint', shouldCancelActiveGesture: true, cancelDrag }),
      rmbEvent()
    );
    expect(handled).toBe(true);
    expect(cancelDrag).toHaveBeenCalled();
  });
});

function baseGeneratorFaceClickCtx(
  over: Partial<GeneratorPrimaryPointerUpDeps> = {}
): GeneratorPrimaryPointerUpDeps {
  return {
    tool: 'rocks',
    addPanelOpen: false,
    piscinaPhase: 'pick',
    insectaPhase: 'pick',
    getIntersection: () => null,
    updatePointerFromEvent: vi.fn(),
    getAddPosition: () => null,
    getFaceNormalFromHit: () => null,
    randomSeed32: () => 0x11111111,
    getNextRockSeed: () => 0x22222222,
    setNextRockSeed: vi.fn(),
    placeRocks: vi.fn(),
    getNextGrassSeed: () => 0,
    setNextGrassSeed: vi.fn(),
    placeGrass: vi.fn(),
    getNextFloraSeed: () => 0,
    setNextFloraSeed: vi.fn(),
    placeFlora: vi.fn(),
    getNextAshlarSeed: () => 0,
    setNextAshlarSeed: vi.fn(),
    placeAshlar: vi.fn(),
    getNextPiscinaSeed: () => 0,
    setNextPiscinaSeed: vi.fn(),
    commitPiscinaSurfacePick: vi.fn(),
    getNextInsectaSeed: () => 0,
    setNextInsectaSeed: vi.fn(),
    commitInsectaSurfacePick: vi.fn(),
    scheduleRender: vi.fn(),
    ...over
  };
}

describe('applyGeneratorFaceClickPointerDown', () => {
  const hit = { object: {} } as unknown as Intersection;

  it('places rocks on hit', () => {
    const placeRocks = vi.fn();
    const setNextRockSeed = vi.fn();
    applyGeneratorFaceClickPointerDown(
      baseGeneratorFaceClickCtx({
        getIntersection: () => hit,
        getAddPosition: () => [1, 2, 3],
        getFaceNormalFromHit: () => [0, 1, 0],
        getNextRockSeed: () => 0,
        placeRocks,
        setNextRockSeed
      }),
      { button: 0 } as PointerEvent
    );
    expect(placeRocks).toHaveBeenCalledWith([1, 2, 3], [0, 1, 0], 0x11111111);
    expect(setNextRockSeed).toHaveBeenCalledWith(0x11111111);
  });

  it('does nothing for rocks without hit', () => {
    const placeRocks = vi.fn();
    applyGeneratorFaceClickPointerDown(
      baseGeneratorFaceClickCtx({ placeRocks }),
      { button: 0 } as PointerEvent
    );
    expect(placeRocks).not.toHaveBeenCalled();
  });

  it('places grass on hit', () => {
    const placeGrass = vi.fn();
    const setNextGrassSeed = vi.fn();
    applyGeneratorFaceClickPointerDown(
      baseGeneratorFaceClickCtx({
        tool: 'grass',
        getIntersection: () => hit,
        getAddPosition: () => [4, 5, 6],
        getFaceNormalFromHit: () => [1, 0, 0],
        getNextGrassSeed: () => 0x33333333,
        placeGrass,
        setNextGrassSeed
      }),
      { button: 0 } as PointerEvent
    );
    expect(placeGrass).toHaveBeenCalledWith([4, 5, 6], [1, 0, 0], 0x33333333);
    expect(setNextGrassSeed).toHaveBeenCalledWith(0x11111111);
  });

  it('commits piscina surface pick only in pick phase', () => {
    const commitPiscinaSurfacePick = vi.fn();
    const scheduleRender = vi.fn();
    const updatePointerFromEvent = vi.fn();
    applyGeneratorFaceClickPointerDown(
      baseGeneratorFaceClickCtx({
        tool: 'piscina',
        piscinaPhase: 'pick',
        getIntersection: () => hit,
        getAddPosition: () => [0, 0, 1],
        getFaceNormalFromHit: () => [0, 0, 1],
        getNextPiscinaSeed: () => 0,
        setNextPiscinaSeed: vi.fn(),
        commitPiscinaSurfacePick,
        scheduleRender,
        updatePointerFromEvent
      }),
      { button: 0 } as PointerEvent
    );
    expect(updatePointerFromEvent).toHaveBeenCalled();
    expect(commitPiscinaSurfacePick).toHaveBeenCalledWith([0, 0, 1], [0, 0, 1]);
    expect(scheduleRender).toHaveBeenCalled();
  });

  it('does not commit piscina pick in shape phase', () => {
    const commitPiscinaSurfacePick = vi.fn();
    applyGeneratorFaceClickPointerDown(
      baseGeneratorFaceClickCtx({
        tool: 'piscina',
        piscinaPhase: 'shape',
        getIntersection: () => hit,
        getAddPosition: () => [0, 0, 0],
        getFaceNormalFromHit: () => [0, 1, 0],
        commitPiscinaSurfacePick
      }),
      { button: 0 } as PointerEvent
    );
    expect(commitPiscinaSurfacePick).not.toHaveBeenCalled();
  });
});
