/**
 * Krita-style Pixel Brush Engine
 * Paints by stamping brush tip "dabs" along the stroke path.
 * @see https://docs.krita.org/en/reference_manual/brushes/brush_engines/pixel_brush_engine.html
 */

export type BrushShape = 'round' | 'rectangle' | 'ellipse' | 'star' | 'hexagon';

export type RotationMode = 'fixed' | 'origin' | 'drawing';
export type ColorSource = 'plain' | 'uniformRandom';

export interface BrushParams {
  size: number;
  shape: BrushShape;
  angle: number; // degrees
  ratio: number; // 0.1–1, ellipse flatness (1 = circle)
  color: string;
  opacity: number; // 0–1
  flow: number; // 0–1, per-dab opacity (build-up)
  softness: number; // 0–1, radial gradient falloff (0=hard, 1=soft)
  sharpness: number; // 0–1, threshold (1=hard pixel edge)
  sharpnessSoften: number; // 0–1, edge softness for sharpness transition
  scatterX: number; // 0–1, random offset along stroke direction
  scatterY: number; // 0–1, random offset perpendicular to stroke
  mirrorH: boolean;
  mirrorV: boolean;
  rotationMode: RotationMode;
  rotationAngle: number; // degrees, fixed rotation when rotationMode='fixed'
  spacing: number; // fraction of size (0.25 = dabs every 25% of diameter)
  isotropicSpacing: boolean; // true = diameter only; false = use ratio for ellipse
  source: ColorSource;
}

const DEFAULT_PARAMS: Partial<BrushParams> = {
  opacity: 1,
  flow: 1,
  softness: 0,
  sharpness: 0,
  sharpnessSoften: 0.2,
  scatterX: 0,
  scatterY: 0,
  mirrorH: false,
  mirrorV: false,
  rotationMode: 'fixed',
  rotationAngle: 0,
  spacing: 0.25,
  isotropicSpacing: true,
  source: 'plain'
};

export function withDefaults(
  params: Partial<BrushParams> & Pick<BrushParams, 'size' | 'shape' | 'angle' | 'ratio' | 'color'>
): BrushParams {
  return { ...DEFAULT_PARAMS, ...params } as BrushParams;
}

export interface Dab {
  x: number;
  y: number;
  angle: number; // radians, stroke direction
  /** Optional: add this to dabAngle when drawing with symmetry (radians) */
  symmetryAngleRad?: number;
  /** Optional: angle from origin to dab (radians), used when rotationMode='origin' */
  originAngleRad?: number;
}

/** Full params overload */
export function interpolateDabs(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  params: Pick<BrushParams, 'size' | 'ratio' | 'spacing' | 'isotropicSpacing'>
): Dab[];
/** Legacy overload: spacingFraction + brushSize */
export function interpolateDabs(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  spacingFraction: number,
  brushSize: number
): Dab[];
export function interpolateDabs(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  paramsOrSpacing: Pick<BrushParams, 'size' | 'ratio' | 'spacing' | 'isotropicSpacing'> | number,
  brushSize?: number
): Dab[] {
  const params: Pick<BrushParams, 'size' | 'ratio' | 'spacing' | 'isotropicSpacing'> =
    typeof paramsOrSpacing === 'number'
      ? {
          size: brushSize!,
          ratio: 1,
          spacing: paramsOrSpacing,
          isotropicSpacing: true
        }
      : paramsOrSpacing;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return [{ x: x1, y: y1, angle: 0 }];

  const baseStep = params.size * Math.max(0.05, params.spacing);
  let step = params.isotropicSpacing ? baseStep : baseStep * Math.min(1, params.ratio);
  if (dist <= step) return [{ x: x2, y: y2, angle: Math.atan2(dy, dx) }];

  const angle = Math.atan2(dy, dx);
  const maxDabs = 25; // cap to avoid lag with very low spacing
  let n = Math.floor(dist / step);
  if (n > maxDabs) {
    step = dist / maxDabs;
    n = maxDabs;
  }

  const dabs: Dab[] = [];
  dabs.push({ x: x1, y: y1, angle });
  for (let i = 1; i <= n; i++) {
    const t = (i * step) / dist;
    dabs.push({
      x: x1 + dx * t,
      y: y1 + dy * t,
      angle
    });
  }
  dabs.push({ x: x2, y: y2, angle });
  return dabs;
}

/**
 * Legacy interpolateDabs (spacing fraction + brush size).
 * Prefer interpolateDabs(x1,y1,x2,y2, params) for full control.
 */
export function interpolateDabsLegacy(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  spacingFraction: number,
  brushSize: number
): Dab[] {
  return interpolateDabs(x1, y1, x2, y2, {
    size: brushSize,
    ratio: 1,
    spacing: spacingFraction,
    isotropicSpacing: true
  });
}

/**
 * Apply scatter offset to a dab. Modifies dab in place.
 */
function applyScatter(
  dab: Dab,
  scatterX: number,
  scatterY: number,
  brushSize: number,
  rng: () => number
): void {
  if (scatterX <= 0 && scatterY <= 0) return;
  const sx = scatterX * brushSize * 0.5 * (rng() * 2 - 1);
  const sy = scatterY * brushSize * 0.5 * (rng() * 2 - 1);
  const cos = Math.cos(dab.angle);
  const sin = Math.sin(dab.angle);
  dab.x += sx * cos - sy * sin;
  dab.y += sx * sin + sy * cos;
}

/** Get dab color based on source mode. */
function getDabColor(params: BrushParams, rng: () => number): string {
  if (params.source === 'uniformRandom') {
    const h = Math.floor(rng() * 360);
    const s = 70 + rng() * 30;
    const l = 40 + rng() * 40;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  return params.color;
}

let _rng = seededRandom(12345);
function random01(): number {
  return _rng();
}
export function setBrushRng(fn: () => number) {
  _rng = fn;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

/** Offscreen canvas for brush stamp rendering (reused to avoid allocations) */
let _stampCanvas: HTMLCanvasElement | null = null;
let _stampCtx: CanvasRenderingContext2D | null = null;
let _brushCanvas: HTMLCanvasElement | null = null;
let _brushCtx: CanvasRenderingContext2D | null = null;

/** Cached stamp (alpha mask) for soft/sharp brushes - key excludes rotation (applied at draw time) */
interface StampCacheEntry {
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
}
let _stampCache: { key: string; entry: StampCacheEntry } | null = null;

/** Max distance from center to shape boundary - radial gradient must extend this far for softness. */
function getShapeMaxRadius(shape: BrushShape, rx: number, ry: number, r: number): number {
  switch (shape) {
    case 'rectangle':
      return Math.max(Math.hypot(rx, ry), 0.5); // corners at (±rx,±ry)
    case 'round':
    case 'star':
    case 'hexagon':
      return Math.max(r, 0.5);
    case 'ellipse':
      return Math.max(rx, ry, 0.5);
    default:
      return Math.max(rx, ry, r, 0.5);
  }
}

function stampCacheKey(params: BrushParams): string {
  const p = withDefaults(params);
  return [
    p.shape,
    p.size,
    p.ratio,
    p.angle,
    p.softness,
    p.sharpness,
    p.sharpnessSoften ?? 0.2,
    p.mirrorH ? 1 : 0,
    p.mirrorV ? 1 : 0
  ].join('|');
}

function getOrCreateStamp(
  fullParams: BrushParams,
  w: number,
  h: number,
  rx: number,
  ry: number,
  r: number,
  maxR: number
): StampCacheEntry {
  const key = stampCacheKey(fullParams);
  if (_stampCache?.key === key) {
    return _stampCache.entry;
  }
  const stampSize = Math.ceil(Math.max(w, h, 2 * maxR) + 8);
  const { canvas: stamp, ctx: sCtx } = getStampCanvas(stampSize, stampSize);
  const ox = stamp.width / 2;
  const oy = stamp.height / 2;
  sCtx.clearRect(0, 0, stamp.width, stamp.height);
  sCtx.save();
  sCtx.translate(ox, oy);
  if (fullParams.mirrorH) sCtx.scale(-1, 1);
  if (fullParams.mirrorV) sCtx.scale(1, -1);
  sCtx.rotate(0); // Cache at 0, apply dabAngle at draw time
  if (fullParams.softness > 0 || fullParams.sharpness > 0) {
    sCtx.save();
    drawShapePath(sCtx, fullParams.shape, rx, ry, r);
    sCtx.clip();
    const gradOuter = Math.max(0.001, maxR);
    const innerR = Math.min(
      gradOuter - 0.001,
      fullParams.softness < 1 ? maxR * (1 - fullParams.softness) : 0
    );
    const gradInner = Math.max(0.001, innerR);
    const gradient = sCtx.createRadialGradient(0, 0, gradInner, 0, 0, gradOuter);
    if (fullParams.sharpness > 0) {
      const thresh = Math.max(0, Math.min(1, fullParams.sharpness));
      const soft = Math.max(0, Math.min(1, fullParams.sharpnessSoften ?? 0.2));
      gradient.addColorStop(0, `rgba(255,255,255,1)`);
      let lastStop = 0;
      if (soft > 0 && thresh < 1) {
        gradient.addColorStop(thresh, `rgba(255,255,255,1)`);
        lastStop = Math.min(0.999, thresh + Math.max(0.001, soft));
        if (lastStop > thresh) gradient.addColorStop(lastStop, `rgba(255,255,255,0)`);
      } else if (thresh < 1) {
        gradient.addColorStop(thresh, `rgba(255,255,255,1)`);
        lastStop = Math.min(0.999, Math.max(thresh + 0.001, thresh + (soft || 0.001)));
        if (lastStop > thresh) gradient.addColorStop(lastStop, `rgba(255,255,255,0)`);
      }
      if (lastStop < 1) gradient.addColorStop(1, `rgba(255,255,255,0)`);
    } else {
      const mid = Math.max(0.001, Math.min(0.999, 1 - fullParams.softness));
      gradient.addColorStop(0, `rgba(255,255,255,1)`);
      gradient.addColorStop(mid, `rgba(255,255,255,1)`);
      gradient.addColorStop(1, `rgba(255,255,255,0)`);
    }
    sCtx.fillStyle = gradient;
    sCtx.fillRect(-maxR - 2, -maxR - 2, (maxR + 2) * 2, (maxR + 2) * 2);
    sCtx.restore();
  } else {
    sCtx.fillStyle = '#fff';
    drawShapePath(sCtx, fullParams.shape, rx, ry, r);
    sCtx.fill();
  }
  sCtx.restore();
  // Copy to dedicated canvas so cache survives future getStampCanvas overwrites
  const cached = document.createElement('canvas');
  cached.width = stamp.width;
  cached.height = stamp.height;
  cached.getContext('2d')!.drawImage(stamp, 0, 0);
  const entry: StampCacheEntry = { canvas: cached, ox, oy };
  _stampCache = { key, entry };
  return entry;
}

function getStampCanvas(
  w: number,
  h: number
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const sz = Math.ceil(Math.max(w, h) + 4);
  if (!_stampCanvas || _stampCanvas.width < sz || _stampCanvas.height < sz) {
    _stampCanvas = document.createElement('canvas');
    _stampCanvas.width = sz;
    _stampCanvas.height = sz;
    _stampCtx = _stampCanvas.getContext('2d')!;
  }
  return { canvas: _stampCanvas!, ctx: _stampCtx! };
}

function getBrushCanvas(
  w: number,
  h: number
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const sz = Math.ceil(Math.max(w, h) + 4);
  if (!_brushCanvas || _brushCanvas.width < sz || _brushCanvas.height < sz) {
    _brushCanvas = document.createElement('canvas');
    _brushCanvas.width = sz;
    _brushCanvas.height = sz;
    _brushCtx = _brushCanvas.getContext('2d')!;
  }
  return { canvas: _brushCanvas!, ctx: _brushCtx! };
}

/**
 * Draw a single dab to the canvas context.
 */
export function drawDab(ctx: CanvasRenderingContext2D, dab: Dab, params: BrushParams): void {
  const fullParams = withDefaults(params);
  const color = getDabColor(fullParams, random01);

  const alpha = Math.max(0, Math.min(1, fullParams.opacity * fullParams.flow));
  if (alpha <= 0) return;

  const r = fullParams.size / 2;
  const w = fullParams.size;
  const h = fullParams.size * Math.max(0.1, fullParams.ratio);

  const needsMask =
    fullParams.softness > 0 || (fullParams.sharpness > 0 && fullParams.sharpness < 1);

  let dabAngle = 0;
  if (fullParams.shape === 'ellipse' || fullParams.shape === 'rectangle') {
    dabAngle = (fullParams.angle * Math.PI) / 180;
  }
  if (fullParams.rotationMode === 'fixed') {
    dabAngle += (fullParams.rotationAngle * Math.PI) / 180;
  } else if (fullParams.rotationMode === 'origin' && dab.originAngleRad != null) {
    dabAngle += dab.originAngleRad;
  } else if (fullParams.rotationMode === 'drawing') {
    dabAngle += dab.angle;
  }
  // Don't add symmetryAngleRad when in origin mode - originAngleRad already encodes per-point rotation
  if (dab.symmetryAngleRad != null && fullParams.rotationMode !== 'origin')
    dabAngle += dab.symmetryAngleRad;

  const rx = w / 2;
  const ry = h / 2;
  const maxR = getShapeMaxRadius(fullParams.shape, rx, ry, r);

  if (!needsMask && alpha >= 0.999) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.translate(dab.x, dab.y);
    if (fullParams.mirrorH) ctx.scale(-1, 1);
    if (fullParams.mirrorV) ctx.scale(1, -1);
    ctx.rotate(dabAngle);
    drawShapePath(ctx, fullParams.shape, rx, ry, r);
    ctx.fill();
    ctx.restore();
    return;
  }

  const stampEntry = getOrCreateStamp(fullParams, w, h, rx, ry, r, maxR);
  const { canvas: stamp, ox, oy } = stampEntry;

  // Composite color + stamp on offscreen brush canvas (must match stamp size exactly to avoid solid border)
  const { canvas: brush, ctx: bCtx } = getBrushCanvas(stamp.width - 4, stamp.height - 4);
  bCtx.clearRect(0, 0, brush.width, brush.height);
  bCtx.fillStyle = color;
  bCtx.fillRect(0, 0, brush.width, brush.height);
  bCtx.globalCompositeOperation = 'destination-in';
  bCtx.drawImage(stamp, 0, 0);
  bCtx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(dab.x, dab.y);
  ctx.rotate(dabAngle);
  ctx.drawImage(brush, -ox, -oy);
  ctx.restore();
}

function drawShapePath(
  ctx: CanvasRenderingContext2D,
  shape: BrushShape,
  rx: number,
  ry: number,
  r: number
): void {
  switch (shape) {
    case 'round':
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      break;
    case 'rectangle':
      ctx.beginPath();
      ctx.rect(-rx, -ry, rx * 2, ry * 2);
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (Math.PI * i) / 5 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.4;
        const x = Math.cos(angle) * rad;
        const y = Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 'hexagon':
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
  }
}

/**
 * Apply scatter to dabs. Call after interpolateDabs if scatter is enabled.
 */
export function applyScatterToDabs(
  dabs: Dab[],
  params: BrushParams,
  rng: () => number = random01
): void {
  const p = withDefaults(params);
  if (p.scatterX <= 0 && p.scatterY <= 0) return;
  for (const dab of dabs) {
    applyScatter(dab, p.scatterX, p.scatterY, p.size, rng);
  }
}

/**
 * Draw brush preview outline (stroke, not fill) for UI.
 */
export function drawBrushPreview(
  ctx: CanvasRenderingContext2D,
  params: Partial<BrushParams> & Pick<BrushParams, 'size' | 'shape' | 'angle' | 'ratio' | 'color'>,
  strokeStyle: string = 'rgba(128,128,128,0.5)'
): void {
  const p = withDefaults(params);
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = 1.5;
  if (p.mirrorH) ctx.scale(-1, 1);
  if (p.mirrorV) ctx.scale(1, -1);
  const previewRot = (params as { previewRotationRad?: number }).previewRotationRad;
  let rot = p.shape === 'ellipse' || p.shape === 'rectangle' ? (p.angle * Math.PI) / 180 : 0;
  if (p.rotationMode === 'fixed') {
    rot += (p.rotationAngle * Math.PI) / 180;
  } else if (p.rotationMode === 'origin' && previewRot != null) {
    rot += previewRot;
  } else if (p.rotationMode === 'drawing') {
    // Never use rotationAngle; use preview angle or default (no stroke direction when hovering)
    rot += previewRot ?? Math.PI / 4;
  }
  ctx.rotate(rot);

  const r = p.size / 2;
  const w = p.size;
  const h = p.size * p.ratio;

  switch (p.shape) {
    case 'round':
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      // Orientation indicator when rotated (round is otherwise rotation-invariant)
      if (Math.abs(rot) > 0.001) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -Math.max(r * 0.8, 5));
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      break;
    case 'rectangle':
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const angle = (Math.PI * i) / 5 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.4;
        const x = Math.cos(angle) * rad;
        const y = Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    case 'hexagon':
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      break;
  }
  ctx.restore();
}
