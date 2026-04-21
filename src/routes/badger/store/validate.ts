// Structural validator for BadgeDocument. Used when loading persisted or
// shared documents from untrusted sources (localStorage tampering, share
// URLs). Returns a normalized document or null on failure. Fills in missing
// optional fields with defaults so downstream code can assume a complete
// shape without per-field null checks.

import { emptyDocument, type BadgeDocument, type BadgePath, type BadgeText, type NodeType, type PathNode, type TextMode, type Vec2, type EnamelMaterial } from './types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec2(v: unknown): v is Vec2 {
  return isObj(v) && isNum(v.x) && isNum(v.y);
}

function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

function validateNode(v: unknown): PathNode | null {
  if (!isObj(v)) return null;
  if (v.type === 'line' && isVec2(v.to)) {
    return { type: 'line', to: { x: v.to.x, y: v.to.y } };
  }
  if (v.type === 'quad' && isVec2(v.control) && isVec2(v.to)) {
    return {
      type: 'quad',
      control: { x: v.control.x, y: v.control.y },
      to: { x: v.to.x, y: v.to.y }
    };
  }
  if (v.type === 'cubic' && isVec2(v.c1) && isVec2(v.c2) && isVec2(v.to)) {
    return {
      type: 'cubic',
      c1: { x: v.c1.x, y: v.c1.y },
      c2: { x: v.c2.x, y: v.c2.y },
      to: { x: v.to.x, y: v.to.y }
    };
  }
  return null;
}

function validateNodeType(v: unknown): NodeType {
  if (v === 'cusp' || v === 'smooth' || v === 'symmetric' || v === 'auto') return v;
  return 'cusp';
}

function validatePath(v: unknown): BadgePath | null {
  if (!isObj(v)) return null;
  if (typeof v.id !== 'string' || !v.id) return null;
  // Legacy 'outline'/'divider' kinds get collapsed to 'shape' at load time
  // elsewhere; here we only accept the post-collapse kinds.
  const kind = v.kind === 'cutout' ? 'cutout' : 'shape';
  if (!isVec2(v.start)) return null;
  if (!Array.isArray(v.nodes)) return null;
  const nodes: PathNode[] = [];
  for (const n of v.nodes) {
    const node = validateNode(n);
    if (!node) return null;
    nodes.push(node);
  }
  const path: BadgePath = {
    id: v.id,
    kind,
    closed: Boolean(v.closed),
    start: { x: v.start.x, y: v.start.y },
    nodes,
    strokeWidth: isNum(v.strokeWidth) ? v.strokeWidth : 0.4
  };
  if (Array.isArray(v.nodeTypes)) {
    path.nodeTypes = v.nodeTypes.map(validateNodeType);
  }
  return path;
}

function validateText(v: unknown): BadgeText | null {
  if (!isObj(v)) return null;
  if (typeof v.id !== 'string' || !v.id) return null;
  if (typeof v.text !== 'string') return null;
  if (typeof v.fontId !== 'string') return null;
  if (!isNum(v.sizeMm) || v.sizeMm <= 0) return null;
  if (!isVec2(v.position)) return null;
  const mode: TextMode = v.mode === 'outline' ? 'outline' : 'filled';
  return {
    id: v.id,
    text: v.text,
    fontId: v.fontId,
    fontLabel: typeof v.fontLabel === 'string' ? v.fontLabel : v.fontId,
    sizeMm: v.sizeMm,
    position: { x: v.position.x, y: v.position.y },
    mode,
    strokeWidth: isNum(v.strokeWidth) ? v.strokeWidth : 0.4
  };
}

export function validateBadgeDocument(raw: unknown): BadgeDocument | null {
  if (!isObj(raw)) return null;
  const canvas = raw.canvas;
  if (!isObj(canvas) || !isNum(canvas.width) || !isNum(canvas.height)) return null;
  if (canvas.width <= 0 || canvas.height <= 0) return null;

  const metal = raw.metal;
  if (!isObj(metal) || !Array.isArray(metal.paths)) return null;
  const paths: BadgePath[] = [];
  for (const p of metal.paths) {
    // Legacy kinds are collapsed upstream in loadInitial; for shared docs we
    // coerce them here too so old shares continue to load.
    if (isObj(p) && (p.kind === 'outline' || p.kind === 'divider')) p.kind = 'shape';
    const vp = validatePath(p);
    if (!vp) return null;
    paths.push(vp);
  }

  const texts: BadgeText[] = [];
  if (Array.isArray(metal.texts)) {
    for (const t of metal.texts) {
      const vt = validateText(t);
      if (vt) texts.push(vt);
    }
  }

  const d = emptyDocument(canvas.width, canvas.height);
  d.metal.paths = paths;
  d.metal.texts = texts;
  if (isNum(metal.baseThickness)) d.metal.baseThickness = metal.baseThickness;
  if (isNum(metal.wallHeight)) d.metal.wallHeight = metal.wallHeight;
  if (isNum(metal.bevelRadius)) d.metal.bevelRadius = metal.bevelRadius;
  if (isNum(metal.minWallWidth)) d.metal.minWallWidth = metal.minWallWidth;

  if (isObj(raw.colorAssignments)) {
    for (const [k, v] of Object.entries(raw.colorAssignments)) {
      if (isHex(v)) d.colorAssignments[k] = v;
    }
  }
  if (isObj(raw.materialAssignments)) {
    for (const [k, v] of Object.entries(raw.materialAssignments)) {
      if (v === 'plain' || v === 'glitter' || v === 'metallic') {
        d.materialAssignments[k] = v as EnamelMaterial;
      }
    }
  }
  if (Array.isArray(raw.palette)) {
    const palette = raw.palette.filter(isHex);
    if (palette.length > 0) d.palette = palette;
  }
  if (isObj(raw.render)) {
    const r = raw.render;
    if (
      r.finish === 'gold' ||
      r.finish === 'silver' ||
      r.finish === 'black_nickel' ||
      r.finish === 'copper' ||
      r.finish === 'iron' ||
      r.finish === 'rose_gold' ||
      r.finish === 'bronze' ||
      r.finish === 'brass'
    ) {
      d.render.finish = r.finish;
    }
    if (r.metalSurface === 'polished' || r.metalSurface === 'matte') {
      d.render.metalSurface = r.metalSurface;
    }
    if (r.enamelFinish === 'soft' || r.enamelFinish === 'hard') {
      d.render.enamelFinish = r.enamelFinish;
    }
    if (isHex(r.background)) d.render.background = r.background;
  }
  return d;
}
