import { describe, it, expect, vi } from 'vitest';
import { tryHandleGeneratorToolRmb } from './generatorPointer';
import type { GeneratorRmbDeps } from './generatorPointer';

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
