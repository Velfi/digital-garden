// Single entry point for "all metal paths that exist right now, including
// those derived from text elements". Every downstream system — topology,
// mesh, SVG export, canvas rendering, selection picking — reads through this
// helper instead of touching doc.metal.paths directly. Text elements are
// expanded on demand against the font library so editing a text element's
// props immediately reflows the derived paths without any extra state.

import type { BadgeDocument, BadgePath } from './types';
import { getLoadedFont } from './fontLibrary';
import { expandText } from './textExpansion';

export function effectiveMetalPaths(doc: BadgeDocument): BadgePath[] {
  const texts = doc.metal.texts;
  if (!texts || texts.length === 0) return doc.metal.paths;
  const extra: BadgePath[] = [];
  for (const t of texts) {
    const font = getLoadedFont(t.fontId);
    if (!font) continue;
    const produced = expandText({ text: t, font }, `text:${t.id}`);
    for (const p of produced) extra.push(p);
  }
  if (extra.length === 0) return doc.metal.paths;
  return [...doc.metal.paths, ...extra];
}
