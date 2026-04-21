import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { MATERIAL_DEFAULT_BRUSH_HEX } from '$lib/materialPalette';
import {
  emptyDocument,
  cloneDoc,
  type BadgeDocument,
  type BadgePath,
  type Cell,
  type Mode,
  type MetalTool,
  type ColorsTool,
  type EnamelMaterial,
  type ModalRequest,
  type PathKind,
  type RectCornerStyle,
  type PolygonCornerStyle
} from './types';
import { computeTopology } from '../topology/planar';
import { signedArea } from '../topology/geometry';
import { reassignPerCell } from '../topology/stableIds';
import { simplifyPath } from '../simplify';
import { validateBadgeDocument } from './validate';
import { fontLoadTick } from './fontLibrary';
import { effectiveMetalPaths } from './effectivePaths';

// Bumped when on-disk document shape changes in a way that makes older
// persisted documents meaningless. v2: canvas is mm-native (pixel-scale docs
// from v1 are discarded on load).
const STORAGE_KEY = 'badger-document-v2';
const SKIP_STARTUP_KEY = 'badger-skip-startup';

function loadInitial(): BadgeDocument {
  if (!browser) return emptyDocument();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDocument();
    const parsed = JSON.parse(raw);
    // Collapse the old 3-way `kind` ("outline" | "divider" | "cutout") down
    // to the new 2-way ("shape" | "cutout"). Old outline and divider paths
    // both become `shape` — the outline/divider split is now derived from
    // whether the path is closed. Cutouts carry through unchanged. The
    // validator also does this, but we mutate in place first so migrations
    // stay co-located with the load path.
    if (parsed && parsed.metal && Array.isArray(parsed.metal.paths)) {
      for (const p of parsed.metal.paths) {
        if (p && (p.kind === 'outline' || p.kind === 'divider')) p.kind = 'shape';
      }
    }
    const doc = validateBadgeDocument(parsed);
    if (doc) return doc;
  } catch {
    /* ignore */
  }
  return emptyDocument();
}

export const document = writable<BadgeDocument>(loadInitial());
export const mode = writable<Mode>('metal');
export const metalTool = writable<MetalTool>('pen');
export const activeKind = writable<PathKind>('shape');
export const activeStrokeWidth = writable<number>(0.4);
export const colorsTool = writable<ColorsTool>('fill');
export const activeColor = writable<string>('#d94452');
// Active enamel material for the fill tool. Paints alongside activeColor —
// clicking a cell writes both the color and the material in one atomic step.
export const activeMaterial = writable<EnamelMaterial>('plain');
export const selectedPathIds = writable<Set<string>>(new Set());
// At most one text element is edited at a time. Kept separate from
// selectedPathIds because text elements have different controls (string,
// font, size, mode) than drawn paths (nodes, kind).
export const selectedTextId = writable<string | null>(null);
// In-canvas edit mode (Inkscape-style). When non-null, the text tool is
// accepting keystrokes for this text element and the caret is rendered at
// `editingCaret` (an index into the string, 0..text.length). Committing
// clears both and deletes the text if it ended up empty.
export const editingTextId = writable<string | null>(null);
export const editingCaret = writable<number>(0);
// Session defaults for newly placed text. Persist across the session in the
// UI but not across reloads — a fresh session re-prompts the user to pick a
// font, which is the realistic flow anyway since system-font handles don't
// survive reload on non-Chromium browsers.
import type { TextMode } from './types';
export const activeTextFontId = writable<string | null>(null);
export const activeTextFontLabel = writable<string>('');
export const activeTextSizeMm = writable<number>(8);
export const activeTextMode = writable<TextMode>('filled');
export const activeTextStrokeWidth = writable<number>(0.4);
// Handle-level selection for the currently singly-selected path. Handle keys
// are serialized as `<pathId>:<kind>:<index>` (kind ∈ {start,node,in,out}).
// Start uses index 0 by convention. Only populated when selectedPathIds.size
// === 1 and all keys share that path; an effect in MetalCanvas enforces this.
export const selectedHandles = writable<Set<string>>(new Set());
export const selectedCellIds = writable<Set<string>>(new Set());
export const hoveredCellId = writable<string | null>(null);
export const sidebarOpen = writable<boolean>(true);
export const modalRequest = writable<ModalRequest>(null);
export const showCellBorders = writable<boolean>(true);
export const showManufacturingWarnings = writable<boolean>(true);

// Reference image overlay for the metal canvas. The image itself can be
// large (photos, sketches), so it lives in IndexedDB rather than localStorage
// to avoid the ~5MB quota. Display settings (opacity, layer, visibility) stay
// in localStorage since they're tiny. Opacity is 0–1; layer chooses whether
// the image renders behind the metal paths or in front of them.
export type ReferenceLayer = 'behind' | 'front';
export const referenceImage = writable<string | null>(null);
export const referenceOpacity = writable<number>(0.5);
export const referenceLayer = writable<ReferenceLayer>('behind');
export const referenceVisible = writable<boolean>(true);

const REFERENCE_SETTINGS_KEY = 'badger-reference-settings-v1';
const REFERENCE_IDB_NAME = 'badger-reference';
const REFERENCE_IDB_STORE = 'image';
const REFERENCE_IDB_KEY = 'current';

function openReferenceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REFERENCE_IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(REFERENCE_IDB_STORE);
    };
  });
}

async function loadReferenceImage(): Promise<string | null> {
  const db = await openReferenceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REFERENCE_IDB_STORE, 'readonly');
    const req = tx.objectStore(REFERENCE_IDB_STORE).get(REFERENCE_IDB_KEY);
    req.onsuccess = () => {
      db.close();
      resolve(typeof req.result === 'string' ? req.result : null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function saveReferenceImage(value: string | null): Promise<void> {
  const db = await openReferenceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REFERENCE_IDB_STORE, 'readwrite');
    const store = tx.objectStore(REFERENCE_IDB_STORE);
    if (value === null) store.delete(REFERENCE_IDB_KEY);
    else store.put(value, REFERENCE_IDB_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

if (browser) {
  try {
    const raw = localStorage.getItem(REFERENCE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.opacity === 'number') referenceOpacity.set(parsed.opacity);
      if (parsed.layer === 'behind' || parsed.layer === 'front') referenceLayer.set(parsed.layer);
      if (typeof parsed.visible === 'boolean') referenceVisible.set(parsed.visible);
    }
  } catch {
    /* ignore */
  }

  // Restore the image from IDB. Track a load-complete flag so the subscribe
  // below doesn't round-trip the freshly-loaded value back into IDB on the
  // first tick — that would be harmless, but racy if the user uploads a new
  // image before the load resolves.
  let imageLoaded = false;
  loadReferenceImage()
    .then((img) => {
      imageLoaded = true;
      if (img !== null && get(referenceImage) === null) referenceImage.set(img);
    })
    .catch(() => {
      imageLoaded = true;
    });
  referenceImage.subscribe((value) => {
    if (!imageLoaded) return;
    saveReferenceImage(value).catch(() => {
      /* ignore — quota errors surface as a non-persistent image, which is
         the pre-IDB behavior anyway */
    });
  });

  let refTimer: ReturnType<typeof setTimeout> | undefined;
  const persistRef = () => {
    if (refTimer) clearTimeout(refTimer);
    refTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          REFERENCE_SETTINGS_KEY,
          JSON.stringify({
            opacity: get(referenceOpacity),
            layer: get(referenceLayer),
            visible: get(referenceVisible)
          })
        );
      } catch {
        /* ignore */
      }
    }, 300);
  };
  referenceOpacity.subscribe(persistRef);
  referenceLayer.subscribe(persistRef);
  referenceVisible.subscribe(persistRef);
}

// Shape tool options — persisted across the session via the document? No —
// these are editor-UI state, not document state, so they live in memory only.
// Corner radius values are in mm. Polygon sides in [3, 24].
export const rectCornerStyle = writable<RectCornerStyle>('sharp');
export const rectCornerRadius = writable<number>(2);
export const polygonSides = writable<number>(6);
export const polygonCornerStyle = writable<PolygonCornerStyle>('sharp');
export const polygonCornerRadius = writable<number>(1);

// Document with text elements baked into concrete BadgePaths. Topology,
// mesh, manufacturing checks, and SVG export all read from this so text
// participates uniformly. Falls back to the raw document when no texts are
// present so the common case doesn't allocate a new object per update.
export const bakedDocument = derived(
  [document, fontLoadTick],
  ([$doc]): BadgeDocument => {
    if ($doc.metal.texts.length === 0) return $doc;
    return {
      ...$doc,
      metal: {
        ...$doc.metal,
        paths: effectiveMetalPaths($doc),
        texts: []
      }
    };
  }
);

// Recompute on both document changes and font-library ticks — the latter so
// text-derived paths appear in topology/cells as soon as their font loads
// (without needing the user to edit the document to trigger a redraw).
export const cells = derived(
  bakedDocument,
  ($doc, set: (v: Cell[]) => void) => {
    try {
      const t = computeTopology($doc);
      set(t.cells);
    } catch (err) {
      console.error('[badger] topology failed', err);
      set([]);
    }
  }
);

// SVG path-data for the badge silhouette (outline union minus cutouts). Used
// as a `<clipPath>` in the canvases so path strokes cannot visually overflow
// past the outline — both divider end caps AND interior-outline ribbons,
// which under single-width stroking have a half-ribbon on each side of the
// centerline that would otherwise spill past the silhouette in a way the 3D
// render can't reproduce.
//
// Emits outer silhouette rings as CCW and cutout holes as CW so nonzero fill
// unions nested outlines (a shape inside another shape, like a figure-8
// inside the disc silhouette, windings stack to 2 > 0 → inside) while still
// subtracting cutouts (winding −1 → outside). Evenodd fill would instead
// treat a nested outline as a hole, punching a figure-8-shaped gap out of
// the clip region and erasing strokes inside it.
export const outlineClipD = derived(bakedDocument, ($doc, set: (v: string) => void) => {
  try {
    const t = computeTopology($doc);
    if (t.outlineUnion.length === 0) {
      set('');
      return;
    }
    const parts: string[] = [];
    const emit = (poly: { x: number; y: number }[], ccw: boolean) => {
      if (poly.length < 3) return;
      const area = signedArea(poly);
      const ring = (area > 0) === ccw ? poly : [...poly].reverse();
      let d = `M ${ring[0].x} ${ring[0].y}`;
      for (let i = 1; i < ring.length; i++) d += ` L ${ring[i].x} ${ring[i].y}`;
      parts.push(d + ' Z');
    };
    for (const o of t.outlineUnion) emit(o, true);
    for (const c of t.cutouts) emit(c, false);
    set(parts.join(' '));
  } catch {
    set('');
  }
});

// History
const MAX_HISTORY = 50;
let undoStack: BadgeDocument[] = [];
let redoStack: BadgeDocument[] = [];
export const canUndo = writable(false);
export const canRedo = writable(false);

export function pushHistory() {
  const current = cloneDoc(get(document));
  undoStack.push(current);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  canUndo.set(undoStack.length > 0);
  canRedo.set(false);
}

export function undo() {
  if (undoStack.length === 0) return;
  const current = cloneDoc(get(document));
  redoStack.push(current);
  const prev = undoStack.pop()!;
  document.set(prev);
  canUndo.set(undoStack.length > 0);
  canRedo.set(redoStack.length > 0);
}

export function redo() {
  if (redoStack.length === 0) return;
  const current = cloneDoc(get(document));
  undoStack.push(current);
  const next = redoStack.pop()!;
  document.set(next);
  canUndo.set(undoStack.length > 0);
  canRedo.set(redoStack.length > 0);
}

export function updateDocument(updater: (doc: BadgeDocument) => void) {
  pushHistory();
  document.update((doc) => {
    const next = cloneDoc(doc);
    const prevCells = safeCells(doc);
    updater(next);
    const newCells = safeCells(next);
    next.colorAssignments = reassignPerCell(
      prevCells,
      newCells,
      next.colorAssignments
    );
    next.materialAssignments = reassignPerCell(
      prevCells,
      newCells,
      next.materialAssignments
    );
    return next;
  });
}

function safeCells(doc: BadgeDocument): Cell[] {
  try {
    return computeTopology(doc).cells;
  } catch {
    return [];
  }
}

// Autosave
if (browser) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  document.subscribe((doc) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
      } catch {
        /* ignore */
      }
    }, 800);
  });
}

export function getSkipStartup(): boolean {
  if (!browser) return false;
  try {
    return localStorage.getItem(SKIP_STARTUP_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSkipStartup(v: boolean) {
  if (!browser) return;
  try {
    localStorage.setItem(SKIP_STARTUP_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function resetDocument(width: number, height: number) {
  pushHistory();
  document.set(emptyDocument(width, height));
}

// Replace the current document wholesale (e.g. after opening a .badger file).
// Pushes a history entry so the user can undo back to what they had before.
// Callers must pass a document that has already been through
// `validateBadgeDocument`.
export function loadDocument(doc: BadgeDocument) {
  pushHistory();
  document.set(doc);
  selectedPathIds.set(new Set());
  selectedTextId.set(null);
  selectedHandles.set(new Set());
  selectedCellIds.set(new Set());
}

// Picks the authored kind (shape | cutout): if any paths are selected, apply
// to them (one history entry) and also keep it as the default for future new
// paths. Otherwise, just set the default.
export function pickKind(kind: PathKind) {
  activeKind.set(kind);
  const ids = get(selectedPathIds);
  if (ids.size === 0) return;
  updateDocument((d) => {
    for (const p of d.metal.paths) if (ids.has(p.id)) p.kind = kind;
  });
}

// Stroke widths are in mm. A typical divider wall on a pin is ~0.4mm; anything
// past ~5mm covers most of a small badge.
export function pickStrokeWidth(width: number) {
  const w = Math.max(0.1, Math.min(5, width));
  activeStrokeWidth.set(w);
  const ids = get(selectedPathIds);
  if (ids.size === 0) return;
  updateDocument((d) => {
    for (const p of d.metal.paths) if (ids.has(p.id)) p.strokeWidth = w;
  });
}

// Simplifies the currently selected paths in place. No-op when no paths are
// selected. Curve nodes (quad/cubic) are preserved; only runs of line nodes
// are reduced via RDP — see simplify.ts.
export function simplifySelectedPaths() {
  const ids = get(selectedPathIds);
  if (ids.size === 0) return;
  updateDocument((d) => {
    for (let i = 0; i < d.metal.paths.length; i++) {
      const p = d.metal.paths[i];
      if (ids.has(p.id)) d.metal.paths[i] = simplifyPath(p);
    }
  });
}

// Reverses every selected path in place. Mirrors the single-path reverse
// previously scoped to the NodeToolbar — promoted to the Path menu so it can
// act on any number of selected paths at once.
export function reverseSelectedPaths() {
  const ids = get(selectedPathIds);
  if (ids.size === 0) return;
  updateDocument((d) => {
    for (const p of d.metal.paths) {
      if (!ids.has(p.id)) continue;
      const anchors = [p.start, ...p.nodes.map((n) => n.to)];
      const rev = anchors.slice().reverse();
      const newNodes: typeof p.nodes = [];
      for (let i = 0; i < p.nodes.length; i++) {
        const src = p.nodes[p.nodes.length - 1 - i];
        if (src.type === 'line') newNodes.push({ type: 'line', to: { ...rev[i + 1] } });
        else if (src.type === 'quad')
          newNodes.push({ type: 'quad', control: { ...src.control }, to: { ...rev[i + 1] } });
        else
          newNodes.push({
            type: 'cubic',
            c1: { ...src.c2 },
            c2: { ...src.c1 },
            to: { ...rev[i + 1] }
          });
      }
      p.start = { ...rev[0] };
      p.nodes = newNodes;
      if (p.nodeTypes) p.nodeTypes = p.nodeTypes.slice().reverse();
    }
  });
}

// ---- clipboard ----
// In-memory, session-scoped path clipboard. Deliberately not backed by the
// OS clipboard — badge paths aren't a meaningful text representation and
// round-tripping through the async Clipboard API would complicate the
// happy-path copy-inside-badger flow. Paste clones the stored paths with
// fresh ids, nudges them so they don't overlap the originals, and selects
// the new copies.
let pathClipboard: BadgePath[] = [];
const PASTE_OFFSET_MM = 2;

function newPathId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

export const canPastePaths = writable<boolean>(false);

function snapshotSelectedPaths(): BadgePath[] {
  const ids = get(selectedPathIds);
  if (ids.size === 0) return [];
  const doc = get(document);
  const snapshot: BadgePath[] = [];
  for (const p of doc.metal.paths) {
    if (ids.has(p.id)) snapshot.push(structuredClone(p));
  }
  return snapshot;
}

export function copySelectedPaths(): boolean {
  const snap = snapshotSelectedPaths();
  if (snap.length === 0) return false;
  pathClipboard = snap;
  canPastePaths.set(true);
  return true;
}

export function cutSelectedPaths(): boolean {
  const snap = snapshotSelectedPaths();
  if (snap.length === 0) return false;
  pathClipboard = snap;
  canPastePaths.set(true);
  const ids = new Set(snap.map((p) => p.id));
  updateDocument((d) => {
    d.metal.paths = d.metal.paths.filter((p) => !ids.has(p.id));
  });
  selectedPathIds.set(new Set());
  selectedHandles.set(new Set());
  return true;
}

export function pastePaths(): boolean {
  if (pathClipboard.length === 0) return false;
  const newIds = new Set<string>();
  const clones: BadgePath[] = pathClipboard.map((p) => {
    const clone = structuredClone(p);
    clone.id = newPathId();
    clone.start.x += PASTE_OFFSET_MM;
    clone.start.y += PASTE_OFFSET_MM;
    for (const n of clone.nodes) {
      n.to.x += PASTE_OFFSET_MM;
      n.to.y += PASTE_OFFSET_MM;
      if (n.type === 'cubic') {
        n.c1.x += PASTE_OFFSET_MM;
        n.c1.y += PASTE_OFFSET_MM;
        n.c2.x += PASTE_OFFSET_MM;
        n.c2.y += PASTE_OFFSET_MM;
      } else if (n.type === 'quad') {
        n.control.x += PASTE_OFFSET_MM;
        n.control.y += PASTE_OFFSET_MM;
      }
    }
    newIds.add(clone.id);
    return clone;
  });
  updateDocument((d) => {
    d.metal.paths.push(...clones);
  });
  selectedPathIds.set(newIds);
  selectedHandles.set(new Set());
  return true;
}

// ---- text elements ----

import type { BadgeText, Vec2 } from './types';

// Add a new text element at `position` and enter edit mode. Inkscape-style:
// the text starts empty and accepts typing immediately; committing an empty
// text deletes it. Does nothing if no font is selected.
export function addText(position: Vec2): string | null {
  const fontId = get(activeTextFontId);
  if (!fontId) return null;
  const id = `t_${Math.random().toString(36).slice(2, 10)}`;
  const text: BadgeText = {
    id,
    text: '',
    fontId,
    fontLabel: get(activeTextFontLabel) || fontId,
    sizeMm: get(activeTextSizeMm),
    position: { x: position.x, y: position.y },
    mode: get(activeTextMode),
    strokeWidth: get(activeTextStrokeWidth)
  };
  updateDocument((d) => {
    d.metal.texts.push(text);
  });
  selectedTextId.set(id);
  editingTextId.set(id);
  editingCaret.set(0);
  return id;
}

export function updateText(id: string, mutator: (t: BadgeText) => void) {
  updateDocument((d) => {
    const t = d.metal.texts.find((tt) => tt.id === id);
    if (t) mutator(t);
  });
}

// Enter edit mode for an existing text element. Places the caret at the end
// of the string — matches Inkscape's "click to enter" behavior where caret
// positioning by click is a separate gesture.
export function beginEditingText(id: string) {
  const texts = get(document).metal.texts;
  const t = texts.find((tt) => tt.id === id);
  if (!t) return;
  selectedTextId.set(id);
  editingTextId.set(id);
  editingCaret.set(t.text.length);
}

// Insert a string at the current caret. Used for printable keys and paste.
// No-op unless edit mode is active for a real text element.
export function typeIntoEditingText(s: string) {
  const id = get(editingTextId);
  if (!id) return;
  const caret = get(editingCaret);
  updateDocument((d) => {
    const t = d.metal.texts.find((tt) => tt.id === id);
    if (!t) return;
    t.text = t.text.slice(0, caret) + s + t.text.slice(caret);
  });
  editingCaret.set(caret + s.length);
}

// Backspace (dir=-1) / Delete (dir=+1) at the caret.
export function deleteInEditingText(dir: -1 | 1) {
  const id = get(editingTextId);
  if (!id) return;
  const caret = get(editingCaret);
  updateDocument((d) => {
    const t = d.metal.texts.find((tt) => tt.id === id);
    if (!t) return;
    if (dir === -1) {
      if (caret === 0) return;
      t.text = t.text.slice(0, caret - 1) + t.text.slice(caret);
    } else {
      if (caret >= t.text.length) return;
      t.text = t.text.slice(0, caret) + t.text.slice(caret + 1);
    }
  });
  if (dir === -1) editingCaret.update((c) => Math.max(0, c - 1));
}

// Move caret by `delta`, clamped to [0, text.length]. Shortcut values:
// 'home' -> 0, 'end' -> text.length.
export function moveEditingCaret(to: number | 'home' | 'end') {
  const id = get(editingTextId);
  if (!id) return;
  const t = get(document).metal.texts.find((tt) => tt.id === id);
  if (!t) return;
  if (to === 'home') editingCaret.set(0);
  else if (to === 'end') editingCaret.set(t.text.length);
  else editingCaret.set(Math.max(0, Math.min(t.text.length, to)));
}

// Finish editing. Empty text gets deleted (matches Inkscape — an empty
// text-in-progress that the user clicks away from is discarded rather than
// left as an invisible element).
export function commitEditingText() {
  const id = get(editingTextId);
  editingTextId.set(null);
  editingCaret.set(0);
  if (!id) return;
  const t = get(document).metal.texts.find((tt) => tt.id === id);
  if (t && t.text.length === 0) {
    deleteText(id);
  }
}

export function deleteText(id: string) {
  updateDocument((d) => {
    d.metal.texts = d.metal.texts.filter((t) => t.id !== id);
  });
  selectedTextId.update((cur) => (cur === id ? null : cur));
  editingTextId.update((cur) => {
    if (cur === id) {
      editingCaret.set(0);
      return null;
    }
    return cur;
  });
}

export * from './types';
