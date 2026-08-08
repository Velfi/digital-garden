import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WATER_Y } from './constants';
import { mirrorCameraMatrix } from './tankMesh';

/**
 * What the surface does with the mirror pass.
 *
 * The shader used to read the reflection target at the fragment's own screen
 * position, with the horizontal axis negated by hand to undo the handedness a
 * reflection reverses. It now follows the reflected ray to whatever it meets and
 * projects that point through the mirror camera's own view-projection.
 *
 * Those are not obviously the same thing, and the first test here is the reason
 * the change is safe: on the flat water they agree exactly, for every point
 * along the ray, because the mirror camera, the fragment and the whole reflected
 * ray are collinear. That collinearity is what the old shortcut was quietly
 * living on — and what a tilted surface destroys, which is the second test.
 */

const PLANE_Y = WATER_Y;

function mainCamera(): THREE.PerspectiveCamera {
  // Roughly where the jar's camera sits: five centimetres under the waterline,
  // fourteen out, looking slightly up at the marimo.
  const camera = new THREE.PerspectiveCamera(35, 1.6, 0.005, 3);
  camera.position.set(0.02, -0.02, 0.141);
  camera.lookAt(0, -0.018, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Where a world point lands in a camera's picture, in texture coordinates. */
function project(camera: THREE.PerspectiveCamera, point: THREE.Vector3): THREE.Vector2 {
  const clip = point.clone().project(camera);
  return new THREE.Vector2(clip.x * 0.5 + 0.5, clip.y * 0.5 + 0.5);
}

function mirrorSetup() {
  const camera = mainCamera();
  const mirror = new THREE.PerspectiveCamera(35, 1, 0.005, 3);
  mirrorCameraMatrix(new THREE.Matrix4(), mirror, camera, new THREE.Vector3(0, -0.018, 0), PLANE_Y);
  return { camera, mirror };
}

describe('the mirror camera', () => {
  it('is the camera reflected in the water', () => {
    const { camera, mirror } = mirrorSetup();
    expect(mirror.position.y - PLANE_Y).toBeCloseTo(PLANE_Y - camera.position.y, 12);
    expect(mirror.position.x).toBeCloseTo(camera.position.x, 12);
    expect(mirror.position.z).toBeCloseTo(camera.position.z, 12);

    // A reflection reverses handedness: the mirrored basis has its right vector
    // negated relative to the mirror image of the real one. This is the fact the
    // old screen-space lookup had to compensate for by flipping u.
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const mirrorRight = new THREE.Vector3().setFromMatrixColumn(mirror.matrixWorld, 0);
    expect(mirrorRight.x).toBeCloseTo(-right.x, 6);
    expect(mirrorRight.y).toBeCloseTo(right.y, 6); // y is negated twice over
    expect(mirrorRight.z).toBeCloseTo(-right.z, 6);
  });

  it('draws a submerged point where its reflection appears to the real camera', () => {
    // The defining property of a planar mirror. If this holds, sampling the
    // target at the mirror camera's projection of a point returns that point's
    // colour, which is the whole basis of the new lookup.
    const { camera, mirror } = mirrorSetup();
    const point = new THREE.Vector3(0.012, -0.03, -0.02);
    const image = new THREE.Vector3(point.x, 2 * PLANE_Y - point.y, point.z);

    const inMirror = project(mirror, point);
    const inMain = project(camera, image);
    expect(inMirror.x).toBeCloseTo(1 - inMain.x, 6);
    expect(inMirror.y).toBeCloseTo(inMain.y, 6);
  });
});

describe('the reflected-ray lookup', () => {
  /** The reflected ray the shader traces, for a surface normal at a point. */
  function reflectedRay(camera: THREE.PerspectiveCamera, point: THREE.Vector3, up: THREE.Vector3) {
    const incident = point.clone().sub(camera.position).normalize();
    // Facing the viewer from underwater, the interface normal points down.
    const n = up.clone().negate();
    return incident.clone().sub(n.clone().multiplyScalar(2 * incident.dot(n)));
  }

  it('agrees with the old screen-space lookup on flat water, at any distance', () => {
    const { camera, mirror } = mirrorSetup();
    const up = new THREE.Vector3(0, 1, 0);

    for (const [x, z] of [
      [0.0, 0.0],
      [0.03, -0.02],
      [-0.04, 0.03]
    ]) {
      const fragment = new THREE.Vector3(x, PLANE_Y, z);
      const ray = reflectedRay(camera, fragment, up);
      // What the shader replaced: the fragment's own screen position, u negated.
      const old = project(camera, fragment);

      for (const t of [0.002, 0.02, 0.08, 0.15]) {
        const seen = fragment.clone().addScaledVector(ray, t);
        const uv = project(mirror, seen);
        expect(uv.x).toBeCloseTo(1 - old.x, 5);
        expect(uv.y).toBeCloseTo(old.y, 5);
      }
    }
  });

  it('moves with distance once the surface tilts, which is the parallax', () => {
    // The meniscus stands the surface up to seventy degrees. There the reflected
    // ray leaves the line through the mirror camera, the lookup starts to depend
    // on how far away the reflected thing is, and the old formulation has no way
    // to say so — it would have returned the same pixel for all of these.
    const { camera, mirror } = mirrorSetup();
    const fragment = new THREE.Vector3(0.0, PLANE_Y + 0.002, 0.042);
    const tilt = (60 * Math.PI) / 180;
    const up = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt));
    const ray = reflectedRay(camera, fragment, up);

    const near = project(mirror, fragment.clone().addScaledVector(ray, 0.01));
    const far = project(mirror, fragment.clone().addScaledVector(ray, 0.12));
    expect(near.distanceTo(far)).toBeGreaterThan(0.05);
  });

  it('keeps a gentle ripple to a modest shift', () => {
    // The same mechanism carries the ripples, so it has to stay proportionate:
    // a typical wave slope must not throw the sample across the picture.
    const { camera, mirror } = mirrorSetup();
    const fragment = new THREE.Vector3(0.0, PLANE_Y, 0.0);
    const flat = project(
      mirror,
      fragment
        .clone()
        .addScaledVector(reflectedRay(camera, fragment, new THREE.Vector3(0, 1, 0)), 0.1)
    );

    const slope = 0.15; // a fair wave at the defaults
    const up = new THREE.Vector3(-slope, 1, 0).normalize();
    const rippled = project(
      mirror,
      fragment.clone().addScaledVector(reflectedRay(camera, fragment, up), 0.1)
    );

    const shift = flat.distanceTo(rippled);
    expect(shift).toBeGreaterThan(0.01);
    expect(shift).toBeLessThan(0.5);
  });
});
