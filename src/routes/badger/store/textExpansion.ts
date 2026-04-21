// Expand a BadgeText into a list of BadgePaths. Text elements are authored as
// (text, font, size, position, mode) but all downstream systems — topology,
// mesh, SVG export, canvas rendering — operate on BadgePaths. Expansion
// happens each time the document is read for those systems, so editing text
// props re-emits fresh paths without mutating stored state.
//
// Filled mode: each glyph contour becomes a closed shape path. Counter-
// clockwise contours (the letter body) render as the silhouette; clockwise
// contours (the counter inside 'O', 'A', etc.) become cutouts so they punch
// through the filled letter. Signed area determines winding.
//
// Outline mode: each glyph contour becomes a pair of closed shape paths —
// the original glyph inflated outward by strokeWidth/2 as a shape, and the
// glyph inset inward by strokeWidth/2 as a cutout. The difference is a
// ribbon tracing the glyph edge. Using the existing shape+cutout primitives
// avoids any seam/open-path heuristics and gives the mesh pipeline geometry
// identical in kind to hand-drawn hollow rings.
//
// Coordinates: opentype.js draws with Y pointing down in screen space (same
// as SVG), which matches badger's world space directly, so no axis flip.

import type opentype from 'opentype.js';
import type { BadgePath, BadgeText, PathNode, Vec2 } from './types';

// Mitred polygon offset. Positive `amount` shrinks (inset), negative grows
// (inflate). Returns [] if a positive inset collapses the polygon. Matches
// the behavior of geometry/buildBadgeMeshData.ts:insetPolygon; duplicated
// here to avoid a circular import between buildBadgeMeshData (which imports
// effectiveMetalPaths, which imports this file) and this expansion module.
function polygonSignedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function offsetPolygon(poly: Vec2[], amount: number): Vec2[] {
  if (poly.length < 3 || amount === 0) return [...poly];
  const n = poly.length;
  const ccw = polygonSignedArea(poly) > 0;
  const src = ccw ? poly : [...poly].reverse();
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n];
    const cur = src[i];
    const next = src[(i + 1) % n];
    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    const L1 = Math.hypot(d1x, d1y) || 1;
    const L2 = Math.hypot(d2x, d2y) || 1;
    const n1 = { x: d1y / L1, y: -d1x / L1 };
    const n2 = { x: d2y / L2, y: -d2x / L2 };
    const nx = n1.x + n2.x;
    const ny = n1.y + n2.y;
    const L = Math.hypot(nx, ny) || 1;
    const sx = nx / L;
    const sy = ny / L;
    const dot = n1.x * sx + n1.y * sy || 1;
    const scale = Math.min(4, 1 / Math.max(0.25, dot));
    out.push({ x: cur.x - sx * amount * scale, y: cur.y - sy * amount * scale });
  }
  if (amount > 0) {
    let a = 0;
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      const q = out[(i + 1) % out.length];
      a += p.x * q.y - q.x * p.y;
    }
    if (Math.abs(a / 2) < 0.01) return [];
  }
  return ccw ? out : out.reverse();
}

function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

type Contour = {
  start: Vec2;
  nodes: PathNode[];
  // Sampled flat polygon used only for winding detection — not emitted.
  flat: Vec2[];
};

function sampleCubic(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, out: Vec2[]): void {
  const STEPS = 8;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y
    });
  }
}

function sampleQuad(p0: Vec2, c: Vec2, p2: Vec2, out: Vec2[]): void {
  const STEPS = 6;
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y
    });
  }
}

// Walk an opentype.js Path and split it into contours (one per M...Z subpath).
// Line/Quad/Cubic commands translate 1:1 to PathNode types.
function extractContours(path: opentype.Path): Contour[] {
  const contours: Contour[] = [];
  let current: Contour | null = null;
  let pen: Vec2 = { x: 0, y: 0 };
  let contourStart: Vec2 = { x: 0, y: 0 };

  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      if (current && current.nodes.length > 0) contours.push(current);
      contourStart = { x: cmd.x, y: cmd.y };
      pen = contourStart;
      current = { start: { ...contourStart }, nodes: [], flat: [{ ...contourStart }] };
    } else if (cmd.type === 'L') {
      const to = { x: cmd.x, y: cmd.y };
      if (!current) {
        current = { start: { ...to }, nodes: [], flat: [{ ...to }] };
        contourStart = { ...to };
      } else {
        current.nodes.push({ type: 'line', to });
        current.flat.push(to);
      }
      pen = to;
    } else if (cmd.type === 'C') {
      const to = { x: cmd.x, y: cmd.y };
      const c1 = { x: cmd.x1, y: cmd.y1 };
      const c2 = { x: cmd.x2, y: cmd.y2 };
      if (current) {
        current.nodes.push({ type: 'cubic', c1, c2, to });
        sampleCubic(pen, c1, c2, to, current.flat);
      }
      pen = to;
    } else if (cmd.type === 'Q') {
      const to = { x: cmd.x, y: cmd.y };
      const c = { x: cmd.x1, y: cmd.y1 };
      if (current) {
        current.nodes.push({ type: 'quad', control: c, to });
        sampleQuad(pen, c, to, current.flat);
      }
      pen = to;
    } else if (cmd.type === 'Z') {
      if (current) {
        // opentype sometimes emits Z without an explicit line-back-to-start.
        // Close the geometry by appending a line to the start if we aren't
        // already there, so downstream code sees a complete loop.
        const last = current.nodes[current.nodes.length - 1];
        const lastPt =
          last && 'to' in last ? last.to : current.start;
        const dx = lastPt.x - current.start.x;
        const dy = lastPt.y - current.start.y;
        if (dx * dx + dy * dy > 1e-6) {
          current.nodes.push({ type: 'line', to: { ...current.start } });
          current.flat.push({ ...current.start });
        }
      }
    }
  }
  if (current && current.nodes.length > 0) contours.push(current);
  return contours;
}

export type TextExpansionInput = {
  text: BadgeText;
  font: opentype.Font;
};

// Produce the BadgePaths that represent a text element at its current props.
// `idPrefix` keeps per-glyph path ids stable across re-expansions (so color
// assignments on filled letters survive editing neighboring letters).
export function expandText(
  input: TextExpansionInput,
  idPrefix: string
): BadgePath[] {
  const { text, font } = input;
  if (!text.text) return [];

  // opentype treats its "fontSize" as the em square height in output units.
  // Our sizeMm is interpreted as that em size; users see "24mm text" and get
  // glyphs whose em box is 24mm tall (actual rendered cap-height is typically
  // ~70% of that, matching how CSS font-size feels).
  const otPath = font.getPath(text.text, text.position.x, text.position.y + text.sizeMm, text.sizeMm);
  const contours = extractContours(otPath);
  if (contours.length === 0) return [];

  // Determine outer vs hole contours via winding. In SVG/opentype space
  // (Y-down), an outer contour is clockwise (positive signed area under
  // Y-down) and a hole is counter-clockwise. We keep it relative: sort by
  // absolute area descending, then tag any contour whose sign differs from
  // the dominant outer sign as a hole.
  const areas = contours.map((c) => signedArea(c.flat));
  // Positive-sign contours are outer in SVG Y-down (CW). Majority vote by area.
  let posArea = 0;
  let negArea = 0;
  for (const a of areas) {
    if (a > 0) posArea += a;
    else negArea += -a;
  }
  const outerSignPositive = posArea >= negArea;

  const paths: BadgePath[] = [];
  for (let i = 0; i < contours.length; i++) {
    const c = contours[i];
    const area = areas[i];
    const isOuter = area === 0 ? true : area > 0 === outerSignPositive;

    if (text.mode === 'filled') {
      paths.push({
        id: `${idPrefix}:${i}`,
        kind: isOuter ? 'shape' : 'cutout',
        closed: true,
        start: c.start,
        nodes: c.nodes,
        strokeWidth: 0.4
      });
    } else {
      // Outline mode: emit a shape+cutout pair straddling the contour so
      // the difference is a ribbon of width = strokeWidth tracing the
      // original glyph edge. Operates on the flattened polygon (we lose
      // bezier fidelity in stored data — acceptable since the offset rings
      // are polylines anyway).
      const halfStroke = Math.max(0.1, text.strokeWidth) / 2;
      // Strip any trailing duplicate start point so the ring is a clean loop.
      const ring = c.flat.slice();
      if (
        ring.length > 1 &&
        Math.abs(ring[0].x - ring[ring.length - 1].x) < 1e-6 &&
        Math.abs(ring[0].y - ring[ring.length - 1].y) < 1e-6
      ) {
        ring.pop();
      }
      if (ring.length < 3) continue;

      // Offset +halfStroke and -halfStroke produce two concentric rings.
      // The one enclosing the larger area is the ribbon's outer boundary
      // (shape); the smaller-area one is the inner boundary (cutout).
      // Works uniformly for outer glyph contours and for hole contours —
      // in both cases the ribbon straddles the original line.
      const a = offsetPolygon(ring, halfStroke);
      const b = offsetPolygon(ring, -halfStroke);
      if (a.length < 3 || b.length < 3) continue;
      const areaA = Math.abs(polygonSignedArea(a));
      const areaB = Math.abs(polygonSignedArea(b));
      const outerRing = areaA >= areaB ? a : b;
      const innerRing = areaA >= areaB ? b : a;

      paths.push({
        id: `${idPrefix}:${i}:o`,
        kind: 'shape',
        closed: true,
        start: outerRing[0],
        nodes: outerRing.slice(1).map((p) => ({ type: 'line', to: p })),
        strokeWidth: 0.4
      });
      paths.push({
        id: `${idPrefix}:${i}:i`,
        kind: 'cutout',
        closed: true,
        start: innerRing[0],
        nodes: innerRing.slice(1).map((p) => ({ type: 'line', to: p })),
        strokeWidth: 0.4
      });
    }
  }
  return paths;
}
