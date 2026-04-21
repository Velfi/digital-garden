import type { BadgeDocument, BadgePath, Cell, Vec2 } from './store/types';
import { effectiveMetalPaths } from './store/effectivePaths';
import { isEffectivelyClosed } from './topology/geometry';
import { computeTopology, effectiveKind } from './topology/planar';
import { finishHex } from './exportTextures';

// Bake text elements into concrete paths before export so SVG + topology
// both reflect the expanded text.
function bakeDocForExport(doc: BadgeDocument): BadgeDocument {
  if (doc.metal.texts.length === 0) return doc;
  return {
    ...doc,
    metal: { ...doc.metal, paths: effectiveMetalPaths(doc), texts: [] }
  };
}

function pathD(p: BadgePath): string {
  let d = `M ${p.start.x} ${p.start.y}`;
  for (const n of p.nodes) {
    if (n.type === 'line') d += ` L ${n.to.x} ${n.to.y}`;
    else if (n.type === 'quad') d += ` Q ${n.control.x} ${n.control.y} ${n.to.x} ${n.to.y}`;
    else d += ` C ${n.c1.x} ${n.c1.y} ${n.c2.x} ${n.c2.y} ${n.to.x} ${n.to.y}`;
  }
  if (isEffectivelyClosed(p)) d += ' Z';
  return d;
}

function cellD(c: Cell): string {
  if (c.polygon.length === 0) return '';
  let d = `M ${c.polygon[0].x} ${c.polygon[0].y}`;
  for (let i = 1; i < c.polygon.length; i++) d += ` L ${c.polygon[i].x} ${c.polygon[i].y}`;
  d += ' Z';
  for (const hole of c.holes) {
    if (hole.length === 0) continue;
    d += ` M ${hole[0].x} ${hole[0].y}`;
    for (let i = 1; i < hole.length; i++) d += ` L ${hole[i].x} ${hole[i].y}`;
    d += ' Z';
  }
  return d;
}

function polyD(poly: Vec2[]): string {
  if (poly.length < 3) return '';
  let d = `M ${poly[0].x} ${poly[0].y}`;
  for (let i = 1; i < poly.length; i++) d += ` L ${poly[i].x} ${poly[i].y}`;
  return d + ' Z';
}

export function buildSvg(docIn: BadgeDocument, cells: Cell[]): string {
  const doc = bakeDocForExport(docIn);
  const w = doc.canvas.width;
  const h = doc.canvas.height;
  const topo = computeTopology(doc);
  const clipParts: string[] = [];
  for (const o of topo.outlineUnion) {
    const d = polyD(o);
    if (d) clipParts.push(d);
  }
  for (const c of topo.cutouts) {
    const d = polyD(c);
    if (d) clipParts.push(d);
  }
  const clipD = clipParts.join(' ');
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}mm" height="${h}mm">`
  );
  if (clipD) {
    lines.push('<defs>');
    lines.push(
      `  <clipPath id="badger-outline-clip" clipPathUnits="userSpaceOnUse"><path d="${clipD}" clip-rule="nonzero" /></clipPath>`
    );
    lines.push('</defs>');
  }
  lines.push('<g id="cells">');
  for (const c of cells) {
    const fill = doc.colorAssignments[c.id] ?? '#e8e2d0';
    lines.push(`  <path d="${cellD(c)}" fill="${fill}" fill-rule="evenodd" />`);
  }
  lines.push('</g>');
  lines.push('<g id="metal">');
  const metalColor = finishHex(doc.render.finish);
  for (const p of doc.metal.paths) {
    const kind = effectiveKind(p);
    const stroke = kind === 'cutout' ? '#111' : metalColor;
    const strokeWidth = p.strokeWidth;
    const fill = kind === 'cutout' ? '#111' : 'none';
    const clipAttr = kind !== 'cutout' && clipD ? ' clip-path="url(#badger-outline-clip)"' : '';
    lines.push(
      `  <path d="${pathD(p)}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" stroke-linecap="round" stroke-linejoin="round" data-kind="${kind}" data-id="${p.id}"${clipAttr} />`
    );
  }
  lines.push('</g>');
  lines.push('</svg>');
  return lines.join('\n');
}

export function downloadSvg(doc: BadgeDocument, cells: Cell[]) {
  const svg = buildSvg(doc, cells);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  triggerDownload(blob, 'badger.svg');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke once the browser has had a chance to start the download. queueMicrotask
  // is too early in some browsers; one rAF is the typical safe minimum and avoids
  // the unbounded setTimeout leak when many exports stack up.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
