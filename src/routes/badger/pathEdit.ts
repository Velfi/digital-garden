// Node-tool path editing primitives.
//
// These operate on BadgePath in place (the caller passes the path from the
// BadgeDocument to mutate — usually inside an updateDocument callback).
// Kept pure of Svelte/store imports so they can be unit-tested and reused
// from both the canvas and the sidebar toolbar.

import type { BadgePath, NodeType, PathNode, Vec2 } from './store/types';

export type HandleId =
  | { kind: 'start' }
  | { kind: 'node'; i: number }
  | { kind: 'in'; i: number }
  | { kind: 'out'; i: number };

export type EndpointRef = { pathId: string; endpoint: 'start' | 'end' };

export function anchorCount(path: BadgePath): number {
  return path.nodes.length + 1;
}

export function getNodeType(path: BadgePath, anchorIdx: number): NodeType {
  return path.nodeTypes?.[anchorIdx] ?? 'cusp';
}

export function setNodeType(path: BadgePath, anchorIdx: number, type: NodeType) {
  if (anchorIdx < 0 || anchorIdx >= anchorCount(path)) return;
  if (!path.nodeTypes) path.nodeTypes = Array(anchorCount(path)).fill('cusp');
  while (path.nodeTypes.length < anchorCount(path)) path.nodeTypes.push('cusp');
  path.nodeTypes[anchorIdx] = type;
}

export function anchorPos(path: BadgePath, anchorIdx: number): Vec2 {
  return anchorIdx === 0 ? path.start : path.nodes[anchorIdx - 1].to;
}

export function pathAnchorBefore(path: BadgePath, i: number): Vec2 {
  return i === 0 ? path.start : path.nodes[i - 1].to;
}

function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

// Upgrade a line/quad segment at nodes[i] to a cubic with handles matching
// the existing shape.
export function ensureCubicNode(path: BadgePath, i: number) {
  const node = path.nodes[i];
  if (!node || node.type === 'cubic') return;
  const prev = pathAnchorBefore(path, i);
  if (node.type === 'line') {
    const c1 = lerp(prev, node.to, 1 / 3);
    const c2 = lerp(prev, node.to, 2 / 3);
    path.nodes[i] = { type: 'cubic', c1, c2, to: node.to };
  } else {
    const c = node.control;
    const c1 = { x: prev.x + (2 / 3) * (c.x - prev.x), y: prev.y + (2 / 3) * (c.y - prev.y) };
    const c2 = {
      x: node.to.x + (2 / 3) * (c.x - node.to.x),
      y: node.to.y + (2 / 3) * (c.y - node.to.y)
    };
    path.nodes[i] = { type: 'cubic', c1, c2, to: node.to };
  }
}

// In/out control at an anchor. Returns the Vec2 being aliased by the
// underlying segment (cubic c1/c2, quad control), or null when none.
export function inControlAt(path: BadgePath, anchorIdx: number): Vec2 | null {
  if (anchorIdx === 0) {
    if (!path.closed) return null;
    const last = path.nodes[path.nodes.length - 1];
    if (!last) return null;
    if (last.type === 'cubic') return last.c2;
    if (last.type === 'quad') return last.control;
    return null;
  }
  const node = path.nodes[anchorIdx - 1];
  if (!node) return null;
  if (node.type === 'cubic') return node.c2;
  if (node.type === 'quad') return node.control;
  return null;
}

export function outControlAt(path: BadgePath, anchorIdx: number): Vec2 | null {
  const node = path.nodes[anchorIdx];
  if (!node) return null;
  if (node.type === 'cubic') return node.c1;
  if (node.type === 'quad') return node.control;
  return null;
}

// After a handle moves, enforce the stored node type at its anchor by
// adjusting the paired handle. Quad segments alias their control across
// both sides, so there's nothing to enforce.
export function enforceNodeType(path: BadgePath, anchorIdx: number, moved: 'in' | 'out') {
  const type = getNodeType(path, anchorIdx);
  if (type === 'cusp') return;
  const anchor = anchorPos(path, anchorIdx);
  const inC = inControlAt(path, anchorIdx);
  const outC = outControlAt(path, anchorIdx);
  const inNode = anchorIdx === 0
    ? (path.closed ? path.nodes[path.nodes.length - 1] : null)
    : path.nodes[anchorIdx - 1];
  const outNode = path.nodes[anchorIdx];
  if (inNode?.type === 'quad' || outNode?.type === 'quad') return;
  if (!inC || !outC) return;
  const source = moved === 'in' ? inC : outC;
  const target = moved === 'in' ? outC : inC;
  const dx = source.x - anchor.x;
  const dy = source.y - anchor.y;
  if (type === 'symmetric') {
    target.x = anchor.x - dx;
    target.y = anchor.y - dy;
  } else if (type === 'smooth' || type === 'auto') {
    // Auto degrades to smooth the moment a user moves one side.
    if (type === 'auto') setNodeType(path, anchorIdx, 'smooth');
    const srcLen = Math.hypot(dx, dy);
    if (srcLen < 1e-6) return;
    const tgtLen = Math.hypot(target.x - anchor.x, target.y - anchor.y);
    target.x = anchor.x - (dx / srcLen) * tgtLen;
    target.y = anchor.y - (dy / srcLen) * tgtLen;
  }
}

// Recompute handles around an anchor marked 'auto' — tangent handles along
// the chord between prev and next anchors, each 1/3 of the corresponding
// segment length (Inkscape auto-smooth).
export function applyAutoAt(path: BadgePath, anchorIdx: number) {
  if (getNodeType(path, anchorIdx) !== 'auto') return;
  const n = anchorCount(path);
  const hasPrev = anchorIdx > 0 || path.closed;
  const hasNext = anchorIdx < n - 1 || path.closed;
  if (!hasPrev || !hasNext) return;
  const prevIdx = anchorIdx === 0 ? n - 1 : anchorIdx - 1;
  const nextIdx = anchorIdx === n - 1 ? 0 : anchorIdx + 1;
  const a = anchorPos(path, anchorIdx);
  const prev = anchorPos(path, prevIdx);
  const next = anchorPos(path, nextIdx);
  const tx = next.x - prev.x;
  const ty = next.y - prev.y;
  const tl = Math.hypot(tx, ty);
  if (tl < 1e-6) return;
  const ux = tx / tl;
  const uy = ty / tl;
  const lenIn = Math.hypot(prev.x - a.x, prev.y - a.y) / 3;
  const lenOut = Math.hypot(next.x - a.x, next.y - a.y) / 3;
  const prevSegIdx = anchorIdx === 0 ? n - 2 : anchorIdx - 1;
  if (path.nodes[prevSegIdx]) {
    ensureCubicNode(path, prevSegIdx);
    const pn = path.nodes[prevSegIdx];
    if (pn && pn.type === 'cubic') {
      pn.c2.x = a.x - ux * lenIn;
      pn.c2.y = a.y - uy * lenIn;
    }
  }
  if (path.nodes[anchorIdx]) {
    ensureCubicNode(path, anchorIdx);
    const nn = path.nodes[anchorIdx];
    if (nn && nn.type === 'cubic') {
      nn.c1.x = a.x + ux * lenOut;
      nn.c1.y = a.y + uy * lenOut;
    }
  }
}

// Retract one side's control at nodes[i]. Cubic → quad keeping the surviving
// handle; quad → line.
export function retractHandle(path: BadgePath, h: HandleId) {
  if (h.kind !== 'in' && h.kind !== 'out') return;
  const node = path.nodes[h.i];
  if (!node) return;
  if (node.type === 'cubic') {
    if (h.kind === 'in') {
      path.nodes[h.i] = { type: 'quad', control: { ...node.c1 }, to: node.to };
    } else {
      path.nodes[h.i] = { type: 'quad', control: { ...node.c2 }, to: node.to };
    }
  } else if (node.type === 'quad') {
    path.nodes[h.i] = { type: 'line', to: node.to };
  }
}

export function deleteNode(path: BadgePath, i: number) {
  if (path.nodes.length <= 1) return;
  path.nodes.splice(i, 1);
  if (path.nodeTypes) path.nodeTypes.splice(i + 1, 1);
}

export function cloneNode(n: PathNode): PathNode {
  if (n.type === 'line') return { type: 'line', to: { ...n.to } };
  if (n.type === 'quad') return { type: 'quad', control: { ...n.control }, to: { ...n.to } };
  return { type: 'cubic', c1: { ...n.c1 }, c2: { ...n.c2 }, to: { ...n.to } };
}

export function cloneNodeWithTo(n: PathNode, to: Vec2): PathNode {
  if (n.type === 'line') return { type: 'line', to: { ...to } };
  if (n.type === 'quad') return { type: 'quad', control: { ...n.control }, to: { ...to } };
  return { type: 'cubic', c1: { ...n.c1 }, c2: { ...n.c2 }, to: { ...to } };
}

export function sampleSegment(path: BadgePath, i: number, t: number): Vec2 {
  const node = path.nodes[i];
  const p0 = pathAnchorBefore(path, i);
  if (node.type === 'line') {
    return { x: p0.x + t * (node.to.x - p0.x), y: p0.y + t * (node.to.y - p0.y) };
  }
  if (node.type === 'quad') {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * node.control.x + t * t * node.to.x,
      y: u * u * p0.y + 2 * u * t * node.control.y + t * t * node.to.y
    };
  }
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * node.c1.x + 3 * u * t * t * node.c2.x + t * t * t * node.to.x,
    y: u * u * u * p0.y + 3 * u * u * t * node.c1.y + 3 * u * t * t * node.c2.y + t * t * t * node.to.y
  };
}

// De Casteljau split at parameter t. Replaces nodes[i] with two segments.
export function splitSegmentAt(path: BadgePath, i: number, t: number) {
  const node = path.nodes[i];
  const p0 = pathAnchorBefore(path, i);
  let left: PathNode;
  let right: PathNode;
  if (node.type === 'line') {
    const mid = { x: p0.x + t * (node.to.x - p0.x), y: p0.y + t * (node.to.y - p0.y) };
    left = { type: 'line', to: mid };
    right = { type: 'line', to: { ...node.to } };
  } else if (node.type === 'quad') {
    const p1 = node.control;
    const p2 = node.to;
    const q0 = lerp(p0, p1, t);
    const q1 = lerp(p1, p2, t);
    const mid = lerp(q0, q1, t);
    left = { type: 'quad', control: { ...q0 }, to: mid };
    right = { type: 'quad', control: { ...q1 }, to: { ...p2 } };
  } else {
    const p1 = node.c1;
    const p2 = node.c2;
    const p3 = node.to;
    const q0 = lerp(p0, p1, t);
    const q1 = lerp(p1, p2, t);
    const q2 = lerp(p2, p3, t);
    const r0 = lerp(q0, q1, t);
    const r1 = lerp(q1, q2, t);
    const mid = lerp(r0, r1, t);
    left = { type: 'cubic', c1: { ...q0 }, c2: { ...r0 }, to: mid };
    right = { type: 'cubic', c1: { ...r1 }, c2: { ...q2 }, to: { ...p3 } };
  }
  path.nodes.splice(i, 1, left, right);
  if (path.nodeTypes) {
    path.nodeTypes.splice(i + 1, 0, 'cusp');
  }
}

// Reshape a segment so its curve passes through `target` at parameter t.
// Upgrades line/quad to cubic as needed; distributes correction to c1/c2.
export function warpSegmentTo(path: BadgePath, i: number, t: number, target: Vec2) {
  const node = path.nodes[i];
  if (!node) return;
  if (node.type === 'line' || node.type === 'quad') ensureCubicNode(path, i);
  const now = path.nodes[i];
  if (now.type !== 'cubic') return;
  const p0 = pathAnchorBefore(path, i);
  const p3 = now.to;
  const u = 1 - t;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b0 = u * u * u;
  const b3 = t * t * t;
  const currentX = b0 * p0.x + b1 * now.c1.x + b2 * now.c2.x + b3 * p3.x;
  const currentY = b0 * p0.y + b1 * now.c1.y + b2 * now.c2.y + b3 * p3.y;
  const dx = target.x - currentX;
  const dy = target.y - currentY;
  const denom = b1 * b1 + b2 * b2;
  if (denom < 1e-9) return;
  const k1 = b1 / denom;
  const k2 = b2 / denom;
  now.c1.x += dx * k1;
  now.c1.y += dy * k1;
  now.c2.x += dx * k2;
  now.c2.y += dy * k2;
}

// Break (split) a path at an anchor. Closed → open at that point; interior
// anchor on an open path → two open paths; endpoint on an open path → no-op.
// Returns 1 or 2 paths; caller is responsible for substituting into paths[].
export function splitAtAnchor(
  path: BadgePath,
  anchorIdx: number,
  newIdFactory: () => string
): BadgePath[] {
  const n = anchorCount(path);
  if (anchorIdx < 0 || anchorIdx >= n) return [path];
  if (path.closed) {
    const opened: BadgePath = {
      ...path,
      id: path.id,
      closed: false,
      start: { ...anchorPos(path, anchorIdx) },
      nodes: [],
      nodeTypes: []
    };
    const ringNodes: PathNode[] = [];
    const ringTypes: NodeType[] = [];
    ringTypes.push(getNodeType(path, anchorIdx));
    for (let k = 0; k < n; k++) {
      const srcSegIdx = (anchorIdx + k) % n;
      const destAnchor = (anchorIdx + k + 1) % n;
      const src = path.nodes[srcSegIdx] ?? null;
      if (src) {
        if (src.type === 'line') {
          ringNodes.push({ type: 'line', to: { ...anchorPos(path, destAnchor) } });
        } else if (src.type === 'quad') {
          ringNodes.push({
            type: 'quad',
            control: { ...src.control },
            to: { ...anchorPos(path, destAnchor) }
          });
        } else {
          ringNodes.push({
            type: 'cubic',
            c1: { ...src.c1 },
            c2: { ...src.c2 },
            to: { ...anchorPos(path, destAnchor) }
          });
        }
      } else {
        ringNodes.push({ type: 'line', to: { ...anchorPos(path, destAnchor) } });
      }
      ringTypes.push(getNodeType(path, destAnchor));
    }
    opened.nodes = ringNodes;
    opened.nodeTypes = ringTypes;
    return [opened];
  }
  if (anchorIdx === 0 || anchorIdx === n - 1) return [path];
  const left: BadgePath = {
    ...path,
    id: newIdFactory(),
    nodes: [],
    nodeTypes: [],
    start: { ...path.start },
    closed: false
  };
  const right: BadgePath = {
    ...path,
    id: newIdFactory(),
    nodes: [],
    nodeTypes: [],
    start: { ...anchorPos(path, anchorIdx) },
    closed: false
  };
  for (let k = 0; k < anchorIdx; k++) left.nodes.push(cloneNode(path.nodes[k]));
  for (let k = anchorIdx; k < path.nodes.length; k++) right.nodes.push(cloneNode(path.nodes[k]));
  if (path.nodeTypes) {
    left.nodeTypes = path.nodeTypes.slice(0, anchorIdx + 1);
    right.nodeTypes = path.nodeTypes.slice(anchorIdx);
  }
  return [left, right];
}

export function reversePath(path: BadgePath): BadgePath {
  const anchors: Vec2[] = [path.start, ...path.nodes.map((n) => n.to)];
  const rev = anchors.slice().reverse();
  const newNodes: PathNode[] = [];
  for (let i = 0; i < path.nodes.length; i++) {
    const origIdx = path.nodes.length - 1 - i;
    const src = path.nodes[origIdx];
    if (src.type === 'line') newNodes.push({ type: 'line', to: { ...rev[i + 1] } });
    else if (src.type === 'quad')
      newNodes.push({ type: 'quad', control: { ...src.control }, to: { ...rev[i + 1] } });
    else newNodes.push({ type: 'cubic', c1: { ...src.c2 }, c2: { ...src.c1 }, to: { ...rev[i + 1] } });
  }
  return {
    ...path,
    start: { ...rev[0] },
    nodes: newNodes,
    nodeTypes: path.nodeTypes ? path.nodeTypes.slice().reverse() : undefined
  };
}

// Merge two endpoint anchors. Same open path → closes it. Two open paths →
// concatenates into one (keeping the first path's id). Returns true if
// merged, false on precondition failure.
export function mergeEndpoints(
  paths: BadgePath[],
  a: EndpointRef,
  b: EndpointRef
): boolean {
  const pa = paths.find((pp) => pp.id === a.pathId);
  const pb = paths.find((pp) => pp.id === b.pathId);
  if (!pa || !pb) return false;
  if (pa.closed || pb.closed) return false;
  if (pa === pb) {
    if (a.endpoint === b.endpoint) return false;
    const endAnchor = pa.nodes[pa.nodes.length - 1]?.to;
    if (!endAnchor) return false;
    const mid = { x: (pa.start.x + endAnchor.x) / 2, y: (pa.start.y + endAnchor.y) / 2 };
    pa.start = { ...mid };
    pa.nodes[pa.nodes.length - 1] = cloneNodeWithTo(pa.nodes[pa.nodes.length - 1], mid);
    pa.closed = true;
    if (pa.nodeTypes) pa.nodeTypes = pa.nodeTypes.slice(0, -1);
    return true;
  }
  const sa = a.endpoint === 'end' ? pa : reversePath(pa);
  const sb = b.endpoint === 'start' ? pb : reversePath(pb);
  const aEnd = sa.nodes[sa.nodes.length - 1]?.to ?? sa.start;
  const bStart = sb.start;
  const mid = { x: (aEnd.x + bStart.x) / 2, y: (aEnd.y + bStart.y) / 2 };
  if (sa.nodes.length > 0) {
    sa.nodes[sa.nodes.length - 1] = cloneNodeWithTo(sa.nodes[sa.nodes.length - 1], mid);
  } else {
    sa.start = { ...mid };
  }
  const dx = mid.x - bStart.x;
  const dy = mid.y - bStart.y;
  const bNodes = sb.nodes.map((n) => cloneNode(n));
  if (bNodes.length > 0) {
    const first = bNodes[0];
    if (first.type === 'quad') {
      first.control.x += dx;
      first.control.y += dy;
    } else if (first.type === 'cubic') {
      first.c1.x += dx;
      first.c1.y += dy;
    }
  }
  const merged: BadgePath = {
    id: pa.id,
    kind: pa.kind,
    closed: false,
    start: { ...sa.start },
    nodes: [...sa.nodes.map((n) => cloneNode(n)), ...bNodes],
    strokeWidth: pa.strokeWidth,
    nodeTypes: [
      ...(sa.nodeTypes ?? Array(sa.nodes.length + 1).fill('cusp' as NodeType)),
      ...((sb.nodeTypes ?? Array(sb.nodes.length + 1).fill('cusp' as NodeType)).slice(1))
    ]
  };
  const idx = paths.findIndex((pp) => pp.id === pa.id);
  paths.splice(idx, 1, merged);
  const idxB = paths.findIndex((pp) => pp.id === pb.id);
  if (idxB >= 0) paths.splice(idxB, 1);
  return true;
}

// Join two endpoint anchors with a straight segment. Unlike mergeEndpoints
// this doesn't collapse them into one — it stitches a new line between them.
// Preconditions: both endpoints of open paths (or the same one). Returns
// true on success. For the same-path case, this closes the path with an
// explicit straight segment rather than coalescing the endpoints.
export function joinWithSegment(
  paths: BadgePath[],
  a: EndpointRef,
  b: EndpointRef
): boolean {
  const pa = paths.find((pp) => pp.id === a.pathId);
  const pb = paths.find((pp) => pp.id === b.pathId);
  if (!pa || !pb) return false;
  if (pa.closed || pb.closed) return false;
  if (pa === pb) {
    if (a.endpoint === b.endpoint) return false;
    // Append a line segment back to start; mark closed.
    pa.nodes.push({ type: 'line', to: { ...pa.start } });
    if (pa.nodeTypes) pa.nodeTypes.push('cusp');
    pa.closed = true;
    // Collapse duplicate endpoint now that it loops.
    if (pa.nodeTypes) pa.nodeTypes = pa.nodeTypes.slice(0, -1);
    // Drop the duplicated to-anchor by turning the last node into the closing
    // node — keep as-is; topology uses closed flag.
    return true;
  }
  const sa = a.endpoint === 'end' ? pa : reversePath(pa);
  const sb = b.endpoint === 'start' ? pb : reversePath(pb);
  // Append a line from sa's end to sb's start, then sb's remaining nodes.
  const merged: BadgePath = {
    id: pa.id,
    kind: pa.kind,
    closed: false,
    start: { ...sa.start },
    nodes: [
      ...sa.nodes.map((n) => cloneNode(n)),
      { type: 'line', to: { ...sb.start } },
      ...sb.nodes.map((n) => cloneNode(n))
    ],
    strokeWidth: pa.strokeWidth,
    nodeTypes: [
      ...(sa.nodeTypes ?? Array(sa.nodes.length + 1).fill('cusp' as NodeType)),
      'cusp',
      ...((sb.nodeTypes ?? Array(sb.nodes.length + 1).fill('cusp' as NodeType)).slice(1))
    ]
  };
  const idx = paths.findIndex((pp) => pp.id === pa.id);
  paths.splice(idx, 1, merged);
  const idxB = paths.findIndex((pp) => pp.id === pb.id);
  if (idxB >= 0) paths.splice(idxB, 1);
  return true;
}

// Delete a segment at nodes[i]. On an open path this can produce one or
// two resulting paths (splitting at the segment). On a closed path, it
// opens the path with endpoints at the segment's two anchors. Returns the
// resulting path(s); caller substitutes into paths[].
export function deleteSegment(
  path: BadgePath,
  i: number,
  newIdFactory: () => string
): BadgePath[] {
  if (i < 0 || i >= path.nodes.length) return [path];
  if (path.closed) {
    // Open at the segment: the segment-after-i becomes the new start, wrap
    // around, and drop the old segment i. Anchor-count decreases by 1 (the
    // two anchors adjacent to segment i become separate endpoints with the
    // segment removed between them).
    const n = anchorCount(path);
    // segment i spans anchors i and i+1 (with i+1 wrapping when i === n-2? no,
    // for closed, segment i connects anchor i to anchor (i+1) mod n, but our
    // representation only has explicit segments 0..nodes.length-1 = n-2, and
    // the close is implicit. So i ∈ [0, nodes.length-1].
    // Start the opened path at anchor i+1 and walk around to anchor i.
    const startAnchor = (i + 1) % n;
    const opened: BadgePath = {
      ...path,
      id: path.id,
      closed: false,
      start: { ...anchorPos(path, startAnchor) },
      nodes: [],
      nodeTypes: []
    };
    const ringTypes: NodeType[] = [getNodeType(path, startAnchor)];
    for (let k = 0; k < n - 1; k++) {
      const srcSegIdx = (startAnchor + k) % n;
      if (srcSegIdx === i) continue; // the deleted segment
      const destAnchor = (startAnchor + k + 1) % n;
      const src = path.nodes[srcSegIdx];
      if (src) {
        if (src.type === 'line') {
          opened.nodes.push({ type: 'line', to: { ...anchorPos(path, destAnchor) } });
        } else if (src.type === 'quad') {
          opened.nodes.push({
            type: 'quad',
            control: { ...src.control },
            to: { ...anchorPos(path, destAnchor) }
          });
        } else {
          opened.nodes.push({
            type: 'cubic',
            c1: { ...src.c1 },
            c2: { ...src.c2 },
            to: { ...anchorPos(path, destAnchor) }
          });
        }
      }
      ringTypes.push(getNodeType(path, destAnchor));
    }
    opened.nodeTypes = ringTypes;
    return [opened];
  }
  // Open path — deleting segment i splits at that gap.
  // segment i connects anchor i to anchor i+1.
  const left: BadgePath = {
    ...path,
    id: path.id,
    closed: false,
    start: { ...path.start },
    nodes: path.nodes.slice(0, i).map(cloneNode),
    nodeTypes: path.nodeTypes ? path.nodeTypes.slice(0, i + 1) : undefined
  };
  const right: BadgePath = {
    ...path,
    id: newIdFactory(),
    closed: false,
    start: { ...anchorPos(path, i + 1) },
    nodes: path.nodes.slice(i + 1).map(cloneNode),
    nodeTypes: path.nodeTypes ? path.nodeTypes.slice(i + 1) : undefined
  };
  const result: BadgePath[] = [];
  // Drop paths with no nodes (pure start-only) — they're degenerate.
  if (left.nodes.length > 0) result.push(left);
  if (right.nodes.length > 0) result.push(right);
  // If both empty (only possible when i=0 and nodes.length=1), return empty.
  return result;
}

// 2D affine transform as a 3x3 matrix stored row-major (last row implicit
// [0, 0, 1]). Applied as [x', y'] = [a c e; b d f] * [x, y, 1].
export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function applyAffine(m: Affine, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

// Build an affine that rotates `rad` radians then scales by (sx, sy) around
// the origin point. Used by the transform handles: pick the pivot (opposite
// handle for scale, bbox center for rotate) and apply a single matrix.
export function affineAround(origin: Vec2, sx: number, sy: number, rad: number): Affine {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // T(origin) * R * S * T(-origin), expanded to skip matrix multiplies.
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const e = origin.x - a * origin.x - c * origin.y;
  const f = origin.y - b * origin.x - d * origin.y;
  return { a, b, c, d, e, f };
}

// Apply an affine transform to every point (start, node anchors, and cubic/
// quad control handles) in the path, in place. Node types and topology are
// unchanged. Scaling with one axis flipped is supported — the resulting
// orientation matches what the user dragged.
export function transformPath(path: BadgePath, m: Affine) {
  path.start = applyAffine(m, path.start);
  for (const n of path.nodes) {
    n.to = applyAffine(m, n.to);
    if (n.type === 'cubic') {
      n.c1 = applyAffine(m, n.c1);
      n.c2 = applyAffine(m, n.c2);
    } else if (n.type === 'quad') {
      n.control = applyAffine(m, n.control);
    }
  }
}

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

// Axis-aligned bounding box over anchors + control handles of one or more
// paths. Uses control points (not flattened curve samples) so the bbox is
// cheap to recompute every frame. The extra slack on curves that bulge past
// their anchor hull is acceptable — the user still gets a stable box that
// contains the shape, and scale/rotate math stays exact because we apply
// the same affine to every stored point.
export function pathPointsBBox(paths: BadgePath[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const push = (p: Vec2) => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };
  for (const path of paths) {
    push(path.start);
    for (const n of path.nodes) {
      push(n.to);
      if (n.type === 'cubic') {
        push(n.c1);
        push(n.c2);
      } else if (n.type === 'quad') {
        push(n.control);
      }
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
