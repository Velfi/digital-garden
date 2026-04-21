// Glue layer used by the node-tool toolbar (sidebar/NodeToolbar.svelte) and
// the keyboard shortcut handler in MetalCanvas. Each action resolves the
// current selection from the stores and funnels a single history-tracked
// mutation through updateDocument.

import { get } from 'svelte/store';
import {
  document as docStore,
  selectedPathIds,
  selectedHandles,
  updateDocument
} from './store';
import type { BadgePath, NodeType } from './store/types';
import {
  type HandleId,
  type EndpointRef,
  anchorCount,
  applyAutoAt,
  deleteNode,
  deleteSegment,
  ensureCubicNode,
  mergeEndpoints,
  retractHandle,
  setNodeType,
  splitAtAnchor,
  splitSegmentAt,
  joinWithSegment
} from './pathEdit';

function newId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

function parseHandleKey(k: string): { pathId: string; handle: HandleId } | null {
  const lastColon = k.lastIndexOf(':');
  if (lastColon < 0) return null;
  const secondLast = k.lastIndexOf(':', lastColon - 1);
  if (secondLast < 0) return null;
  const pathId = k.slice(0, secondLast);
  const kind = k.slice(secondLast + 1, lastColon) as HandleId['kind'];
  const idx = Number(k.slice(lastColon + 1));
  if (!Number.isFinite(idx)) return null;
  if (kind === 'start') return { pathId, handle: { kind: 'start' } };
  if (kind === 'node' || kind === 'in' || kind === 'out') {
    return { pathId, handle: { kind, i: idx } };
  }
  return null;
}

// Returns the single selected path or null when exactly one isn't selected.
export function getSingleSelectedPath(): BadgePath | null {
  const ids = get(selectedPathIds);
  if (ids.size !== 1) return null;
  const id = [...ids][0];
  return get(docStore).metal.paths.find((p) => p.id === id) ?? null;
}

// Anchor indices of every selected handle on `path`. Handle-level selection
// is the vocabulary the toolbar speaks in — node-type and insert act on
// anchors, segment-type and insert act on segments (pairs of consecutive
// selected anchors).
export function selectedAnchorsFor(path: BadgePath): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const k of get(selectedHandles)) {
    const parsed = parseHandleKey(k);
    if (!parsed || parsed.pathId !== path.id) continue;
    let idx: number | null = null;
    if (parsed.handle.kind === 'start') idx = 0;
    else if (parsed.handle.kind === 'node') idx = parsed.handle.i + 1;
    if (idx == null || seen.has(idx)) continue;
    seen.add(idx);
    out.push(idx);
  }
  out.sort((a, b) => a - b);
  return out;
}

// Segment indices where both endpoint anchors are in `anchors`.
export function selectedSegmentsFrom(anchors: number[]): number[] {
  const segs: number[] = [];
  for (let k = 0; k < anchors.length - 1; k++) {
    if (anchors[k + 1] === anchors[k] + 1) segs.push(anchors[k]);
  }
  return segs;
}

// The common NodeType across every selected anchor, or null when the
// selection is empty or mixed. Used by the toolbar to highlight the
// segmented control when all selected anchors agree.
export function commonNodeType(path: BadgePath, anchors: number[]): NodeType | null {
  if (anchors.length === 0) return null;
  const first = path.nodeTypes?.[anchors[0]] ?? 'cusp';
  for (let k = 1; k < anchors.length; k++) {
    const t = path.nodeTypes?.[anchors[k]] ?? 'cusp';
    if (t !== first) return null;
  }
  return first;
}

// ----- toolbar actions -----

export function setNodeTypeForSelection(type: NodeType) {
  const sel = getSingleSelectedPath();
  if (!sel) return;
  const anchors = selectedAnchorsFor(sel);
  if (anchors.length === 0) return;
  updateDocument((d) => {
    const path = d.metal.paths.find((p) => p.id === sel.id);
    if (!path) return;
    for (const a of anchors) setNodeType(path, a, type);
    if (type === 'auto') for (const a of anchors) applyAutoAt(path, a);
  });
}

// Make each selected segment a line or a cubic curve.
export function setSegmentType(kind: 'line' | 'curve') {
  const sel = getSingleSelectedPath();
  if (!sel) return;
  const anchors = selectedAnchorsFor(sel);
  const segs = selectedSegmentsFrom(anchors);
  if (segs.length === 0) return;
  updateDocument((d) => {
    const path = d.metal.paths.find((p) => p.id === sel.id);
    if (!path) return;
    for (const i of segs) {
      if (kind === 'line') {
        path.nodes[i] = { type: 'line', to: { ...path.nodes[i].to } };
      } else {
        ensureCubicNode(path, i);
      }
    }
  });
}

// Insert a node at the midpoint of every selected segment.
export function insertNode() {
  const sel = getSingleSelectedPath();
  if (!sel) return;
  const anchors = selectedAnchorsFor(sel);
  const segs = selectedSegmentsFrom(anchors);
  if (segs.length === 0) return;
  updateDocument((d) => {
    const path = d.metal.paths.find((p) => p.id === sel.id);
    if (!path) return;
    for (const i of segs.slice().sort((a, b) => b - a)) splitSegmentAt(path, i, 0.5);
  });
}

// Delete every selected anchor (preserving the path otherwise). Also
// "demotes" selected control handles to quads/lines, matching the canvas's
// Delete-key behavior.
export function deleteSelectedNodes() {
  const sel = getSingleSelectedPath();
  if (!sel) return;
  const keys = get(selectedHandles);
  if (keys.size === 0) return;
  updateDocument((d) => {
    type Op =
      | { kind: 'deleteNode'; i: number }
      | { kind: 'deleteStart' }
      | { kind: 'demoteIn'; i: number }
      | { kind: 'demoteOut'; i: number };
    const ops: Op[] = [];
    for (const k of keys) {
      const parsed = parseHandleKey(k);
      if (!parsed || parsed.pathId !== sel.id) continue;
      const h = parsed.handle;
      if (h.kind === 'start') ops.push({ kind: 'deleteStart' });
      else if (h.kind === 'node') ops.push({ kind: 'deleteNode', i: h.i });
      else if (h.kind === 'in') ops.push({ kind: 'demoteIn', i: h.i });
      else ops.push({ kind: 'demoteOut', i: h.i });
    }
    const path = d.metal.paths.find((p) => p.id === sel.id);
    if (!path) return;
    for (const op of ops) {
      if (op.kind === 'demoteIn' || op.kind === 'demoteOut') {
        const i = op.i;
        const node = path.nodes[i];
        if (!node) continue;
        if (node.type === 'cubic') {
          const inRemoved = ops.some((o) => o.kind === 'demoteIn' && o.i === i);
          const outRemoved = ops.some((o) => o.kind === 'demoteOut' && o.i === i);
          if (inRemoved && outRemoved) {
            path.nodes[i] = { type: 'line', to: node.to };
          } else if (inRemoved) {
            path.nodes[i] = { type: 'quad', control: { ...node.c1 }, to: node.to };
          } else {
            path.nodes[i] = { type: 'quad', control: { ...node.c2 }, to: node.to };
          }
        } else if (node.type === 'quad') {
          path.nodes[i] = { type: 'line', to: node.to };
        }
      }
    }
    const nodeDeletes = ops
      .filter((o): o is { kind: 'deleteNode'; i: number } => o.kind === 'deleteNode')
      .map((o) => o.i)
      .sort((a, b) => b - a);
    for (const i of nodeDeletes) deleteNode(path, i);
    if (ops.some((o) => o.kind === 'deleteStart') && path.nodes.length > 0) {
      const n0 = path.nodes[0];
      path.start = { ...n0.to };
      path.nodes.splice(0, 1);
      if (path.nodeTypes) path.nodeTypes.splice(0, 1);
    }
    d.metal.paths = d.metal.paths.filter((p) => p.nodes.length > 0);
  });
  selectedHandles.set(new Set());
}

// Break a path at a single selected anchor.
export function breakAtSelected() {
  const sel = getSingleSelectedPath();
  if (!sel) return;
  const anchors = selectedAnchorsFor(sel);
  if (anchors.length !== 1) return;
  const anchorIdx = anchors[0];
  updateDocument((d) => {
    const idx = d.metal.paths.findIndex((p) => p.id === sel.id);
    if (idx < 0) return;
    const replacements = splitAtAnchor(d.metal.paths[idx], anchorIdx, newId);
    d.metal.paths.splice(idx, 1, ...replacements);
  });
  selectedHandles.set(new Set());
}

// Collect endpoint refs from the current handle selection. Only endpoints of
// open paths qualify.
function collectSelectedEndpoints(): EndpointRef[] {
  const out: EndpointRef[] = [];
  const doc = get(docStore);
  for (const k of get(selectedHandles)) {
    const parsed = parseHandleKey(k);
    if (!parsed) continue;
    const path = doc.metal.paths.find((p) => p.id === parsed.pathId);
    if (!path || path.closed) continue;
    if (parsed.handle.kind === 'start') {
      out.push({ pathId: parsed.pathId, endpoint: 'start' });
    } else if (
      parsed.handle.kind === 'node' &&
      parsed.handle.i === path.nodes.length - 1
    ) {
      out.push({ pathId: parsed.pathId, endpoint: 'end' });
    }
  }
  return out;
}

export function joinSelectedEndpoints() {
  const endpoints = collectSelectedEndpoints();
  if (endpoints.length !== 2) return;
  updateDocument((d) => {
    mergeEndpoints(d.metal.paths, endpoints[0], endpoints[1]);
  });
  selectedHandles.set(new Set());
}

export function joinSelectedWithSegment() {
  const endpoints = collectSelectedEndpoints();
  if (endpoints.length !== 2) return;
  updateDocument((d) => {
    joinWithSegment(d.metal.paths, endpoints[0], endpoints[1]);
  });
  selectedHandles.set(new Set());
}

// Delete every selected segment.
export function deleteSelectedSegments() {
  const sel = getSingleSelectedPath();
  if (!sel) return;
  const anchors = selectedAnchorsFor(sel);
  const segs = selectedSegmentsFrom(anchors);
  if (segs.length === 0) return;
  updateDocument((d) => {
    const idx = d.metal.paths.findIndex((p) => p.id === sel.id);
    if (idx < 0) return;
    // Delete high-to-low so indices stay valid on open paths. For closed
    // paths, only the first deletion is meaningful (path opens); the rest
    // are applied to the opened result.
    let currentPaths = [d.metal.paths[idx]];
    for (const segIdx of segs.slice().sort((a, b) => b - a)) {
      const target = currentPaths[0];
      if (!target) break;
      currentPaths = deleteSegment(target, segIdx, newId);
    }
    d.metal.paths.splice(idx, 1, ...currentPaths);
  });
  selectedHandles.set(new Set());
}

// Retract both handles at selected anchors (Inkscape "delete handles").
export function retractSelectedHandles() {
  const sel = getSingleSelectedPath();
  if (!sel) return;
  const keys = get(selectedHandles);
  updateDocument((d) => {
    const path = d.metal.paths.find((p) => p.id === sel.id);
    if (!path) return;
    // If controls are selected, retract those. If only anchors are selected,
    // retract both sides of each anchor (in + out on their respective segs).
    const anchorSides: Array<{ segIdx: number; side: 'in' | 'out' }> = [];
    for (const k of keys) {
      const parsed = parseHandleKey(k);
      if (!parsed || parsed.pathId !== sel.id) continue;
      const h = parsed.handle;
      if (h.kind === 'in' || h.kind === 'out') {
        retractHandle(path, h);
      } else if (h.kind === 'node') {
        // The anchor is nodes[h.i].to. Its outgoing side lives on nodes[h.i+1],
        // its incoming side on nodes[h.i].
        anchorSides.push({ segIdx: h.i, side: 'in' });
        if (h.i + 1 < path.nodes.length) {
          anchorSides.push({ segIdx: h.i + 1, side: 'out' });
        } else if (path.closed) {
          // wraps to nodes[0]
          anchorSides.push({ segIdx: 0, side: 'out' });
        }
      } else if (h.kind === 'start') {
        if (path.nodes[0]) anchorSides.push({ segIdx: 0, side: 'out' });
        if (path.closed && path.nodes.length > 0) {
          anchorSides.push({ segIdx: path.nodes.length - 1, side: 'in' });
        }
      }
    }
    for (const s of anchorSides) {
      retractHandle(path, { kind: s.side, i: s.segIdx });
    }
  });
}

