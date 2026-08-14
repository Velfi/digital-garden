import { zipSync, strToU8 } from 'fflate';
import type { BadgeDocument, Cell, MetalFinish, Vec2 } from './store/types';
import { computeTopology } from './topology/planar';
import {
  ENAMEL_CAPILLARY_LENGTH_MM,
  ENAMEL_CONTACT_ANGLE_RAD,
  cellMeniscusContext,
  meniscusDipAt,
  meniscusDipAtWall
} from './geometry/meniscusProfile';

// Output resolution for all three textures. Matches the 1024×1024 reference
// size used by Mahjuro's existing relic source art so the textures drop in
// alongside them without scaling.
const TEX_SIZE = 1024;

// Heightmap levels. 0 = outside silhouette (no extrusion), HEIGHT_ENAMEL is
// the enamel rim (contact line at the wall), and HEIGHT_METAL is the metal
// wall top. For soft enamel the surface dips below HEIGHT_ENAMEL toward
// HEIGHT_ENAMEL_FLOOR inside each cell per Young–Laplace; the floor is
// chosen so the 30-step range encodes the full κ·sqrt(2·(1−sin θ)) wall dip
// at a consistent mm-per-step ratio. Hard enamel stays at HEIGHT_ENAMEL
// everywhere — flat-capped epoxy dome, no meniscus.
const HEIGHT_ENAMEL = 140;
const HEIGHT_ENAMEL_FLOOR = 110;
const HEIGHT_METAL = 255;

export function finishHex(finish: MetalFinish): string {
  switch (finish) {
    case 'gold':
      return '#d4a44e';
    case 'silver':
      return '#f2f4f7';
    case 'black_nickel':
      return '#2a2b2d';
    case 'copper':
      return '#b87333';
    case 'iron':
      return '#52555a';
    case 'rose_gold':
      return '#d9a295';
    case 'bronze':
      return '#8c6a3f';
    case 'brass':
      return '#c9a34a';
  }
}

// Fit the badge's mm-space viewBox into a square texture while preserving
// aspect ratio. Returns the transform params to map badge-space (x,y) in mm
// onto pixel-space (px,py). The shorter axis is padded with background (the
// caller already cleared to the right color), so badges that aren't square
// get centered letterboxing.
function fitTransform(docWidth: number, docHeight: number) {
  const scale = TEX_SIZE / Math.max(docWidth, docHeight);
  const w = docWidth * scale;
  const h = docHeight * scale;
  const ox = (TEX_SIZE - w) / 2;
  const oy = (TEX_SIZE - h) / 2;
  return { scale, ox, oy };
}

type Tx = ReturnType<typeof fitTransform>;

function tracePolygon(ctx: CanvasRenderingContext2D, poly: Vec2[], tx: Tx) {
  if (poly.length < 3) return;
  ctx.moveTo(tx.ox + poly[0].x * tx.scale, tx.oy + poly[0].y * tx.scale);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(tx.ox + poly[i].x * tx.scale, tx.oy + poly[i].y * tx.scale);
  }
  ctx.closePath();
}

// Build a Path2D covering the badge silhouette (outline union minus cutouts).
// evenodd fill rule handles the subtraction: the outer rings fill the area,
// the inner cutout rings punch holes.
function silhouettePath(
  ctx: CanvasRenderingContext2D,
  outlines: Vec2[][],
  cutouts: Vec2[][],
  tx: Tx
) {
  ctx.beginPath();
  for (const o of outlines) tracePolygon(ctx, o, tx);
  for (const c of cutouts) tracePolygon(ctx, c, tx);
}

function createCanvas(): HTMLCanvasElement {
  const c = window.document.createElement('canvas');
  c.width = TEX_SIZE;
  c.height = TEX_SIZE;
  return c;
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas.toBlob returned null'));
        return;
      }
      blob
        .arrayBuffer()
        .then((ab) => resolve(new Uint8Array(ab)))
        .catch(reject);
    }, 'image/png');
  });
}

function drawObjectTexture(doc: BadgeDocument, cells: Cell[]): HTMLCanvasElement {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d')!;
  const tx = fitTransform(doc.canvas.width, doc.canvas.height);
  const topo = computeTopology(doc);
  const metal = finishHex(doc.render.finish);

  // 1. Fill the entire silhouette with the metal color. Cells will overpaint
  //    this, leaving metal visible only where the walls are.
  ctx.save();
  silhouettePath(ctx, topo.outlineUnion, topo.cutouts, tx);
  ctx.fillStyle = metal;
  ctx.fill('evenodd');
  ctx.restore();

  // 2. Paint each enamel cell with its assigned color. Holes (nested
  //    outlines) are added to the path with evenodd so the inner region
  //    stays unpainted and its own cell can claim it.
  for (const c of cells) {
    const fill = doc.colorAssignments[c.id] ?? '#e8e2d0';
    ctx.beginPath();
    tracePolygon(ctx, c.polygon, tx);
    for (const h of c.holes) tracePolygon(ctx, h, tx);
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
  }

  return canvas;
}

function drawMaskTexture(doc: BadgeDocument): HTMLCanvasElement {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d')!;
  const tx = fitTransform(doc.canvas.width, doc.canvas.height);
  const topo = computeTopology(doc);

  // Black background, white silhouette (outline minus cutouts). Mahjuro's
  // mesh extrusion treats bright pixels as "keep" and dark as "discard".
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  silhouettePath(ctx, topo.outlineUnion, topo.cutouts, tx);
  ctx.fillStyle = '#fff';
  ctx.fill('evenodd');

  return canvas;
}

function drawHeightTexture(doc: BadgeDocument, cells: Cell[]): HTMLCanvasElement {
  const canvas = createCanvas();
  const ctx = canvas.getContext('2d')!;
  const tx = fitTransform(doc.canvas.width, doc.canvas.height);
  const topo = computeTopology(doc);

  // Black outside the silhouette (no relief). Inside the silhouette the
  // default is metal height — cells then lower themselves to the enamel level.
  // This matches the physical pin: the whole base is metal; enamel sits in
  // recessed pockets bounded by walls.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  silhouettePath(ctx, topo.outlineUnion, topo.cutouts, tx);
  const metalRgb = `rgb(${HEIGHT_METAL},${HEIGHT_METAL},${HEIGHT_METAL})`;
  ctx.fillStyle = metalRgb;
  ctx.fill('evenodd');

  const isSoft = doc.render.enamelFinish === 'soft';
  // Scale factor maps physical dip (mm) to grayscale levels. The full
  // wall dip dip₀ = κ·sqrt(2·(1−sin θ)) maps to (HEIGHT_ENAMEL −
  // HEIGHT_ENAMEL_FLOOR). Narrower cells dip less and stay closer to
  // HEIGHT_ENAMEL; broad fields approach HEIGHT_ENAMEL_FLOOR at the centre.
  const dip0 = meniscusDipAtWall();
  const grayPerMm = dip0 > 0 ? (HEIGHT_ENAMEL - HEIGHT_ENAMEL_FLOOR) / dip0 : 0;

  if (!isSoft) {
    // Hard enamel: uniform fill, matches the flat-capped 3D geometry.
    const enamelRgb = `rgb(${HEIGHT_ENAMEL},${HEIGHT_ENAMEL},${HEIGHT_ENAMEL})`;
    for (const c of cells) {
      ctx.beginPath();
      tracePolygon(ctx, c.polygon, tx);
      for (const h of c.holes) tracePolygon(ctx, h, tx);
      ctx.fillStyle = enamelRgb;
      ctx.fill('evenodd');
    }
    return canvas;
  }

  // Soft enamel: rasterise the meniscus profile per-pixel inside each cell's
  // bbox. Writing via ImageData is orders of magnitude faster than calling
  // fillRect or fillStyle per pixel. Bbox-limited iteration plus a precomputed
  // edge buffer keeps the cost bounded even for dozens of cells.
  for (const c of cells) {
    const profileCtx = cellMeniscusContext(c.polygon, c.holes);
    const minPxX = Math.max(0, Math.floor(tx.ox + profileCtx.bbox.minX * tx.scale) - 1);
    const maxPxX = Math.min(TEX_SIZE, Math.ceil(tx.ox + profileCtx.bbox.maxX * tx.scale) + 1);
    const minPxY = Math.max(0, Math.floor(tx.oy + profileCtx.bbox.minY * tx.scale) - 1);
    const maxPxY = Math.min(TEX_SIZE, Math.ceil(tx.oy + profileCtx.bbox.maxY * tx.scale) + 1);
    const w = maxPxX - minPxX;
    const h = maxPxY - minPxY;
    if (w <= 0 || h <= 0) continue;
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let py = 0; py < h; py++) {
      const mmY = (py + minPxY - tx.oy) / tx.scale;
      const rowOff = py * w * 4;
      for (let px = 0; px < w; px++) {
        const mmX = (px + minPxX - tx.ox) / tx.scale;
        const dip = meniscusDipAt(mmX, mmY, profileCtx);
        if (dip <= 0) continue; // pixel outside this cell — leave untouched
        const g = Math.max(
          HEIGHT_ENAMEL_FLOOR,
          Math.round(HEIGHT_ENAMEL - dip * grayPerMm)
        );
        const off = rowOff + px * 4;
        data[off] = g;
        data[off + 1] = g;
        data[off + 2] = g;
        data[off + 3] = 255;
      }
    }
    // Compose onto the main canvas. createImageData starts fully transparent,
    // so only the in-cell pixels we wrote will replace the metal background.
    // Use source-over (default) with putImageData's region-copy? putImageData
    // overwrites pixels unconditionally, which would wipe the metal rim. Bake
    // into a temporary canvas and drawImage with source-over instead.
    const scratch = window.document.createElement('canvas');
    scratch.width = w;
    scratch.height = h;
    scratch.getContext('2d')!.putImageData(img, 0, 0);
    ctx.drawImage(scratch, minPxX, minPxY);
  }

  return canvas;
}

export async function downloadTextures(
  doc: BadgeDocument,
  cells: Cell[],
  slug = 'badge'
): Promise<void> {
  const [objectPng, maskPng, heightPng] = await Promise.all([
    canvasToPngBytes(drawObjectTexture(doc, cells)),
    canvasToPngBytes(drawMaskTexture(doc)),
    canvasToPngBytes(drawHeightTexture(doc, cells))
  ]);

  const zipped = zipSync({
    [`${slug}_object.png`]: objectPng,
    [`${slug}_mask.png`]: maskPng,
    [`${slug}_height.png`]: heightPng,
    'README.txt': strToU8(
      [
        'Badger texture export for Mahjuro-style relic/tile pipelines.',
        '',
        `${slug}_object.png  — RGBA color (metal + enamel), transparent outside the silhouette.`,
        `${slug}_mask.png    — grayscale silhouette: white = keep, black = cut away.`,
        `${slug}_height.png  — grayscale relief: black outside the silhouette,`,
        `                     ${HEIGHT_METAL} on metal walls,`,
        `                     ${HEIGHT_ENAMEL} at each enamel cell's rim (contact line).`,
        `                     Soft enamel: interior dips toward ${HEIGHT_ENAMEL_FLOOR} via Young–Laplace,`,
        `                     with capillary length κ = ${ENAMEL_CAPILLARY_LENGTH_MM} mm and`,
        `                     contact angle θ = ${(ENAMEL_CONTACT_ANGLE_RAD * 180 / Math.PI).toFixed(0)}°. Small cells dip less, large cells`,
        `                     flatten to the floor. Hard enamel: flat at ${HEIGHT_ENAMEL}.`,
        '',
        `All three textures are ${TEX_SIZE}×${TEX_SIZE}. Non-square badges are letterboxed.`
      ].join('\n')
    )
  });

  const blob = new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = `${slug}_textures.zip`;
  a.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
