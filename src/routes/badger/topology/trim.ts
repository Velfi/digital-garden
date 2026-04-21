import type { BadgePath, PathNode, Vec2 } from '../store/types';
import { EPS, flattenPath, segSegIntersect, vDist } from './geometry';

// Cursor distance below which a trim hover snaps to a path. Same threshold
// as the select tool's pickPath, modulated by the path's stroke width.
const HOVER_PX = 6;

// A "span" is a maximal sub-polyline of a path bounded by intersection
// points with any other path (or self-intersections of this path). Trim
// deletes one span at a time. For an open path with no intersections,
// the whole polyline is one span and trim deletes the entire path.
//
// Spans are indexed 0..N-1 along the path's flattened polyline.
export type TrimSpan = {
  pathId: string;
  spanIdx: number;
  // Polyline points of the span itself (start..end inclusive). Used for
  // highlighting and for re-encoding the path after deletion.
  points: Vec2[];
};

export type TrimSpansResult = {
  // The flattened polyline of the path (closed paths repeat the first
  // point at the end as flattenPath already does).
  polyline: Vec2[];
  // Sorted-along-path cut positions: { segIdx, t }, with intersection
  // points spliced in. Spans are the runs between consecutive cuts; for
  // an open path with K cuts there are K+1 spans, for a closed path K.
  spans: Vec2[][];
};

// Compute the spans of `targetPath` given all paths in the document.
// Other paths and self-intersections both count.
export function computeTrimSpans(
  targetPath: BadgePath,
  allPaths: BadgePath[]
): TrimSpansResult {
  const target = flattenPath(targetPath);
  if (target.length < 2) return { polyline: target, spans: [target] };

  // Cuts along the target polyline: each is a (segIdx, t) parameter where
  // segIdx is the index of the segment [target[i], target[i+1]].
  type Cut = { segIdx: number; t: number; point: Vec2 };
  const cuts: Cut[] = [];

  const otherPolylines: Vec2[][] = [];
  for (const p of allPaths) {
    if (p.id === targetPath.id) continue;
    const flat = flattenPath(p);
    if (flat.length >= 2) otherPolylines.push(flat);
  }

  for (let i = 0; i < target.length - 1; i++) {
    const a = target[i];
    const b = target[i + 1];

    // Crossings against every other path's polyline.
    for (const other of otherPolylines) {
      for (let j = 0; j < other.length - 1; j++) {
        const hit = segSegIntersect(a, b, other[j], other[j + 1]);
        if (!hit) continue;
        if (hit.t < EPS || hit.t > 1 - EPS) continue;
        cuts.push({ segIdx: i, t: hit.t, point: hit.point });
      }
    }

    // Self-intersections: only test against later non-adjacent segments
    // to avoid duplicates and false hits at shared vertices.
    for (let j = i + 2; j < target.length - 1; j++) {
      const c = target[j];
      const d = target[j + 1];
      const hit = segSegIntersect(a, b, c, d);
      if (!hit) continue;
      if (hit.t < EPS || hit.t > 1 - EPS) continue;
      // Both segments get a cut at this intersection.
      cuts.push({ segIdx: i, t: hit.t, point: hit.point });
      // The other segment's parameter for this same intersection.
      const u = segSegIntersect(c, d, a, b)?.t ?? 0;
      cuts.push({ segIdx: j, t: u, point: hit.point });
    }
  }

  // Sort cuts in walk order along the target polyline.
  cuts.sort((x, y) => x.segIdx - y.segIdx || x.t - y.t);

  // Build spans by walking the polyline, inserting cut points as vertices.
  if (cuts.length === 0) {
    return { polyline: target, spans: [target.map((p) => ({ ...p }))] };
  }

  const spans: Vec2[][] = [];
  let current: Vec2[] = [{ ...target[0] }];
  let cursor = 0;

  for (let i = 0; i < target.length - 1; i++) {
    while (cursor < cuts.length && cuts[cursor].segIdx === i) {
      const cut = cuts[cursor];
      current.push({ ...cut.point });
      spans.push(current);
      current = [{ ...cut.point }];
      cursor++;
    }
    current.push({ ...target[i + 1] });
  }
  spans.push(current);

  // For a closed path the first and last spans are actually one span that
  // wraps the seam — merge them. flattenPath repeats the first point at
  // the end for closed paths, so the last span ends where the first began.
  if (targetPath.closed && spans.length >= 2) {
    const first = spans[0];
    const last = spans[spans.length - 1];
    if (vDist(first[0], last[last.length - 1]) < EPS) {
      const merged = [...last.slice(0, -1), ...first];
      spans[0] = merged;
      spans.pop();
    }
  }

  return { polyline: target, spans };
}

// Find the closest point on a polyline to `p`. Returns null if no segment
// is within `maxDist`. Returns the matched span index when given spans.
export function pickTrimSpan(
  cursor: Vec2,
  targetPath: BadgePath,
  spans: Vec2[][],
  maxDist: number
): TrimSpan | null {
  let bestSpanIdx = -1;
  let bestDist = maxDist;
  for (let s = 0; s < spans.length; s++) {
    const span = spans[s];
    for (let i = 0; i < span.length - 1; i++) {
      const d = distToSegment(cursor, span[i], span[i + 1]);
      if (d < bestDist) {
        bestDist = d;
        bestSpanIdx = s;
      }
    }
  }
  if (bestSpanIdx < 0) return null;
  return {
    pathId: targetPath.id,
    spanIdx: bestSpanIdx,
    points: spans[bestSpanIdx].map((p) => ({ ...p }))
  };
}

// Find the path under the cursor and the trim span on it that's hovered.
// Mirrors MetalCanvas.pickPath but returns the matched span too.
export function findHoveredTrimSpan(
  cursor: Vec2,
  paths: BadgePath[],
  scale: number
): { path: BadgePath; result: TrimSpansResult; span: TrimSpan } | null {
  // Walk top-most first (matches pickPath ordering).
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    const result = computeTrimSpans(path, paths);
    const maxDist = HOVER_PX / scale + path.strokeWidth / 2;
    const span = pickTrimSpan(cursor, path, result.spans, maxDist);
    if (span) return { path, result, span };
  }
  return null;
}

// Apply the trim deletion. Returns the replacement paths for `original`
// (zero, one, or two paths). If the deleted span was the only span in an
// open path, returns []. For closed paths, deleting a span opens the path
// into a single remainder; for open paths, deleting a middle span splits
// it into two.
export function applyTrimDeletion(
  original: BadgePath,
  spans: Vec2[][],
  deletedIdx: number
): BadgePath[] {
  if (spans.length <= 1) return [];

  if (original.closed) {
    // Splice out the deleted span and concatenate the remaining spans
    // in order — they form a single open polyline because the closed
    // loop has been broken at the deletion site.
    const rest: Vec2[] = [];
    for (let i = 0; i < spans.length; i++) {
      if (i === deletedIdx) continue;
      const s = spans[i];
      if (rest.length === 0) rest.push(...s.map((p) => ({ ...p })));
      else {
        // Each subsequent span starts at the last vertex of the previous
        // span (sharing a cut point) — skip the duplicate.
        rest.push(...s.slice(1).map((p) => ({ ...p })));
      }
    }
    return rest.length >= 2 ? [polylineToPath(rest, original, 0, false)] : [];
  }

  // Open path: contiguous remainder before the deleted span (concat of
  // spans 0..deletedIdx-1) and after (deletedIdx+1..end). Cut points are
  // shared between adjacent spans, so dedupe at the joins.
  const before: Vec2[] = [];
  for (let i = 0; i < deletedIdx; i++) {
    const s = spans[i];
    if (before.length === 0) before.push(...s.map((p) => ({ ...p })));
    else before.push(...s.slice(1).map((p) => ({ ...p })));
  }
  const after: Vec2[] = [];
  for (let i = deletedIdx + 1; i < spans.length; i++) {
    const s = spans[i];
    if (after.length === 0) after.push(...s.map((p) => ({ ...p })));
    else after.push(...s.slice(1).map((p) => ({ ...p })));
  }

  const out: BadgePath[] = [];
  if (before.length >= 2) out.push(polylineToPath(before, original, 0, false));
  if (after.length >= 2) out.push(polylineToPath(after, original, out.length, false));
  return out;
}

function polylineToPath(
  pts: Vec2[],
  original: BadgePath,
  suffixIdx: number,
  closed: boolean
): BadgePath {
  const nodes: PathNode[] = [];
  for (let i = 1; i < pts.length; i++) {
    nodes.push({ type: 'line', to: { ...pts[i] } });
  }
  return {
    id: suffixIdx === 0 ? original.id : `${original.id}-trim${suffixIdx}`,
    kind: original.kind,
    closed,
    start: { ...pts[0] },
    nodes,
    strokeWidth: original.strokeWidth
  };
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return vDist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return vDist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
