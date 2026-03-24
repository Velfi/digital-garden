/**
 * Types and helpers for multi-step tool gestures (cuboid depth, polygon/roof corners, rope, piscina).
 * VoxelCanvas owns the reactive state; this module documents shapes and shared predicates.
 */

export type CuboidStrokePhase = 'plane' | 'depth' | null;
export type PolygonStrokePhase = 'placing' | null;
export type RoofStrokePhase = 'placing' | null;
export type RopeStrokePhase = 'placing' | 'tension' | null;
export type PiscinaPlacementPhase = 'pick' | 'shape';

/** True when a segmented stroke (extra click targets / phases) is in progress. */
export function isSegmentedStrokeGestureActive(opts: {
  cuboidPhase: CuboidStrokePhase;
  polygonPhase: PolygonStrokePhase;
  roofPhase: RoofStrokePhase;
  ropePhase: RopeStrokePhase;
}): boolean {
  return !!(
    opts.cuboidPhase ||
    opts.polygonPhase ||
    opts.roofPhase ||
    opts.ropePhase
  );
}
