import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { offscreenMarker } from './offscreen';

/** A silhouette a tenth of the frame across, which is about what a small pet is. */
const R = 0.1;

describe('offscreenMarker', () => {
  it('says nothing while the marimo is in frame', () => {
    expect(offscreenMarker(0, 0, R, R)).toBeNull();
    expect(offscreenMarker(0.5, -0.4, R, R)).toBeNull();
  });

  it('says nothing at the moment the silhouette first touches an edge', () => {
    // Touching from the inside is still wholly visible. The marker has to start
    // from nothing here, or it pops in over something you can see perfectly well.
    expect(offscreenMarker(1 - R, 0, R, R)).toBeNull();
    expect(offscreenMarker(0, -(1 - R), R, R)).toBeNull();
  });

  it('reaches one exactly as the last of it clears the edge', () => {
    expect(offscreenMarker(1 + R, 0, R, R)?.hidden).toBeCloseTo(1, 12);
    expect(offscreenMarker(-(1 + R), 0, R, R)?.hidden).toBeCloseTo(1, 12);
    // And stays there rather than growing, however far out it gets.
    expect(offscreenMarker(4, 0, R, R)?.hidden).toBe(1);
  });

  it('is half hidden with its centre on the edge', () => {
    expect(offscreenMarker(1, 0, R, R)?.hidden).toBeCloseTo(0.5, 12);
  });

  it('fades in monotonically across the crossing', () => {
    let previous = 0;
    for (let i = 1; i <= 20; i++) {
      const marker = offscreenMarker(1 - R + (i / 20) * 2 * R, 0, R, R);
      const hidden = marker?.hidden ?? 0;
      expect(hidden).toBeGreaterThan(previous);
      previous = hidden;
    }
    expect(previous).toBeCloseTo(1, 12);
  });

  it('takes the worse of the two axes when it leaves through a corner', () => {
    // Half out the side and a quarter out the top is three-quarters gone, not
    // some blend of the two — the marker tracks distance past an edge, and the
    // side is the edge it is furthest past.
    const marker = offscreenMarker(1 + 0.5 * R, 1 - 0.5 * R, R, R);
    expect(marker?.hidden).toBeCloseTo(0.75, 12);
  });

  it('uses each axis its own radius, since the frame is not square', () => {
    // A portrait viewport projects the same ball wider in x than in y, so the
    // same offset is further through the crossing vertically.
    const wide = 0.2;
    const tall = 0.1;
    const marker = offscreenMarker(1, 1, wide, tall);
    expect(offscreenMarker(1, 0, wide, tall)?.hidden).toBeCloseTo(0.5, 12);
    expect(offscreenMarker(0, 1, wide, tall)?.hidden).toBeCloseTo(0.5, 12);
    expect(marker?.hidden).toBeCloseTo(0.5, 12);
  });

  it('clamps the marker to the frame however far out the marimo is', () => {
    const marker = offscreenMarker(-6, 3, R, R);
    expect(marker?.ndcX).toBe(-1);
    expect(marker?.ndcY).toBe(1);
  });

  it('points the way the marimo actually went', () => {
    // Degrees clockwise from up, which is what a CSS rotation on an arrow wants.
    expect(offscreenMarker(0, 2, R, R)?.angleDeg).toBeCloseTo(0, 9);
    expect(offscreenMarker(2, 0, R, R)?.angleDeg).toBeCloseTo(90, 9);
    expect(offscreenMarker(0, -2, R, R)?.angleDeg).toBeCloseTo(180, 9);
    expect(offscreenMarker(-2, 0, R, R)?.angleDeg).toBeCloseTo(-90, 9);
    expect(offscreenMarker(2, 2, R, R)?.angleDeg).toBeCloseTo(45, 9);
  });

  it('keeps pointing outward after the position has been clamped', () => {
    // The clamped corner is at 45 degrees, but the marimo is far further out
    // sideways than up, and the arrow has to say so.
    const marker = offscreenMarker(8, 1.2, R, R);
    expect(marker?.ndcX).toBe(1);
    expect(marker?.ndcY).toBe(1);
    expect(marker?.angleDeg).toBeGreaterThan(80);
  });

  it('snaps rather than fades for a silhouette too small to have an edge', () => {
    expect(offscreenMarker(0.999, 0, 0, 0)).toBeNull();
    expect(offscreenMarker(1.001, 0, 0, 0)?.hidden).toBe(1);
  });

  it('agrees with a real projection about how big the marimo is on screen', () => {
    // The caller has to turn a radius in metres into one in device coordinates
    // before any of the above means anything, and it does that from the view
    // depth and the field of view rather than by projecting a second point.
    // This is the check that the shortcut is the same arithmetic the projection
    // matrix does — get it wrong and the fade band lands in the wrong place
    // while every test above still passes.
    const camera = new THREE.PerspectiveCamera(35, 4 / 5, 0.005, 3);
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

    const right = new THREE.Vector3();
    const centre = new THREE.Vector3();
    const edge = new THREE.Vector3();

    for (const depth of [0.1, 0.15, 0.3]) {
      for (const radius of [0.006, 0.012, 0.045]) {
        camera.position.set(0, 0, depth);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        camera.updateProjectionMatrix();
        right.setFromMatrixColumn(camera.matrixWorld, 0);

        centre.set(0, 0, 0).project(camera);
        edge.copy(right).multiplyScalar(radius).project(camera);

        const predictedY = radius / (depth * tanHalfFov);
        const predictedX = predictedY / camera.aspect;
        // Exactly, not approximately: the offset point sits at the same depth
        // as the centre, so the perspective divide is the same number for both
        // and the mapping is linear across it. What the formula does approximate
        // is a *sphere* — its true silhouette is the tangent cone, a shade wider
        // than this disc through the centre — and that gap stays well inside the
        // fade band while the ball is much smaller than its distance from the
        // eye, as a marimo in a jar always is.
        expect(edge.x - centre.x).toBeCloseTo(predictedX, 12);
        expect(predictedX / predictedY).toBeCloseTo(1 / camera.aspect, 12);
      }
    }
  });

  it('unmirrors a marimo behind the camera and calls it wholly gone', () => {
    // The perspective divide sends a point behind the eye back through the
    // origin, so the raw coordinates point exactly the wrong way.
    const marker = offscreenMarker(0.3, -0.2, R, R, true);
    expect(marker?.hidden).toBe(1);
    expect(marker?.ndcX).toBeCloseTo(-0.3, 12);
    expect(marker?.ndcY).toBeCloseTo(0.2, 12);
    // Reported at the centre of the frame it would otherwise have been called
    // visible; being behind you is not being in shot.
    expect(offscreenMarker(0, 0, R, R, true)?.hidden).toBe(1);
  });
});
