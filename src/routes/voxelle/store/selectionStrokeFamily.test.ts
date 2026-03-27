import { describe, it, expect } from 'vitest';
import type { StrokeMode } from './core';
import {
  SELECTION_STROKE_FAMILY_ORDER,
  SELECTION_STROKE_FAMILY_VARIANTS,
  strokeModeToSelectionStrokeFamily,
  defaultStrokeModeForSelectionStrokeFamily,
  isStrokeModeInSelectionStrokeFamily,
  selectionStrokeFamilyShowsShapeVariants,
  strokeModeUsesPlaneAxis,
  strokeModeUsesPolygonOffset,
  strokeModeUsesPlaneCuboidHollowShell
} from './selectionStrokeFamily';

describe('selectionStrokeFamily', () => {
  it('maps every StrokeMode to exactly one family via variants table', () => {
    const modesFromVariants = new Set<StrokeMode>();
    for (const family of SELECTION_STROKE_FAMILY_ORDER) {
      for (const v of SELECTION_STROKE_FAMILY_VARIANTS[family]) {
        modesFromVariants.add(v.mode);
        expect(strokeModeToSelectionStrokeFamily(v.mode)).toBe(family);
      }
    }
    const allModes: StrokeMode[] = [
      'line',
      'plane',
      'circle',
      'precise',
      'cuboid',
      'cylinder',
      'polygonHull',
      'polygon',
      'fill',
      'spray'
    ];
    expect(modesFromVariants.size).toBe(allModes.length);
    for (const m of allModes) {
      expect(modesFromVariants.has(m)).toBe(true);
    }
  });

  it('default per family round-trips to that family', () => {
    for (const family of SELECTION_STROKE_FAMILY_ORDER) {
      const sm = defaultStrokeModeForSelectionStrokeFamily(family);
      expect(strokeModeToSelectionStrokeFamily(sm)).toBe(family);
      expect(isStrokeModeInSelectionStrokeFamily(sm, family)).toBe(true);
    }
  });

  it('strokeModeUsesPlaneAxis matches oriented plane strokes', () => {
    expect(strokeModeUsesPlaneAxis('plane')).toBe(true);
    expect(strokeModeUsesPlaneAxis('circle')).toBe(true);
    expect(strokeModeUsesPlaneAxis('cuboid')).toBe(true);
    expect(strokeModeUsesPlaneAxis('cylinder')).toBe(true);
    expect(strokeModeUsesPlaneAxis('line')).toBe(false);
    expect(strokeModeUsesPlaneAxis('polygonHull')).toBe(false);
  });

  it('strokeModeUsesPolygonOffset is polygonHull and solid polygon only', () => {
    expect(strokeModeUsesPolygonOffset('polygonHull')).toBe(true);
    expect(strokeModeUsesPolygonOffset('polygon')).toBe(true);
    expect(strokeModeUsesPolygonOffset('plane')).toBe(false);
  });

  it('strokeModeUsesPlaneCuboidHollowShell matches plane, cuboid, cylinder', () => {
    expect(strokeModeUsesPlaneCuboidHollowShell('plane')).toBe(true);
    expect(strokeModeUsesPlaneCuboidHollowShell('cuboid')).toBe(true);
    expect(strokeModeUsesPlaneCuboidHollowShell('cylinder')).toBe(true);
    expect(strokeModeUsesPlaneCuboidHollowShell('polygonHull')).toBe(false);
  });

  it('selectionStrokeFamilyShowsShapeVariants is false only for fill and spray families', () => {
    expect(selectionStrokeFamilyShowsShapeVariants('stroke')).toBe(true);
    expect(selectionStrokeFamilyShowsShapeVariants('surface')).toBe(true);
    expect(selectionStrokeFamilyShowsShapeVariants('solid')).toBe(true);
    expect(selectionStrokeFamilyShowsShapeVariants('fill')).toBe(false);
    expect(selectionStrokeFamilyShowsShapeVariants('spray')).toBe(false);
  });
});
