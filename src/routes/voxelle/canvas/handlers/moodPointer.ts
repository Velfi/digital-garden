/**
 * Mood tools: face-click on pointerdown (same rationale as generator face-click tools).
 */
import type { Intersection } from 'three';
import type { FaceNormal } from '../../store/core';
import { isMoodFaceClickTool } from '../../store/mood/registry';
import { setAtmospherePlaneFromWorldPointAndNormal } from '../../store/atmosphere';

export interface MoodFaceClickDeps {
  tool: string;
  addPanelOpen: boolean;
  getIntersection: () => Intersection | null | undefined;
  updatePointerFromEvent: (e: PointerEvent) => void;
  getFaceNormalFromHit: (hit: Intersection) => FaceNormal | null;
  scheduleRender: () => void;
}

/** @deprecated Use {@link MoodFaceClickDeps}. */
export type MoodPointerUpDeps = MoodFaceClickDeps;

export function applyMoodFaceClickPointerDown(
  ctx: MoodFaceClickDeps,
  event: PointerEvent
): void {
  if (event.button !== 0 || ctx.addPanelOpen) return;
  if (!isMoodFaceClickTool(ctx.tool)) return;

  ctx.updatePointerFromEvent(event);
  const hit = ctx.getIntersection();
  if (!hit) return;
  const normal = ctx.getFaceNormalFromHit(hit);
  if (!normal) return;
  const p = hit.point;
  if (ctx.tool === 'atmosphere') {
    setAtmospherePlaneFromWorldPointAndNormal(p.x, p.y, p.z, normal[0], normal[1], normal[2]);
  }
  ctx.scheduleRender();
}
