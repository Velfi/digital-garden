// Badger file format. A single self-contained JSON file that captures
// everything reproducible about a badge: canvas dimensions, metal paths +
// texts + physical dimensions, color/material assignments per cell, the
// palette, and the render settings. UI state (selection, mode, active color,
// undo history) is intentionally excluded — that's per-session, not per-file.
//
// Wrapper shape lets us identify the file (reject a random JSON that happens
// to have the right fields) and migrate in the future. `document` is the
// normalized BadgeDocument as produced by `validateBadgeDocument`, so the
// on-disk shape matches what the in-memory store uses.

import type { BadgeDocument } from './store/types';
import { validateBadgeDocument } from './store/validate';

export const BADGER_FILE_MAGIC = 'badger';
export const BADGER_FILE_VERSION = 1;
export const BADGER_FILE_EXTENSION = '.badger';
export const BADGER_FILE_MIME = 'application/json';

export type BadgerFile = {
  format: typeof BADGER_FILE_MAGIC;
  version: number;
  document: BadgeDocument;
};

export function serializeBadgerFile(doc: BadgeDocument): string {
  const file: BadgerFile = {
    format: BADGER_FILE_MAGIC,
    version: BADGER_FILE_VERSION,
    document: doc
  };
  return JSON.stringify(file, null, 2);
}

export type DeserializeResult =
  | { ok: true; document: BadgeDocument }
  | { ok: false; error: string };

export function deserializeBadgerFile(text: string): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'File is not a badger document.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== BADGER_FILE_MAGIC) {
    return { ok: false, error: 'File is not a badger document (missing "format": "badger").' };
  }
  if (typeof obj.version !== 'number' || obj.version < 1) {
    return { ok: false, error: 'Badger file is missing a valid version.' };
  }
  if (obj.version > BADGER_FILE_VERSION) {
    return {
      ok: false,
      error: `Badger file version ${obj.version} is newer than this app supports (max ${BADGER_FILE_VERSION}). Update the app.`
    };
  }
  const doc = validateBadgeDocument(obj.document);
  if (!doc) {
    return { ok: false, error: 'Badger file document payload is malformed.' };
  }
  return { ok: true, document: doc };
}

// Save the document with a user-chosen filename. Uses the File System Access
// API where available (Chromium) to show a native save dialog with a real
// filename field and directory picker. Falls back to window.prompt + the
// classic <a download> flow on Safari/Firefox, which don't support the API.
// `suggestedName` seeds the dialog/prompt but the user can edit it.
export async function saveBadgerFile(
  doc: BadgeDocument,
  suggestedName = 'badger'
): Promise<void> {
  const text = serializeBadgerFile(doc);
  const suggested = ensureExtension(suggestedName);
  const anyWindow = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{
      createWritable: () => Promise<{
        write: (data: string | Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  };
  if (typeof anyWindow.showSaveFilePicker === 'function') {
    try {
      const handle = await anyWindow.showSaveFilePicker({
        suggestedName: suggested,
        types: [
          {
            description: 'Badger file',
            accept: { [BADGER_FILE_MIME]: [BADGER_FILE_EXTENSION] }
          }
        ]
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (e) {
      // AbortError = user cancelled. Anything else falls through to the
      // prompt fallback, since a failed write shouldn't lose the user's
      // chance to save.
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  const picked = window.prompt('Save badge as:', suggested);
  if (picked === null) return;
  const finalName = ensureExtension(picked.trim() || 'badger');
  const blob = new Blob([text], { type: BADGER_FILE_MIME });
  triggerDownload(blob, finalName);
}

// Back-compat wrapper for callers that want the old no-prompt download.
export function downloadBadgerFile(doc: BadgeDocument, filename = 'badger') {
  const text = serializeBadgerFile(doc);
  const blob = new Blob([text], { type: BADGER_FILE_MIME });
  triggerDownload(blob, ensureExtension(filename));
}

// Opens a native file picker and resolves with the file's text contents, or
// null if the user cancelled. Uses an ephemeral <input type="file"> instead
// of the File System Access API because the latter isn't supported in every
// browser, and we don't need its write-back-to-original-file behaviour.
export function pickBadgerFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${BADGER_FILE_EXTENSION},application/json,.json`;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        resolve({ name: file.name, text });
      } catch {
        resolve(null);
      }
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function ensureExtension(name: string): string {
  return name.toLowerCase().endsWith(BADGER_FILE_EXTENSION)
    ? name
    : name + BADGER_FILE_EXTENSION;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
