/**
 * Where the marimo went, when it went somewhere you cannot see.
 *
 * The camera follows the ball vertically but is pinned to the jar's axis
 * horizontally, and on the portrait layout it dollies in close enough on a small
 * marimo that the side walls of the jar sit outside the frame. So a small pet
 * shoved into the glass can genuinely leave the picture, with nothing to say
 * which way it went. This is the fighting-game answer: a marker clamped to the
 * edge, pointing at it.
 *
 * Everything here is screen-space arithmetic on numbers the caller has already
 * projected — no camera, no three, so it can be reasoned about and tested on its
 * own.
 */

import { clamp } from './careSim';

export interface OffscreenMarker {
  /**
   * How much of the marimo the frame has eaten, in (0, 1]. Zero would mean it
   * is still entirely visible, which is reported as no marker at all; one means
   * the last of it has cleared the edge.
   */
  hidden: number;
  /**
   * Where to put the marker, in normalised device coordinates clamped to the
   * frame. +x is right, +y is up.
   */
  ndcX: number;
  ndcY: number;
  /** Which way to point, in degrees clockwise from straight up. */
  angleDeg: number;
}

/**
 * A silhouette narrower than this is treated as a point.
 *
 * The fade band is two radii wide, so a vanishing radius would divide by
 * something arbitrarily small. Below this the marker simply snaps on as the
 * centre crosses the edge, which is the honest behaviour for something too
 * small to have an edge of its own.
 */
const MIN_NDC_RADIUS = 1e-4;

/**
 * How far past the frame edge one axis has carried the silhouette.
 *
 * The band runs from `1 - r`, where the disc is just touching the edge from the
 * inside, to `1 + r`, where the last of it has passed — two radii of travel, and
 * exactly the interval over which a viewer watches it disappear.
 */
function axisHidden(ndc: number, radius: number): number {
  const r = Math.max(radius, MIN_NDC_RADIUS);
  return clamp((Math.abs(ndc) - (1 - r)) / (2 * r), 0, 1);
}

/**
 * The marker for a marimo at `ndcX, ndcY` with a projected silhouette of
 * `ndcRadiusX` by `ndcRadiusY`, or `null` while it is still wholly in frame.
 *
 * The two axes are combined by taking the larger, not by measuring the visible
 * area: leaving through a corner should not read as less gone than leaving
 * through a side, and what the fade is tracking is "how far past an edge is it",
 * which is per-edge by nature.
 */
export function offscreenMarker(
  ndcX: number,
  ndcY: number,
  ndcRadiusX: number,
  ndcRadiusY: number,
  behindCamera = false
): OffscreenMarker | null {
  // A point behind the eye comes back through the perspective divide mirrored
  // about the origin, so the projected coordinates point the opposite way to the
  // truth. Undo that, and call it wholly gone — it is not merely off an edge,
  // it is behind you. The jar is a closed box in front of the camera, so this
  // should never fire; it costs one branch to not be a lie if it ever does.
  const x = behindCamera ? -ndcX : ndcX;
  const y = behindCamera ? -ndcY : ndcY;

  const hidden = behindCamera ? 1 : Math.max(axisHidden(x, ndcRadiusX), axisHidden(y, ndcRadiusY));
  if (hidden <= 0) return null;

  return {
    hidden,
    ndcX: clamp(x, -1, 1),
    ndcY: clamp(y, -1, 1),
    // Measured from up rather than from right, because the consumer is a CSS
    // rotation on an arrow drawn pointing up. Screen +y is down and NDC +y is
    // up, and the two flips cancel: this is already the angle to rotate by.
    angleDeg: (Math.atan2(x, y) * 180) / Math.PI
  };
}
