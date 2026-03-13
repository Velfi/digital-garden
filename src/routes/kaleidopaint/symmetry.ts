export type SymmetryMode = 'none' | 'linear' | 'polar' | 'mosaic';

export type MosaicType =
  | 'square-4'
  | 'hex-6'
  | 'square-8'
  | 'triangular-3'
  | 'square-12'
  | 'rhombic-4'
  | 'offset-4'
  | 'diamond-4'
  | 'trihex-6'
  | 'cairo-5'
  | 'penrose';

export const MOSAIC_TYPES: { value: MosaicType; label: string }[] = [
  { value: 'square-4', label: 'Square 4-fold' },
  { value: 'hex-6', label: 'Hex 6-fold' },
  { value: 'square-8', label: 'Star 8-fold' },
  { value: 'triangular-3', label: 'Triangular 3-fold' },
  { value: 'square-12', label: 'Dodecagon 12-fold' },
  { value: 'rhombic-4', label: 'Rhombic 4-fold' },
  { value: 'offset-4', label: 'Brick 4-fold' },
  { value: 'diamond-4', label: 'Diamond 4-fold' },
  { value: 'trihex-6', label: 'Trihex 3+6-fold' },
  { value: 'cairo-5', label: 'Cairo 5-fold' },
  { value: 'penrose', label: 'Penrose 5-fold' }
];

export function getMosaicPreviewFolds(type: MosaicType): number {
  const match = type.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 6;
}

/**
 * Draws mosaic tile grid and symmetry lines for preview.
 */
export function drawMosaicPreview(
  ctx: CanvasRenderingContext2D,
  type: MosaicType,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rotationDeg: number
): void {
  const size = Math.min(w, h);
  const T = Math.max(size / 5, 40);
  const sqrt3 = Math.sqrt(3);
  const PHI = (1 + Math.sqrt(5)) / 2;
  const rotRad = (rotationDeg * Math.PI) / 180;

  // Size shapes so they meet: radius = half the nearest-neighbor distance
  const lineLen = T / 2;

  ctx.save();
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
  ctx.lineWidth = 1;

  const cells = getMosaicTileCenters(cx, cy, type, w, h);

  // Draw tile outlines (squares, hexagons, or radial guides) - size varies by fold
  for (const cell of cells) {
    let r = lineLen;
    if (cell.folds === 3)
      r = T / sqrt3; // Triangle circumradius for edge-to-edge
    else if (cell.folds === 6) r = (T * sqrt3) / 2; // Hex inradius
    const triRot =
      cell.folds === 3 && cell.flip
        ? rotRad + Math.PI / 2 // Down-pointing triangle
        : rotRad + (cell.folds === 3 ? -Math.PI / 2 : 0); // Up-pointing
    ctx.beginPath();
    if (cell.folds === 3) {
      for (let k = 0; k < 3; k++) {
        const a = (2 * Math.PI * k) / 3 + triRot;
        const x = cell.x + r * Math.cos(a);
        const y = cell.y + r * Math.sin(a);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (cell.folds === 4) {
      ctx.rect(cell.x - r, cell.y - r, r * 2, r * 2);
    } else if (cell.folds === 5 || cell.folds === 6 || cell.folds === 8 || cell.folds === 12) {
      const n = cell.folds;
      for (let k = 0; k < n; k++) {
        const a = (2 * Math.PI * k) / n + rotRad;
        const x = cell.x + r * Math.cos(a);
        const y = cell.y + r * Math.sin(a);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
    ctx.stroke();
  }

  // Draw radial symmetry lines at each tile center (slightly stronger)
  ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)';
  const radialLen = lineLen * 1.2;
  for (const cell of cells) {
    let r = radialLen;
    if (cell.folds === 3) r = T / sqrt3;
    else if (cell.folds === 6) r = (T * sqrt3) / 2;
    for (let k = 0; k < cell.folds; k++) {
      const a = (2 * Math.PI * k) / cell.folds + rotRad;
      ctx.beginPath();
      ctx.moveTo(cell.x, cell.y);
      ctx.lineTo(cell.x + r * 1.2 * Math.cos(a), cell.y + r * 1.2 * Math.sin(a));
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Returns all canvas coordinates where a stroke at (x, y) should be drawn
 * given the symmetry mode and fold count.
 * @param rotationDeg - rotation offset in degrees (for polar/linear)
 * @param canvasWidth - required for mosaic mode
 * @param canvasHeight - required for mosaic mode
 * @param mosaicTypeVal - required for mosaic mode
 */
export function getSymmetricPoints(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  mode: SymmetryMode,
  folds: number,
  rotationDeg = 0,
  canvasWidth?: number,
  canvasHeight?: number,
  mosaicTypeVal?: MosaicType
): [number, number][] {
  if (mode === 'none' || folds < 1) {
    return [[x, y]];
  }

  if (mode === 'linear') {
    return getLinearPoints(x, y, centerX, centerY, folds, rotationDeg);
  }

  if (mode === 'polar') {
    return getPolarPoints(x, y, centerX, centerY, folds, rotationDeg);
  }

  if (mode === 'mosaic' && canvasWidth != null && canvasHeight != null && mosaicTypeVal) {
    return getMosaicPoints(
      x,
      y,
      centerX,
      centerY,
      mosaicTypeVal,
      rotationDeg,
      canvasWidth,
      canvasHeight
    );
  }

  return [[x, y]];
}

/**
 * Returns the angle delta (radians) to add to the base brush angle for each symmetric copy.
 * Copy 0 (identity) always gets 0. For reflections: delta = 2*lineAngle - 2*baseAngle.
 * For polar rotations: delta = 2πk/n.
 */
export function getSymmetricAngleDeltas(
  centerX: number,
  centerY: number,
  mode: SymmetryMode,
  folds: number,
  rotationDeg: number,
  baseAngleRad: number,
  canvasWidth?: number,
  canvasHeight?: number,
  mosaicTypeVal?: MosaicType
): number[] {
  if (mode === 'none' || folds < 1) return [0];

  const rotRad = (rotationDeg * Math.PI) / 180;

  if (mode === 'polar') {
    const deltas: number[] = [];
    for (let k = 0; k < folds; k++) {
      deltas.push((2 * Math.PI * k) / folds);
    }
    return deltas;
  }

  if (mode === 'mosaic' && canvasWidth != null && canvasHeight != null && mosaicTypeVal) {
    const deltas: number[] = [];
    const cells = getMosaicTileCenters(centerX, centerY, mosaicTypeVal, canvasWidth, canvasHeight);
    for (const cell of cells) {
      for (let k = 0; k < cell.folds; k++) {
        deltas.push((2 * Math.PI * k) / cell.folds);
      }
    }
    return deltas;
  }

  if (mode === 'linear') {
    const deltas: number[] = [0];
    if (folds >= 2) deltas.push(2 * rotRad - 2 * baseAngleRad); // reflectH
    if (folds >= 4) {
      deltas.push(2 * (rotRad + Math.PI / 2) - 2 * baseAngleRad); // reflectV
      deltas.push(Math.PI); // reflectH(reflectV) = 180° rotation
      if (folds >= 8) {
        deltas.push(2 * (rotRad + Math.PI / 4) - 2 * baseAngleRad); // reflectD1
        deltas.push(2 * (rotRad + (3 * Math.PI) / 4) - 2 * baseAngleRad); // reflectD2
        deltas.push(Math.PI / 2); // reflectD1(reflectH) = 90° rotation
        deltas.push(-Math.PI / 2); // reflectD2(reflectH) = -90° rotation
      }
    }
    return deltas;
  }

  return [0];
}

/**
 * Returns the section index that contains the point (px, py).
 * Section indices match the wedge ordering used by clipToSymmetrySection.
 */
function getSectionIndexForPoint(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  mode: SymmetryMode,
  folds: number,
  rotationDeg: number,
  canvasWidth: number,
  canvasHeight: number,
  mosaicTypeVal?: MosaicType
): {
  sectionIndex: number;
  cellCenterX: number;
  cellCenterY: number;
  cellFolds: number;
  localFold?: number;
} | null {
  const rotRad = (rotationDeg * Math.PI) / 180;

  if (mode === 'none' || folds < 1) return null;

  if (mode === 'polar' || mode === 'linear') {
    const angle = Math.atan2(py - centerY, px - centerX);
    let u = (angle - rotRad + 2 * Math.PI * 2) % (2 * Math.PI);
    const n = folds;
    const wedgeAngle = (2 * Math.PI) / n;
    const sectionIndex = Math.floor(u / wedgeAngle) % n;
    return {
      sectionIndex,
      cellCenterX: centerX,
      cellCenterY: centerY,
      cellFolds: n
    };
  }

  if (mode === 'mosaic' && mosaicTypeVal) {
    const cells = getMosaicTileCenters(centerX, centerY, mosaicTypeVal, canvasWidth, canvasHeight);
    let nearest: { cell: MosaicCell; dist: number } | null = null;
    for (const cell of cells) {
      const dx = px - cell.x;
      const dy = py - cell.y;
      const dist = Math.hypot(dx, dy);
      if (!nearest || dist < nearest.dist) nearest = { cell, dist };
    }
    if (nearest) {
      const { cell } = nearest;
      const dx = px - cell.x;
      const dy = py - cell.y;
      const angle = Math.atan2(dy, dx);
      let u = (angle - rotRad + 2 * Math.PI * 2) % (2 * Math.PI);
      const wedgeAngle = (2 * Math.PI) / cell.folds;
      const localFold = Math.floor(u / wedgeAngle) % cell.folds;
      return {
        sectionIndex: localFold,
        cellCenterX: cell.x,
        cellCenterY: cell.y,
        cellFolds: cell.folds,
        localFold
      };
    }
    const cell = cells[0];
    return {
      sectionIndex: 0,
      cellCenterX: cell?.x ?? centerX,
      cellCenterY: cell?.y ?? centerY,
      cellFolds: cell?.folds ?? 6
    };
  }

  return null;
}

/**
 * Applies the symmetry section clip path to the given context.
 * Uses pointPosition to determine which section contains the drawn point (clipping to wrong section hides the image).
 */
export function clipToSymmetrySection(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  pointPx: number,
  pointPy: number,
  mode: SymmetryMode,
  folds: number,
  rotationDeg: number,
  canvasWidth: number,
  canvasHeight: number,
  mosaicTypeVal?: MosaicType
): void {
  const rotRad = (rotationDeg * Math.PI) / 180;
  const R = 2 * Math.max(canvasWidth, canvasHeight);

  ctx.beginPath();

  if (mode === 'none' || folds < 1) {
    ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.clip();
    return;
  }

  const section = getSectionIndexForPoint(
    pointPx,
    pointPy,
    centerX,
    centerY,
    mode,
    folds,
    rotationDeg,
    canvasWidth,
    canvasHeight,
    mosaicTypeVal
  );

  if (!section) {
    ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.clip();
    return;
  }

  if (mode === 'polar' || mode === 'linear') {
    const n = section.cellFolds;
    const wedgeAngle = (2 * Math.PI) / n;
    const a1 = section.sectionIndex * wedgeAngle + rotRad;
    const a2 = (section.sectionIndex + 1) * wedgeAngle + rotRad;
    ctx.moveTo(section.cellCenterX, section.cellCenterY);
    ctx.lineTo(section.cellCenterX + R * Math.cos(a1), section.cellCenterY + R * Math.sin(a1));
    ctx.lineTo(section.cellCenterX + R * Math.cos(a2), section.cellCenterY + R * Math.sin(a2));
    ctx.closePath();
    ctx.clip();
    return;
  }

  if (mode === 'mosaic') {
    const wedgeAngle = (2 * Math.PI) / section.cellFolds;
    const localFold = section.localFold ?? section.sectionIndex % section.cellFolds;
    const a1 = localFold * wedgeAngle + rotRad;
    const a2 = (localFold + 1) * wedgeAngle + rotRad;
    const cellR = Math.max(R, 200);
    ctx.moveTo(section.cellCenterX, section.cellCenterY);
    ctx.lineTo(
      section.cellCenterX + cellR * Math.cos(a1),
      section.cellCenterY + cellR * Math.sin(a1)
    );
    ctx.lineTo(
      section.cellCenterX + cellR * Math.cos(a2),
      section.cellCenterY + cellR * Math.sin(a2)
    );
    ctx.closePath();
    ctx.clip();
    return;
  }

  ctx.rect(0, 0, canvasWidth, canvasHeight);
  ctx.clip();
}

function rotatePoint(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rad: number
): [number, number] {
  const dx = px - cx;
  const dy = py - cy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

function getLinearPoints(
  x: number,
  y: number,
  cx: number,
  cy: number,
  folds: number,
  rotationDeg: number
): [number, number][] {
  const rotRad = (rotationDeg * Math.PI) / 180;
  const [ux, uy] = rotatePoint(x, y, cx, cy, -rotRad);

  function reflectH(px: number, py: number): [number, number] {
    return [px, 2 * cy - py];
  }
  function reflectV(px: number, py: number): [number, number] {
    return [2 * cx - px, py];
  }
  function reflectD1(px: number, py: number): [number, number] {
    return [cx + (py - cy), cy + (px - cx)];
  }
  function reflectD2(px: number, py: number): [number, number] {
    return [cx - (py - cy), cy - (px - cx)];
  }

  const base: [number, number][] = [[ux, uy]];
  if (folds >= 2) base.push(reflectH(ux, uy));
  if (folds >= 4) {
    base.push(reflectV(ux, uy));
    base.push(reflectH(reflectV(ux, uy)[0], reflectV(ux, uy)[1]));
  }
  if (folds >= 8) {
    base.push(reflectD1(ux, uy));
    base.push(reflectD2(ux, uy));
    const h = reflectH(ux, uy);
    base.push(reflectD1(h[0], h[1]));
    base.push(reflectD2(h[0], h[1]));
  }

  return base.map(([px, py]) => rotatePoint(px, py, cx, cy, rotRad));
}

function getPolarPoints(
  x: number,
  y: number,
  cx: number,
  cy: number,
  n: number,
  rotationDeg: number
): [number, number][] {
  const points: [number, number][] = [];
  const dx = x - cx;
  const dy = y - cy;
  const rotRad = (rotationDeg * Math.PI) / 180;

  // Transform to rotated frame, apply n-fold symmetry (k=0 stays identity), transform back
  const ux = dx * Math.cos(-rotRad) - dy * Math.sin(-rotRad);
  const uy = dx * Math.sin(-rotRad) + dy * Math.cos(-rotRad);

  for (let k = 0; k < n; k++) {
    const angle = (2 * Math.PI * k) / n;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const vx = ux * cos - uy * sin;
    const vy = ux * sin + uy * cos;
    const rx = vx * Math.cos(rotRad) - vy * Math.sin(rotRad);
    const ry = vx * Math.sin(rotRad) + vy * Math.cos(rotRad);
    points.push([cx + rx, cy + ry]);
  }

  return points;
}

type MosaicCell = { x: number; y: number; folds: number; flip?: boolean };

function getMosaicTileCenters(
  cx: number,
  cy: number,
  type: MosaicType,
  w: number,
  h: number
): MosaicCell[] {
  const size = Math.min(w, h);
  const T = Math.max(size / 5, 40);
  const margin = T * 1.5;
  const cells: MosaicCell[] = [];
  const sqrt3 = Math.sqrt(3);
  const PHI = (1 + Math.sqrt(5)) / 2;

  function inBounds(x: number, y: number): boolean {
    return x >= -margin && x < w + margin && y >= -margin && y < h + margin;
  }

  switch (type) {
    case 'square-4':
    case 'square-8':
    case 'square-12': {
      const folds = type === 'square-4' ? 4 : type === 'square-8' ? 8 : 12;
      const cols = Math.ceil((w + margin * 2) / T);
      const rows = Math.ceil((h + margin * 2) / T);
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const x = cx + i * T;
          const y = cy + j * T;
          if (inBounds(x, y)) cells.push({ x, y, folds });
        }
      }
      break;
    }
    case 'hex-6': {
      const hexW = T * sqrt3;
      const hexH = T * 1.5;
      const cols = Math.ceil((w + margin * 2) / (hexW * 0.5));
      const rows = Math.ceil((h + margin * 2) / hexH);
      for (let row = -rows; row <= rows; row++) {
        for (let col = -cols; col <= cols; col++) {
          const stagger = ((row % 2) + 2) % 2;
          const x = cx + col * hexW + stagger * (hexW * 0.5);
          const y = cy + row * hexH;
          if (inBounds(x, y)) cells.push({ x, y, folds: 6 });
        }
      }
      break;
    }
    case 'triangular-3': {
      // Equilateral triangle lattice: centers at (i+j/2, j*sqrt3/2)*T, nearest-neighbor = T
      const stepY = T * (sqrt3 / 2);
      const rows = Math.ceil((h + margin * 2) / stepY);
      const cols = Math.ceil((w + margin * 2) / T);
      for (let row = -rows; row <= rows; row++) {
        for (let col = -cols; col <= cols; col++) {
          const x = cx + T * (col + row / 2);
          const y = cy + T * row * (sqrt3 / 2);
          const flip = (((col + row) % 2) + 2) % 2 === 1;
          if (inBounds(x, y)) cells.push({ x, y, folds: 3, flip });
        }
      }
      break;
    }
    case 'rhombic-4': {
      // Rhombus/diamond grid - 60° rhombus
      const rx = T;
      const ry = T * sqrt3;
      const cols = Math.ceil((w + margin * 2) / (rx * 2));
      const rows = Math.ceil((h + margin * 2) / ry);
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const x = cx + i * rx * 2 + (j % 2) * rx;
          const y = cy + j * ry;
          if (inBounds(x, y)) cells.push({ x, y, folds: 4 });
        }
      }
      break;
    }
    case 'offset-4': {
      // Brick / offset square
      const cols = Math.ceil((w + margin * 2) / T);
      const rows = Math.ceil((h + margin * 2) / T);
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const stagger = ((j % 2) + 2) % 2;
          const x = cx + i * T + stagger * (T * 0.5);
          const y = cy + j * T;
          if (inBounds(x, y)) cells.push({ x, y, folds: 4 });
        }
      }
      break;
    }
    case 'diamond-4': {
      // Square grid rotated 45°
      const d = T * Math.SQRT2;
      const cols = Math.ceil((w + margin * 2) / d);
      const rows = Math.ceil((h + margin * 2) / d);
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const x = cx + (i - j) * (d / 2);
          const y = cy + (i + j) * (d / 2);
          if (inBounds(x, y)) cells.push({ x, y, folds: 4 });
        }
      }
      break;
    }
    case 'trihex-6': {
      // Trihexagonal (kagome): hex centers (6-fold) + triangle centers at hex vertices (3-fold)
      const hexW = T * sqrt3;
      const hexH = T * 1.5;
      const cols = Math.ceil((w + margin * 2) / (hexW * 0.5));
      const rows = Math.ceil((h + margin * 2) / hexH);
      for (let row = -rows; row <= rows; row++) {
        for (let col = -cols; col <= cols; col++) {
          const stagger = ((row % 2) + 2) % 2;
          const hx = cx + col * hexW + stagger * (hexW * 0.5);
          const hy = cy + row * hexH;
          if (inBounds(hx, hy)) cells.push({ x: hx, y: hy, folds: 6 });
          // Triangle centers = hex vertices (2 per hex to avoid duplicate)
          const v1x = hx + hexW / 2;
          const v1y = hy;
          const v2x = hx + hexW / 4;
          const v2y = hy - hexH / 2;
          if (inBounds(v1x, v1y)) cells.push({ x: v1x, y: v1y, folds: 3 });
          if (inBounds(v2x, v2y)) cells.push({ x: v2x, y: v2y, folds: 3 });
        }
      }
      break;
    }
    case 'cairo-5': {
      // Cairo pentagon - use tetravalent vertices (square-like) with 5-fold for pentagon flavor
      const step = T * 1.5;
      const cols = Math.ceil((w + margin * 2) / step);
      const rows = Math.ceil((h + margin * 2) / step);
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const stagger = (((i + j) % 2) + 2) % 2;
          const x = cx + i * step + stagger * (step * 0.25);
          const y = cy + j * step;
          if (inBounds(x, y)) cells.push({ x, y, folds: 5 });
        }
      }
      break;
    }
    case 'penrose': {
      // Periodic 5-fold approximation using golden-ratio grid
      const scale = T * PHI;
      const cols = Math.ceil((w + margin * 2) / scale);
      const rows = Math.ceil((h + margin * 2) / scale);
      for (let j = -rows; j <= rows; j++) {
        for (let i = -cols; i <= cols; i++) {
          const x = cx + i * scale + (j % 2) * (scale / PHI) * 0.5;
          const y = cy + j * scale * 0.5;
          if (inBounds(x, y)) cells.push({ x, y, folds: 5 });
        }
      }
      break;
    }
    default:
      cells.push({ x: cx, y: cy, folds: 6 });
  }
  return cells;
}

function getMosaicPoints(
  x: number,
  y: number,
  cx: number,
  cy: number,
  type: MosaicType,
  rotationDeg: number,
  w: number,
  h: number
): [number, number][] {
  const rotRad = (rotationDeg * Math.PI) / 180;
  const cells = getMosaicTileCenters(cx, cy, type, w, h);
  const points: [number, number][] = [];

  const dx = x - cx;
  const dy = y - cy;
  const ux = dx * Math.cos(-rotRad) - dy * Math.sin(-rotRad);
  const uy = dx * Math.sin(-rotRad) + dy * Math.cos(-rotRad);

  for (const cell of cells) {
    for (let k = 0; k < cell.folds; k++) {
      const angle = (2 * Math.PI * k) / cell.folds;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const vx = ux * cos - uy * sin;
      const vy = ux * sin + uy * cos;
      const rx = vx * Math.cos(rotRad) - vy * Math.sin(rotRad);
      const ry = vx * Math.sin(rotRad) + vy * Math.cos(rotRad);
      points.push([cell.x + rx, cell.y + ry]);
    }
  }
  return points;
}
