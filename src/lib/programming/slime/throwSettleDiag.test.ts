import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import { FLOOR_Y, SIM_STEP_SEC } from './constants';
import { buildEggMesh } from './eggMesh';
import { createInteraction, type PointerRay } from './interaction';
import { createTerrariumWorld, type SlimeBody } from './joltWorld';

/**
 * Temporary X-ray for the playFeel throw scenario's never-settling tail.
 * Replays the exact gesture, then reports what keeps moving: worst per-step
 * vertex displacement, centroid drift, awake state, and the plastic
 * rest-length drift that gates the sleep→wake heal loop.
 */

let J: typeof Jolt;

beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

describe('throw settle diagnostics', () => {
  it('replays the throw and prints the tail', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    const positions = new Float32Array(egg.vertexCount * 3);
    const hand = createInteraction(world, slime, egg);

    const step = (withHand: boolean) => {
      if (withHand) hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
      world.readSlimeVertices(slime, positions);
    };

    for (let i = 0; i < 240; i++) step(false);

    let restApex = -Infinity;
    for (let i = 0; i < egg.vertexCount; i++) {
      restApex = Math.max(restApex, positions[i * 3 + 1]);
    }
    const rayTop = 0.1;
    const down: PointerRay = { origin: [0, rayTop, 0], dir: [0, -1, 0] };
    hand.press(down, [0, 0], egg.yolkFaceStart, rayTop - restApex);
    hand.move(down, [0.2, 0]);
    expect(hand.state()).toBe('grabbing');

    hand.move({ origin: [0, rayTop + 0.03, 0], dir: [0, -1, 0] }, [0.2, 0.2]);
    for (let i = 0; i < Math.round(0.5 / SIM_STEP_SEC); i++) step(true);
    const whipSteps = Math.round(0.8 / SIM_STEP_SEC);
    for (let i = 0; i < whipSteps; i++) {
      const sweep = Math.sin((i / whipSteps) * Math.PI * 2 * 2) * 0.03;
      hand.move({ origin: [sweep, rayTop + 0.03, 0], dir: [0, -1, 0] }, [0.2 + sweep, 0.2]);
      step(true);
    }
    hand.release();
    for (let i = 0; i < Math.round(1.5 / SIM_STEP_SEC); i++) step(false);

    // The tail: 6 seconds, quarter-second reports.
    const before = new Float32Array(positions.length);
    const lines: string[] = [];
    const reportEvery = Math.round(0.25 / SIM_STEP_SEC);
    let worstInWindow = 0;
    let movers = 0;
    let worstIndex = -1;
    let stepTrans = 0;
    let stepSpin = 0;
    let stepRadial = 0;
    let stepJiggle = 0;
    let spinX = 0;
    let spinY = 0;
    let spinZ = 0;
    let modeSteps = 0;
    for (let i = 0; i < Math.round(6 / SIM_STEP_SEC); i++) {
      before.set(positions);
      step(false);
      let worst = 0;
      let worstK = -1;
      let over = 0;
      for (let k = 0; k < before.length; k++) {
        const d = Math.abs(positions[k] - before[k]);
        if (d > worst) {
          worst = d;
          worstK = k;
        }
        if (d > 0.00005) over++;
      }
      worstInWindow = Math.max(worstInWindow, worst);
      movers = Math.max(movers, over);
      if (worst === worstInWindow) worstIndex = Math.floor(worstK / 3);
      // Mode decomposition for this step's motion: how much of the
      // per-vertex displacement is net translation, rigid rotation about the
      // centroid, radial breathing toward/away from the centroid, or
      // unstructured jiggle.
      {
        const n = egg.vertexCount;
        let tcx = 0;
        let tcy = 0;
        let tcz = 0;
        for (let v = 0; v < n; v++) {
          tcx += positions[v * 3] - before[v * 3];
          tcy += positions[v * 3 + 1] - before[v * 3 + 1];
          tcz += positions[v * 3 + 2] - before[v * 3 + 2];
        }
        tcx /= n;
        tcy /= n;
        tcz /= n;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (let v = 0; v < n; v++) {
          cx += before[v * 3];
          cy += before[v * 3 + 1];
          cz += before[v * 3 + 2];
        }
        cx /= n;
        cy /= n;
        cz /= n;
        // Angular velocity fit: L = sum r x dr, I = sum |r|^2 (scalar proxy).
        let lx = 0;
        let ly = 0;
        let lz = 0;
        let inertia = 0;
        let radialSq = 0;
        let totalSq = 0;
        for (let v = 0; v < n; v++) {
          const rx = before[v * 3] - cx;
          const ry = before[v * 3 + 1] - cy;
          const rz = before[v * 3 + 2] - cz;
          const dx = positions[v * 3] - before[v * 3] - tcx;
          const dy = positions[v * 3 + 1] - before[v * 3 + 1] - tcy;
          const dz = positions[v * 3 + 2] - before[v * 3 + 2] - tcz;
          lx += ry * dz - rz * dy;
          ly += rz * dx - rx * dz;
          lz += rx * dy - ry * dx;
          const rSq = rx * rx + ry * ry + rz * rz;
          inertia += rSq;
          totalSq += dx * dx + dy * dy + dz * dz;
          if (rSq > 1e-12) {
            const rad = (dx * rx + dy * ry + dz * rz) / Math.sqrt(rSq);
            radialSq += rad * rad;
          }
        }
        stepTrans += Math.hypot(tcx, tcy, tcz);
        stepSpin += Math.hypot(lx, ly, lz) / Math.max(1e-12, inertia);
        spinX += lx / Math.max(1e-12, inertia);
        spinY += ly / Math.max(1e-12, inertia);
        spinZ += lz / Math.max(1e-12, inertia);
        stepRadial += Math.sqrt(radialSq / n);
        stepJiggle += Math.sqrt(totalSq / n);
        modeSteps++;
      }
      if ((i + 1) % reportEvery === 0) {
        // Plastic drift as the sleeping wake-gate computes it (edges only,
        // vs base — the spoke half needs droplet lookups; edges tell enough).
        let worstEdge = 0;
        for (let e = 0; e < slime.plasticEdgeBase.length; e++) {
          worstEdge = Math.max(
            worstEdge,
            Math.abs(slime.plasticEdgeCurrent[e] / slime.plasticEdgeBase[e] - 1)
          );
        }
        let cx = 0;
        let cy = 0;
        for (let v = 0; v < egg.vertexCount; v++) {
          cx += positions[v * 3];
          cy += positions[v * 3 + 1];
        }
        cx /= egg.vertexCount;
        cy /= egg.vertexCount;
        lines.push(
          `t=${((i + 1) * SIM_STEP_SEC).toFixed(2)}s worst=${(worstInWindow * 1000).toFixed(3)}mm/step ` +
            `movers=${movers} worstVert=${worstIndex} active=${slime.body.IsActive()} ` +
            `edgeDrift=${(worstEdge * 100).toFixed(2)}% centre=(${(cx * 1000).toFixed(1)}, ${(cy * 1000).toFixed(1)})mm ` +
            `| per-step avg: trans=${((stepTrans / modeSteps) * 1e6).toFixed(1)}um ` +
            `spin=${((stepSpin / modeSteps) * 120 * 57.3).toFixed(2)}deg/s ` +
            `axis=(${((spinX / modeSteps) * 120 * 57.3).toFixed(1)}, ${((spinY / modeSteps) * 120 * 57.3).toFixed(1)}, ${((spinZ / modeSteps) * 120 * 57.3).toFixed(1)}) ` +
            `radialRMS=${((stepRadial / modeSteps) * 1e6).toFixed(1)}um ` +
            `jiggleRMS=${((stepJiggle / modeSteps) * 1e6).toFixed(1)}um`
        );
        worstInWindow = 0;
        movers = 0;
        stepTrans = 0;
        stepSpin = 0;
        stepRadial = 0;
        stepJiggle = 0;
        spinX = 0;
        spinY = 0;
        spinZ = 0;
        modeSteps = 0;
      }
    }
    writeFileSync('/tmp/throw-settle-diag.log', lines.join('\n') + '\n');
  });
});
