import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '__snapshots__');

/** When set, overwrite BMP baselines (Vitest workers do not receive `-u` in `process.argv`). */
const UPDATE = process.env.VITEST_BMP_UPDATE === '1';

/**
 * Compare `buffer` to `__snapshots__/<filename>` as raw bytes.
 * Update baselines: `VITEST_BMP_UPDATE=1 npx vitest run …/piscina.snapshot.test.ts`
 */
export function assertBmpFileSnapshot(buffer: Buffer, filename: string): void {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const filePath = join(SNAPSHOT_DIR, filename);
  if (UPDATE || !existsSync(filePath)) {
    writeFileSync(filePath, buffer);
    return;
  }
  const expected = readFileSync(filePath);
  const looksLikeVitestJson = expected.length >= 2 && expected[0] === 0x7b && expected[1] === 0x22; // `{ "`
  if (looksLikeVitestJson) {
    throw new Error(
      `${filename} is not a raw BMP (Vitest serialized the Buffer as JSON). Regenerate with: VITEST_BMP_UPDATE=1 npm run test:voxelle:piscina-snapshots`
    );
  }
  if (!buffer.equals(expected)) {
    throw new Error(
      `BMP snapshot mismatch: ${filename}. To refresh: VITEST_BMP_UPDATE=1 npm run test:voxelle:piscina-snapshots`
    );
  }
}
