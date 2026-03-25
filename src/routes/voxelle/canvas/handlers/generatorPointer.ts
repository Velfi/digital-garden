/**
 * Right-click reseed and gesture-cancel for generator tools; extracted from VoxelCanvas.
 */
import { get } from 'svelte/store';
import type { Intersection } from 'three';
import { getBoundsFromPositions } from '../../coordUtils';
import { getStampOffsetForFace } from '../../store/core';
import type { FaceNormal } from '../../store/core';
import { ashlarRoughness, ashlarSize, ashlarThickness } from '../../store/generatorSettings';
import { getAshlarPositions } from '../../store/generators/rock';

function ashlarThicknessAxis(normal: FaceNormal): 0 | 1 | 2 {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  return ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
}

export interface GeneratorRmbDeps {
  tool: string;
  piscinaPhase: 'pick' | 'shape';
  insectaPhase: 'pick' | 'shape';
  render: () => void;
  randomSeed32: () => number;
  setNextRockSeed: (n: number) => void;
  setNextGrassSeed: (n: number) => void;
  setNextFloraSeed: (n: number) => void;
  setNextPiscinaSeed: (n: number) => void;
  setNextInsectaSeed: (n: number) => void;
  setNextAshlarSeed: (n: number) => void;
  /** Seed used for ashlar RMB preview (matches placement semantics). */
  getAshlarPlacementSeed: () => number;
  getIntersection: () => Intersection | null | undefined;
  getAddPosition: (hit: Intersection) => [number, number, number] | null;
  getFaceNormalFromHit: (hit: Intersection) => FaceNormal | null;
  updatePreviewMesh: (positions: [number, number, number][]) => void;
  setRollOverVisible: (v: boolean) => void;
  shouldCancelActiveGesture: boolean;
  cancelDrag: () => void;
}

/** @returns true if the event was fully handled (caller should return). */
export function tryHandleGeneratorToolRmb(ctx: GeneratorRmbDeps, event: PointerEvent): boolean {
  if (event.button !== 2) return false;

  if (ctx.tool === 'rocks') {
    ctx.setNextRockSeed(ctx.randomSeed32());
    event.preventDefault();
    ctx.render();
    return true;
  }
  if (ctx.tool === 'grass') {
    ctx.setNextGrassSeed(ctx.randomSeed32());
    event.preventDefault();
    ctx.render();
    return true;
  }
  if (ctx.tool === 'flora') {
    ctx.setNextFloraSeed(ctx.randomSeed32());
    event.preventDefault();
    ctx.render();
    return true;
  }
  if (ctx.tool === 'piscina') {
    if (ctx.piscinaPhase === 'shape') {
      ctx.setNextPiscinaSeed(ctx.randomSeed32());
    }
    event.preventDefault();
    ctx.render();
    return true;
  }
  if (ctx.tool === 'insecta') {
    if (ctx.insectaPhase === 'shape') {
      ctx.setNextInsectaSeed(ctx.randomSeed32());
    }
    event.preventDefault();
    ctx.render();
    return true;
  }
  if (ctx.tool === 'ashlar') {
    ctx.setNextAshlarSeed(ctx.randomSeed32());
    event.preventDefault();
    const hit = ctx.getIntersection();
    if (hit) {
      const place = ctx.getAddPosition(hit);
      const normal = ctx.getFaceNormalFromHit(hit);
      if (place && normal) {
        const size = get(ashlarSize) as number;
        const roughness = get(ashlarRoughness) as number;
        const thickness = get(ashlarThickness) as number;
        const thicknessAxis = ashlarThicknessAxis(normal);
        const surfaceTarget: [number, number, number] = [
          place[0] - normal[0],
          place[1] - normal[1],
          place[2] - normal[2]
        ];
        const localPositions = getAshlarPositions(
          ctx.getAshlarPlacementSeed(),
          size,
          roughness,
          thickness,
          thicknessAxis
        );
        const bounds = getBoundsFromPositions(localPositions);
        if (bounds) {
          const halfW = (bounds.maxX - bounds.minX) / 2;
          const halfH = (bounds.maxY - bounds.minY) / 2;
          const halfD = (bounds.maxZ - bounds.minZ) / 2;
          const targetForStamp: [number, number, number] = [
            normal[0] ? surfaceTarget[0] : place[0] - halfW,
            normal[1] ? surfaceTarget[1] : place[1] - halfH,
            normal[2] ? surfaceTarget[2] : place[2] - halfD
          ];
          const [ox, oy, oz] = getStampOffsetForFace(targetForStamp, normal, bounds);
          const previewPositions = localPositions.map(
            ([lx, ly, lz]) => [lx + ox, ly + oy, lz + oz] as [number, number, number]
          );
          ctx.updatePreviewMesh(previewPositions);
        } else {
          ctx.updatePreviewMesh([]);
        }
        ctx.setRollOverVisible(false);
      }
    }
    ctx.render();
    return true;
  }

  if (ctx.shouldCancelActiveGesture) {
    event.preventDefault();
    ctx.cancelDrag();
    ctx.render();
    return true;
  }
  return false;
}

export interface GeneratorPrimaryPointerUpDeps {
  tool: string;
  addPanelOpen: boolean;
  piscinaPhase: 'pick' | 'shape';
  insectaPhase: 'pick' | 'shape';
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
  getNextInsectaSeed: () => number;
  setNextInsectaSeed: (n: number) => void;
  commitInsectaSurfacePick: (place: [number, number, number], normal: FaceNormal) => void;
  scheduleRender: () => void;
}

/** Face-click generators: apply placement on primary pointer up (mirrors VoxelCanvas). */
export function applyGeneratorFaceClickPointerUp(
  ctx: GeneratorPrimaryPointerUpDeps,
  event: PointerEvent
): void {
  if (event.button !== 0 || ctx.addPanelOpen) return;

  if (ctx.tool === 'rocks') {
    const hit = ctx.getIntersection();
    if (hit) {
      const place = ctx.getAddPosition(hit);
      const normal = ctx.getFaceNormalFromHit(hit);
      if (place && normal) {
        const seed = ctx.getNextRockSeed() === 0 ? ctx.randomSeed32() : ctx.getNextRockSeed();
        ctx.placeRocks(place, normal, seed);
        ctx.setNextRockSeed(ctx.randomSeed32());
      }
    }
    return;
  }
  if (ctx.tool === 'grass') {
    const hit = ctx.getIntersection();
    if (hit) {
      const place = ctx.getAddPosition(hit);
      const normal = ctx.getFaceNormalFromHit(hit);
      if (place && normal) {
        const seed = ctx.getNextGrassSeed() === 0 ? ctx.randomSeed32() : ctx.getNextGrassSeed();
        ctx.placeGrass(place, normal, seed);
        ctx.setNextGrassSeed(ctx.randomSeed32());
      }
    }
    return;
  }
  if (ctx.tool === 'flora') {
    const hit = ctx.getIntersection();
    if (hit) {
      const place = ctx.getAddPosition(hit);
      const normal = ctx.getFaceNormalFromHit(hit);
      if (place && normal) {
        const seed = ctx.getNextFloraSeed() === 0 ? ctx.randomSeed32() : ctx.getNextFloraSeed();
        ctx.placeFlora(place, normal, seed);
        ctx.setNextFloraSeed(ctx.randomSeed32());
      }
    }
    return;
  }
  if (ctx.tool === 'piscina') {
    ctx.updatePointerFromEvent(event);
    if (ctx.piscinaPhase === 'pick') {
      const hit = ctx.getIntersection();
      if (hit) {
        const place = ctx.getAddPosition(hit);
        const normal = ctx.getFaceNormalFromHit(hit);
        if (place && normal) {
          if (ctx.getNextPiscinaSeed() === 0) {
            ctx.setNextPiscinaSeed(ctx.randomSeed32());
          }
          ctx.commitPiscinaSurfacePick(place, normal);
          ctx.scheduleRender();
        }
      }
    }
    return;
  }
  if (ctx.tool === 'insecta') {
    ctx.updatePointerFromEvent(event);
    if (ctx.insectaPhase === 'pick') {
      const hit = ctx.getIntersection();
      if (hit) {
        const place = ctx.getAddPosition(hit);
        const normal = ctx.getFaceNormalFromHit(hit);
        if (place && normal) {
          if (ctx.getNextInsectaSeed() === 0) {
            ctx.setNextInsectaSeed(ctx.randomSeed32());
          }
          ctx.commitInsectaSurfacePick(place, normal);
          ctx.scheduleRender();
        }
      }
    }
    return;
  }
  if (ctx.tool === 'ashlar') {
    const hit = ctx.getIntersection();
    if (hit) {
      const place = ctx.getAddPosition(hit);
      const normal = ctx.getFaceNormalFromHit(hit);
      if (place && normal) {
        const seed = ctx.getNextAshlarSeed() === 0 ? ctx.randomSeed32() : ctx.getNextAshlarSeed();
        ctx.placeAshlar(place, normal, seed);
        ctx.setNextAshlarSeed(ctx.randomSeed32());
      }
    }
  }
}
