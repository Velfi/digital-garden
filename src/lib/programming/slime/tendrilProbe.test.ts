import { describe, expect, it } from 'vitest';
import { FLOOR_Y } from './constants';
import { createPbdWorld } from './pbdWorld';

/**
 * The pseudopod probe: aim the feeding tendril at a point just past the
 * body's rim — an oat-flake's seat — and check the three promises the
 * scene relies on:
 *
 * - it *reaches*: material actually arrives at the tip, so the skin has a
 *   tongue to wrap and the flake's coverage gate can trip;
 * - it is a gesture, not a walk: the body's centroid stays put while the
 *   tongue is out;
 * - it leaves nothing behind: cleared and settled, the body is as still as
 *   an idle one (the walking-body bug family stays dead).
 */

function stepSeconds(world: ReturnType<typeof createPbdWorld>, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) world.step(1 / 60);
}

describe('feeding tendril', () => {
  it('reaches the flake without walking the body or leaving drift', { timeout: 30_000 }, () => {
    const w = createPbdWorld();
    const n = w.particleCount;
    const p = new Float32Array(n * 3);
    const v = new Float32Array(n * 3);

    stepSeconds(w, 2.5);

    const centroid = (): [number, number] => {
      w.readPositions(p);
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < n; i++) {
        cx += p[i * 3];
        cz += p[i * 3 + 2];
      }
      return [cx / n, cz / n];
    };
    const nearestTo = (x: number, y: number, z: number): number => {
      w.readPositions(p);
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = p[i * 3] - x;
        const dy = p[i * 3 + 1] - y;
        const dz = p[i * 3 + 2] - z;
        best = Math.min(best, Math.hypot(dx, dy, dz));
      }
      return best;
    };

    // The flake's seat: the scene's tongue range is the last stretch (the
    // lure walks the body most of the way first), so the probe seats the
    // flake a rim-and-a-bit past the mound — just over 2 cm out.
    const [cx0, cz0] = centroid();
    const tipX = cx0 + 0.022;
    const tipY = FLOOR_Y + 0.004;
    const before = nearestTo(tipX, tipY, 0);

    // Reach: the scene aims the target and ramps strength; the solver's
    // own tip paces itself out to the flake. A real meal moves on as soon
    // as the tongue arrives, so the probe does too (with a time cap).
    let touched = -1;
    for (let i = 0; i < 60 * 5; i++) {
      w.setTendril(tipX, tipY, 0, Math.min(1, i / 30));
      w.step(1 / 60);
      if (nearestTo(tipX, tipY, 0) < 0.002) {
        touched = i / 60;
        break;
      }
    }
    const during = nearestTo(tipX, tipY, 0);
    const [cx1, cz1] = centroid();
    console.log(
      `touched=${touched.toFixed(2)}s lean=${(Math.hypot(cx1 - cx0, cz1 - cz0) * 1000).toFixed(1)}mm`
    );

    // Engulf: the flake is drawn home under the skirt, the target riding
    // it, the strength fading out — then the tongue is released.
    for (let i = 0; i < 120; i++) {
      const t = i / 120;
      w.setTendril(cx1 + (tipX - cx1) * (1 - t), tipY, cz1 * t, 1 - t);
      w.step(1 / 60);
    }
    w.clearTendril();
    stepSeconds(w, 3);
    w.readVelocities(v);
    let mvx = 0;
    let mvz = 0;
    for (let i = 0; i < n; i++) {
      mvx += v[i * 3];
      mvz += v[i * 3 + 2];
    }
    mvx /= n;
    mvz /= n;

    // It reaches: goo arrives at the flake within the meal's patience.
    expect(touched).toBeGreaterThan(0);
    expect(during).toBeLessThan(Math.min(before, 0.004));
    // It leans, it does not relocate: the mound stays a mound while the
    // tongue is the thing that travels.
    expect(Math.hypot(cx1 - cx0, cz1 - cz0)).toBeLessThan(0.012);
    // It leaves no drift: settled again, the body is idle-still.
    expect(Math.hypot(mvx, mvz)).toBeLessThan(0.001);
  });
});
