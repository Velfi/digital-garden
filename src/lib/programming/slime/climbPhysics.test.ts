import { beforeAll, describe, expect, it } from 'vitest';
import type Jolt from 'jolt-physics';
import { loadJolt } from '../marimo/joltWorld';
import {
  BOX_HALF_Z,
  BOX_HEIGHT,
  CLIMB_ANCHOR_SPEED,
  CLIMB_LAG_PAUSE,
  CLIMB_START_V,
  FLOOR_Y,
  SIM_STEP_SEC,
  SQUEEGEE_BLADE_HALF_EXTENTS
} from './constants';
import { createClimbWithPlanner, type ClimbInputs, type ClimbPlanner } from './climb';
import { buildEggMesh } from './eggMesh';
import { PANE_ZP, paneWorld } from './grimeMap';
import { createTerrariumWorld, type TerrariumWorld } from './joltWorld';

/**
 * The will against real physics: not the planner (which has its own pure
 * tests) but the open question underneath it — whether a steered grip can
 * actually hold fourteen grams of soft body onto vertical glass. A scripted
 * planner takes the dice out and drives one canonical ascent; the assertions
 * are about altitude and integrity, not style.
 */

let J: typeof Jolt;

beforeAll(async () => {
  J = await loadJolt();
}, 30_000);

function step(world: TerrariumWorld, steps: number, also?: () => void): void {
  for (let i = 0; i < steps; i++) {
    also?.();
    world.step(SIM_STEP_SEC);
  }
}

describe('climbing, on the solver', () => {
  it('a scripted ascent lifts the body up the front pane and keeps it whole', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    // Spawned within reach of the front pane, then given two seconds to rest.
    const slime = world.addSlime(egg, [0, FLOOR_Y + 0.004, 0.018]);
    step(world, 240);

    // The scripted will, shaped like the real planner's ascent: grip at
    // crown height, advance only while the body keeps up.
    let v = CLIMB_START_V;
    const inputs: ClimbInputs & { center: [number, number, number] } = {
      center: [0, FLOOR_Y + 0.01, 0.018],
      handBusy: false,
      zest: 1,
      moisture: 1,
      speed: 1,
      food: null
    };
    const planner: ClimbPlanner = {
      step(dt) {
        const at = paneWorld(PANE_ZP, 0.5, v);
        if (at[1] - inputs.center[1] < CLIMB_LAG_PAUSE) {
          v = Math.min(0.55, v + (dt * CLIMB_ANCHOR_SPEED) / BOX_HEIGHT);
        }
        return { mode: 'ascend', active: true, anchor: paneWorld(PANE_ZP, 0.5, v), pane: PANE_ZP };
      },
      mode: () => 'ascend'
    };
    const climb = createClimbWithPlanner(world, slime, egg, planner);

    // Half a minute on the glass, with the will fed the body's real centroid
    // the way the scene feeds it. A grip that cannot beat gravity never gets
    // its anchor off crown height (the feedback gate holds it down), and the
    // altitude assertions below fail.
    const positions = new Float32Array(egg.vertexCount * 3);
    step(world, 3600, () => {
      world.readSlimeVertices(slime, positions);
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let i = 0; i < egg.vertexCount; i++) {
        cx += positions[i * 3];
        cy += positions[i * 3 + 1];
        cz += positions[i * 3 + 2];
      }
      inputs.center[0] = cx / egg.vertexCount;
      inputs.center[1] = cy / egg.vertexCount;
      inputs.center[2] = cz / egg.vertexCount;
      climb.step(SIM_STEP_SEC, inputs);
    });
    world.readSlimeVertices(slime, positions);

    let centroidY = 0;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    let finite = true;
    for (let i = 0; i < egg.vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) finite = false;
      centroidY += y;
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
      expect(Math.abs(x)).toBeLessThan(0.3);
      expect(Math.abs(z)).toBeLessThan(0.3);
    }
    centroidY /= egg.vertexCount;

    expect(finite).toBe(true);
    // The anchor tops out at v = 0.55 — 44 mm up the pane. A grip that held
    // gets the crown near it and the centroid well off the floor; a grip
    // that slipped never even freed the anchor from the feedback gate.
    const anchorY = FLOOR_Y + 0.55 * BOX_HEIGHT;
    expect(maxY).toBeGreaterThan(anchorY - 0.012);
    expect(centroidY).toBeGreaterThan(FLOOR_Y + 0.018);
    // And it is pressed against the glass, which is what smears it.
    expect(maxZ).toBeGreaterThan(BOX_HALF_Z - 0.006);

    world.dispose();
  }, 60_000); // half a minute of 120 Hz soft body is real work
});

describe('the squeegee blade, on the solver', () => {
  it('a paddle glides along the front pane without upsetting anything', () => {
    const world = createTerrariumWorld(J);
    const egg = buildEggMesh();
    world.addSlime(egg, [0, FLOOR_Y + 0.004, 0]);
    step(world, 120);

    // Plant the blade against the front pane and sweep it sideways, the way
    // a squeegee stroke does.
    const inward = SQUEEGEE_BLADE_HALF_EXTENTS[2];
    const start: [number, number, number] = [-0.03, FLOOR_Y + 0.04, BOX_HALF_Z - inward];
    // A half-turn yaw — any fixed rotation proves the point.
    const blade = world.addPaddle(SQUEEGEE_BLADE_HALF_EXTENTS, start, [0, 1, 0, 0]);

    const pose: [number, number, number] = [0, 0, 0];
    const quat: [number, number, number, number] = [0, 0, 0, 1];
    let x = start[0];
    step(world, 240, () => {
      x = Math.min(0.03, x + 0.05 * SIM_STEP_SEC);
      world.moveKinematic(blade, [x, start[1], start[2]], SIM_STEP_SEC);
    });

    world.readPose(blade, pose, quat);
    // It went where it was sent and kept the rotation it was built with.
    expect(pose[0]).toBeGreaterThan(0.02);
    expect(pose[2]).toBeCloseTo(start[2], 3);
    expect(Math.abs(quat[1])).toBeCloseTo(1, 3);

    world.remove(blade);
    world.dispose();
  });
});
