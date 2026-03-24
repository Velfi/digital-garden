import { get, writable } from 'svelte/store';
import { coordKey, parseCoordKey, getSelectionBounds } from '../coordUtils';
import { commitUndoAfter, ensureGridFitsPositions, selection, tool, voxels } from './core';
import { clipboardEntryToVoxel } from './clipboard';
import type { Voxel } from '../voxelMaterial';
import type { StampBookEntryTuple, StampBookRecord } from '../stampBookStorage';
import {
  deleteStamp,
  getStampById,
  listStampsFromIndexedDb,
  putStamp,
  replaceAllOrders
} from '../stampBookStorage';
import { renderStampPreviewPng } from '../stampBookThumbnail';

/**
 * Stamp shape loaded from the stamp book (not the edit selection).
 * When non-null and non-empty, stamp/punch use this map instead of `selection`.
 * Cleared when the user makes a non-empty selection (they are defining a new stamp shape).
 */
export const bookStampPattern = writable<Map<string, Voxel> | null>(null);

let skipBookClearOnSelectionSync = false;

selection.subscribe((s) => {
  if (skipBookClearOnSelectionSync) return;
  if (s.size > 0) {
    bookStampPattern.set(null);
  }
});

export type { StampBookEntryTuple, StampBookRecord };

const MAX_TAG_LEN = 64;

/** Normalize tags for storage and search: lowercase, trim, dedupe, cap length. */
export function normalizeStampTags(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of raw) {
      const s = String(t).trim().toLowerCase().slice(0, MAX_TAG_LEN);
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }
  if (typeof raw === 'string') {
    const parts = raw
      .split(/[,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    return normalizeStampTags(parts);
  }
  return [];
}

function withNormalizedTags(r: StampBookRecord): StampBookRecord {
  return { ...r, tags: normalizeStampTags(r.tags) };
}

/** Ordered stamps with normalized tags (use this from UI). */
export async function listStampsOrdered(): Promise<StampBookRecord[]> {
  const raw = await listStampsFromIndexedDb();
  return raw.map(withNormalizedTags);
}

/** True if query matches stamp name or any tag (all whitespace-separated words must match somewhere). */
export function stampMatchesSearch(record: StampBookRecord, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = record.name.toLowerCase();
  const tags = normalizeStampTags(record.tags);
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  return words.every((word) => {
    if (name.includes(word)) return true;
    return tags.some((t) => t.includes(word));
  });
}

/** Same semantics as copySelection: relative coords from selection bbox min, only keys with voxels. */
export function selectionToStampEntries(
  voxelMap: Map<string, Voxel>,
  sel: Map<string, Voxel>
): StampBookEntryTuple[] | null {
  const bounds = getSelectionBounds(sel);
  if (!bounds) return null;
  const entries: StampBookEntryTuple[] = [];
  for (const [key] of sel) {
    if (!voxelMap.has(key)) continue;
    const vx = voxelMap.get(key)!;
    const [x, y, z] = parseCoordKey(key);
    entries.push([x - bounds.minX, y - bounds.minY, z - bounds.minZ, vx.color, vx.material]);
  }
  if (entries.length === 0) return null;
  return entries;
}

export function entriesToSelectionMap(entries: StampBookEntryTuple[]): Map<string, Voxel> {
  const m = new Map<string, Voxel>();
  for (const e of entries) {
    const [dx, dy, dz] = e;
    m.set(coordKey(dx, dy, dz), clipboardEntryToVoxel(e));
  }
  return m;
}

export function canSaveSelectionAsStamp(): boolean {
  return selectionToStampEntries(get(voxels), get(selection)) !== null;
}

export async function saveSelectionAsStamp(
  name: string,
  tagInput?: string | string[]
): Promise<StampBookRecord | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const entries = selectionToStampEntries(get(voxels), get(selection));
  if (!entries) return null;

  let previewBlob: Blob | undefined;
  try {
    const blob = await renderStampPreviewPng(entries);
    if (blob) previewBlob = blob;
  } catch {
    /* thumbnail optional */
  }

  const list = await listStampsFromIndexedDb();
  const maxOrder = list.reduce((m, r) => Math.max(m, r.order), -1);
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const tags = Array.isArray(tagInput)
    ? normalizeStampTags(tagInput)
    : normalizeStampTags(tagInput);

  const record: StampBookRecord = {
    id,
    name: trimmed,
    order: maxOrder + 1,
    entries,
    createdAt: Date.now(),
    tags,
    previewBlob
  };
  await putStamp(record);
  return withNormalizedTags(record);
}

/** Load a stamp from the book for placement: does not replace the edit selection. */
export function applyStampRecordToSelection(record: StampBookRecord): void {
  const map = entriesToSelectionMap(record.entries);
  const positions: [number, number, number][] = [];
  for (const key of map.keys()) {
    positions.push(parseCoordKey(key));
  }
  ensureGridFitsPositions(positions);
  skipBookClearOnSelectionSync = true;
  bookStampPattern.set(map);
  commitUndoAfter(() => {
    selection.set(new Map());
  });
  skipBookClearOnSelectionSync = false;
  tool.set('stamp');
}

export async function updateStampName(id: string, name: string): Promise<void> {
  const rec = await getStampById(id);
  if (!rec) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  await putStamp(withNormalizedTags({ ...rec, name: trimmed }));
}

export async function updateStampTags(id: string, tagInput: string | string[]): Promise<void> {
  const rec = await getStampById(id);
  if (!rec) return;
  const tags = Array.isArray(tagInput)
    ? normalizeStampTags(tagInput)
    : normalizeStampTags(tagInput);
  await putStamp(withNormalizedTags({ ...rec, tags }));
}

export async function removeStamp(id: string): Promise<void> {
  await deleteStamp(id);
}

export async function reorderStamps(orderedIds: string[]): Promise<void> {
  const list = await listStampsFromIndexedDb();
  const byId = new Map(list.map((r) => [r.id, r] as const));
  const next: StampBookRecord[] = [];
  let o = 0;
  for (const id of orderedIds) {
    const r = byId.get(id);
    if (!r) continue;
    next.push({ ...r, order: o++ });
  }
  for (const r of list) {
    if (orderedIds.includes(r.id)) continue;
    next.push({ ...r, order: o++ });
  }
  await replaceAllOrders(next);
}

export type ParsedStampImport = { name: string; entries: StampBookEntryTuple[]; tags: string[] };

export function parseStampLibraryJson(
  text: string
): { ok: true; stamps: ParsedStampImport[] } | { ok: false; error: string } {
  try {
    const data = JSON.parse(text) as {
      voxelleStampLibrary?: unknown;
      stamps?: unknown;
    };
    if (data?.voxelleStampLibrary !== 1 || !Array.isArray(data.stamps)) {
      return { ok: false, error: 'Not a Voxelle stamp library (expected voxelleStampLibrary: 1).' };
    }
    const out: ParsedStampImport[] = [];
    for (const s of data.stamps as unknown[]) {
      if (!s || typeof s !== 'object') continue;
      const obj = s as { name?: unknown; entries?: unknown; tags?: unknown };
      if (typeof obj.name !== 'string' || !Array.isArray(obj.entries)) continue;
      const entries: StampBookEntryTuple[] = [];
      for (const row of obj.entries) {
        if (!Array.isArray(row) || row.length < 4) continue;
        const dx = row[0];
        const dy = row[1];
        const dz = row[2];
        const c = row[3];
        if (
          typeof dx !== 'number' ||
          typeof dy !== 'number' ||
          typeof dz !== 'number' ||
          typeof c !== 'number' ||
          !Number.isFinite(dx + dy + dz + c)
        ) {
          continue;
        }
        const mat = row.length >= 5 && typeof row[4] === 'string' ? row[4] : undefined;
        if (mat !== undefined) {
          entries.push([dx, dy, dz, c & 0xffffff, mat]);
        } else {
          entries.push([dx, dy, dz, c & 0xffffff]);
        }
      }
      if (entries.length === 0) continue;
      const name = obj.name.trim() || 'Stamp';
      const tags = normalizeStampTags(obj.tags);
      out.push({ name, entries, tags });
    }
    if (out.length === 0) {
      return { ok: false, error: 'No valid stamps found in file.' };
    }
    return { ok: true, stamps: out };
  } catch {
    return { ok: false, error: 'Invalid JSON.' };
  }
}

/** JSON-serializable export (no previews). */
export function stampRecordsToLibraryJson(records: StampBookRecord[]): string {
  return JSON.stringify(
    {
      voxelleStampLibrary: 1 as const,
      stamps: records.map((r) => ({
        id: r.id,
        name: r.name,
        entries: r.entries,
        ...(normalizeStampTags(r.tags).length > 0 ? { tags: normalizeStampTags(r.tags) } : {})
      }))
    },
    null,
    2
  );
}

export async function importStampsFromParsed(
  stamps: ParsedStampImport[]
): Promise<StampBookRecord[]> {
  const list = await listStampsFromIndexedDb();
  let maxOrder = list.reduce((m, r) => Math.max(m, r.order), -1);
  const created: StampBookRecord[] = [];

  for (const p of stamps) {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let previewBlob: Blob | undefined;
    try {
      const blob = await renderStampPreviewPng(p.entries);
      if (blob) previewBlob = blob;
    } catch {
      /* optional */
    }
    const tags = normalizeStampTags(p.tags);
    const record: StampBookRecord = {
      id,
      name: p.name,
      order: ++maxOrder,
      entries: p.entries,
      createdAt: Date.now(),
      tags,
      previewBlob
    };
    await putStamp(record);
    created.push(withNormalizedTags(record));
  }
  return created;
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
