import type { DrawBrushShape } from '../store/index';

/** Draw brush shape options for the tool panel. */
export const DRAW_BRUSH_SHAPES: { id: DrawBrushShape; label: string; title: string }[] = [
  { id: 'sphere', label: 'Sphere', title: 'Spherical brush (Euclidean distance)' },
  { id: 'cube', label: 'Cube', title: 'Cubic brush (Chebyshev distance)' },
  { id: 'pyramid', label: 'Pyramid', title: 'Pyramid brush (tapers from base to tip)' }
];
