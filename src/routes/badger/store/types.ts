import { MATERIAL_BUILTIN_PALETTE_HEX } from '$lib/materialPalette';

export type Vec2 = { x: number; y: number };

export type PathNodeType = 'line' | 'quad' | 'cubic';

export type PathNode =
  | { type: 'line'; to: Vec2 }
  | { type: 'quad'; control: Vec2; to: Vec2 }
  | { type: 'cubic'; c1: Vec2; c2: Vec2; to: Vec2 };

// Per-anchor node type (Inkscape-style).
//   cusp      — handles move independently
//   smooth    — incoming/outgoing handles stay collinear (lengths independent)
//   symmetric — handles mirror each other through the anchor (same length)
//   auto      — handles are derived from neighboring anchors
export type NodeType = 'cusp' | 'smooth' | 'symmetric' | 'auto';

// Authored path kind. "shape" is the default — it becomes the badge silhouette
// when closed, or a metal wall (divider) when left open. "cutout" is always a
// hole through the metal (and only makes sense on a closed path). The full
// topological distinction (outline/divider/cutout) is derived from kind+closed
// at the topology layer; see `effectiveKind` in topology/planar.ts.
//
// `nodeTypes` is indexed per-anchor: [0] is the start anchor, [i+1] is
// nodes[i].to. Optional for backwards compat — missing entries are treated as
// 'cusp' at runtime.
export type BadgePath = {
  id: string;
  kind: 'shape' | 'cutout';
  closed: boolean;
  start: Vec2;
  nodes: PathNode[];
  strokeWidth: number; // mm
  nodeTypes?: NodeType[];
};

// A text element lives in the metal layer alongside paths. At topology/mesh
// time it is expanded into BadgePaths: 'filled' renders each glyph contour
// as a closed shape path (solid extruded letters, colorable as cells);
// 'outline' renders each contour as a thickened open stroke (hollow letter
// outlines). The expansion is deterministic and derived from (text, font,
// sizeMm, position, mode, strokeWidth) — the expansion itself is not stored.
export type TextMode = 'filled' | 'outline';
export type BadgeText = {
  id: string;
  text: string;
  // Font identity used to look up the font blob from the fontLibrary store
  // (system font postscriptName, or uploaded font's stored id). Rendering
  // falls back to showing nothing when the font isn't available.
  fontId: string;
  // Human-readable label kept alongside fontId so the UI can display
  // something useful even when the font blob hasn't been restored yet
  // (system fonts don't persist across reloads on non-Chromium browsers).
  fontLabel: string;
  sizeMm: number; // cap-height in mm (opentype em-units scaled)
  position: Vec2; // anchor position — top-left of the em box
  mode: TextMode;
  // Only meaningful in outline mode. Width of the thickened stroke that
  // traces each glyph contour.
  strokeWidth: number; // mm
};

export type CellId = string;

export type Cell = {
  id: CellId;
  polygon: Vec2[];
  // Nested outlines that sit entirely inside this cell's polygon. Each hole is
  // its own cell elsewhere in the topology; storing the loops here lets the
  // fill/pick paths cut them out so a ring can be colored separately from the
  // disc it surrounds.
  holes: Vec2[][];
  area: number;
  centroid: Vec2;
  neighbors: CellId[];
};

export type EnamelFinish = 'soft' | 'hard';
// Per-cell enamel surface material. Orthogonal to the pin-wide EnamelFinish
// (soft/hard controls geometry — meniscus dip vs flat cap); EnamelMaterial
// controls the shader applied to the cell. 'plain' is the legacy default for
// any cell without an explicit assignment.
export type EnamelMaterial = 'plain' | 'glitter' | 'metallic';
export type MetalFinish =
  | 'gold'
  | 'silver'
  | 'black_nickel'
  | 'copper'
  | 'iron'
  | 'rose_gold'
  | 'bronze'
  | 'brass';
export type MetalSurface = 'polished' | 'matte';

// All spatial values in a BadgeDocument are stored in millimeters. Real enamel
// pins are physical objects, so the document is the source of truth in real
// units; UI may display mm or inches based on user preference.
export type BadgeDocument = {
  canvas: {
    width: number; // mm
    height: number; // mm
  };
  metal: {
    paths: BadgePath[];
    texts: BadgeText[];
    baseThickness: number; // mm
    wallHeight: number; // mm
    bevelRadius: number; // mm
    minWallWidth: number; // mm
  };
  colorAssignments: Record<CellId, string>;
  // Sparse: cells without an entry render as 'plain'. Stored this way so
  // legacy documents (saved before per-cell materials existed) round-trip
  // unchanged and existing all-plain badges don't bloat the autosave.
  materialAssignments: Record<CellId, EnamelMaterial>;
  palette: string[];
  render: {
    finish: MetalFinish;
    metalSurface: MetalSurface;
    enamelFinish: EnamelFinish;
    background: string;
  };
};

export type Mode = 'metal' | 'colors' | 'render';

export type MetalTool =
  | 'select'
  | 'grab'
  | 'pen'
  | 'pencil'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'trim'
  | 'text';
export type RectCornerStyle = 'sharp' | 'round' | 'squircle';
export type PolygonCornerStyle = 'sharp' | 'round';
export type PathKind = BadgePath['kind'];
export type ColorsTool = 'fill' | 'eyedropper';

export type ModalRequest =
  | 'newBadge'
  | 'help'
  | 'startup'
  | 'exportPng'
  | 'exportSvg'
  | 'exportGlb'
  | 'exportTextures'
  | 'share'
  | 'options'
  | null;

export function cloneDoc(doc: BadgeDocument): BadgeDocument {
  return structuredClone(doc);
}

// Typical enamel pin: ~30mm across, ~1.6mm metal base, ~1.2mm wall height,
// ~1mm min wall. Defaults aim at a plausible manufacturable starting point.
export function emptyDocument(width = 30, height = 30): BadgeDocument {
  return {
    canvas: { width, height },
    metal: {
      paths: [],
      texts: [],
      baseThickness: 0.5,
      wallHeight: 1.2,
      bevelRadius: 0.2,
      minWallWidth: 0.2
    },
    colorAssignments: {},
    materialAssignments: {},
    palette: [...MATERIAL_BUILTIN_PALETTE_HEX],
    render: {
      finish: 'gold',
      metalSurface: 'polished',
      enamelFinish: 'soft',
      background: '#262626'
    }
  };
}
