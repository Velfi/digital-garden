import { describe, it, expect } from 'vitest';
import {
  BADGER_FILE_VERSION,
  deserializeBadgerFile,
  serializeBadgerFile
} from './badgerFile';
import { emptyDocument } from './store/types';

function sampleDocument() {
  const doc = emptyDocument(40, 40);
  doc.metal.paths = [
    {
      id: 'rim',
      kind: 'shape',
      closed: true,
      start: { x: 5, y: 5 },
      nodes: [
        { type: 'line', to: { x: 35, y: 5 } },
        { type: 'line', to: { x: 35, y: 35 } },
        { type: 'line', to: { x: 5, y: 35 } }
      ],
      strokeWidth: 0.6
    },
    {
      id: 'divider',
      kind: 'shape',
      closed: false,
      start: { x: 10, y: 20 },
      nodes: [{ type: 'cubic', c1: { x: 15, y: 15 }, c2: { x: 25, y: 25 }, to: { x: 30, y: 20 } }],
      strokeWidth: 0.4
    }
  ];
  doc.colorAssignments = { 'cell-1': '#ff0000', 'cell-2': '#00ff00' };
  doc.materialAssignments = { 'cell-1': 'glitter' };
  doc.palette = ['#ff0000', '#00ff00', '#0000ff'];
  doc.render.finish = 'rose_gold';
  doc.render.enamelFinish = 'hard';
  return doc;
}

describe('badger file format', () => {
  it('round-trips a populated document', () => {
    const doc = sampleDocument();
    const text = serializeBadgerFile(doc);
    const result = deserializeBadgerFile(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.document).toEqual(doc);
  });

  it('emits the current version and magic', () => {
    const text = serializeBadgerFile(sampleDocument());
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe('badger');
    expect(parsed.version).toBe(BADGER_FILE_VERSION);
  });

  it('rejects non-JSON input', () => {
    const result = deserializeBadgerFile('not json at all');
    expect(result.ok).toBe(false);
  });

  it('rejects JSON without the badger magic', () => {
    const result = deserializeBadgerFile(
      JSON.stringify({ version: 1, document: sampleDocument() })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not a badger document/);
  });

  it('rejects files from a newer version', () => {
    const future = {
      format: 'badger',
      version: BADGER_FILE_VERSION + 1,
      document: sampleDocument()
    };
    const result = deserializeBadgerFile(JSON.stringify(future));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/newer/);
  });

  it('rejects a malformed document payload', () => {
    const bad = {
      format: 'badger',
      version: 1,
      document: { canvas: { width: -1, height: 0 } }
    };
    const result = deserializeBadgerFile(JSON.stringify(bad));
    expect(result.ok).toBe(false);
  });

  it('ignores unknown top-level fields for forward compatibility', () => {
    const withExtras = {
      format: 'badger',
      version: 1,
      document: sampleDocument(),
      futureMetadata: { author: 'someone' }
    };
    const result = deserializeBadgerFile(JSON.stringify(withExtras));
    expect(result.ok).toBe(true);
  });
});
