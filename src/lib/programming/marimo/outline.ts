/**
 * Flattening a shape field into a silhouette, for the 2D previews.
 *
 * The tank renders the real thing; this exists so the fragment chooser can show
 * what it is offering without standing up a WebGL context per option. It reads
 * the same coefficients the shader does, so the outline is the actual shape and
 * not an impression of one.
 */

import { deepestFacet, surfaceScale, type MarimoShape } from './facets';
import { extremeDirection } from './sphericalHarmonics';

export interface OutlinePoint {
  /** Position in units of mean radius. +y is down, matching SVG. */
  x: number;
  y: number;
  /** Outward radial direction. Strands grow along this. */
  nx: number;
  ny: number;
}

/** Any unit vector perpendicular to `d`. */
function perpendicular(d: readonly [number, number, number]): [number, number, number] {
  // Cross with whichever axis `d` is least aligned to, so the result is never
  // degenerate however `d` happens to be pointing.
  const [x, y, z] = d;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  const axis: [number, number, number] =
    ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];

  const px = y * axis[2] - z * axis[1];
  const py = z * axis[0] - x * axis[2];
  const pz = x * axis[1] - y * axis[0];
  const length = Math.hypot(px, py, pz) || 1;
  return [px / length, py / length, pz / length];
}

/**
 * A closed silhouette through the plane that shows the shape off best.
 *
 * The slice is taken through the largest feature and oriented with it at the
 * bottom, which is both the most informative angle and, for a marimo, the
 * truthful one — a flat spot is a flat spot because that side was down. A flat
 * face wins that contest outright when there is one: it is the most it has to
 * say about itself, and a slice that missed it would draw a ball that looks
 * round and is not.
 */
export function shapeOutline(shape: MarimoShape, samples = 96): OutlinePoint[] {
  const facet = deepestFacet(shape);
  const down = facet ? facet.d : extremeDirection(shape.coeffs);
  const side = perpendicular(down);

  const points: OutlinePoint[] = [];
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // theta = pi/2 puts the dominant feature at the bottom of the picture.
    const scale = surfaceScale(
      shape,
      side[0] * cos + down[0] * sin,
      side[1] * cos + down[1] * sin,
      side[2] * cos + down[2] * sin
    );

    points.push({ x: cos * scale, y: sin * scale, nx: cos, ny: sin });
  }

  return points;
}

/** `shapeOutline` as an SVG path, scaled and centred. */
export function outlinePath(
  points: readonly OutlinePoint[],
  centreX: number,
  centreY: number,
  radius: number
): string {
  if (points.length === 0) return '';
  const coords = points.map(
    (p) => `${(centreX + p.x * radius).toFixed(2)},${(centreY + p.y * radius).toFixed(2)}`
  );
  return `M${coords.join('L')}Z`;
}
