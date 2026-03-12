<script lang="ts">
  import { tick } from 'svelte';
  import { onMount, onDestroy } from 'svelte';
  import {
    tool,
    symmetryEnabled,
    symmetryMode,
    symmetryFolds,
    symmetryOriginX,
    symmetryOriginY,
    symmetryRotation,
    color,
    secondaryColor,
    brushSize,
    brushShape,
    brushAngle,
    brushRatio,
    brushSpacing,
    brushOpacity,
    brushFlow,
    brushSoftness,
    brushSharpness,
    brushSharpnessSoften,
    brushScatterX,
    brushScatterY,
    brushMirrorH,
    brushMirrorV,
    brushRotationMode,
    brushRotationAngle,
    brushIsotropicSpacing,
    brushSource,
    brushMix,
    showSymmetryPreview,
    brushRotateWithSymmetry,
    history,
    mosaicType
  } from './store';
  import { getSymmetricPoints, getSymmetricAngleDeltas, drawMosaicPreview } from './symmetry';
  import {
    interpolateDabs,
    drawDab,
    drawBrushPreview,
    applyScatterToDabs,
    type BrushParams,
    type Dab
  } from './brushEngine';
  import paintBucketUrl from '$lib/assets/paint_bucket.png';

  export let width = 900;
  export let height = 900;

  let canvas: HTMLCanvasElement;
  let previewCanvas: HTMLCanvasElement;
  let viewport: HTMLDivElement;
  let ctx: CanvasRenderingContext2D;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let hoverX: number | null = null;
  let hoverY: number | null = null;
  let prevHoverX = 0;
  let prevHoverY = 0;
  let smoothedDrawingAngleRad = Math.PI / 4;
  const DRAWING_ANGLE_SMOOTH = 0.15; // lower = smoother, higher = more responsive

  // Zoom and pan
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartOffsetX = 0;
  let panStartOffsetY = 0;
  let spaceHeld = false;
  let isRotating = false;
  let lastRotateAngle = 0;

  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 10;
  const MAX_UNDO = 50;

  let undoStack: ImageData[] = [];
  let redoStack: ImageData[] = [];
  let paintBucketImg: HTMLImageElement | null = null;

  // RAF batching for stroke drawing
  let strokeQueue: { x: number; y: number }[] = [];
  let rafId: number | null = null;

  function cloneImageData(data: ImageData): ImageData {
    return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
  }

  function pushUndo() {
    if (!canvas || !ctx) return;
    redoStack = [];
    const snapshot = cloneImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    history.canUndo.set(undoStack.length > 0);
    history.canRedo.set(false);
  }

  function doUndo() {
    if (!canvas || !ctx || undoStack.length === 0) return;
    const current = cloneImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    redoStack.push(current);
    const snapshot = undoStack.pop()!;
    ctx.putImageData(snapshot, 0, 0);
    history.canUndo.set(undoStack.length > 0);
    history.canRedo.set(redoStack.length > 0);
  }

  function doRedo() {
    if (!canvas || !ctx || redoStack.length === 0) return;
    const current = cloneImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    undoStack.push(current);
    const snapshot = redoStack.pop()!;
    ctx.putImageData(snapshot, 0, 0);
    history.canUndo.set(undoStack.length > 0);
    history.canRedo.set(redoStack.length > 0);
  }

  function fitToView() {
    if (!viewport || !canvas) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const cw = canvas.width;
    const ch = canvas.height;
    if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return;
    const s = Math.min(vw / cw, vh / ch);
    scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s));
    panX = (vw - cw * scale) / 2;
    panY = (vh - ch * scale) / 2;
  }

  function zoomIn() {
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx = vw / 2;
    const vy = vh / 2;
    const newScale = Math.min(MAX_ZOOM, scale * 1.2);
    panX = vx - (vx - panX) * (newScale / scale);
    panY = vy - (vy - panY) * (newScale / scale);
    scale = newScale;
  }

  function zoomOut() {
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const vx = vw / 2;
    const vy = vh / 2;
    const newScale = Math.max(MIN_ZOOM, scale / 1.2);
    panX = vx - (vx - panX) * (newScale / scale);
    panY = vy - (vy - panY) * (newScale / scale);
    scale = newScale;
  }

  $: w = Math.max(1, Math.min(2000, width));
  $: h = Math.max(1, Math.min(2000, height));

  function getCanvasCoords(e: { clientX: number; clientY: number }): [number, number] {
    if (!viewport) return [0, 0];
    const rect = viewport.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    return [(vx - panX) / scale, (vy - panY) / scale];
  }

  function getCenter(): [number, number] {
    if (!canvas) return [0, 0];
    return [$symmetryOriginX * canvas.width, $symmetryOriginY * canvas.height];
  }

  function effectiveMode() {
    return $symmetryEnabled ? $symmetryMode : 'none';
  }

  function drawAtPoints(x: number, y: number, draw: (px: number, py: number) => void) {
    const [cx, cy] = getCenter();
    const points = getSymmetricPoints(
      x,
      y,
      cx,
      cy,
      effectiveMode(),
      $symmetryFolds,
      $symmetryRotation,
      canvas?.width,
      canvas?.height,
      $mosaicType
    );
    for (const [px, py] of points) {
      draw(px, py);
    }
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const vx = e.clientX - rect.left;
    const vy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.97 : 1.03;
    const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * factor));
    panX = vx - (vx - panX) * (newScale / scale);
    panY = vy - (vy - panY) * (newScale / scale);
    scale = newScale;
  }

  function startPan(e: { clientX: number; clientY: number }) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panStartOffsetX = panX;
    panStartOffsetY = panY;
  }

  function getBrushParams(): BrushParams {
    return {
      size: $brushSize,
      shape: $brushShape,
      angle: $brushAngle,
      ratio: Math.max(0.1, Math.min(1, $brushRatio)),
      color: $color,
      secondaryColor: $secondaryColor,
      opacity: $brushOpacity,
      flow: $brushFlow,
      softness: $brushSoftness,
      sharpness: $brushSharpness,
      sharpnessSoften: $brushSharpnessSoften,
      scatterX: $brushScatterX,
      scatterY: $brushScatterY,
      mirrorH: $brushMirrorH,
      mirrorV: $brushMirrorV,
      rotationMode: $brushRotationMode,
      rotationAngle: $brushRotationAngle,
      spacing: $brushSpacing,
      isotropicSpacing: $brushIsotropicSpacing,
      source: $brushSource,
      mix: $brushMix
    };
  }

  function handlePointerDown(e: PointerEvent) {
    if (!canvas || !ctx || !viewport) return;
    if (e.pointerType === 'touch') {
      if (!e.isPrimary) return;
      e.preventDefault();
    }
    if (e.button === 1 || spaceHeld) {
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    viewport.setPointerCapture(e.pointerId);
    const [x, y] = getCanvasCoords(e);
    const [cx, cy] = getCenter();
    if ($tool === 'origin') {
      symmetryOriginX.set(Math.max(0, Math.min(1, x / canvas.width)));
      symmetryOriginY.set(Math.max(0, Math.min(1, y / canvas.height)));
      return;
    }
    if ($tool === 'eyedropper') {
      const px = Math.floor(x);
      const py = Math.floor(y);
      if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
        const imgData = ctx.getImageData(px, py, 1, 1);
        const [r, g, b, a] = imgData.data;
        const hex = rgbToHex(r, g, b);
        color.set(hex);
      }
      return;
    }
    if ($tool === 'rotate') {
      isRotating = true;
      lastRotateAngle = Math.atan2(y - cy, x - cx);
      return;
    }
    if ($tool === 'paint') {
      pushUndo();
      isDrawing = true;
      lastX = x;
      lastY = y;
      prevHoverX = x;
      prevHoverY = y;
      const params = getBrushParams();
      const [cx, cy] = getCenter();
      const pts = getSymmetricPoints(
        x,
        y,
        cx,
        cy,
        effectiveMode(),
        $symmetryFolds,
        $symmetryRotation,
        canvas?.width,
        canvas?.height,
        $mosaicType
      );
      const shapeAngleRad =
        $brushShape === 'ellipse' || $brushShape === 'rectangle'
          ? ($brushAngle * Math.PI) / 180
          : 0;
      const baseAngleRad =
        $brushRotationMode === 'fixed'
          ? shapeAngleRad + ($brushRotationAngle * Math.PI) / 180
          : $brushRotationMode === 'drawing'
            ? shapeAngleRad + Math.PI / 4
            : 0;
      const angleDeltas = $brushRotateWithSymmetry
        ? getSymmetricAngleDeltas(
            cx,
            cy,
            effectiveMode(),
            $symmetryFolds,
            $symmetryRotation,
            baseAngleRad,
            canvas?.width,
            canvas?.height,
            $mosaicType
          )
        : pts.map(() => 0);
      for (let i = 0; i < pts.length; i++) {
        const [px, py] = pts[i];
        const dab: Dab = {
          x: px,
          y: py,
          angle: 0
        };
        if ($brushRotationMode === 'origin') {
          dab.originAngleRad = Math.atan2(py - cy, px - cx);
          delete dab.symmetryAngleRad;
        } else if ($brushRotateWithSymmetry) {
          dab.symmetryAngleRad = angleDeltas[i];
        }
        drawDab(ctx, dab, params);
      }
    } else if ($tool === 'fill') {
      pushUndo();
      floodFill(x, y);
    }
  }

  function drawPreview() {
    if (!previewCanvas) return;
    const pCtx = previewCanvas.getContext('2d');
    if (!pCtx) return;
    pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    const showOriginMarker = $tool === 'origin' || $tool === 'rotate';
    if (!$showSymmetryPreview && hoverX === null && !showOriginMarker) return;

    const [cx, cy] = getCenter();

    // Origin marker when using origin or rotate tool
    if (showOriginMarker) {
      pCtx.strokeStyle = 'rgba(255, 200, 0, 0.9)';
      pCtx.lineWidth = 2;
      pCtx.beginPath();
      pCtx.arc(cx, cy, 8, 0, 2 * Math.PI);
      pCtx.stroke();
    }
    const maxR = Math.max(canvas.width, canvas.height);

    // Draw symmetry guide lines (only when preview enabled)
    const rotRad = ($symmetryRotation * Math.PI) / 180;
    if (
      $showSymmetryPreview &&
      $symmetryEnabled &&
      $symmetryMode === 'linear' &&
      $symmetryFolds >= 2
    ) {
      pCtx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
      pCtx.lineWidth = 1;
      const drawLine = (angle: number) => {
        pCtx.beginPath();
        pCtx.moveTo(cx, cy);
        pCtx.lineTo(cx + maxR * 1.5 * Math.cos(angle), cy + maxR * 1.5 * Math.sin(angle));
        pCtx.stroke();
        pCtx.beginPath();
        pCtx.moveTo(cx, cy);
        pCtx.lineTo(cx - maxR * 1.5 * Math.cos(angle), cy - maxR * 1.5 * Math.sin(angle));
        pCtx.stroke();
      };
      if ($symmetryFolds >= 2) drawLine(rotRad);
      if ($symmetryFolds >= 4) drawLine(rotRad + Math.PI / 2);
      if ($symmetryFolds >= 8) {
        drawLine(rotRad + Math.PI / 4);
        drawLine(rotRad + (3 * Math.PI) / 4);
      }
    }
    if ($showSymmetryPreview && $symmetryEnabled && $symmetryMode === 'polar') {
      if ($symmetryFolds >= 2) {
        pCtx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
        pCtx.lineWidth = 1;
        for (let k = 0; k < $symmetryFolds; k++) {
          const angle = (2 * Math.PI * k) / $symmetryFolds + rotRad;
          pCtx.beginPath();
          pCtx.moveTo(cx, cy);
          pCtx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
          pCtx.stroke();
        }
      }
    }
    if ($showSymmetryPreview && $symmetryEnabled && $symmetryMode === 'mosaic' && canvas) {
      drawMosaicPreview(pCtx, $mosaicType, cx, cy, canvas.width, canvas.height, $symmetryRotation);
    }

    // Draw cursor preview when hovering
    if (hoverX !== null && hoverY !== null) {
      if ($tool === 'fill') {
        // Paint bucket - no symmetry preview
        // Paint bucket icon in fill mode
        if (paintBucketImg?.complete && paintBucketImg.naturalWidth > 0) {
          const size = 24;
          pCtx.drawImage(paintBucketImg, hoverX - size / 2, hoverY - size / 2, size, size);
        }
      } else if ($tool !== 'origin' && $tool !== 'rotate' && $tool !== 'eyedropper') {
        // Brush shape preview in paint mode
        const points = getSymmetricPoints(
          hoverX,
          hoverY,
          cx,
          cy,
          effectiveMode(),
          $symmetryFolds,
          $symmetryRotation,
          canvas?.width,
          canvas?.height,
          $mosaicType
        );
        const [r, g, b] = hexToRgb($color);
        const params = getBrushParams();
        const rawDrawingRad =
          $brushRotationMode === 'drawing' && hoverX !== null && hoverY !== null
            ? (() => {
                const dx = hoverX - prevHoverX;
                const dy = hoverY - prevHoverY;
                return Math.hypot(dx, dy) >= 2 ? Math.atan2(dy, dx) : null;
              })()
            : null;
        if (rawDrawingRad !== null) {
          let delta = rawDrawingRad - smoothedDrawingAngleRad;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          while (delta < -Math.PI) delta += 2 * Math.PI;
          smoothedDrawingAngleRad += DRAWING_ANGLE_SMOOTH * delta;
        }
        const baseDrawingRad = smoothedDrawingAngleRad;
        const shapeAngleRad =
          $brushShape === 'ellipse' || $brushShape === 'rectangle'
            ? ($brushAngle * Math.PI) / 180
            : 0;
        const baseAngleRad =
          $brushRotationMode === 'fixed'
            ? shapeAngleRad + ($brushRotationAngle * Math.PI) / 180
            : $brushRotationMode === 'drawing'
              ? shapeAngleRad + baseDrawingRad
              : 0;
        const angleDeltas = $brushRotateWithSymmetry
          ? getSymmetricAngleDeltas(
              cx,
              cy,
              effectiveMode(),
              $symmetryFolds,
              $symmetryRotation,
              baseAngleRad,
              canvas?.width,
              canvas?.height,
              $mosaicType
            )
          : points.map(() => 0);
        for (let i = 0; i < points.length; i++) {
          const [px, py] = points[i];
          pCtx.save();
          pCtx.translate(px, py);
          const pointAngle = Math.atan2(py - cy, px - cx);
          let previewRotationRad: number;
          if ($brushRotationMode === 'origin') {
            previewRotationRad = pointAngle;
          } else if ($brushRotationMode === 'drawing') {
            previewRotationRad = baseDrawingRad + angleDeltas[i];
          } else {
            previewRotationRad = baseAngleRad + angleDeltas[i];
          }
          if ($brushRotationMode === 'fixed' && $brushRotateWithSymmetry) {
            pCtx.rotate(angleDeltas[i]);
          }
          const previewParams: Parameters<typeof drawBrushPreview>[1] = {
            ...params,
            rotationMode: $brushRotationMode,
            ...($brushRotationMode === 'origin' || $brushRotationMode === 'drawing'
              ? { previewRotationRad }
              : {})
          };
          drawBrushPreview(pCtx, previewParams, `rgba(${r}, ${g}, ${b}, 0.35)`);
          pCtx.restore();
        }
      }
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!canvas) return;
    if (isPanning) {
      panX = panStartOffsetX + e.clientX - panStartX;
      panY = panStartOffsetY + e.clientY - panStartY;
      return;
    }
    const [x, y] = getCanvasCoords(e);
    if (hoverX !== null && hoverY !== null) {
      prevHoverX = hoverX;
      prevHoverY = hoverY;
    } else {
      prevHoverX = x;
      prevHoverY = y;
    }
    hoverX = x;
    hoverY = y;

    if (isRotating) {
      const [cx, cy] = getCenter();
      const angle = Math.atan2(y - cy, x - cx);
      const deltaDeg = ((angle - lastRotateAngle) * 180) / Math.PI;
      symmetryRotation.update((r) => (r + deltaDeg + 360) % 360);
      lastRotateAngle = angle;
    }
    drawPreview();

    if ($tool === 'paint' && isDrawing) {
      prevHoverX = x;
      prevHoverY = y;
    }

    if ($tool !== 'paint' || !isDrawing || !ctx) return;
    strokeQueue.push({ x, y });
    if (rafId === null) {
      rafId = requestAnimationFrame(flushStrokeQueue);
    }
  }

  const STROKE_BATCH_SIZE = 8; // segments per frame to avoid blocking UI

  function flushStrokeQueue() {
    rafId = null;
    if (!canvas || !ctx || strokeQueue.length === 0) return;
    const [cx, cy] = getCenter();
    const params = getBrushParams();
    const spacingParams = {
      size: $brushSize,
      ratio: Math.max(0.1, Math.min(1, $brushRatio)),
      spacing: $brushSpacing,
      isotropicSpacing: $brushIsotropicSpacing
    };
    let px = lastX;
    let py = lastY;
    const batch = strokeQueue.splice(0, STROKE_BATCH_SIZE);
    for (const pt of batch) {
      const dabs = interpolateDabs(px, py, pt.x, pt.y, spacingParams);
      applyScatterToDabs(dabs, params);
      for (const dab of dabs) {
        const pts = getSymmetricPoints(
          dab.x,
          dab.y,
          cx,
          cy,
          effectiveMode(),
          $symmetryFolds,
          $symmetryRotation,
          canvas?.width,
          canvas?.height,
          $mosaicType
        );
        const shapeAngleRad =
          $brushShape === 'ellipse' || $brushShape === 'rectangle'
            ? ($brushAngle * Math.PI) / 180
            : 0;
        const baseAngleRad =
          $brushRotationMode === 'fixed'
            ? shapeAngleRad + ($brushRotationAngle * Math.PI) / 180
            : $brushRotationMode === 'drawing'
              ? shapeAngleRad + dab.angle
              : 0;
        const angleDeltas = $brushRotateWithSymmetry
          ? getSymmetricAngleDeltas(
              cx,
              cy,
              effectiveMode(),
              $symmetryFolds,
              $symmetryRotation,
              baseAngleRad,
              canvas?.width,
              canvas?.height,
              $mosaicType
            )
          : pts.map(() => 0);
        for (let i = 0; i < pts.length; i++) {
          const [sx, sy] = pts[i];
          const symDab = { ...dab, x: sx, y: sy };
          if ($brushRotationMode === 'origin') {
            symDab.originAngleRad = Math.atan2(sy - cy, sx - cx);
            delete symDab.symmetryAngleRad;
          } else if ($brushRotateWithSymmetry) {
            symDab.symmetryAngleRad = angleDeltas[i];
          }
          drawDab(ctx, symDab, params);
        }
      }
      px = pt.x;
      py = pt.y;
    }
    lastX = px;
    lastY = py;
    if (strokeQueue.length > 0) {
      rafId = requestAnimationFrame(flushStrokeQueue);
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.button === 1 || isPanning) {
      isPanning = false;
    } else if (e.button === 0 || e.button === -1) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (strokeQueue.length > 0) flushStrokeQueue();
      isRotating = false;
      isDrawing = false;
      drawPreview();
    }
  }

  function handlePointerLeave() {
    isPanning = false;
    isRotating = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (strokeQueue.length > 0) flushStrokeQueue();
    isDrawing = false;
    hoverX = null;
    hoverY = null;
    smoothedDrawingAngleRad = Math.PI / 4;
    drawPreview();
  }

  function floodFill(startX: number, startY: number) {
    const [cx, cy] = getCenter();
    const points = getSymmetricPoints(
      startX,
      startY,
      cx,
      cy,
      effectiveMode(),
      $symmetryFolds,
      $symmetryRotation,
      canvas?.width,
      canvas?.height,
      $mosaicType
    );
    const fillColor = hexToRgb($color);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const w = canvas.width;
    const h = canvas.height;

    function getPixel(x: number, y: number): [number, number, number, number] | null {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || ix >= w || iy < 0 || iy >= h) return null;
      const i = (iy * w + ix) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    }

    function setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;
      const i = (iy * w + ix) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }

    function colorsMatch(a: [number, number, number, number], b: [number, number, number, number]) {
      return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    }

    function fillAt(seedX: number, seedY: number) {
      const ix = Math.floor(seedX);
      const iy = Math.floor(seedY);
      if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;

      const seedPixel = getPixel(ix, iy);
      if (!seedPixel) return;
      if (colorsMatch(seedPixel, fillColor)) return;

      // Scanline flood fill - O(width) stack instead of O(area), avoids overflow
      const stack: [number, number][] = [[ix, iy]];
      const visited = new Set<string>();
      const queued = new Set<string>([`${ix},${iy}`]);

      while (stack.length > 0) {
        const [px, py] = stack.pop()!;
        const key = `${px},${py}`;
        if (visited.has(key)) continue;

        const pix = getPixel(px, py);
        if (!pix || !colorsMatch(pix, seedPixel)) continue;

        // Find horizontal span
        let x1 = px;
        while (x1 > 0) {
          const p = getPixel(x1 - 1, py);
          if (!p || !colorsMatch(p, seedPixel)) break;
          x1--;
        }
        let x2 = px;
        while (x2 < w - 1) {
          const p = getPixel(x2 + 1, py);
          if (!p || !colorsMatch(p, seedPixel)) break;
          x2++;
        }

        for (let x = x1; x <= x2; x++) {
          setPixel(x, py, fillColor[0], fillColor[1], fillColor[2], 255);
          visited.add(`${x},${py}`);
        }

        // Add span starts from row above and below
        for (const ny of [py - 1, py + 1]) {
          if (ny < 0 || ny >= h) continue;
          let x = x1;
          while (x <= x2) {
            const p = getPixel(x, ny);
            if (p && colorsMatch(p, seedPixel)) {
              const k = `${x},${ny}`;
              if (!queued.has(k)) {
                queued.add(k);
                stack.push([x, ny]);
              }
              // Skip rest of contiguous run on this row (may extend past x2)
              while (x < w) {
                const p2 = getPixel(x, ny);
                if (!p2 || !colorsMatch(p2, seedPixel)) break;
                x++;
              }
            } else {
              x++;
            }
          }
        }
      }
    }

    for (const [px, py] of points) {
      fillAt(px, py);
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function hexToRgb(hex: string): [number, number, number, number] {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return [0, 0, 0, 255];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 255];
  }

  function rgbToHex(r: number, g: number, b: number): string {
    return (
      '#' +
      [r, g, b]
        .map((c) =>
          Math.max(0, Math.min(255, Math.round(c)))
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    );
  }

  $: if (canvas && ctx && (w !== canvas.width || h !== canvas.height)) {
    const cw = Math.max(100, Math.min(2000, w));
    const ch = Math.max(100, Math.min(2000, h));
    canvas.width = cw;
    canvas.height = ch;
    if (previewCanvas) {
      previewCanvas.width = cw;
      previewCanvas.height = ch;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    tick().then(fitToView);
  }

  $: if (viewport && canvas && canvas.width === w && canvas.height === h) {
    tick().then(fitToView);
  }

  $: ($symmetryMode,
    $symmetryFolds,
    $symmetryRotation,
    $symmetryOriginX,
    $symmetryOriginY,
    $symmetryEnabled,
    $showSymmetryPreview,
    $brushRotateWithSymmetry,
    $brushRotationMode,
    $tool,
    $brushShape,
    $brushSize,
    $brushAngle,
    $brushRatio,
    $mosaicType,
    tick().then(drawPreview));

  onMount(() => {
    history.undo = doUndo;
    history.redo = doRedo;
    const img = new Image();
    img.src = paintBucketUrl;
    img.onload = () => {
      paintBucketImg = img;
      drawPreview();
    };
  });

  onDestroy(() => {
    history.undo = () => {};
    history.redo = () => {};
    history.canUndo.set(false);
    history.canRedo.set(false);
  });

  function initCanvas(node: HTMLCanvasElement, dims: { w: number; h: number }) {
    ctx = node.getContext('2d')!;
    if (!ctx) return;
    const cw = Math.max(100, Math.min(2000, dims.w));
    const ch = Math.max(100, Math.min(2000, dims.h));
    node.width = cw;
    node.height = ch;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    return {
      update(newDims: { w: number; h: number }) {
        const nw = Math.max(100, Math.min(2000, newDims.w));
        const nh = Math.max(100, Math.min(2000, newDims.h));
        node.width = nw;
        node.height = nh;
        if (previewCanvas) {
          previewCanvas.width = nw;
          previewCanvas.height = nh;
        }
        ctx!.fillStyle = '#ffffff';
        ctx!.fillRect(0, 0, nw, nh);
      }
    };
  }
</script>

<svelte:window
  on:pointerup={handlePointerUp}
  on:pointerleave={handlePointerLeave}
  on:keydown={(e) => {
    const target = document.activeElement;
    const isInput =
      target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';
    if (e.code === 'Space' && !isInput) {
      e.preventDefault();
      spaceHeld = true;
    }
    if (!isInput && (e.ctrlKey || e.metaKey)) {
      if (e.key.toLowerCase() === 'z' && e.shiftKey) {
        e.preventDefault();
        history.redo();
      } else if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        history.undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      }
    }
  }}
  on:keyup={(e) => e.code === 'Space' && (spaceHeld = false) && (isPanning = false)}
/>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<div
  class="viewport"
  bind:this={viewport}
  role="application"
  aria-label="Kaleidopaint canvas"
  class:panning={isPanning}
  class:space-pan={spaceHeld && !isPanning}
  on:wheel={handleWheel}
  on:pointerdown={handlePointerDown}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
  on:pointerleave={handlePointerLeave}
  on:pointercancel={handlePointerUp}
  tabindex="0"
  style="touch-action: none;"
>
  <div
    class="zoom-controls"
    on:pointerdown|stopPropagation
    role="toolbar"
    aria-label="Zoom controls"
    tabindex="0"
  >
    <button type="button" on:click|stopPropagation={zoomOut} title="Zoom out" aria-label="Zoom out"
      >−</button
    >
    <span class="zoom-percent">{Math.round(scale * 100)}%</span>
    <button type="button" on:click|stopPropagation={zoomIn} title="Zoom in" aria-label="Zoom in"
      >+</button
    >
    <button
      type="button"
      on:click|stopPropagation={fitToView}
      title="Fit to view"
      aria-label="Fit canvas to view">Fit</button
    >
  </div>
  <div class="canvas-transform" style="transform: translate({panX}px, {panY}px) scale({scale});">
    <div class="canvas-wrapper">
      <canvas id="kaleido-canvas" bind:this={canvas} width={w} height={h} use:initCanvas={{ w, h }}
      ></canvas>
      <canvas
        class="preview-overlay"
        bind:this={previewCanvas}
        width={w}
        height={h}
        aria-hidden="true"
      ></canvas>
    </div>
  </div>
</div>

<style lang="scss">
  .viewport {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 400px;
    overflow: hidden;
    outline: none;
    cursor: crosshair;
    background: #2e2e2e;
    border: 1px solid #a0a0a0;

    &.space-pan {
      cursor: grab;
    }

    &.panning {
      cursor: grabbing;
    }
  }

  .zoom-controls {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 4px;
    pointer-events: auto;
    z-index: 1;

    button {
      width: 1.75rem;
      height: 1.75rem;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, 0.25);
      }
    }

    .zoom-percent {
      min-width: 3ch;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.9);
    }
  }

  .canvas-transform {
    transform-origin: 0 0;
    display: inline-block;
  }

  .canvas-wrapper {
    position: relative;
    display: inline-block;
  }

  #kaleido-canvas {
    display: block;
    cursor: crosshair;
    image-rendering: pixelated; /* Nearest-neighbor for pixel art */
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
  }

  .preview-overlay {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    image-rendering: pixelated;
    image-rendering: -moz-crisp-edges;
    image-rendering: crisp-edges;
  }
</style>
