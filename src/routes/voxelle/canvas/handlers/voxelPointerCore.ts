/**
 * Bridges VoxelCanvas runtime state into `generatorPointer` deps without pulling Svelte stores into this file.
 */
import type { Intersection } from 'three';
import type { FaceNormal } from '../../store/core';
import type { GeneratorPrimaryPointerUpDeps, GeneratorRmbDeps } from './generatorPointer';

export interface VoxelGeneratorRmbBridge {
  getTool: () => string;
  getPiscinaPhase: () => 'pick' | 'shape';
  render: () => void;
  randomSeed32: () => number;
  setNextRockSeed: (n: number) => void;
  setNextGrassSeed: (n: number) => void;
  setNextFloraSeed: (n: number) => void;
  setNextPiscinaSeed: (n: number) => void;
  setNextAshlarSeed: (n: number) => void;
  getAshlarPlacementSeed: () => number;
  getIntersection: () => Intersection | null | undefined;
  getAddPosition: (hit: Intersection) => [number, number, number] | null;
  getFaceNormalFromHit: (hit: Intersection) => FaceNormal | null;
  updatePreviewMesh: (positions: [number, number, number][]) => void;
  setRollOverVisible: (v: boolean) => void;
  shouldCancelActiveGesture: () => boolean;
  cancelDrag: () => void;
}

export function buildVoxelGeneratorRmbDeps(b: VoxelGeneratorRmbBridge): GeneratorRmbDeps {
  return {
    tool: b.getTool(),
    piscinaPhase: b.getPiscinaPhase(),
    render: b.render,
    randomSeed32: b.randomSeed32,
    setNextRockSeed: b.setNextRockSeed,
    setNextGrassSeed: b.setNextGrassSeed,
    setNextFloraSeed: b.setNextFloraSeed,
    setNextPiscinaSeed: b.setNextPiscinaSeed,
    setNextAshlarSeed: b.setNextAshlarSeed,
    getAshlarPlacementSeed: b.getAshlarPlacementSeed,
    getIntersection: b.getIntersection,
    getAddPosition: b.getAddPosition,
    getFaceNormalFromHit: b.getFaceNormalFromHit,
    updatePreviewMesh: b.updatePreviewMesh,
    setRollOverVisible: b.setRollOverVisible,
    shouldCancelActiveGesture: b.shouldCancelActiveGesture(),
    cancelDrag: b.cancelDrag
  };
}

export interface VoxelGeneratorPrimaryPointerUpBridge {
  getTool: () => string;
  getAddPanelOpen: () => boolean;
  getPiscinaPhase: () => 'pick' | 'shape';
  getIntersection: () => Intersection | null | undefined;
  updatePointerFromEvent: (e: PointerEvent) => void;
  getAddPosition: (hit: Intersection) => [number, number, number] | null;
  getFaceNormalFromHit: (hit: Intersection) => FaceNormal | null;
  randomSeed32: () => number;
  getNextRockSeed: () => number;
  setNextRockSeed: (n: number) => void;
  placeRocks: (place: [number, number, number], normal: FaceNormal, seed: number) => void;
  getNextGrassSeed: () => number;
  setNextGrassSeed: (n: number) => void;
  placeGrass: (place: [number, number, number], normal: FaceNormal, seed: number) => void;
  getNextFloraSeed: () => number;
  setNextFloraSeed: (n: number) => void;
  placeFlora: (place: [number, number, number], normal: FaceNormal, seed: number) => void;
  getNextAshlarSeed: () => number;
  setNextAshlarSeed: (n: number) => void;
  placeAshlar: (place: [number, number, number], normal: FaceNormal, seed: number) => void;
  getNextPiscinaSeed: () => number;
  setNextPiscinaSeed: (n: number) => void;
  commitPiscinaSurfacePick: (place: [number, number, number], normal: FaceNormal) => void;
  scheduleRender: () => void;
}

export function buildVoxelGeneratorPrimaryPointerUpDeps(
  b: VoxelGeneratorPrimaryPointerUpBridge
): GeneratorPrimaryPointerUpDeps {
  return {
    tool: b.getTool(),
    addPanelOpen: b.getAddPanelOpen(),
    piscinaGizmoUp: false,
    piscinaPhase: b.getPiscinaPhase(),
    getIntersection: b.getIntersection,
    updatePointerFromEvent: b.updatePointerFromEvent,
    getAddPosition: b.getAddPosition,
    getFaceNormalFromHit: b.getFaceNormalFromHit,
    randomSeed32: b.randomSeed32,
    getNextRockSeed: b.getNextRockSeed,
    setNextRockSeed: b.setNextRockSeed,
    placeRocks: b.placeRocks,
    getNextGrassSeed: b.getNextGrassSeed,
    setNextGrassSeed: b.setNextGrassSeed,
    placeGrass: b.placeGrass,
    getNextFloraSeed: b.getNextFloraSeed,
    setNextFloraSeed: b.setNextFloraSeed,
    placeFlora: b.placeFlora,
    getNextAshlarSeed: b.getNextAshlarSeed,
    setNextAshlarSeed: b.setNextAshlarSeed,
    placeAshlar: b.placeAshlar,
    getNextPiscinaSeed: b.getNextPiscinaSeed,
    setNextPiscinaSeed: b.setNextPiscinaSeed,
    commitPiscinaSurfacePick: b.commitPiscinaSurfacePick,
    scheduleRender: b.scheduleRender
  };
}
