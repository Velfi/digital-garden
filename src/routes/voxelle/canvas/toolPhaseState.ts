/**
 * Types and helpers for multi-step tool gestures (cuboid depth, polygon/roof corners, rope/cloth, piscina).
 * VoxelCanvas owns the reactive state; this module documents shapes and shared predicates.
 */

export type CuboidStrokePhase = 'plane' | 'depth' | null;
export type CylinderStrokePhase = 'plane' | 'depth' | null;
/** Surface Polygon (convex hull in plane) placement phase. */
export type PolygonHullStrokePhase = 'placing' | null;
export type SolidPolygonStrokePhase = 'placing' | 'depth' | null;
export type RoofStrokePhase = 'placing' | null;
export type RopeStrokePhase = 'placing' | 'tension' | null;
export type ClothStrokePhase = 'placing' | 'tension' | null;
export type PiscinaPlacementPhase = 'pick' | 'shape';

/** Wall tool: multi-click polygon footprint before Done. */
export type WallPolygonStrokePhase = 'placing' | null;

/** True when a segmented stroke (extra click targets / phases) is in progress. */
export function isSegmentedStrokeGestureActive(opts: {
  cuboidPhase: CuboidStrokePhase;
  cylinderPhase: CylinderStrokePhase;
  /** Hull-in-plane polygon stroke (`StrokeMode` `polygonHull`). */
  polygonPhase: PolygonHullStrokePhase;
  /** Sculpt wall + polygon area shape. */
  wallPolygonPhase?: WallPolygonStrokePhase;
  solidPolygonPhase: SolidPolygonStrokePhase;
  roofPhase: RoofStrokePhase;
  ropePhase: RopeStrokePhase;
  clothPhase: ClothStrokePhase;
}): boolean {
  return !!(
    opts.cuboidPhase ||
    opts.cylinderPhase ||
    opts.polygonPhase ||
    opts.wallPolygonPhase ||
    opts.solidPolygonPhase ||
    opts.roofPhase ||
    opts.ropePhase ||
    opts.clothPhase
  );
}
