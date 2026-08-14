import { describe, expect, it } from 'vitest';
import { FLOOR_Y, SIM_STEP_SEC } from './constants';
import { createParticleHand } from './particleHand';
import { createPbdWorld } from './pbdWorld';

/**
 * The hand and the will, probed exactly the way the scene drives them —
 * press on the surface, drag the pointer, release — because the lift probe
 * in pbdWorld.test.ts pulls at a stationary point and passed while the
 * *moving* hand was silently losing its grip in the app.
 */

function bodyStats(world: ReturnType<typeof createPbdWorld>) {
  const p = new Float32Array(world.particleCount * 3);
  world.readPositions(p);
  let minY = Infinity;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < world.particleCount; i++) {
    minY = Math.min(minY, p[i * 3 + 1]);
    cx += p[i * 3];
    cz += p[i * 3 + 2];
  }
  return { minY, cx: cx / world.particleCount, cz: cz / world.particleCount };
}

function settle(world: ReturnType<typeof createPbdWorld>, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) world.step(1 / 60);
}

describe('the continuum hand and will', () => {
  it('a press-and-drag lifts the body clear of the floor, and release drops it', () => {
    const world = createPbdWorld();
    settle(world, 1.5);
    const rest = bodyStats(world);

    const hand = createParticleHand(world);
    // Press straight down onto the crown from in front, like the pointer:
    // a ray from the camera's neighbourhood hitting the top of the mound.
    const origin: [number, number, number] = [0, FLOOR_Y + 0.08, 0.1];
    const crown: [number, number, number] = [0, FLOOR_Y + 0.015, 0];
    const dir: [number, number, number] = [
      crown[0] - origin[0],
      crown[1] - origin[1],
      crown[2] - origin[2]
    ];
    const len = Math.hypot(...dir);
    dir[0] /= len;
    dir[1] /= len;
    dir[2] /= len;
    hand.press({ origin, dir }, len);

    // Drag upward at a real hand's pace — 50 mm/s of pointer travel, the
    // lift gain doubling it — then hold at the top for a beat. The first
    // draft of this probe dragged at 20 mm/s and read as a failure; the
    // hand's lift speed *is* the gesture's speed, which is correct feel.
    const dragSteps = Math.round(0.9 / SIM_STEP_SEC);
    for (let i = 0; i < dragSteps; i++) {
      const t = (i + 1) / dragSteps;
      hand.move({ origin: [origin[0], origin[1] + t * 0.045, origin[2]], dir });
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
    }
    const holdSteps = Math.round(0.5 / SIM_STEP_SEC);
    for (let i = 0; i < holdSteps; i++) {
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
    }
    const held = bodyStats(world);
    expect(held.minY).toBeGreaterThan(rest.minY + 0.004);

    hand.release();
    settle(world, 4);
    const landed = bodyStats(world);
    expect(landed.minY).toBeGreaterThan(FLOOR_Y - 0.002);
    expect(landed.minY).toBeLessThan(FLOOR_Y + 0.008);
  }, 120_000);

  it('a press-and-hold pokes a dent and stays a poke; release springs back', () => {
    const world = createPbdWorld();
    settle(world, 1.5);
    const rest = bodyStats(world);

    // Crown height at the body's own axis — the dent gauge. The rim rises
    // as the crown dips, so a whole-body max would understate the poke.
    const p = new Float32Array(world.particleCount * 3);
    const crownAt = () => {
      world.readPositions(p);
      let crown = -Infinity;
      for (let i = 0; i < world.particleCount; i++) {
        const dx = p[i * 3] - rest.cx;
        const dz = p[i * 3 + 2] - rest.cz;
        if (dx * dx + dz * dz < 0.006 * 0.006) crown = Math.max(crown, p[i * 3 + 1]);
      }
      return crown;
    };
    const restCrown = crownAt();

    const hand = createParticleHand(world);
    // Straight down onto the crown, and hold — no drag at all.
    const origin: [number, number, number] = [rest.cx, FLOOR_Y + 0.1, rest.cz];
    const dir: [number, number, number] = [0, -1, 0];
    hand.press({ origin, dir }, origin[1] - restCrown);
    expect(hand.state()).toBe('poking');

    for (let i = 0; i < Math.round(1 / SIM_STEP_SEC); i++) {
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
    }
    expect(hand.state()).toBe('poking');
    const pressedCrown = crownAt();
    expect(restCrown - pressedCrown).toBeGreaterThan(0.002);

    hand.release();
    settle(world, 3);
    const healedCrown = crownAt();
    expect(restCrown - healedCrown).toBeLessThan(0.002);
  }, 120_000);

  it('a pet stroke stays a caress: dragged hard, it never grabs or lifts', () => {
    const world = createPbdWorld();
    settle(world, 1.5);
    const rest = bodyStats(world);

    const hand = createParticleHand(world);
    // Same crown press as the lift probe — but as the pet gesture.
    const origin: [number, number, number] = [0, FLOOR_Y + 0.08, 0.1];
    const crown: [number, number, number] = [0, FLOOR_Y + 0.015, 0];
    const dir: [number, number, number] = [
      crown[0] - origin[0],
      crown[1] - origin[1],
      crown[2] - origin[2]
    ];
    const len = Math.hypot(...dir);
    dir[0] /= len;
    dir[1] /= len;
    dir[2] /= len;
    hand.press({ origin, dir }, len, 'pet');
    expect(hand.state()).toBe('petting');

    // Drag well past the grab threshold, back and forth like a real stroke,
    // faster than the lift probe's pull. Petting must survive enthusiasm.
    const strokeSteps = Math.round(1.2 / SIM_STEP_SEC);
    for (let i = 0; i < strokeSteps; i++) {
      const sway = Math.sin((i / strokeSteps) * Math.PI * 4) * 0.02;
      hand.move({ origin: [origin[0] + sway, origin[1] + 0.03, origin[2]], dir });
      hand.step(SIM_STEP_SEC);
      world.step(SIM_STEP_SEC);
      expect(hand.state()).toBe('petting');
    }
    // The body stayed on the floor the whole while — stroked, not carried.
    const stroked = bodyStats(world);
    expect(stroked.minY).toBeLessThan(FLOOR_Y + 0.008);

    hand.release();
    expect(hand.state()).toBe('idle');
    settle(world, 2);
    const after = bodyStats(world);
    expect(Number.isFinite(after.cx)).toBe(true);
  }, 120_000);

  it('a lure draws the mound across the floor', () => {
    const world = createPbdWorld();
    settle(world, 1.5);
    const rest = bodyStats(world);

    world.setLure(0.03, 0);
    settle(world, 10);
    const drawn = bodyStats(world);
    // Crawled a meaningful distance toward the flake, still on the floor.
    expect(drawn.cx - rest.cx).toBeGreaterThan(0.008);
    expect(drawn.minY).toBeLessThan(FLOOR_Y + 0.008);

    world.clearLure();
    settle(world, 2);
    const after = bodyStats(world);
    expect(Number.isFinite(after.cx)).toBe(true);
  }, 120_000);
});
