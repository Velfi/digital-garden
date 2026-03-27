import type { StrokeMode } from './core';

/** High-level grouping for draw/selection stroke shapes (maps 1:1 to `StrokeMode`). */
export type SelectionStrokeFamily = 'stroke' | 'surface' | 'solid' | 'fill' | 'spray';

const STROKE_TO_FAMILY: Record<StrokeMode, SelectionStrokeFamily> = {
  line: 'stroke',
  precise: 'stroke',
  plane: 'surface',
  circle: 'surface',
  polygonHull: 'surface',
  cuboid: 'solid',
  cylinder: 'solid',
  polygon: 'solid',
  fill: 'fill',
  spray: 'spray'
};

const FAMILY_DEFAULT_STROKE: Record<SelectionStrokeFamily, StrokeMode> = {
  stroke: 'line',
  surface: 'plane',
  solid: 'cuboid',
  fill: 'fill',
  spray: 'spray'
};

export const SELECTION_STROKE_FAMILY_ORDER: readonly SelectionStrokeFamily[] = [
  'stroke',
  'surface',
  'solid',
  'fill',
  'spray'
];

export type SelectionStrokeFamilyVariant = {
  mode: StrokeMode;
  label: string;
  title: string;
  /** Short label for the floating tool panel (area / stroke shape). Falls back to `label`. */
  panelLabel?: string;
};

export const SELECTION_STROKE_FAMILY_VARIANTS: Record<
  SelectionStrokeFamily,
  readonly SelectionStrokeFamilyVariant[]
> = {
  stroke: [
    {
      mode: 'line',
      label: 'Line',
      title: 'Draw lines (axis-aligned or on-plane via tool panel)'
    },
    {
      mode: 'precise',
      label: 'Precise',
      title:
        'Click voxel to lock plane from face normal, then click to place one voxel or drag to place a plane'
    }
  ],
  surface: [
    {
      mode: 'plane',
      label: 'Plane',
      title:
        'Fill whole plane (Alt+scroll to cycle orientation, hold Shift while dragging to mirror around drag start)'
    },
    {
      mode: 'circle',
      label: 'Circle',
      title: 'Drag from center to edge: disk in the plane (Alt+scroll to cycle orientation)'
    },
    {
      mode: 'polygonHull',
      label: 'Polygon',
      title: 'Click to place points, Done to fill convex hull'
    }
  ],
  solid: [
    {
      mode: 'cuboid',
      label: 'Cuboid',
      panelLabel: 'Cube',
      title: 'Drag to set plane (Alt+scroll to cycle), scroll for depth, click or Done to apply'
    },
    {
      mode: 'cylinder',
      label: 'Cylindroid',
      panelLabel: 'Cylinder',
      title:
        'Drag center to edge for base disk (Alt+scroll to cycle plane), scroll for depth, Done to apply — taper in tool panel'
    },
    {
      mode: 'polygon',
      label: 'Polygonoid',
      panelLabel: 'Polygon',
      title:
        'Click to place outline corners, Set depth, then adjust depth (slider / vertical drag) and Done — like Cube'
    }
  ],
  fill: [
    {
      mode: 'fill',
      label: 'Fill',
      title:
        'Click to flood-fill: Voxel (empty space), Remove/Paint (voxels), Select / Select by color (selection)'
    }
  ],
  spray: [
    {
      mode: 'spray',
      label: 'Spray',
      title: 'Drag to paint a soft brush along the path'
    }
  ]
};

export const SELECTION_STROKE_FAMILY_LABELS: Record<SelectionStrokeFamily, string> = {
  stroke: 'Stroke',
  surface: 'Surface',
  solid: 'Solid',
  /** Single-mode family: no shape row in tool panel (sidebar family only). */
  fill: 'Fill',
  spray: 'Spray'
};

/** Families that show a second-row shape picker (stroke / surface / solid). */
export function selectionStrokeFamilyShowsShapeVariants(
  family: SelectionStrokeFamily
): boolean {
  return family !== 'fill' && family !== 'spray';
}

export function strokeModeToSelectionStrokeFamily(mode: StrokeMode): SelectionStrokeFamily {
  return STROKE_TO_FAMILY[mode];
}

export function defaultStrokeModeForSelectionStrokeFamily(
  family: SelectionStrokeFamily
): StrokeMode {
  return FAMILY_DEFAULT_STROKE[family];
}

export function isStrokeModeInSelectionStrokeFamily(
  mode: StrokeMode,
  family: SelectionStrokeFamily
): boolean {
  return STROKE_TO_FAMILY[mode] === family;
}

/** X/Y/Z/Auto plane controls (sidebar + tool panel). */
export function strokeModeUsesPlaneAxis(mode: StrokeMode): boolean {
  return (
    mode === 'plane' ||
    mode === 'circle' ||
    mode === 'cuboid' ||
    mode === 'cylinder'
  );
}

/** Polygon offset-from-normal slider (surface hull and solid outline). */
export function strokeModeUsesPolygonOffset(mode: StrokeMode): boolean {
  return mode === 'polygonHull' || mode === 'polygon';
}

/** Hollow + wall thickness for plane/cuboid/cylinder (not polygon hull fill). */
export function strokeModeUsesPlaneCuboidHollowShell(mode: StrokeMode): boolean {
  return (
    mode === 'plane' || mode === 'cuboid' || mode === 'cylinder'
  );
}
