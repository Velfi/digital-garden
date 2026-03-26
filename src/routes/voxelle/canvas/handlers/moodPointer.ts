/**
 * Mood tools: face-click to set atmosphere plane (pointer up).
 */
import type { Intersection } from 'three';
import type { FaceNormal } from '../../store/core';
import { isMoodFaceClickTool } from '../../store/mood/registry';
import { setAtmospherePlaneFromWorldPointAndNormal } from '../../store/atmosphere';

export interface MoodPointerUpDeps {
  tool: string;
  addPanelOpen: boolean;
  getIntersection: () => Intersection | null | undefined;
  updatePointerFromEvent: (e: PointerEvent) => void;
  getFaceNormalFromHit: (hit: Intersection) => FaceNormal | null;
  scheduleRender: () => void;
}

export function applyMoodFaceClickPointerUp(
  ctx: MoodPointerUpDeps,
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
