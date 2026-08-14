<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import {
    document as docStore,
    metalTool,
    selectedPathIds,
    selectedHandles,
    cells,
    hoveredCellId,
    showCellBorders,
    showManufacturingWarnings,
    referenceImage,
    referenceOpacity,
    referenceLayer,
    referenceVisible,
    outlineClipD,
    updateDocument,
    activeKind,
    activeStrokeWidth,
    rectCornerStyle,
    rectCornerRadius,
    polygonSides,
    polygonCornerStyle,
    polygonCornerRadius,
    addText,
    selectedTextId,
    activeTextFontId,
    bakedDocument,
    editingTextId,
    editingCaret,
    beginEditingText,
    commitEditingText,
    typeIntoEditingText,
    deleteInEditingText,
    moveEditingCaret,
    deleteText
  } from './store';
  import type { BadgePath, BadgeDocument, Vec2, PathNode, Cell, NodeType } from './store/types';
  import { effectiveMetalPaths } from './store/effectivePaths';
  import { fontLoadTick, getLoadedFont } from './store/fontLibrary';
  import {
    type HandleId,
    type EndpointRef,
    anchorCount,
    pathAnchorBefore,
    getNodeType,
    setNodeType,
    enforceNodeType,
    applyAutoAt,
    ensureCubicNode,
    retractHandle,
    deleteNode,
    sampleSegment,
    splitSegmentAt,
    warpSegmentTo,
    splitAtAnchor,
    mergeEndpoints,
    transformPath,
    affineAround,
    applyAffine,
    IDENTITY,
    pathPointsBBox,
    type Affine,
    type BBox as PathBBox
  } from './pathEdit';
  import {
    flattenPath,
    isEffectivelyClosed,
    poleOfInaccessibility,
    vDist
  } from './topology/geometry';
  import { effectiveKind } from './topology/planar';
  import { fitPencilStroke } from './topology/curveFit';
  import { runChecks, type Warning } from './topology/manufacturing';
  import {
    findHoveredTrimSpan,
    applyTrimDeletion,
    type TrimSpan
  } from './topology/trim';
  import { simplifyPath } from './simplify';
  import { displayUnit, mmToDisplay, unitLabel, snapEnabled } from './store/units';
  import { finishHex } from './exportTextures';

  let viewport: HTMLDivElement | null = $state(null);
  let panX = $state(0);
  let panY = $state(0);
  let scale = $state(1);
  let isPanning = $state(false);
  let spaceHeld = $state(false);
  let panStart: { x: number; y: number; ox: number; oy: number } | null = null;

  // Text-edit caret blink. Toggled every 530ms — the CSS caret cadence — and
  // reset to visible whenever the caret position or content changes so the
  // user sees immediate feedback when typing (no mid-blink "where did it
  // go?" confusion). The interval runs only while editing to avoid wasted
  // ticks the rest of the time.
  let caretBlinkOn = $state(true);
  $effect(() => {
    if (!$editingTextId) {
      caretBlinkOn = true;
      return;
    }
    // Reset on any change — caret index, content length, font, size.
    void $editingCaret;
    void $docStore;
    caretBlinkOn = true;
    const iv = window.setInterval(() => {
      caretBlinkOn = !caretBlinkOn;
    }, 530);
    return () => window.clearInterval(iv);
  });

  // Authored paths + text-expanded paths. Used by the render loop so text
  // elements appear alongside hand-drawn paths. Picking/selection stick to
  // authored paths only — text is edited via its own sidebar section.
  let renderedPaths = $derived((() => {
    void $fontLoadTick;
    return effectiveMetalPaths($docStore);
  })());

  // pen draft (in-progress path)
  let draftPath: BadgePath | null = $state(null);
  // when the user drags on the pen tool, we remember the click point and the
  // *outgoing* control handle for the NEXT segment (mirror of dragged point).
  let pendingOutHandle: Vec2 | null = $state(null);
  // drag state for pen curve: is the user pressing-and-dragging right now?
  let penDown: { anchor: Vec2; current: Vec2; isFirst: boolean } | null = $state(null);

  // shape tool drag state
  let dragStart: Vec2 | null = $state(null);
  let dragCurrent: Vec2 | null = $state(null);
  let dragTool: string | null = $state(null);
  // Ctrl/Cmd held during a shape drag. For ellipse/polygon it constrains the
  // endpoint so width equals height; for line it snaps the angle to 15°
  // increments. Re-evaluated on every pointer event while dragging.
  let dragConstrain: boolean = $state(false);
  let hoverPoint: Vec2 | null = $state(null);

  // True when the pen draft is eligible to close and the pointer is hovering
  // near the start anchor. Mirrors the same threshold the pointerdown
  // close-check uses, so the visual affordance cannot disagree with the hit
  // test. The 8px radius is in screen pixels — divided by `scale` to convert
  // to world units.
  let nearCloseStart = $derived.by(() => {
    const dp = draftPath;
    const hp = hoverPoint;
    if (!dp || !hp) return false;
    if (dp.nodes.length < 2) return false;
    return vDist(hp, dp.start) < 8 / scale;
  });

  // Constrain `b` to form a square bounding box around `a` — pick the larger
  // of |dx|,|dy| and apply it to both axes, preserving sign.
  function squarizeEndpoint(a: Vec2, b: Vec2): Vec2 {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: a.x + (dx < 0 ? -m : m),
      y: a.y + (dy < 0 ? -m : m)
    };
  }

  // Snap the angle of vector a→b to the nearest `stepDeg` increment while
  // preserving its magnitude.
  function snapAngle(a: Vec2, b: Vec2, stepDeg: number): Vec2 {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const r = Math.hypot(dx, dy);
    if (r === 0) return b;
    const step = (stepDeg * Math.PI) / 180;
    const snapped = Math.round(Math.atan2(dy, dx) / step) * step;
    return { x: a.x + r * Math.cos(snapped), y: a.y + r * Math.sin(snapped) };
  }

  // trim tool hover — recomputed on pointermove. `path` is the picked
  // path, `result` holds its full span decomposition, `span` is the one
  // under the cursor. Click on the canvas commits the deletion.
  let trimHover: ReturnType<typeof findHoveredTrimSpan> = $state(null);

  // pencil freehand stroke — raw samples while pointer is down, fitted to
  // Beziers on release.
  let pencilStroke: Vec2[] | null = $state(null);

  // In-flight segment reshape (Inkscape-style click-drag on a curve). Mutates
  // path.nodes[i] live so the curve passes through the cursor; single history
  // entry committed on pointerup.
  let segDrag: { pathId: string; i: number; t: number; moved: boolean } | null = $state(null);

  // node editing state. HandleId comes from pathEdit.ts. Keys follow:
  //   "start"        — path.start position
  //   "node:<i>"     — path.nodes[i].to position
  //   "in:<i>"       — incoming control: c2 of nodes[i] (cubic) or control (quad)
  //   "out:<i>"      — outgoing control: c1 of nodes[i+1] (cubic) or control (quad, same as in)
  let editDrag: {
    pathId: string;
    handle: HandleId;
    start: Vec2;
    origin: Vec2;
    mirror: boolean;
    breakSym: boolean;
    // true once movement has crossed the drag threshold; until then a pointerup
    // is treated as a click (select the handle) instead of a no-op move.
    moved: boolean;
    // selection intent resolved on pointerup if `moved` is still false:
    //   'replace' — replace selection with this one handle
    //   'toggle'  — xor this handle in the existing selection (shift-click)
    clickIntent: 'replace' | 'toggle';
  } | null = $state(null);

  // Transform bbox drag (Figma-style). `mode` picks the gesture; `handle`
  // encodes which corner/edge the user grabbed (for scale) or which quadrant
  // (for rotate). `initial` snapshots the paths at pointerdown so every frame
  // computes from a stable baseline — incremental affines would drift.
  type ScaleHandleKind =
    | 'nw' | 'n' | 'ne'
    | 'w'        | 'e'
    | 'sw' | 's' | 'se';
  type TransformMode = 'move' | 'scale' | 'rotate';
  type TransformDragState = {
    mode: TransformMode;
    scaleHandle?: ScaleHandleKind;
    startWorld: Vec2;
    bbox: PathBBox;
    initial: Map<string, BadgePath>; // pathId -> cloned path snapshot
    moved: boolean;
    // Pivot is fixed at drag start — for scale it's the opposite handle; for
    // rotate it's bbox center. Alt/Opt switches scale pivot to center; user
    // intent doesn't change mid-drag even if the modifier toggles.
    pivot: Vec2;
    // Rotate: baseline angle from pivot to startWorld, in radians.
    startAngle: number;
    // Affine currently applied to the snapshot — updated every frame so the
    // overlay can render a live-transformed bbox that tracks the shape
    // (rotated quad during rotate; axis-aligned rect after scale/move).
    currentMatrix: Affine;
  };
  let transformDrag = $state<TransformDragState | null>(null);

  let warnings = $derived.by(() => runChecks($bakedDocument, $cells));

  // Bounding box around outline paths so we can render a ruler alongside. Falls
  // back to any metal paths if no outlines exist, and to null if the document
  // is empty (ruler is suppressed in that case).
  type BBox = { minX: number; minY: number; maxX: number; maxY: number };
  let badgeBBox = $derived.by<BBox | null>(() => {
    const paths = $docStore.metal.paths;
    const outlines = paths.filter((p) => effectiveKind(p) === 'outline');
    const source = outlines.length > 0 ? outlines : paths;
    if (source.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxStrokeHalf = 0;
    for (const p of source) {
      const half = p.strokeWidth * 0.5;
      if (half > maxStrokeHalf) maxStrokeHalf = half;
      for (const pt of flattenPath(p)) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
    if (!isFinite(minX)) return null;
    return {
      minX: minX - maxStrokeHalf,
      minY: minY - maxStrokeHalf,
      maxX: maxX + maxStrokeHalf,
      maxY: maxY + maxStrokeHalf
    };
  });

  // Pick tick spacings for a ruler so labels land on "nice" multiples of 5/10
  // and we end up with roughly 4–10 major ticks across the BB's long edge.
  // Values returned are in display units (mm for "mm", inches for "in") and
  // converted to mm at render time.
  function rulerSteps(unit: 'mm' | 'in', spanMm: number): { minor: number; major: number } {
    const mmPer = unit === 'mm' ? 1 : 25.4;
    const spanDisplay = Math.max(spanMm / mmPer, 0.0001);
    // Aim for ~6 major ticks along the span.
    const rough = spanDisplay / 6;
    // Snap to nearest {1, 2, 5} × 10^k at or below `rough`.
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / pow;
    let major: number;
    if (norm >= 5) major = 5 * pow;
    else if (norm >= 2) major = 2 * pow;
    else major = 1 * pow;
    // Minor = major / 5 for multiples of 5/10 friendliness (2→every 5th label,
    // 5→every 5th label, 1→every 5th label).
    const minor = major / 5;
    return { minor, major };
  }

  function fitToView() {
    if (!viewport) return;
    const w = $docStore.canvas.width;
    const h = $docStore.canvas.height;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw <= 0 || vh <= 0) {
      // layout not ready — try again on the next frame
      requestAnimationFrame(fitToView);
      return;
    }
    const s = Math.min(vw / w, vh / h) * 0.9;
    scale = s;
    panX = (vw - w * s) / 2;
    panY = (vh - h * s) / 2;
  }

  function zoomAtCenter(factor: number) {
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const cx = vw / 2;
    const cy = vh / 2;
    const ns = Math.max(1, Math.min(500, scale * factor));
    panX = cx - (cx - panX) * (ns / scale);
    panY = cy - (cy - panY) * (ns / scale);
    scale = ns;
  }

  function screenToWorld(sx: number, sy: number): Vec2 {
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return { x: (sx - rect.left - panX) / scale, y: (sy - rect.top - panY) / scale };
  }

  // Path anchors (start + each node.to) quantize to a 1mm grid so endpoints
  // from different paths land on the same point and topology stitching can
  // merge them exactly. Bezier control handles are intentionally left
  // unsnapped. When the user opts out in Options, anchors are left at
  // sub-mm precision, and two paths only join if the user places anchors at
  // exactly the same coordinates — topology's GRAPH_SNAP_DIST is a pure
  // numerical-noise floor, not a UX forgiveness radius.
  const ANCHOR_GRID = 1;
  function snapAnchor(p: Vec2): Vec2 {
    if (!get(snapEnabled)) return { x: p.x, y: p.y };
    return {
      x: Math.round(p.x / ANCHOR_GRID) * ANCHOR_GRID,
      y: Math.round(p.y / ANCHOR_GRID) * ANCHOR_GRID
    };
  }

  function newId(): string {
    return `p_${Math.random().toString(36).slice(2, 10)}`;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    const delta = Math.max(-50, Math.min(50, e.deltaY * unit));
    const factor = Math.exp(-delta * 0.0015);
    const ns = Math.max(1, Math.min(500, scale * factor));
    panX = vx - (vx - panX) * (ns / scale);
    panY = vy - (vy - panY) * (ns / scale);
    scale = ns;
  }

  function startPan(e: PointerEvent) {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, ox: panX, oy: panY };
  }

  // ---- transform-bbox helpers ----
  // Paths currently in the selection (path-level, not handle-level). Empty
  // when nothing is selected.
  let selectedPaths = $derived.by<BadgePath[]>(() => {
    const ids = $selectedPathIds;
    if (ids.size === 0) return [];
    return $docStore.metal.paths.filter((p) => ids.has(p.id));
  });

  // AABB over all selected paths' anchors + control handles. Recomputed from
  // the live document so the overlay tracks edits (pan of a node, etc.).
  // During an active transform drag we freeze the bbox at drag start so the
  // handles don't skitter while scaling — consult `transformDrag.bbox` there.
  let selectionBBox = $derived.by<PathBBox | null>(() => {
    const td = transformDrag;
    if (td) return td.bbox;
    return pathPointsBBox(selectedPaths);
  });

  // World-space positions of the eight scale handles + the four rotate
  // "outside-corner" hit zones. Corner rotate zones are tested BEFORE scale
  // handles at matching corners so a drag just outside the box rotates.
  function handlePositions(bb: PathBBox): Record<ScaleHandleKind, Vec2> {
    const midX = (bb.minX + bb.maxX) / 2;
    const midY = (bb.minY + bb.maxY) / 2;
    return {
      nw: { x: bb.minX, y: bb.minY },
      n: { x: midX, y: bb.minY },
      ne: { x: bb.maxX, y: bb.minY },
      w: { x: bb.minX, y: midY },
      e: { x: bb.maxX, y: midY },
      sw: { x: bb.minX, y: bb.maxY },
      s: { x: midX, y: bb.maxY },
      se: { x: bb.maxX, y: bb.maxY }
    };
  }

  // Opposite handle for a given corner/edge — used as the scale pivot.
  // Alt-drag overrides this to use the bbox center instead.
  function oppositeHandle(h: ScaleHandleKind): ScaleHandleKind {
    switch (h) {
      case 'nw': return 'se';
      case 'n': return 's';
      case 'ne': return 'sw';
      case 'w': return 'e';
      case 'e': return 'w';
      case 'sw': return 'ne';
      case 's': return 'n';
      case 'se': return 'nw';
    }
  }

  // Hit-test the transform bbox at world-space point `p`. Returns either a
  // scale handle (cursor near a corner/edge square), a rotate zone (just
  // outside a corner), or 'move' (inside the box — used for drag-to-translate
  // when an already-selected path is grabbed), or null. Null means the
  // pointer didn't hit any part of the transform UI.
  function hitTransformHandle(
    bb: PathBBox,
    p: Vec2
  ): { kind: 'scale'; h: ScaleHandleKind } | { kind: 'rotate'; corner: 'nw' | 'ne' | 'sw' | 'se' } | null {
    const r = 6 / scale; // half-size of the scale-handle hit square
    const rotateRing = 18 / scale; // outer ring for rotate hit, in world units
    const pos = handlePositions(bb);
    // Scale handles first — tight square around each.
    for (const key of ['nw','n','ne','w','e','sw','s','se'] as ScaleHandleKind[]) {
      const hp = pos[key];
      if (Math.abs(p.x - hp.x) <= r && Math.abs(p.y - hp.y) <= r) {
        return { kind: 'scale', h: key };
      }
    }
    // Rotate zone — a ring of `rotateRing` pixels around each corner, but
    // OUTSIDE the bbox so dragging just off a corner rotates. Inside the
    // bbox we never return rotate (that space belongs to path/node picks).
    const corners: { k: 'nw' | 'ne' | 'sw' | 'se'; pt: Vec2 }[] = [
      { k: 'nw', pt: pos.nw },
      { k: 'ne', pt: pos.ne },
      { k: 'sw', pt: pos.sw },
      { k: 'se', pt: pos.se }
    ];
    const outsideBox =
      p.x < bb.minX - 0.001 || p.x > bb.maxX + 0.001 ||
      p.y < bb.minY - 0.001 || p.y > bb.maxY + 0.001;
    if (!outsideBox) return null;
    for (const c of corners) {
      if (Math.hypot(p.x - c.pt.x, p.y - c.pt.y) <= rotateRing) {
        return { kind: 'rotate', corner: c.k };
      }
    }
    return null;
  }

  // Snapshot the selected paths as structured clones keyed by id. Used at
  // transform-drag start so every frame derives from a stable baseline.
  function snapshotSelection(): Map<string, BadgePath> {
    const m = new Map<string, BadgePath>();
    for (const p of selectedPaths) m.set(p.id, structuredClone(p));
    return m;
  }

  // Build the affine matrix that transforms the snapshot into the frame the
  // cursor is currently requesting. Kept pure so the overlay render path can
  // use the same matrix to transform the bbox corners without duplicating
  // gesture logic. Returns IDENTITY for unexpected modes.
  function buildDragMatrix(
    td: TransformDragState,
    p: Vec2,
    shiftKey: boolean,
    altKey: boolean
  ): Affine {
    const dx = p.x - td.startWorld.x;
    const dy = p.y - td.startWorld.y;
    if (td.mode === 'move') {
      // Pure translation — shift locks to the dominant axis.
      let tx = dx;
      let ty = dy;
      if (shiftKey) {
        if (Math.abs(tx) > Math.abs(ty)) ty = 0;
        else tx = 0;
      }
      return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
    }
    if (td.mode === 'scale' && td.scaleHandle) {
      const bb = td.bbox;
      const pivot = altKey ? { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 } : td.pivot;
      const h = td.scaleHandle;
      const driveX = h === 'nw' || h === 'ne' || h === 'sw' || h === 'se' || h === 'w' || h === 'e';
      const driveY = h === 'nw' || h === 'ne' || h === 'sw' || h === 'se' || h === 'n' || h === 's';
      const handlePt = handlePositions(bb)[h];
      const refX = handlePt.x - pivot.x;
      const refY = handlePt.y - pivot.y;
      let sx = driveX && refX !== 0 ? ((p.x - pivot.x) / refX) : 1;
      let sy = driveY && refY !== 0 ? ((p.y - pivot.y) / refY) : 1;
      if (shiftKey && driveX && driveY) {
        const s = Math.max(Math.abs(sx), Math.abs(sy));
        sx = s * Math.sign(sx || 1);
        sy = s * Math.sign(sy || 1);
      }
      return affineAround(pivot, sx, sy, 0);
    }
    if (td.mode === 'rotate') {
      const pivot = td.pivot;
      const curAngle = Math.atan2(p.y - pivot.y, p.x - pivot.x);
      let angle = curAngle - td.startAngle;
      if (shiftKey) {
        const step = Math.PI / 12; // 15°
        angle = Math.round(angle / step) * step;
      }
      return affineAround(pivot, 1, 1, angle);
    }
    return IDENTITY;
  }

  // Apply the transform for the current pointer position. Resets each path
  // to its snapshot and applies the single matrix so every frame computes
  // from the same baseline — no per-frame drift. Stores the matrix on
  // `transformDrag.currentMatrix` so the overlay can render a bbox that
  // tracks the live transformed shape.
  function applyTransformDrag(p: Vec2, shiftKey: boolean, altKey: boolean) {
    if (!transformDrag) return;
    const td = transformDrag;
    const m = buildDragMatrix(td, p, shiftKey, altKey);
    td.currentMatrix = m;
    docStore.update((d) => {
      for (const [id, snap] of td.initial) {
        const path = d.metal.paths.find((pp) => pp.id === id);
        if (!path) continue;
        path.start = { ...snap.start };
        path.nodes = snap.nodes.map((n) => {
          if (n.type === 'line') return { type: 'line', to: { ...n.to } };
          if (n.type === 'quad') return { type: 'quad', control: { ...n.control }, to: { ...n.to } };
          return { type: 'cubic', c1: { ...n.c1 }, c2: { ...n.c2 }, to: { ...n.to } };
        });
        transformPath(path, m);
      }
      return d;
    });
  }

  // ---- handle helpers ----
  function selectedSingle(): BadgePath | null {
    const ids = $selectedPathIds;
    if (ids.size !== 1) return null;
    const id = [...ids][0];
    return $docStore.metal.paths.find((p) => p.id === id) ?? null;
  }

  function handleKey_(pathId: string, h: HandleId): string {
    const idx = h.kind === 'start' ? 0 : h.i;
    return `${pathId}:${h.kind}:${idx}`;
  }

  function parseHandleKey(k: string): { pathId: string; handle: HandleId } | null {
    // pathId may contain colons in principle — split from the right.
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

  function handlePos(path: BadgePath, h: HandleId): Vec2 | null {
    if (h.kind === 'start') return path.start;
    const node = path.nodes[h.i];
    if (!node) return null;
    if (h.kind === 'node') return node.to;
    if (h.kind === 'in') {
      if (node.type === 'cubic') return node.c2;
      if (node.type === 'quad') return node.control;
      return null;
    }
    // out
    if (node.type === 'cubic') return node.c1;
    if (node.type === 'quad') return node.control;
    return null;
  }

  function hitHandle(path: BadgePath, p: Vec2): HandleId | null {
    const r = 8 / scale;
    // nodes first (denser target)
    if (vDist(p, path.start) < r) return { kind: 'start' };
    for (let i = 0; i < path.nodes.length; i++) {
      if (vDist(p, path.nodes[i].to) < r) return { kind: 'node', i };
    }
    for (let i = 0; i < path.nodes.length; i++) {
      const node = path.nodes[i];
      if (node.type === 'cubic') {
        if (vDist(p, node.c1) < r) return { kind: 'out', i };
        if (vDist(p, node.c2) < r) return { kind: 'in', i };
      } else if (node.type === 'quad') {
        if (vDist(p, node.control) < r) return { kind: 'in', i };
      }
    }
    return null;
  }

  // produce list of overlay handles for the currently-selected path
  type HandleItem = {
    id: HandleId;
    pos: Vec2;
    kind: 'anchor' | 'control';
    pairFrom?: Vec2;
    nodeType?: NodeType;
  };
  function overlayHandles(path: BadgePath): HandleItem[] {
    const items: HandleItem[] = [
      { id: { kind: 'start' }, pos: path.start, kind: 'anchor', nodeType: getNodeType(path, 0) }
    ];
    for (let i = 0; i < path.nodes.length; i++) {
      const node = path.nodes[i];
      const anchorPrev = i === 0 ? path.start : path.nodes[i - 1].to;
      if (node.type === 'cubic') {
        items.push({ id: { kind: 'out', i }, pos: node.c1, kind: 'control', pairFrom: anchorPrev });
        items.push({ id: { kind: 'in', i }, pos: node.c2, kind: 'control', pairFrom: node.to });
      } else if (node.type === 'quad') {
        items.push({
          id: { kind: 'in', i },
          pos: node.control,
          kind: 'control',
          pairFrom: node.to
        });
      }
      items.push({
        id: { kind: 'node', i },
        pos: node.to,
        kind: 'anchor',
        nodeType: getNodeType(path, i + 1)
      });
    }
    return items;
  }

  // move a node (anchor). By default the surrounding control handles move
  // along with the node so their relative offsets are preserved.
  function moveAnchor(path: BadgePath, h: HandleId, delta: Vec2) {
    const apply = (p: Vec2) => {
      p.x += delta.x;
      p.y += delta.y;
    };
    if (h.kind === 'start') {
      apply(path.start);
      // outgoing handle lives on nodes[0]
      const n0 = path.nodes[0];
      if (n0 && n0.type === 'cubic') apply(n0.c1);
      else if (n0 && n0.type === 'quad') apply(n0.control);
      return;
    }
    if (h.kind !== 'node') return;
    const node = path.nodes[h.i];
    if (!node) return;
    apply(node.to);
    if (node.type === 'cubic') apply(node.c2);
    else if (node.type === 'quad') apply(node.control);
    const next = path.nodes[h.i + 1];
    if (next && next.type === 'cubic') apply(next.c1);
    // quad.control belongs to this segment, not the next — already handled
  }

  // Anchor index for a HandleId. 'start' = 0, 'node i' = i+1.
  function anchorIndexOf(h: HandleId): number | null {
    if (h.kind === 'start') return 0;
    if (h.kind === 'node') return h.i + 1;
    return null;
  }

  // After an anchor moves, re-derive any neighboring 'auto' handles. Called
  // from the drag path so auto anchors retune smoothly as the user edits.
  function refreshAutoNeighbors(path: BadgePath, anchorIdx: number) {
    const n = anchorCount(path);
    const neighbors: number[] = [anchorIdx];
    if (anchorIdx > 0) neighbors.push(anchorIdx - 1);
    else if (path.closed) neighbors.push(n - 1);
    if (anchorIdx < n - 1) neighbors.push(anchorIdx + 1);
    else if (path.closed) neighbors.push(0);
    for (const idx of neighbors) applyAutoAt(path, idx);
  }

  // move a control handle. When breakSym is false, we enforce the stored node
  // type for the affected anchor. When breakSym is true (shift-drag), the drag
  // is treated as cusp for the duration of the gesture.
  function moveControl(path: BadgePath, h: HandleId, abs: Vec2, breakSym: boolean) {
    if (h.kind === 'in') {
      const node = path.nodes[h.i];
      if (!node) return;
      if (node.type === 'cubic') {
        node.c2.x = abs.x;
        node.c2.y = abs.y;
        if (!breakSym) enforceNodeType(path, h.i + 1, 'in');
      } else if (node.type === 'quad') {
        node.control.x = abs.x;
        node.control.y = abs.y;
      }
    } else if (h.kind === 'out') {
      const node = path.nodes[h.i];
      if (!node) return;
      if (node.type === 'cubic') {
        node.c1.x = abs.x;
        node.c1.y = abs.y;
        if (!breakSym) enforceNodeType(path, h.i, 'out');
      } else if (node.type === 'quad') {
        node.control.x = abs.x;
        node.control.y = abs.y;
      }
    }
  }

  // Return the handle keys that moveAnchor would ALSO translate when asked
  // to move the given anchor — used so multi-handle operations don't apply
  // the delta twice to a control handle that rides along with its anchor.
  function attachedControlKeys(path: BadgePath, h: HandleId): string[] {
    const keys: string[] = [];
    if (h.kind === 'start') {
      const n0 = path.nodes[0];
      if (n0 && (n0.type === 'cubic' || n0.type === 'quad')) {
        keys.push(handleKey_(path.id, { kind: 'out', i: 0 }));
      }
      return keys;
    }
    if (h.kind !== 'node') return keys;
    const node = path.nodes[h.i];
    if (!node) return keys;
    if (node.type === 'cubic' || node.type === 'quad') {
      keys.push(handleKey_(path.id, { kind: 'in', i: h.i }));
    }
    const next = path.nodes[h.i + 1];
    if (next && next.type === 'cubic') {
      keys.push(handleKey_(path.id, { kind: 'out', i: h.i + 1 }));
    }
    return keys;
  }

  // Translate every OTHER currently-selected handle (besides the primary) by
  // the same world delta as the primary. Anchors use moveAnchor (which also
  // carries their attached controls); controls use moveControl with
  // breakSym=true (multi-drag should translate, not reflect). When an anchor
  // in the selection has already dragged a control along, skip re-applying.
  function applyGroupDelta(path: BadgePath, primary: HandleId, delta: Vec2) {
    const primaryKey = handleKey_(path.id, primary);
    const skipControls = new Set<string>();
    for (const key of $selectedHandles) {
      if (key === primaryKey) continue;
      const parsed = parseHandleKey(key);
      if (!parsed || parsed.pathId !== path.id) continue;
      const h = parsed.handle;
      if (h.kind !== 'start' && h.kind !== 'node') continue;
      if (h.kind === 'node' && !path.nodes[h.i]) continue;
      moveAnchor(path, h, delta);
      for (const k of attachedControlKeys(path, h)) skipControls.add(k);
    }
    if (primary.kind === 'start' || primary.kind === 'node') {
      for (const k of attachedControlKeys(path, primary)) skipControls.add(k);
    }
    for (const key of $selectedHandles) {
      if (key === primaryKey) continue;
      if (skipControls.has(key)) continue;
      const parsed = parseHandleKey(key);
      if (!parsed || parsed.pathId !== path.id) continue;
      const h = parsed.handle;
      if (h.kind !== 'in' && h.kind !== 'out') continue;
      if (!path.nodes[h.i]) continue;
      const cur = handlePos(path, h);
      if (!cur) continue;
      moveControl(path, h, { x: cur.x + delta.x, y: cur.y + delta.y }, true);
    }
  }

  // Translate the given selected handle keys in `doc` by (dx, dy). Anchors
  // run first (so their ride-along controls can be recorded), then standalone
  // controls — same dedup logic as applyGroupDelta.
  function nudgeHandles(doc: BadgeDocument, keys: Iterable<string>, dx: number, dy: number) {
    const byPath = new Map<string, HandleId[]>();
    for (const k of keys) {
      const parsed = parseHandleKey(k);
      if (!parsed) continue;
      const arr = byPath.get(parsed.pathId) ?? [];
      arr.push(parsed.handle);
      byPath.set(parsed.pathId, arr);
    }
    for (const [pathId, handles] of byPath) {
      const path = doc.metal.paths.find((pp) => pp.id === pathId);
      if (!path) continue;
      const skipControls = new Set<string>();
      for (const h of handles) {
        if (h.kind !== 'start' && h.kind !== 'node') continue;
        if (h.kind === 'node' && !path.nodes[h.i]) continue;
        moveAnchor(path, h, { x: dx, y: dy });
        for (const k of attachedControlKeys(path, h)) skipControls.add(k);
      }
      for (const h of handles) {
        if (h.kind !== 'in' && h.kind !== 'out') continue;
        if (skipControls.has(handleKey_(path.id, h))) continue;
        if (!path.nodes[h.i]) continue;
        const cur = handlePos(path, h);
        if (!cur) continue;
        moveControl(path, h, { x: cur.x + dx, y: cur.y + dy }, true);
      }
    }
  }

  function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  }

  function cycleSegmentType(path: BadgePath, i: number) {
    const node = path.nodes[i];
    if (!node) return;
    const prev = pathAnchorBefore(path, i);
    if (node.type === 'line') {
      path.nodes[i] = { type: 'quad', control: lerp(prev, node.to, 0.5), to: node.to };
    } else if (node.type === 'quad') {
      const c1 = {
        x: prev.x + (2 / 3) * (node.control.x - prev.x),
        y: prev.y + (2 / 3) * (node.control.y - prev.y)
      };
      const c2 = {
        x: node.to.x + (2 / 3) * (node.control.x - node.to.x),
        y: node.to.y + (2 / 3) * (node.control.y - node.to.y)
      };
      path.nodes[i] = { type: 'cubic', c1, c2, to: node.to };
    } else {
      path.nodes[i] = { type: 'line', to: node.to };
    }
  }


  // ---- pointer handling ----
  function onPointerDown(e: PointerEvent) {
    if (!viewport) return;
    if (e.button === 1 || spaceHeld || $metalTool === 'grab') {
      startPan(e);
      viewport.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const tool = $metalTool;
    viewport.setPointerCapture(e.pointerId);

    // Transform bbox handles: when the select tool is active and at least one
    // path is selected, test for a scale/rotate handle FIRST. Takes priority
    // over per-path node handles so the user can always reach the bbox UI
    // even when a single path is selected and its handles overlap the corner.
    if (tool === 'select' && selectionBBox && $selectedPathIds.size > 0) {
      const th = hitTransformHandle(selectionBBox, p);
      if (th) {
        const bb = selectionBBox;
        const pos = handlePositions(bb);
        if (th.kind === 'scale') {
          const opp = oppositeHandle(th.h);
          const pivot = e.altKey
            ? { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 }
            : { ...pos[opp] };
          transformDrag = {
            mode: 'scale',
            scaleHandle: th.h,
            startWorld: p,
            bbox: bb,
            initial: snapshotSelection(),
            moved: false,
            pivot,
            startAngle: 0,
            currentMatrix: IDENTITY
          };
        } else {
          // rotate
          const center = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
          transformDrag = {
            mode: 'rotate',
            startWorld: p,
            bbox: bb,
            initial: snapshotSelection(),
            moved: false,
            pivot: center,
            startAngle: Math.atan2(p.y - center.y, p.x - center.x),
            currentMatrix: IDENTITY
          };
        }
        return;
      }
    }

    // If a path is selected, check for handle hits FIRST regardless of tool
    // (except when using shape tools which benefit from click-drag-in-empty).
    const sel = selectedSingle();
    if (sel && (tool === 'select' || tool === 'pen')) {
      const hit = hitHandle(sel, p);
      if (hit) {
        const key = handleKey_(sel.id, hit);
        // Shift-click is a pure selection gesture (toggle in/out of the set)
        // and never arms a drag — drags would collide with the live-shift
        // semantics already used during drag (cubic upgrade, break symmetry).
        if (e.shiftKey) {
          selectedHandles.update((s) => {
            const n = new Set(s);
            if (n.has(key)) n.delete(key);
            else n.add(key);
            return n;
          });
          return;
        }
        // Ctrl/Cmd+click on a control retracts it — collapse the segment
        // toward line by removing this side's handle.
        if ((e.ctrlKey || e.metaKey) && (hit.kind === 'in' || hit.kind === 'out')) {
          updateDocument((d) => {
            const path = d.metal.paths.find((pp) => pp.id === sel.id);
            if (path) retractHandle(path, hit);
          });
          return;
        }
        // Plain click. If this handle isn't already selected, replace the
        // selection with just this one so the drag-or-click starts from a
        // clean state. If it IS already selected, preserve the existing
        // multi-selection so a drag moves the whole group.
        if (!$selectedHandles.has(key)) {
          selectedHandles.set(new Set<string>([key]));
        }
        editDrag = {
          pathId: sel.id,
          handle: hit,
          start: p,
          origin: { ...(handlePos(sel, hit) ?? p) },
          mirror: e.altKey,
          breakSym: false,
          moved: false,
          clickIntent: 'replace'
        };
        return;
      }
      // No handle hit — test for a segment under the cursor. Click-drag on
      // a segment reshapes its curve (Inkscape's segment-warp).
      const segHit = pickSegment(sel, p);
      if (segHit && tool === 'select') {
        segDrag = { pathId: sel.id, i: segHit.i, t: segHit.t, moved: false };
        return;
      }
    }

    if (tool === 'select') {
      const hit = pickPath(p);
      if (hit) {
        if (e.shiftKey) {
          selectedPathIds.update((s) => {
            const n = new Set(s);
            if (n.has(hit.id)) n.delete(hit.id);
            else n.add(hit.id);
            return n;
          });
        } else if (!$selectedPathIds.has(hit.id)) {
          selectedPathIds.set(new Set<string>([hit.id]));
        } else if ($selectedPathIds.size > 1 && selectionBBox) {
          // Already-selected path in a multi-selection: drag to translate
          // the whole group. Single-selection keeps its existing node-level
          // drag behavior (node handles take priority above this branch).
          transformDrag = {
            mode: 'move',
            startWorld: p,
            bbox: selectionBBox,
            initial: snapshotSelection(),
            moved: false,
            pivot: { x: 0, y: 0 },
            startAngle: 0,
            currentMatrix: IDENTITY
          };
        }
      } else {
        // start a marquee. Shift preserves the existing selection.
        if (!e.shiftKey) selectedPathIds.set(new Set());
        dragStart = p;
        dragCurrent = p;
        dragTool = e.shiftKey ? 'marquee-add' : 'marquee';
      }
      return;
    }

    if (tool === 'trim') {
      const hover = trimHover;
      if (!hover) return;
      const original = $docStore.metal.paths.find((pp) => pp.id === hover.path.id);
      if (!original) return;
      const replacements = applyTrimDeletion(
        original,
        hover.result.spans,
        hover.span.spanIdx
      ).map((rp: BadgePath) => simplifyPath(rp));
      updateDocument((d) => {
        const idx = d.metal.paths.findIndex((pp) => pp.id === original.id);
        if (idx < 0) return;
        d.metal.paths.splice(idx, 1, ...replacements);
      });
      selectedPathIds.set(new Set<string>(replacements.map((rp: BadgePath) => rp.id)));
      trimHover = null;
      return;
    }

    if (tool === 'pen') {
      // start a pen action: commit the click point and record drag state
      const isFirst = !draftPath;
      const anchor = snapAnchor(p);
      if (!draftPath) {
        draftPath = {
          id: newId(),
          kind: get(activeKind),
          closed: false,
          start: anchor,
          nodes: [],
          strokeWidth: get(activeStrokeWidth)
        };
      } else if (vDist(p, draftPath.start) < 8 / scale && draftPath.nodes.length >= 2) {
        // click on start — close the path
        commitDraft(true);
        return;
      } else {
        // append a node using any pendingOutHandle (from prior click's drag)
        // as c1, and a mirror-of-this-click's-drag-not-yet-known placeholder.
        const node: PathNode = pendingOutHandle
          ? { type: 'cubic', c1: { ...pendingOutHandle }, c2: { ...anchor }, to: { ...anchor } }
          : { type: 'line', to: { ...anchor } };
        draftPath.nodes = [...draftPath.nodes, node];
      }
      penDown = { anchor: { ...anchor }, current: { ...anchor }, isFirst };
      return;
    }

    if (tool === 'line' || tool === 'rect' || tool === 'ellipse' || tool === 'polygon') {
      dragStart = p;
      dragCurrent = p;
      dragTool = tool;
      dragConstrain = e.ctrlKey || e.metaKey;
      return;
    }

    if (tool === 'pencil') {
      pencilStroke = [p];
      return;
    }

    if (tool === 'text') {
      if (!$activeTextFontId) {
        commitEditingText();
        alert('Pick a font in the Text section of the sidebar first.');
        return;
      }
      // Inkscape behavior: click on existing text enters edit mode for it;
      // click on empty canvas commits any in-progress edit and starts a new
      // one. If the user clicks on the same text that's already being
      // edited, we keep the edit session alive (no commit/reopen churn).
      const hit = pickText(p);
      if (hit) {
        if ($editingTextId !== hit) {
          commitEditingText();
          beginEditingText(hit);
        }
      } else {
        commitEditingText();
        addText(p);
      }
      return;
    }

  }

  // Hit-test text elements. Each text's bounding box is approximated by its
  // anchor point and a box whose width is the advance width of its string
  // and height is its sizeMm. For picking precision we defer to the font's
  // actual advance when available; when the font hasn't loaded yet we fall
  // back to an estimate (0.6 em per char) so the user can still select the
  // placeholder to edit it.
  function pickText(p: Vec2): string | null {
    const texts = $docStore.metal.texts;
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      const font = getLoadedFont(t.fontId);
      const width = font
        ? font.getAdvanceWidth(t.text || ' ', t.sizeMm)
        : Math.max(t.sizeMm * 0.6 * Math.max(1, t.text.length), t.sizeMm);
      const box = {
        x0: t.position.x,
        y0: t.position.y,
        x1: t.position.x + width,
        y1: t.position.y + t.sizeMm
      };
      if (p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1) {
        return t.id;
      }
    }
    return null;
  }

  function onPointerMove(e: PointerEvent) {
    if (isPanning && panStart) {
      panX = panStart.ox + (e.clientX - panStart.x);
      panY = panStart.oy + (e.clientY - panStart.y);
      return;
    }
    const p = screenToWorld(e.clientX, e.clientY);
    hoverPoint = p;

    if ($metalTool === 'trim') {
      trimHover = findHoveredTrimSpan(p, $docStore.metal.paths, scale);
    } else if (trimHover) {
      trimHover = null;
    }

    // selection transform drag (move / scale / rotate via bbox handles)
    if (transformDrag) {
      const td = transformDrag;
      const dx = p.x - td.startWorld.x;
      const dy = p.y - td.startWorld.y;
      const DRAG_THRESHOLD_PX = 3;
      if (!td.moved) {
        if (Math.hypot(dx, dy) * scale < DRAG_THRESHOLD_PX) return;
        td.moved = true;
      }
      applyTransformDrag(p, e.shiftKey, e.altKey);
      return;
    }

    // node/handle editing drag
    if (editDrag) {
      const pathId = editDrag.pathId;
      const h = editDrag.handle;
      const delta = { x: p.x - editDrag.start.x, y: p.y - editDrag.start.y };
      // Gate the first mutation behind a small threshold so plain clicks
      // on a handle don't snap it to the grid or otherwise mutate state.
      const DRAG_THRESHOLD_PX = 3;
      if (!editDrag.moved) {
        if (Math.hypot(delta.x, delta.y) * scale < DRAG_THRESHOLD_PX) return;
        editDrag.moved = true;
      }
      const abs = { x: editDrag.origin.x + delta.x, y: editDrag.origin.y + delta.y };
      const shiftNow = e.shiftKey;
      // Mutate the doc in place (no history snapshot per frame). We'll
      // commit a single history entry on pointerup via updateDocument there.
      docStore.update((d) => {
        const path = d.metal.paths.find((pp) => pp.id === pathId);
        if (!path) return d;
        // Resolve the primary handle's delta (snapped for anchors). Apply the
        // same delta to every OTHER selected handle — controls get the same
        // vector translation as the anchor, which matches "drag the group."
        let groupDelta: Vec2 | null = null;
        if (h.kind === 'start' || h.kind === 'node') {
          const cur = handlePos(path, h);
          if (!cur) return d;
          const snapped = snapAnchor(abs);
          const dx = snapped.x - cur.x;
          const dy = snapped.y - cur.y;
          moveAnchor(path, h, { x: dx, y: dy });
          groupDelta = { x: dx, y: dy };
          const aIdx = anchorIndexOf(h);
          if (aIdx != null) refreshAutoNeighbors(path, aIdx);
        } else {
          if (shiftNow) ensureCubicNode(path, h.i);
          const cur = handlePos(path, h);
          moveControl(path, h, abs, shiftNow);
          if (cur) groupDelta = { x: abs.x - cur.x, y: abs.y - cur.y };
        }
        if (groupDelta && $selectedHandles.size > 1) {
          applyGroupDelta(path, h, groupDelta);
        }
        return d;
      });
      return;
    }

    if (segDrag) {
      // Gate first reshape behind a small threshold so a plain click on a
      // segment doesn't mutate the path.
      const DRAG_THRESHOLD_PX = 3;
      if (!segDrag.moved) {
        // Distance from initial pick point (sampled from current nodes) to
        // cursor, in screen pixels.
        const doc0 = $docStore;
        const path0 = doc0.metal.paths.find((pp) => pp.id === segDrag!.pathId);
        if (!path0) {
          segDrag = null;
          return;
        }
        const orig = sampleSegment(path0, segDrag.i, segDrag.t);
        if (Math.hypot(p.x - orig.x, p.y - orig.y) * scale < DRAG_THRESHOLD_PX) return;
        segDrag.moved = true;
      }
      docStore.update((d) => {
        const path = d.metal.paths.find((pp) => pp.id === segDrag!.pathId);
        if (!path) return d;
        warpSegmentTo(path, segDrag!.i, segDrag!.t, p);
        return d;
      });
      return;
    }

    // pen-while-pressed: update pending out handle as mirror of drag
    if (penDown && draftPath) {
      penDown.current = p;
      const dx = p.x - penDown.anchor.x;
      const dy = p.y - penDown.anchor.y;
      // mirror: outgoing handle is click + drag; incoming (applied to most
      // recently-placed node) is click - drag.
      pendingOutHandle = { x: penDown.anchor.x + dx, y: penDown.anchor.y + dy };

      if (penDown.isFirst) {
        // still the very first click — no node yet beyond start. We just
        // remember pendingOutHandle for the next segment's c1.
      } else {
        // retroactively convert the most-recently-appended node into a cubic
        // whose c2 is the mirror of drag.
        const nodes = draftPath.nodes;
        const last = nodes[nodes.length - 1];
        if (last) {
          const c1Base =
            last.type === 'cubic'
              ? last.c1
              : // use the previous pendingOutHandle if any; else fallback to prev anchor
                nodes.length >= 2
                ? (nodes[nodes.length - 2].to as Vec2)
                : draftPath.start;
          const prevAnchor = nodes.length >= 2 ? nodes[nodes.length - 2].to : draftPath.start;
          const c1 = last.type === 'cubic' ? last.c1 : { ...c1Base, x: c1Base.x, y: c1Base.y };
          // only replace if we actually had an incoming handle planned earlier
          // (pendingOutHandle at the time of this node's placement).
          // Otherwise, synthesise c1 = 1/3 along previous line.
          const synthC1 =
            last.type === 'cubic'
              ? c1
              : {
                  x: prevAnchor.x + (last.to.x - prevAnchor.x) * 0.33,
                  y: prevAnchor.y + (last.to.y - prevAnchor.y) * 0.33
                };
          const c2 = { x: penDown.anchor.x - dx, y: penDown.anchor.y - dy };
          draftPath.nodes = [
            ...nodes.slice(0, -1),
            { type: 'cubic', c1: synthC1, c2, to: { ...last.to } }
          ];
        }
      }
      return;
    }

    if (dragStart && dragTool) {
      dragCurrent = p;
      dragConstrain = e.ctrlKey || e.metaKey;
    }

    if (pencilStroke) {
      // Skip samples closer than ~0.5 screen-px to the last — pointer events
      // can fire at sub-pixel deltas when the user holds still and the noise
      // bloats the fit input without adding signal.
      const last = pencilStroke[pencilStroke.length - 1];
      if (vDist(p, last) * scale >= 0.5) pencilStroke = [...pencilStroke, p];
    }
  }

  function onPointerUp() {
    if (!viewport) return;
    if (isPanning) {
      isPanning = false;
      panStart = null;
      return;
    }
    if (transformDrag) {
      const moved = transformDrag.moved;
      transformDrag = null;
      if (moved) {
        // Commit as a single history entry — the doc has been mutated in
        // place each frame; this hands the mutation to updateDocument so
        // the undo stack and per-cell color reassignment see it.
        updateDocument((d) => { void d; });
      }
      return;
    }
    if (editDrag) {
      const moved = editDrag.moved;
      const finalId = editDrag.pathId;
      editDrag = null;
      if (moved) {
        // Commit by finalizing through updateDocument (push a single history
        // entry with remapped colors).
        updateDocument((d) => {
          void d;
          void finalId;
        });
      }
      // If not moved, the pointerdown already resolved selection; nothing to
      // commit — do not push an empty history entry.
      return;
    }
    if (segDrag) {
      const moved = segDrag.moved;
      segDrag = null;
      if (moved) {
        updateDocument((d) => { void d; });
      }
      return;
    }
    if (penDown) {
      // keep pendingOutHandle if the drag was non-trivial; else clear it so
      // the next click produces a straight line.
      const dx = penDown.current.x - penDown.anchor.x;
      const dy = penDown.current.y - penDown.anchor.y;
      if (Math.hypot(dx, dy) < 2 / scale) pendingOutHandle = null;
      penDown = null;
      return;
    }
    if (pencilStroke) {
      const stroke = pencilStroke;
      pencilStroke = null;
      if (stroke.length >= 2) {
        // Tolerance scales with zoom — aim for ~1px on screen so the fit
        // looks faithful at the user's current view.
        const tol = Math.max(0.1, 1 / scale);
        const fit = fitPencilStroke(stroke, tol);
        if (fit) {
          const start = snapAnchor(fit.start);
          const path: BadgePath = {
            id: newId(),
            kind: get(activeKind),
            closed: false,
            start,
            nodes: fit.nodes,
            strokeWidth: get(activeStrokeWidth)
          };
          const lastNode = path.nodes[path.nodes.length - 1];
          if (lastNode) {
            // If the release landed within ~8 screen px of the stroke start,
            // close the loop by snapping the final anchor to start.
            const CLOSE_LOOP_PX = 8;
            const threshold = CLOSE_LOOP_PX / scale;
            const dx = lastNode.to.x - start.x;
            const dy = lastNode.to.y - start.y;
            if (path.nodes.length >= 2 && Math.hypot(dx, dy) <= threshold) {
              lastNode.to = { ...start };
              path.closed = true;
            } else {
              lastNode.to = snapAnchor(lastNode.to);
            }
          }
          updateDocument((d) => {
            d.metal.paths = [...d.metal.paths, path];
          });
        }
      }
      return;
    }
    if (dragStart && dragCurrent && dragTool) {
      const a = dragStart;
      let b = dragCurrent;
      if (dragConstrain) {
        if (dragTool === 'ellipse' || dragTool === 'polygon') {
          b = squarizeEndpoint(a, b);
        } else if (dragTool === 'line') {
          b = snapAngle(a, b, 15);
        }
      }
      if (dragTool === 'marquee' || dragTool === 'marquee-add') {
        commitMarquee(a, b, dragTool === 'marquee-add');
      } else if (vDist(a, b) > 2) {
        // Snap drag endpoints so shape anchors (and rect corners derived from
        // min/max of endpoints) land on grid points. Skip for angle-constrained
        // lines so the 15° direction isn't pulled off-axis by the grid.
        const sa = snapAnchor(a);
        const sb = dragConstrain && dragTool === 'line' ? b : snapAnchor(b);
        if (dragTool === 'line') insertLine(sa, sb);
        else if (dragTool === 'rect') insertRect(sa, sb);
        else if (dragTool === 'ellipse') insertEllipse(sa, sb);
        else if (dragTool === 'polygon') insertPolygon(sa, sb);
      }
      dragStart = null;
      dragCurrent = null;
      dragTool = null;
      dragConstrain = false;
    }
  }

  function onDoubleClick(e: MouseEvent) {
    if (draftPath && draftPath.nodes.length >= 1) {
      commitDraft(false);
      return;
    }
    // double-click a node on the selected path to cycle its type; double-click
    // on an empty segment to insert a new node at the clicked point.
    const sel = selectedSingle();
    if (!sel) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const hit = hitHandle(sel, p);
    if (hit) {
      if (hit.kind === 'node') {
        updateDocument((d) => {
          const path = d.metal.paths.find((pp) => pp.id === sel.id);
          if (path) cycleSegmentType(path, hit.i);
        });
      }
      return;
    }
    const segHit = pickSegment(sel, p);
    if (segHit) {
      updateDocument((d) => {
        const path = d.metal.paths.find((pp) => pp.id === sel.id);
        if (path) splitSegmentAt(path, segHit.i, segHit.t);
      });
    }
  }

  function onContextMenu(e: MouseEvent) {
    if (draftPath) {
      e.preventDefault();
      cancelDraft();
      return;
    }
    const sel = selectedSingle();
    if (!sel) return;
    const p = screenToWorld(e.clientX, e.clientY);
    const hit = hitHandle(sel, p);
    if (!hit) return;
    e.preventDefault();
    if (hit.kind === 'node') {
      updateDocument((d) => {
        const path = d.metal.paths.find((pp) => pp.id === sel.id);
        if (path) deleteNode(path, hit.i);
      });
    } else if (hit.kind === 'start') {
      // shift origin to next node
      updateDocument((d) => {
        const path = d.metal.paths.find((pp) => pp.id === sel.id);
        if (!path || path.nodes.length === 0) return;
        const n0 = path.nodes[0];
        path.start = { ...n0.to };
        path.nodes.splice(0, 1);
        // Drop the now-removed start anchor's node type.
        if (path.nodeTypes) path.nodeTypes.splice(0, 1);
      });
    }
  }

  function commitDraft(closed: boolean) {
    if (!draftPath) return;
    // Unwrap the $state proxy into plain data before it enters the store. The
    // store is later structured-cloned (history, cloneDoc, and postMessage to
    // the mesh worker); Svelte proxies survive neither, throwing DataCloneError.
    const draft: BadgePath = $state.snapshot(draftPath);
    draft.closed = closed;
    // scrub trailing cubic placeholder if c2 equals to (happens when a node
    // was added but no drag followed — pen-click-only case remains a line)
    if (draft.nodes.length > 0) {
      const last = draft.nodes[draft.nodes.length - 1];
      if (last.type === 'cubic' && vDist(last.c2, last.to) < 0.001) {
        draft.nodes[draft.nodes.length - 1] = { type: 'line', to: last.to };
      }
    }
    updateDocument((d) => {
      d.metal.paths = [...d.metal.paths, draft];
    });
    draftPath = null;
    pendingOutHandle = null;
    penDown = null;
  }

  function cancelDraft() {
    draftPath = null;
    pendingOutHandle = null;
    penDown = null;
  }

  function insertLine(a: Vec2, b: Vec2) {
    const path: BadgePath = {
      id: newId(),
      kind: get(activeKind),
      closed: false,
      start: a,
      nodes: [{ type: 'line', to: b }],
      strokeWidth: get(activeStrokeWidth)
    };
    updateDocument((d) => {
      d.metal.paths = [...d.metal.paths, path];
    });
  }

  function insertRect(a: Vec2, b: Vec2) {
    const style = get(rectCornerStyle);
    const r = get(rectCornerRadius);
    const built = buildRect(a, b, style, r);
    const path: BadgePath = {
      id: newId(),
      kind: get(activeKind),
      closed: true,
      start: built.start,
      nodes: built.nodes,
      strokeWidth: get(activeStrokeWidth)
    };
    updateDocument((d) => {
      d.metal.paths = [...d.metal.paths, path];
    });
  }

  // Circle arc approximation constant — handle length as fraction of radius
  // that produces a visually-perfect quarter circle when used on a cubic
  // bezier. For squircles we pull the handles further toward the corner so
  // the curvature "lingers" near the midpoints of each side, producing the
  // iOS-style continuous-curvature look.
  const CIRCLE_K = 0.5522847498;
  const SQUIRCLE_K = 1.0;

  function buildRect(
    a: Vec2,
    b: Vec2,
    style: 'sharp' | 'round' | 'squircle',
    radius: number
  ): { start: Vec2; nodes: PathNode[] } {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);
    const w = x2 - x1;
    const h = y2 - y1;
    // clamp radius to at most half the shortest side
    const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    if (style === 'sharp' || r <= 0) {
      return {
        start: { x: x1, y: y1 },
        nodes: [
          { type: 'line', to: { x: x2, y: y1 } },
          { type: 'line', to: { x: x2, y: y2 } },
          { type: 'line', to: { x: x1, y: y2 } }
        ]
      };
    }
    const k = style === 'squircle' ? SQUIRCLE_K : CIRCLE_K;
    const hd = r * k; // handle offset from the corner along the straight edges
    // start at top edge, just after the top-left corner
    const start: Vec2 = { x: x1 + r, y: y1 };
    const nodes: PathNode[] = [
      // top edge
      { type: 'line', to: { x: x2 - r, y: y1 } },
      // top-right corner
      {
        type: 'cubic',
        c1: { x: x2 - r + hd, y: y1 },
        c2: { x: x2, y: y1 + r - hd },
        to: { x: x2, y: y1 + r }
      },
      // right edge
      { type: 'line', to: { x: x2, y: y2 - r } },
      // bottom-right corner
      {
        type: 'cubic',
        c1: { x: x2, y: y2 - r + hd },
        c2: { x: x2 - r + hd, y: y2 },
        to: { x: x2 - r, y: y2 }
      },
      // bottom edge
      { type: 'line', to: { x: x1 + r, y: y2 } },
      // bottom-left corner
      {
        type: 'cubic',
        c1: { x: x1 + r - hd, y: y2 },
        c2: { x: x1, y: y2 - r + hd },
        to: { x: x1, y: y2 - r }
      },
      // left edge
      { type: 'line', to: { x: x1, y: y1 + r } },
      // top-left corner
      {
        type: 'cubic',
        c1: { x: x1, y: y1 + r - hd },
        c2: { x: x1 + r - hd, y: y1 },
        to: { x: x1 + r, y: y1 }
      }
    ];
    return { start, nodes };
  }

  function insertEllipse(a: Vec2, b: Vec2, kind: BadgePath['kind'] = get(activeKind)) {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    // Build the ellipse from 4 cubic beziers for nice curves & few nodes
    const k = 0.5522847498; // cubic bezier circle approximation
    const start = snapAnchor({ x: cx + rx, y: cy });
    const nodes: PathNode[] = [
      {
        type: 'cubic',
        c1: { x: cx + rx, y: cy + ry * k },
        c2: { x: cx + rx * k, y: cy + ry },
        to: snapAnchor({ x: cx, y: cy + ry })
      },
      {
        type: 'cubic',
        c1: { x: cx - rx * k, y: cy + ry },
        c2: { x: cx - rx, y: cy + ry * k },
        to: snapAnchor({ x: cx - rx, y: cy })
      },
      {
        type: 'cubic',
        c1: { x: cx - rx, y: cy - ry * k },
        c2: { x: cx - rx * k, y: cy - ry },
        to: snapAnchor({ x: cx, y: cy - ry })
      },
      {
        type: 'cubic',
        c1: { x: cx + rx * k, y: cy - ry },
        c2: { x: cx + rx, y: cy - ry * k },
        to: snapAnchor({ x: cx + rx, y: cy })
      }
    ];
    const path: BadgePath = {
      id: newId(),
      kind,
      closed: true,
      start,
      nodes,
      strokeWidth: get(activeStrokeWidth)
    };
    updateDocument((d) => {
      d.metal.paths = [...d.metal.paths, path];
    });
  }

  function insertPolygon(a: Vec2, b: Vec2) {
    const built = buildPolygon(
      a,
      b,
      get(polygonSides),
      get(polygonCornerStyle),
      get(polygonCornerRadius)
    );
    const path: BadgePath = {
      id: newId(),
      kind: get(activeKind),
      closed: true,
      start: built.start,
      nodes: built.nodes,
      strokeWidth: get(activeStrokeWidth)
    };
    updateDocument((d) => {
      d.metal.paths = [...d.metal.paths, path];
    });
  }

  // Build a regular polygon inscribed in a circle between a and b, optionally
  // with rounded corners. Rounding trims each corner by `radius` along each
  // adjacent edge, then fills the gap with a quarter-style cubic bezier tuned
  // to the interior angle.
  function buildPolygon(
    a: Vec2,
    b: Vec2,
    sides: number,
    style: 'sharp' | 'round',
    radius: number
  ): { start: Vec2; nodes: PathNode[] } {
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const circleR = vDist(a, b) / 2;
    const n = Math.max(3, Math.min(24, Math.round(sides)));
    const offset = Math.atan2(b.y - a.y, b.x - a.x);
    const pts: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      const t = offset + (i / n) * Math.PI * 2;
      pts.push({ x: cx + circleR * Math.cos(t), y: cy + circleR * Math.sin(t) });
    }
    if (style === 'sharp' || radius <= 0) {
      const snapped = pts.map(snapAnchor);
      const nodes: PathNode[] = [];
      for (let i = 1; i < snapped.length; i++) nodes.push({ type: 'line', to: snapped[i] });
      return { start: snapped[0], nodes };
    }
    // Side length of a regular polygon inscribed in a circle of radius R.
    const sideLen = 2 * circleR * Math.sin(Math.PI / n);
    const r = Math.min(radius, sideLen / 2);
    // Bezier handle length that approximates a circular arc across the corner.
    // For a quarter turn (square corners) this is ~0.5523*r; for other interior
    // angles we scale by tan(half-turn-angle)/tan(π/4). The exterior turn at
    // each corner of a regular n-gon is 2π/n, so half the turn is π/n.
    const handle = (4 / 3) * Math.tan(Math.PI / (2 * n)) * r;
    type Corner = { trimIn: Vec2; trimOut: Vec2; c1: Vec2; c2: Vec2 };
    const corners: Corner[] = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const toPrev = norm(sub(prev, curr));
      const toNext = norm(sub(next, curr));
      const trimIn = add(curr, scale2(toPrev, r));
      const trimOut = add(curr, scale2(toNext, r));
      const c1 = add(trimIn, scale2(toPrev, -handle));
      const c2 = add(trimOut, scale2(toNext, -handle));
      corners.push({ trimIn, trimOut, c1, c2 });
    }
    const nodes: PathNode[] = [];
    // Path goes: corner0.trimOut -> line to corner1.trimIn -> curve to corner1.trimOut -> ...
    for (let i = 1; i <= n; i++) {
      const c = corners[i % n];
      nodes.push({ type: 'line', to: { ...c.trimIn } });
      nodes.push({ type: 'cubic', c1: { ...c.c1 }, c2: { ...c.c2 }, to: { ...c.trimOut } });
    }
    // Remove the line at the very end back to the starting trimOut — it will
    // close implicitly via the closed flag. Actually the last pushed cubic
    // lands us back at corners[0].trimOut, which IS the start point, so we
    // don't need a final line. But we DO have an extraneous line pushed at
    // i=n pointing to corners[0].trimIn followed by a curve to corners[0]
    // .trimOut — that's the final corner, and it's correct.
    return { start: { ...corners[0].trimOut }, nodes };
  }

  function sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
  }
  function add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
  }
  function scale2(a: Vec2, s: number): Vec2 {
    return { x: a.x * s, y: a.y * s };
  }
  function norm(a: Vec2): Vec2 {
    const l = Math.hypot(a.x, a.y) || 1;
    return { x: a.x / l, y: a.y / l };
  }

  // Find the segment of `path` closest to world-point `p`, within `pxRadius`
  // screen pixels. Returns segment index and t in [0,1] at the nearest point.
  function pickSegment(path: BadgePath, p: Vec2, pxRadius = 6): { i: number; t: number; dist: number } | null {
    const r = pxRadius / scale + path.strokeWidth / 2;
    let best: { i: number; t: number; dist: number } | null = null;
    const STEPS = 24;
    for (let i = 0; i < path.nodes.length; i++) {
      let bestT = 0;
      let bestD = Infinity;
      for (let s = 0; s <= STEPS; s++) {
        const t = s / STEPS;
        const q = sampleSegment(path, i, t);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bestD) {
          bestD = d;
          bestT = t;
        }
      }
      // Refine with a few bisection passes around bestT.
      let lo = Math.max(0, bestT - 1 / STEPS);
      let hi = Math.min(1, bestT + 1 / STEPS);
      for (let k = 0; k < 8; k++) {
        const mid1 = lo + (hi - lo) / 3;
        const mid2 = hi - (hi - lo) / 3;
        const d1 = Math.hypot(sampleSegment(path, i, mid1).x - p.x, sampleSegment(path, i, mid1).y - p.y);
        const d2 = Math.hypot(sampleSegment(path, i, mid2).x - p.x, sampleSegment(path, i, mid2).y - p.y);
        if (d1 < d2) hi = mid2;
        else lo = mid1;
      }
      const finalT = (lo + hi) / 2;
      const d = Math.hypot(sampleSegment(path, i, finalT).x - p.x, sampleSegment(path, i, finalT).y - p.y);
      if (d <= r && (!best || d < best.dist)) {
        best = { i, t: finalT, dist: d };
      }
    }
    return best;
  }

  function commitMarquee(a: Vec2, b: Vec2, additive: boolean) {
    const x1 = Math.min(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const x2 = Math.max(a.x, b.x);
    const y2 = Math.max(a.y, b.y);
    // If the user barely dragged, treat it as a click — fall through to
    // "clicked empty space" (selection already cleared on pointerdown).
    if (x2 - x1 < 2 && y2 - y1 < 2) return;
    const hits = new Set<string>();
    for (const path of $docStore.metal.paths) {
      const flat = flattenPath(path);
      for (const p of flat) {
        if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
          hits.add(path.id);
          break;
        }
      }
    }
    if (additive) {
      selectedPathIds.update((s) => {
        const n = new Set(s);
        for (const id of hits) n.add(id);
        return n;
      });
    } else {
      selectedPathIds.set(hits);
    }
  }

  function pickPath(p: Vec2): BadgePath | null {
    const paths = $docStore.metal.paths;
    for (let i = paths.length - 1; i >= 0; i--) {
      const path = paths[i];
      const flat = flattenPath(path);
      for (let j = 0; j < flat.length - 1; j++) {
        if (distToSegment(p, flat[j], flat[j + 1]) < 6 / scale + path.strokeWidth / 2) {
          return path;
        }
      }
    }
    return null;
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

  function deleteSelected() {
    // Handle-level selection wins: delete the selected nodes from their path,
    // rather than the whole path. Controls degrade their segment to a line
    // (or its predecessor for 'out' handles). Anchors are removed outright.
    const hkeys = $selectedHandles;
    if (hkeys.size > 0) {
      updateDocument((d) => {
        // Group handles by path and sort node-anchors descending so indices
        // stay valid while we splice. Control demotions don't change indices.
        type Op =
          | { kind: 'deleteNode'; i: number }
          | { kind: 'deleteStart' }
          | { kind: 'demoteIn'; i: number }
          | { kind: 'demoteOut'; i: number };
        const byPath = new Map<string, Op[]>();
        for (const k of hkeys) {
          const parsed = parseHandleKey(k);
          if (!parsed) continue;
          const ops = byPath.get(parsed.pathId) ?? [];
          const h = parsed.handle;
          if (h.kind === 'start') ops.push({ kind: 'deleteStart' });
          else if (h.kind === 'node') ops.push({ kind: 'deleteNode', i: h.i });
          else if (h.kind === 'in') ops.push({ kind: 'demoteIn', i: h.i });
          else ops.push({ kind: 'demoteOut', i: h.i });
          byPath.set(parsed.pathId, ops);
        }
        for (const [pathId, ops] of byPath) {
          const path = d.metal.paths.find((pp) => pp.id === pathId);
          if (!path) continue;
          // Demote controls first (no index change), then delete high-to-low.
          for (const op of ops) {
            if (op.kind === 'demoteIn' || op.kind === 'demoteOut') {
              const i = op.i;
              const node = path.nodes[i];
              if (!node) continue;
              if (node.type === 'cubic') {
                // 'in' = c2 paired with node.to; 'out' = c1 paired with prev.
                // A cubic with one handle removed becomes a quad using the
                // remaining handle as its control. If both end up removed in
                // the same pass, degrade to a straight line.
                const inRemoved = ops.some(
                  (o) => o.kind === 'demoteIn' && o.i === i
                );
                const outRemoved = ops.some(
                  (o) => o.kind === 'demoteOut' && o.i === i
                );
                if (inRemoved && outRemoved) {
                  path.nodes[i] = { type: 'line', to: node.to };
                } else if (inRemoved) {
                  path.nodes[i] = { type: 'quad', control: { ...node.c1 }, to: node.to };
                } else if (outRemoved) {
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
          // Deleting start: promote nodes[0].to into start, like the
          // context-menu behavior already does.
          if (ops.some((o) => o.kind === 'deleteStart') && path.nodes.length > 0) {
            const n0 = path.nodes[0];
            path.start = { ...n0.to };
            path.nodes.splice(0, 1);
            if (path.nodeTypes) path.nodeTypes.splice(0, 1);
          }
        }
        // Clean up any path that ended up with zero nodes.
        d.metal.paths = d.metal.paths.filter((p) => p.nodes.length > 0);
      });
      selectedHandles.set(new Set());
      return;
    }
    const ids = $selectedPathIds;
    if (ids.size === 0) return;
    updateDocument((d) => {
      d.metal.paths = d.metal.paths.filter((p) => !ids.has(p.id));
    });
    selectedPathIds.set(new Set());
    selectedHandles.set(new Set());
  }

  function nudgeSelected(dx: number, dy: number) {
    const hkeys = $selectedHandles;
    if (hkeys.size > 0) {
      updateDocument((d) => nudgeHandles(d, hkeys, dx, dy));
      return;
    }
    const ids = $selectedPathIds;
    if (ids.size === 0) return;
    updateDocument((d) => {
      for (const p of d.metal.paths) {
        if (!ids.has(p.id)) continue;
        p.start.x += dx;
        p.start.y += dy;
        for (const n of p.nodes) {
          n.to.x += dx;
          n.to.y += dy;
          if (n.type === 'cubic') {
            n.c1.x += dx;
            n.c1.y += dy;
            n.c2.x += dx;
            n.c2.y += dy;
          } else if (n.type === 'quad') {
            n.control.x += dx;
            n.control.y += dy;
          }
        }
      }
    });
  }

  // Route a keydown to the current text-edit session. Returns true if the
  // event was handled and the caller should stop processing it (i.e.
  // preventDefault was called). Printable keys insert; Escape/Enter commit;
  // Backspace/Delete edit; arrows + Home/End move the caret. Modifier-only
  // combos (Ctrl+Z, meta keys, etc.) fall through so undo still works.
  function handleTextEditingKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey) return false;
    if (e.key === 'Escape' || e.key === 'Enter') {
      commitEditingText();
      e.preventDefault();
      return true;
    }
    if (e.key === 'Backspace') {
      deleteInEditingText(-1);
      e.preventDefault();
      return true;
    }
    if (e.key === 'Delete') {
      deleteInEditingText(1);
      e.preventDefault();
      return true;
    }
    if (e.key === 'ArrowLeft') {
      moveEditingCaret($editingCaret - 1);
      e.preventDefault();
      return true;
    }
    if (e.key === 'ArrowRight') {
      moveEditingCaret($editingCaret + 1);
      e.preventDefault();
      return true;
    }
    if (e.key === 'Home') {
      moveEditingCaret('home');
      e.preventDefault();
      return true;
    }
    if (e.key === 'End') {
      moveEditingCaret('end');
      e.preventDefault();
      return true;
    }
    // Printable characters: single-char keys that aren't navigation.
    if (e.key.length === 1) {
      typeIntoEditingText(e.key);
      e.preventDefault();
      return true;
    }
    // Let other keys (F-keys, unknown modifiers) fall through.
    return false;
  }

  function handleKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const inInput =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    if (inInput) return;
    // In-canvas text editing takes precedence over every other shortcut so
    // letters like 'v' don't flip the tool mid-word. Escape commits; Enter
    // also commits (single-line only for now); arrows/Home/End move caret;
    // Backspace/Delete edit; printable keys insert.
    if ($editingTextId) {
      if (handleTextEditingKey(e)) return;
    }
    if (e.code === 'Space') {
      spaceHeld = true;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      if (pencilStroke) {
        pencilStroke = null;
      } else if (draftPath) {
        cancelDraft();
      } else if ($selectedHandles.size > 0) {
        selectedHandles.set(new Set());
      } else {
        selectedPathIds.set(new Set());
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (draftPath) {
        if (draftPath.nodes.length >= 1) {
          draftPath = { ...draftPath, nodes: draftPath.nodes.slice(0, -1) };
          pendingOutHandle = null;
          penDown = null;
        } else {
          cancelDraft();
        }
        e.preventDefault();
        return;
      }
      deleteSelected();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (draftPath && draftPath.nodes.length >= 1) {
        commitDraft(false);
        e.preventDefault();
      }
    } else if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown'
    ) {
      if ($selectedPathIds.size === 0) return;
      const step = e.shiftKey ? 1 : 0.1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      nudgeSelected(dx, dy);
      e.preventDefault();
    } else {
      // Node-editing shortcuts — only when a single path is selected.
      if (!handleNodeEditKey(e)) return;
    }
  }

  // Returns true if the key was consumed (for e.preventDefault callers).
  function handleNodeEditKey(e: KeyboardEvent): boolean {
    const sel = selectedSingle();
    if (!sel) return false;
    const hkeys = $selectedHandles;
    // Selected anchor indices (start + node anchors).
    const selectedAnchors: number[] = [];
    for (const k of hkeys) {
      const parsed = parseHandleKey(k);
      if (!parsed || parsed.pathId !== sel.id) continue;
      if (parsed.handle.kind === 'start') selectedAnchors.push(0);
      else if (parsed.handle.kind === 'node') selectedAnchors.push(parsed.handle.i + 1);
    }
    selectedAnchors.sort((a, b) => a - b);

    // Insert — split every "selected segment" (both endpoints selected) at t=0.5.
    if (e.key === 'Insert') {
      if (selectedAnchors.length < 2) return false;
      const segIndices: number[] = [];
      for (let k = 0; k < selectedAnchors.length - 1; k++) {
        if (selectedAnchors[k + 1] === selectedAnchors[k] + 1) {
          // segment between anchor[k] and anchor[k]+1 is nodes[anchor[k]]
          segIndices.push(selectedAnchors[k]);
        }
      }
      if (segIndices.length === 0) return false;
      updateDocument((d) => {
        const path = d.metal.paths.find((pp) => pp.id === sel.id);
        if (!path) return;
        // Split high-to-low so earlier indices stay valid.
        for (const i of segIndices.slice().sort((a, b) => b - a)) {
          splitSegmentAt(path, i, 0.5);
        }
      });
      e.preventDefault();
      return true;
    }

    // Node type shortcuts (Shift + C/S/Y/A). Act on every selected anchor.
    if (e.shiftKey && selectedAnchors.length > 0) {
      let newType: NodeType | null = null;
      if (e.key === 'C' || e.key === 'c') newType = 'cusp';
      else if (e.key === 'S' || e.key === 's') newType = 'smooth';
      else if (e.key === 'Y' || e.key === 'y') newType = 'symmetric';
      else if (e.key === 'A' || e.key === 'a') newType = 'auto';
      else if (e.key === 'B' || e.key === 'b') {
        // Shift+B — break (split) selected anchors.
        if (selectedAnchors.length !== 1) return false;
        const anchorIdx = selectedAnchors[0];
        updateDocument((d) => {
          const idx = d.metal.paths.findIndex((pp) => pp.id === sel.id);
          if (idx < 0) return;
          const replacements = splitAtAnchor(d.metal.paths[idx], anchorIdx, newId);
          d.metal.paths.splice(idx, 1, ...replacements);
        });
        selectedHandles.set(new Set());
        e.preventDefault();
        return true;
      } else if (e.key === 'J' || e.key === 'j') {
        // Shift+J — merge two selected endpoint anchors.
        if (selectedAnchors.length !== 2) return false;
        const endpoints: EndpointRef[] = [];
        // Anchor index 0 is a "start" endpoint if path is open; last anchor
        // is an "end" endpoint. Only open paths participate.
        // For cross-path joins we need the selection to actually span two
        // paths — selectedAnchors only carries indices within sel. So we
        // need to look at raw handle keys to know which paths they refer to.
        for (const k of hkeys) {
          const parsed = parseHandleKey(k);
          if (!parsed) continue;
          const path = $docStore.metal.paths.find((pp) => pp.id === parsed.pathId);
          if (!path || path.closed) continue;
          if (parsed.handle.kind === 'start') {
            endpoints.push({ pathId: parsed.pathId, endpoint: 'start' });
          } else if (parsed.handle.kind === 'node' && parsed.handle.i === path.nodes.length - 1) {
            endpoints.push({ pathId: parsed.pathId, endpoint: 'end' });
          }
        }
        if (endpoints.length !== 2) return false;
        updateDocument((d) => {
          mergeEndpoints(d.metal.paths, endpoints[0], endpoints[1]);
        });
        selectedHandles.set(new Set());
        e.preventDefault();
        return true;
      }
      if (newType) {
        updateDocument((d) => {
          const path = d.metal.paths.find((pp) => pp.id === sel.id);
          if (!path) return;
          for (const a of selectedAnchors) setNodeType(path, a, newType!);
          if (newType === 'auto') {
            for (const a of selectedAnchors) applyAutoAt(path, a);
          }
        });
        e.preventDefault();
        return true;
      }
    }

    // Segment-type shortcuts (unshifted L/C). Act on every "selected segment"
    // (both endpoints selected). Lowercase only — avoids shadowing Shift+C.
    if (!e.shiftKey && (e.key === 'l' || e.key === 'c')) {
      if (selectedAnchors.length < 2) return false;
      const segIndices: number[] = [];
      for (let k = 0; k < selectedAnchors.length - 1; k++) {
        if (selectedAnchors[k + 1] === selectedAnchors[k] + 1) {
          segIndices.push(selectedAnchors[k]);
        }
      }
      if (segIndices.length === 0) return false;
      const toLine = e.key === 'l';
      updateDocument((d) => {
        const path = d.metal.paths.find((pp) => pp.id === sel.id);
        if (!path) return;
        for (const i of segIndices) {
          if (toLine) {
            path.nodes[i] = { type: 'line', to: { ...path.nodes[i].to } };
          } else {
            ensureCubicNode(path, i);
          }
        }
      });
      e.preventDefault();
      return true;
    }

    return false;
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') spaceHeld = false;
  }

  function pathToSvgD(path: BadgePath): string {
    let d = `M ${path.start.x} ${path.start.y}`;
    for (const n of path.nodes) {
      if (n.type === 'line') d += ` L ${n.to.x} ${n.to.y}`;
      else if (n.type === 'quad') d += ` Q ${n.control.x} ${n.control.y} ${n.to.x} ${n.to.y}`;
      else d += ` C ${n.c1.x} ${n.c1.y} ${n.c2.x} ${n.c2.y} ${n.to.x} ${n.to.y}`;
    }
    if (isEffectivelyClosed(path)) d += ' Z';
    return d;
  }

  function cellToSvgD(cell: Cell): string {
    if (cell.polygon.length === 0) return '';
    let d = `M ${cell.polygon[0].x} ${cell.polygon[0].y}`;
    for (let i = 1; i < cell.polygon.length; i++) {
      d += ` L ${cell.polygon[i].x} ${cell.polygon[i].y}`;
    }
    d += ' Z';
    for (const hole of cell.holes) {
      if (hole.length === 0) continue;
      d += ` M ${hole[0].x} ${hole[0].y}`;
      for (let i = 1; i < hole.length; i++) d += ` L ${hole[i].x} ${hole[i].y}`;
      d += ' Z';
    }
    return d;
  }

  function nodesToD(start: Vec2, nodes: PathNode[], close: boolean): string {
    let d = `M ${start.x} ${start.y}`;
    for (const n of nodes) {
      if (n.type === 'line') d += ` L ${n.to.x} ${n.to.y}`;
      else if (n.type === 'quad') d += ` Q ${n.control.x} ${n.control.y} ${n.to.x} ${n.to.y}`;
      else d += ` C ${n.c1.x} ${n.c1.y} ${n.c2.x} ${n.c2.y} ${n.to.x} ${n.to.y}`;
    }
    if (close) d += ' Z';
    return d;
  }

  function previewShape(): string {
    if (!dragStart || !dragCurrent || !dragTool) return '';
    const a = dragStart;
    let b = dragCurrent;
    if (dragConstrain) {
      if (dragTool === 'ellipse' || dragTool === 'polygon') {
        b = squarizeEndpoint(a, b);
      } else if (dragTool === 'line') {
        b = snapAngle(a, b, 15);
      }
    }
    if (dragTool === 'line') return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    if (dragTool === 'rect') {
      const built = buildRect(a, b, $rectCornerStyle, $rectCornerRadius);
      return nodesToD(built.start, built.nodes, true);
    }
    if (dragTool === 'ellipse') {
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    if (dragTool === 'polygon') {
      const built = buildPolygon(
        a,
        b,
        $polygonSides,
        $polygonCornerStyle,
        $polygonCornerRadius
      );
      return nodesToD(built.start, built.nodes, true);
    }
    return '';
  }

  function draftToSvgD(): string {
    if (!draftPath) return '';
    let d = `M ${draftPath.start.x} ${draftPath.start.y}`;
    for (const n of draftPath.nodes) {
      if (n.type === 'line') d += ` L ${n.to.x} ${n.to.y}`;
      else if (n.type === 'quad') d += ` Q ${n.control.x} ${n.control.y} ${n.to.x} ${n.to.y}`;
      else d += ` C ${n.c1.x} ${n.c1.y} ${n.c2.x} ${n.c2.y} ${n.to.x} ${n.to.y}`;
    }
    // rubber-band to hover point (and use pendingOutHandle for nicer preview).
    // When the hover is close enough to the start to close the path, snap the
    // preview endpoint to `start` so the affordance and the preview agree.
    if (hoverPoint) {
      const target = nearCloseStart ? draftPath.start : hoverPoint;
      if (pendingOutHandle) {
        d += ` C ${pendingOutHandle.x} ${pendingOutHandle.y} ${target.x} ${target.y} ${target.x} ${target.y}`;
      } else {
        d += ` L ${target.x} ${target.y}`;
      }
    }
    return d;
  }

  function warningColor(w: Warning): string {
    switch (w.kind) {
      case 'self-intersect':
      case 'no-outline':
        return '#e25f3a';
      case 'thin-wall':
        return '#e0a82d';
      case 'small-cell':
        return '#e0a82d';
      default:
        return '#e25f3a';
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);
    requestAnimationFrame(fitToView);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', handleKey);
    window.removeEventListener('keyup', handleKeyUp);
  });

  // derived overlay for selected path
  let selectedPath = $derived(selectedSingle());
  let overlay = $derived(selectedPath ? overlayHandles(selectedPath) : []);

  // Invariant: a handle can only be selected if its owning path is the single
  // selected path AND the referenced node still exists. Structural edits
  // (delete, pen close, etc.) or a change in path selection must therefore
  // prune stale keys. Runs whenever the selected-path derivation or the doc
  // changes.
  // Drop the trim hover state whenever the user switches to a different
  // tool — otherwise the red highlight would linger over the last hovered
  // span until the next pointermove.
  $effect(() => {
    if ($metalTool !== 'trim' && trimHover) trimHover = null;
  });

  // Commit any in-progress text edit when the user switches away from the
  // text tool. Without this, switching to pen (say) would leave an invisible
  // edit session active in the background — subsequent typing could still
  // reach it via the keydown handler even though the caret isn't visible.
  $effect(() => {
    if ($metalTool !== 'text' && $editingTextId) {
      commitEditingText();
    }
  });

  $effect(() => {
    void $docStore;
    const path = selectedPath;
    if (!path) {
      if ($selectedHandles.size > 0) selectedHandles.set(new Set());
      return;
    }
    const current = $selectedHandles;
    if (current.size === 0) return;
    const next = new Set<string>();
    for (const k of current) {
      const parsed = parseHandleKey(k);
      if (!parsed) continue;
      if (parsed.pathId !== path.id) continue;
      const h = parsed.handle;
      if (h.kind === 'start') next.add(k);
      else if (h.kind === 'node' || h.kind === 'in' || h.kind === 'out') {
        if (path.nodes[h.i]) next.add(k);
      }
    }
    if (next.size !== current.size) selectedHandles.set(next);
  });
</script>

<div
  class="viewport"
  bind:this={viewport}
  class:panning={isPanning}
  class:space-pan={(spaceHeld || $metalTool === 'grab') && !isPanning}
  onwheel={handleWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  ondblclick={onDoubleClick}
  oncontextmenu={onContextMenu}
  role="application"
  aria-label="Badger metal canvas"
  tabindex="-1"
>
  <svg
    class="canvas-svg"
    viewBox={`${-panX / scale} ${-panY / scale} ${viewport ? viewport.clientWidth / scale : 600} ${viewport ? viewport.clientHeight / scale : 600}`}
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="0"
      y="0"
      width={$docStore.canvas.width}
      height={$docStore.canvas.height}
      fill="#2e2e2e"
      stroke="#999"
      stroke-width={1 / scale}
    />

    {#if $snapEnabled && scale >= 4}
      <g pointer-events="none" stroke="#ffffff" stroke-width={0.5 / scale} opacity="0.12">
        {#each Array($docStore.canvas.width + 1) as _, i}
          <line x1={i} y1="0" x2={i} y2={$docStore.canvas.height} />
        {/each}
        {#each Array($docStore.canvas.height + 1) as _, i}
          <line x1="0" y1={i} x2={$docStore.canvas.width} y2={i} />
        {/each}
      </g>
    {/if}

    <defs>
      {#if $outlineClipD}
        <clipPath id="badger-metal-outline-clip" clipPathUnits="userSpaceOnUse">
          <path d={$outlineClipD} clip-rule="nonzero" />
        </clipPath>
      {/if}
      <pattern
        id="badger-metal-material-glitter"
        patternUnits="userSpaceOnUse"
        width="1.6"
        height="1.6"
      >
        <circle cx="0.25" cy="0.35" r="0.11" fill="rgba(255,255,255,0.9)" />
        <circle cx="1.10" cy="0.20" r="0.07" fill="rgba(255,255,255,0.7)" />
        <circle cx="0.70" cy="0.95" r="0.09" fill="rgba(255,255,255,0.8)" />
        <circle cx="1.35" cy="1.25" r="0.06" fill="rgba(255,255,255,0.6)" />
        <circle cx="0.15" cy="1.40" r="0.08" fill="rgba(0,0,0,0.35)" />
        <circle cx="1.00" cy="0.75" r="0.05" fill="rgba(0,0,0,0.25)" />
      </pattern>
      <linearGradient
        id="badger-metal-material-metallic"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
      >
        <stop offset="0" stop-color="rgba(255,255,255,0.55)" />
        <stop offset="0.45" stop-color="rgba(255,255,255,0)" />
        <stop offset="0.55" stop-color="rgba(0,0,0,0)" />
        <stop offset="1" stop-color="rgba(0,0,0,0.35)" />
      </linearGradient>
      <linearGradient
        id="badger-metal-material-cloisonne-sheen"
        x1="0"
        y1="0"
        x2="1"
        y2="1"
      >
        <stop offset="0" stop-color="rgba(255,255,255,0.42)" />
        <stop offset="0.18" stop-color="rgba(255,255,255,0.18)" />
        <stop offset="0.42" stop-color="rgba(255,255,255,0)" />
        <stop offset="0.72" stop-color="rgba(32,18,8,0.04)" />
        <stop offset="1" stop-color="rgba(0,0,0,0.16)" />
      </linearGradient>
      <radialGradient
        id="badger-metal-material-cloisonne-depth"
        cx="35%"
        cy="28%"
        r="80%"
      >
        <stop offset="0" stop-color="rgba(255,255,255,0.16)" />
        <stop offset="0.45" stop-color="rgba(255,255,255,0.04)" />
        <stop offset="0.72" stop-color="rgba(0,0,0,0)" />
        <stop offset="1" stop-color="rgba(0,0,0,0.14)" />
      </radialGradient>
      <pattern
        id="badger-metal-unassigned-hatch"
        patternUnits="userSpaceOnUse"
        width="1.2"
        height="1.2"
        patternTransform="rotate(45)"
      >
        <line x1="0" y1="0" x2="0" y2="1.2" stroke="rgba(0,0,0,0.28)" stroke-width="0.35" />
      </pattern>
    </defs>

    {#if $referenceImage && $referenceVisible && $referenceLayer === 'behind'}
      <image
        href={$referenceImage}
        x="0"
        y="0"
        width={$docStore.canvas.width}
        height={$docStore.canvas.height}
        opacity={$referenceOpacity}
        preserveAspectRatio="xMidYMid meet"
        pointer-events="none"
      />
    {/if}

    {#if $outlineClipD}
      <!-- Metal base: fill the entire silhouette with the finish color so any
           gap between a cell polygon and the silver stroke rim (at rounded
           joins, concave notches, etc.) reveals metal rather than canvas
           background. Matches physical reality — the whole base is metal,
           enamel fills pockets on top. -->
      <path d={$outlineClipD} fill={finishHex($docStore.render.finish)} fill-rule="nonzero" pointer-events="none" />
    {/if}

    {#each $cells as cell (cell.id)}
      {@const material = $docStore.materialAssignments[cell.id]}
      {@const assigned = $docStore.colorAssignments[cell.id]}
      <path
        d={cellToSvgD(cell)}
        fill={assigned ?? 'none'}
        fill-rule="evenodd"
        stroke={$showCellBorders ? 'rgba(0,0,0,0.25)' : 'none'}
        stroke-width={0.5 / scale}
        class:hover={$hoveredCellId === cell.id}
      />
      {#if assigned}
        <path
          d={cellToSvgD(cell)}
          fill="url(#badger-metal-material-cloisonne-depth)"
          fill-rule="evenodd"
          stroke="none"
          pointer-events="none"
        />
        <path
          d={cellToSvgD(cell)}
          fill="url(#badger-metal-material-cloisonne-sheen)"
          fill-rule="evenodd"
          stroke="none"
          pointer-events="none"
        />
      {/if}
      {#if !assigned}
        <path
          d={cellToSvgD(cell)}
          fill="url(#badger-metal-unassigned-hatch)"
          fill-rule="evenodd"
          stroke="none"
          pointer-events="none"
        />
        <path
          d={cellToSvgD(cell)}
          fill="none"
          stroke="white"
          stroke-width={1 / scale}
          fill-rule="evenodd"
          pointer-events="none"
          style="mix-blend-mode: difference"
        />
      {/if}
      {#if material === 'glitter' || material === 'metallic'}
        <path
          d={cellToSvgD(cell)}
          fill={material === 'glitter'
            ? 'url(#badger-metal-material-glitter)'
            : 'url(#badger-metal-material-metallic)'}
          fill-rule="evenodd"
          stroke="none"
          pointer-events="none"
        />
      {/if}
    {/each}

    {#each renderedPaths as path (path.id)}
      {@const pathKind = effectiveKind(path)}
      {@const pathStrokeWidth = path.strokeWidth}
      {@const metalColor = finishHex($docStore.render.finish)}
      {@const pathClip =
        pathKind !== 'cutout' && $outlineClipD
          ? 'url(#badger-metal-outline-clip)'
          : undefined}
      {#if $selectedPathIds.has(path.id)}
        <path
          d={pathToSvgD(path)}
          fill="none"
          stroke="#ff6ec7"
          stroke-width={pathStrokeWidth + 4 / scale}
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="0.85"
          pointer-events="none"
          clip-path={pathClip}
        />
      {/if}
      <path
        d={pathToSvgD(path)}
        fill={pathKind === 'cutout' ? 'rgba(30,30,30,0.75)' : 'none'}
        stroke={pathKind === 'cutout' ? '#1b1b1b' : metalColor}
        stroke-width={pathStrokeWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
        clip-path={pathClip}
      />
      {#if pathKind === 'cutout'}
        {@const pole = poleOfInaccessibility(flattenPath(path))}
        {@const c = pole.point}
        {@const halfX = (pole.radius / Math.SQRT2) * 0.8}
        {#if halfX > 0}
          <g
            stroke="#1b1b1b"
            stroke-width={Math.max(pathStrokeWidth, 1 / scale)}
            stroke-linecap="round"
            pointer-events="none"
          >
            <line x1={c.x - halfX} y1={c.y - halfX} x2={c.x + halfX} y2={c.y + halfX} />
            <line x1={c.x - halfX} y1={c.y + halfX} x2={c.x + halfX} y2={c.y - halfX} />
          </g>
        {/if}
      {/if}
    {/each}

    {#each $docStore.metal.texts as t (t.id)}
      {@const isSel = $selectedTextId === t.id}
      {@const isEditing = $editingTextId === t.id}
      {@const font = (void $fontLoadTick, getLoadedFont(t.fontId))}
      {@const w = font ? font.getAdvanceWidth(t.text || ' ', t.sizeMm) : Math.max(t.sizeMm * 0.6 * Math.max(1, t.text.length), t.sizeMm)}
      {@const caretX = isEditing && font
        ? t.position.x + font.getAdvanceWidth(t.text.slice(0, $editingCaret) || '', t.sizeMm)
        : 0}
      <g pointer-events="none">
        {#if isSel || isEditing}
          <rect
            x={t.position.x}
            y={t.position.y}
            width={w}
            height={t.sizeMm}
            fill={isEditing ? 'rgba(255,110,199,0.05)' : 'rgba(255,110,199,0.08)'}
            stroke={isEditing ? 'rgba(255,110,199,0.5)' : '#ff6ec7'}
            stroke-width={1 / scale}
            stroke-dasharray={isEditing ? `${2 / scale} ${2 / scale}` : 'none'}
          />
        {/if}
        {#if isEditing && font && caretBlinkOn}
          <line
            x1={caretX}
            y1={t.position.y}
            x2={caretX}
            y2={t.position.y + t.sizeMm}
            stroke="#ff6ec7"
            stroke-width={Math.max(t.sizeMm * 0.04, 1 / scale)}
          />
        {/if}
        {#if !font}
          <text
            x={t.position.x + w / 2}
            y={t.position.y + t.sizeMm / 2}
            font-size={Math.max(2, t.sizeMm * 0.4)}
            fill="#ff6ec7"
            text-anchor="middle"
            dominant-baseline="middle"
          >font unavailable</text>
        {/if}
      </g>
    {/each}

    {#if $metalTool === 'trim' && trimHover}
      {@const span = trimHover.span.points}
      {@const hoveredStrokeWidth = trimHover.path.strokeWidth}
      <path
        d={`M ${span[0].x} ${span[0].y} ${span
          .slice(1)
          .map((pt) => `L ${pt.x} ${pt.y}`)
          .join(' ')}`}
        fill="none"
        stroke="#ff3b3b"
        stroke-width={hoveredStrokeWidth + 4 / scale}
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.85"
        pointer-events="none"
      />
    {/if}

    {#if $referenceImage && $referenceVisible && $referenceLayer === 'front'}
      <image
        href={$referenceImage}
        x="0"
        y="0"
        width={$docStore.canvas.width}
        height={$docStore.canvas.height}
        opacity={$referenceOpacity}
        preserveAspectRatio="xMidYMid meet"
        pointer-events="none"
      />
    {/if}

    {#if draftPath}
      <path
        d={draftToSvgD()}
        fill="none"
        stroke="#3c7fb8"
        stroke-width={Math.max(1 / scale, draftPath.strokeWidth * 0.6)}
        stroke-dasharray={`${4 / scale},${4 / scale}`}
      />
      {#if nearCloseStart}
        <circle
          cx={draftPath.start.x}
          cy={draftPath.start.y}
          r={6 / scale}
          fill="#3c7fb8"
          fill-opacity="0.25"
          stroke="#3c7fb8"
          stroke-width={1.5 / scale}
        />
      {/if}
      {#if penDown && penDown.current && (penDown.current.x !== penDown.anchor.x || penDown.current.y !== penDown.anchor.y)}
        <line
          x1={penDown.anchor.x - (penDown.current.x - penDown.anchor.x)}
          y1={penDown.anchor.y - (penDown.current.y - penDown.anchor.y)}
          x2={penDown.current.x}
          y2={penDown.current.y}
          stroke="#3c7fb8"
          stroke-width={1 / scale}
          stroke-dasharray={`${2 / scale},${2 / scale}`}
        />
        <circle cx={penDown.anchor.x} cy={penDown.anchor.y} r={3 / scale} fill="#3c7fb8" />
        <circle
          cx={penDown.current.x}
          cy={penDown.current.y}
          r={3 / scale}
          fill="#fff"
          stroke="#3c7fb8"
          stroke-width={1 / scale}
        />
      {/if}
    {/if}

    {#if pencilStroke && pencilStroke.length >= 2}
      <path
        d={pencilStroke.reduce(
          (acc, pt, i) => acc + (i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`),
          ''
        )}
        fill="none"
        stroke="#3c7fb8"
        stroke-width={Math.max(1 / scale, $activeStrokeWidth * 0.6)}
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.7"
      />
    {/if}

    {#if dragStart && dragCurrent && (dragTool === 'marquee' || dragTool === 'marquee-add')}
      <rect
        x={Math.min(dragStart.x, dragCurrent.x)}
        y={Math.min(dragStart.y, dragCurrent.y)}
        width={Math.abs(dragCurrent.x - dragStart.x)}
        height={Math.abs(dragCurrent.y - dragStart.y)}
        fill="rgba(60,127,184,0.12)"
        stroke="#3c7fb8"
        stroke-width={1 / scale}
        stroke-dasharray={`${3 / scale},${3 / scale}`}
      />
    {:else if dragStart && dragCurrent}
      <path
        d={previewShape()}
        fill="none"
        stroke="#3c7fb8"
        stroke-width={2 / scale}
        stroke-dasharray={`${4 / scale},${4 / scale}`}
      />
    {/if}

    <!-- node / handle overlay for the selected path -->
    {#if selectedPath}
      {#each overlay as item, i (i)}
        {#if item.kind === 'control' && item.pairFrom}
          <line
            x1={item.pairFrom.x}
            y1={item.pairFrom.y}
            x2={item.pos.x}
            y2={item.pos.y}
            stroke="#ff6ec7"
            stroke-width={0.75 / scale}
            stroke-dasharray={`${2 / scale},${2 / scale}`}
            opacity="0.7"
          />
        {/if}
      {/each}
      {#each overlay as item, i (i)}
        {@const isSelected = $selectedHandles.has(handleKey_(selectedPath.id, item.id))}
        {#if item.kind === 'anchor'}
          {@const r = (isSelected ? 5 : 4) / scale}
          {@const fill = isSelected ? '#ff6ec7' : '#fff'}
          {@const stroke = isSelected ? '#1a1a1a' : '#ff6ec7'}
          {@const sw = 1.25 / scale}
          {#if item.nodeType === 'smooth'}
            <circle cx={item.pos.x} cy={item.pos.y} r={r} fill={fill} stroke={stroke} stroke-width={sw} />
          {:else if item.nodeType === 'symmetric'}
            <rect
              x={item.pos.x - r}
              y={item.pos.y - r}
              width={r * 2}
              height={r * 2}
              fill={fill}
              stroke={stroke}
              stroke-width={sw}
              transform={`rotate(45 ${item.pos.x} ${item.pos.y})`}
            />
          {:else if item.nodeType === 'auto'}
            <circle cx={item.pos.x} cy={item.pos.y} r={r} fill={fill} stroke={stroke} stroke-width={sw} stroke-dasharray={`${1.5 / scale},${1.5 / scale}`} />
          {:else}
            <rect
              x={item.pos.x - r}
              y={item.pos.y - r}
              width={r * 2}
              height={r * 2}
              fill={fill}
              stroke={stroke}
              stroke-width={sw}
            />
          {/if}
        {:else}
          <circle
            cx={item.pos.x}
            cy={item.pos.y}
            r={(isSelected ? 4.5 : 3.25) / scale}
            fill={isSelected ? '#1a1a1a' : '#ff6ec7'}
            stroke={isSelected ? '#ff6ec7' : '#fff'}
            stroke-width={(isSelected ? 1.5 : 1) / scale}
          />
        {/if}
      {/each}
    {/if}

    <!--
      Transform bounding box + scale/rotate handles. Shown when the select
      tool is active and at least one path is selected. During a drag the box
      + handles render at `transformDrag.currentMatrix * initial corners` so
      they track the live-transformed shape (a rotated quad while rotating;
      an axis-aligned rect while scaling/moving).
    -->
    {#if $metalTool === 'select' && selectionBBox && $selectedPathIds.size > 0}
      {@const tbb = selectionBBox}
      {@const hp = handlePositions(tbb)}
      {@const m = transformDrag ? transformDrag.currentMatrix : IDENTITY}
      {@const tp = (pt: Vec2) => applyAffine(m, pt)}
      {@const corners = [tp(hp.nw), tp(hp.ne), tp(hp.se), tp(hp.sw)]}
      {@const hz = 5 / scale}
      {@const sw = 1 / scale}
      {@const stroke = '#ff6ec7'}
      {@const fill = '#fff'}
      <g pointer-events="none">
        <polygon
          points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
          fill="none"
          stroke={stroke}
          stroke-width={sw}
          stroke-dasharray={`${3 / scale},${3 / scale}`}
          opacity="0.9"
        />
        {#each ['nw','n','ne','w','e','sw','s','se'] as k (k)}
          {@const c = tp(hp[k as ScaleHandleKind])}
          <rect
            x={c.x - hz}
            y={c.y - hz}
            width={hz * 2}
            height={hz * 2}
            fill={fill}
            stroke={stroke}
            stroke-width={sw}
          />
        {/each}
      </g>
    {/if}

    {#if $showManufacturingWarnings}
      {#each warnings as w, i (i)}
        {#if w.at}
          <circle
            cx={w.at.x}
            cy={w.at.y}
            r={6 / scale}
            fill="none"
            stroke={warningColor(w)}
            stroke-width={1.5 / scale}
          />
        {/if}
      {/each}
    {/if}

    {#if badgeBBox}
      {@const bb = badgeBBox}
      {@const unit = $displayUnit}
      {@const steps = rulerSteps(unit, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY))}
      {@const mmPer = unit === 'mm' ? 1 : 25.4}
      {@const minorMm = steps.minor * mmPer}
      {@const majorMm = steps.major * mmPer}
      {@const pad = 14 / scale}
      {@const tickMinor = 1.5 / scale}
      {@const tickMajor = 3 / scale}
      {@const fontSize = 9 / scale}
      {@const stroke = 0.6 / scale}
      {@const axisColor = '#1a1a1a'}
      {@const tickColor = '#aaa'}
      {@const labelColor = '#e6e6e6'}
      <g class="ruler" pointer-events="none">
        <!-- bottom axis -->
        <line
          x1={bb.minX}
          y1={bb.maxY + pad}
          x2={bb.maxX}
          y2={bb.maxY + pad}
          stroke={axisColor}
          stroke-width={stroke}
        />
        <!-- left axis -->
        <line
          x1={bb.minX - pad}
          y1={bb.minY}
          x2={bb.minX - pad}
          y2={bb.maxY}
          stroke={axisColor}
          stroke-width={stroke}
        />

        <!-- bottom ticks/labels -->
        {#each Array.from({ length: Math.floor((bb.maxX - bb.minX) / minorMm) + 1 }, (_, i) => i) as i (i)}
          {@const x = bb.minX + i * minorMm}
          {@const isMajor = Math.abs(((x - bb.minX) % majorMm)) < minorMm * 0.01 || Math.abs(((x - bb.minX) % majorMm) - majorMm) < minorMm * 0.01}
          {#if x <= bb.maxX + minorMm * 0.01}
            <line
              x1={x}
              y1={bb.maxY + pad}
              x2={x}
              y2={bb.maxY + pad + (isMajor ? tickMajor : tickMinor)}
              stroke={tickColor}
              stroke-width={stroke}
            />
            {#if isMajor}
              <text
                x={x}
                y={bb.maxY + pad + tickMajor + fontSize}
                font-size={fontSize}
                fill={labelColor}
                text-anchor="middle"
                font-family="system-ui, sans-serif"
              >
                {mmToDisplay(x - bb.minX, unit).toFixed(unit === 'mm' ? 0 : 2)}
              </text>
            {/if}
          {/if}
        {/each}

        <!-- left ticks/labels -->
        {#each Array.from({ length: Math.floor((bb.maxY - bb.minY) / minorMm) + 1 }, (_, i) => i) as i (i)}
          {@const y = bb.minY + i * minorMm}
          {@const isMajor = Math.abs(((y - bb.minY) % majorMm)) < minorMm * 0.01 || Math.abs(((y - bb.minY) % majorMm) - majorMm) < minorMm * 0.01}
          {#if y <= bb.maxY + minorMm * 0.01}
            <line
              x1={bb.minX - pad - (isMajor ? tickMajor : tickMinor)}
              y1={y}
              x2={bb.minX - pad}
              y2={y}
              stroke={tickColor}
              stroke-width={stroke}
            />
            {#if isMajor}
              <text
                x={bb.minX - pad - tickMajor - fontSize * 0.4}
                y={y + fontSize * 0.35}
                font-size={fontSize}
                fill={labelColor}
                text-anchor="end"
                font-family="system-ui, sans-serif"
              >
                {mmToDisplay(bb.maxY - y, unit).toFixed(unit === 'mm' ? 0 : 2)}
              </text>
            {/if}
          {/if}
        {/each}

        <!-- dimension summary near the origin corner -->
        <text
          x={bb.minX}
          y={bb.minY - pad - fontSize * 0.5}
          font-size={fontSize}
          fill={labelColor}
          text-anchor="start"
          font-family="system-ui, sans-serif"
        >
          {mmToDisplay(bb.maxX - bb.minX, unit).toFixed(unit === 'mm' ? 1 : 3)} × {mmToDisplay(bb.maxY - bb.minY, unit).toFixed(unit === 'mm' ? 1 : 3)} {unitLabel(unit)}
        </text>
      </g>
    {/if}
  </svg>

  <div
    class="zoom-controls"
    role="toolbar"
    aria-label="Zoom controls"
    tabindex="0"
    onpointerdown={(e) => e.stopPropagation()}
  >
    <button type="button" onclick={() => zoomAtCenter(1 / 1.2)}>−</button>
    <span>{Math.round(scale * 100)}%</span>
    <button type="button" onclick={() => zoomAtCenter(1.2)}>+</button>
    <button type="button" onclick={fitToView}>Fit</button>
    <button
      type="button"
      class="magnet"
      class:on={$snapEnabled}
      aria-pressed={$snapEnabled}
      title={$snapEnabled ? 'Snapping on — click to disable' : 'Snapping off — click to enable'}
      onclick={() => snapEnabled.update((s) => !s)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M3 3 h3 v5 a2 2 0 0 0 4 0 V3 h3 v5 a5 5 0 0 1 -10 0 z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path d="M3 5 h3 M10 5 h3" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
  </div>

  {#if selectedPath}
    <div class="edit-hint">
      Editing path · drag nodes or handles · double-click a node to cycle segment type · right-click
      to delete · Shift-drag a handle to break symmetry
    </div>
  {/if}
</div>

<style lang="scss">
  .viewport {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #2e2e2e;
    border: 1px solid #a0a0a0;
    cursor: crosshair;
    outline: none;

    &.space-pan {
      cursor: grab;
    }
    &.panning {
      cursor: grabbing;
    }
  }

  .canvas-svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .hover {
    stroke: #3c7fb8 !important;
  }

  .zoom-controls {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    display: flex;
    gap: 0.25rem;
    align-items: center;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    color: #fff;
    font-size: 0.85rem;

    button {
      width: 1.75rem;
      height: 1.75rem;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }

    .magnet {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(255, 255, 255, 0.55);

      &.on {
        color: #ffb84d;
        border-color: rgba(255, 184, 77, 0.6);
        background: rgba(255, 184, 77, 0.18);
      }
    }
  }

  .edit-hint {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    max-width: 32rem;
    padding: 0.35rem 0.6rem;
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    font-size: 0.8rem;
    line-height: 1.3;
    border-radius: 4px;
  }
</style>
