import { appendFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { FLOOR_Y } from './constants';
import { createPbdWorld } from './pbdWorld';

/** Vitest buffers console output; the X-ray goes to a file too. */
const LOG_PATH = '/tmp/pbd-diag.log';
function out(line: string) {
  console.log(line);
  appendFileSync(LOG_PATH, line + '\n');
}

function sil(world: ReturnType<typeof createPbdWorld>, label: string) {
  const p = new Float32Array(world.particleCount * 3);
  world.readPositions(p);
  let minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < world.particleCount; i++) {
    minY = Math.min(minY, p[i * 3 + 1]);
    maxY = Math.max(maxY, p[i * 3 + 1]);
  }
  const h = maxY - minY;
  const bands = new Float32Array(6);
  for (let i = 0; i < world.particleCount; i++) {
    const b = Math.min(5, Math.floor(((p[i * 3 + 1] - minY) / Math.max(h, 1e-9)) * 6));
    bands[b] = Math.max(bands[b], Math.hypot(p[i * 3], p[i * 3 + 2]));
  }
  out(
    `${label}: h=${(h * 1000).toFixed(1)}mm minY=${((minY - FLOOR_Y) * 1000).toFixed(1)}mm ` +
      `bands=[${Array.from(bands)
        .map((r) => (r * 1000).toFixed(1))
        .join(', ')}]`
  );
  return { minY, maxY, h };
}

function stepSeconds(world: ReturnType<typeof createPbdWorld>, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) world.step(1 / 60);
}

/**
 * The tuning instrument, not a gate: prints the silhouette through settle,
 * flip, and squash arcs. Skipped in the suite (it is slow and assertion-
 * free); unskip while tuning the material and read the bands like an
 * X-ray — every constant change in pbdWorld.ts should be judged here first.
 */
describe('pbd shape diagnostics', () => {
  it('prints the arcs', () => {
    const w = createPbdWorld();
    stepSeconds(w, 1);
    sil(w, 'settle 1s');
    stepSeconds(w, 2);
    sil(w, 'settle 3s');
    stepSeconds(w, 5);
    sil(w, 'settle 8s');

    w.flipForTest();
    stepSeconds(w, 4);
    sil(w, 'flip +4s');
    stepSeconds(w, 12);
    sil(w, 'flip +16s');

    sil(w, 'pre-press');
    for (let i = 0; i < 50; i++) {
      w.pushFrom(0, FLOOR_Y + 0.03, 0, 0.028, 0.12);
      w.step(1 / 60);
    }
    stepSeconds(w, 0.4);
    sil(w, 'pressed');
    stepSeconds(w, 8);
    sil(w, 'healed +8s');
  }, 120_000);

  it('gentle press arc (the probe gesture, watched longer)', () => {
    const w = createPbdWorld();
    stepSeconds(w, 2);
    const rest = sil(w, 'rest');
    for (let i = 0; i < 50; i++) {
      w.pushFrom(0, rest.minY + rest.h + 0.008, 0, 0.028, 0.12);
      w.step(1 / 60);
    }
    stepSeconds(w, 0.4);
    sil(w, 'pressed');
    let at = 0.4;
    for (const span of [2, 2, 4, 8]) {
      stepSeconds(w, span);
      at += span;
      sil(w, `press +${at.toFixed(1)}s`);
    }
  }, 180_000);
});
