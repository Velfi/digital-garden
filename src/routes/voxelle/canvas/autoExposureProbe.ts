/**
 * Screen-probe auto exposure: sample downscaled 2D copy of the viewport and nudge
 * an **automatic** exposure multiplier toward a target linear luminance.
 * The user’s EV bias (`2**biasEv`) multiplies that automatic part for the final
 * `renderer.toneMappingExposure`.
 */

export const AUTO_EXPOSURE_TARGET_LUMINANCE = 0.18;
/** Per-frame lerp toward desired exposure from luminance error. */
export const AUTO_EXPOSURE_SMOOTH = 0.14;
/** Min linear luminance to avoid divide blow-ups. */
export const AUTO_EXPOSURE_MIN_MEASURED_LUM = 1e-4;
/** Skip `markCanvasDirty` when total exposure change is negligible. */
export const AUTO_EXPOSURE_DIRTY_EPS = 0.0008;

const PROBE_SIZE = 16;

export type AutoExposureProbeState = {
  /** Automatic component only; final mult = smoothedAutoMultiplier * 2**biasEv. */
  smoothedAutoMultiplier: number;
  probeCanvas: HTMLCanvasElement | null;
  probeCtx: CanvasRenderingContext2D | null;
};

export function createAutoExposureProbeState(initialAutoMultiplier: number): AutoExposureProbeState {
  return {
    smoothedAutoMultiplier: initialAutoMultiplier,
    probeCanvas: null,
    probeCtx: null
  };
}

function srgbByteToLinear(u8: number): number {
  const c = u8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function averageLinearLuminanceFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const n = width * height;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = srgbByteToLinear(data[i]!);
    const g = srgbByteToLinear(data[i + 1]!);
    const b = srgbByteToLinear(data[i + 2]!);
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return sum / n;
}

function ensureProbeContext(state: AutoExposureProbeState): CanvasRenderingContext2D | null {
  if (!state.probeCanvas) {
    const c = document.createElement('canvas');
    c.width = PROBE_SIZE;
    c.height = PROBE_SIZE;
    state.probeCanvas = c;
    state.probeCtx = c.getContext('2d', { willReadFrequently: true });
  }
  return state.probeCtx;
}

export type TickAutoExposureResult = {
  /** `smoothedAutoMultiplier * biasMult`, clamped to global mult bounds. */
  newTotalMultiplier: number;
  shouldMarkDirty: boolean;
};

/**
 * @param biasEv - User EV bias (same range as global EV); `biasMult = 2**biasEv`.
 */
export function tickAutoExposureProbe(
  state: AutoExposureProbeState,
  sourceCanvas: HTMLCanvasElement,
  opts: {
    biasEv: number;
    min: number;
    max: number;
    targetLuminance: number;
    smooth: number;
    minMeasuredLum: number;
    dirtyEps: number;
  }
): TickAutoExposureResult | null {
  const ctx = ensureProbeContext(state);
  if (!ctx) return null;

  const biasMult = Math.pow(2, opts.biasEv);

  try {
    const sw = Math.max(1, sourceCanvas.width);
    const sh = Math.max(1, sourceCanvas.height);
    ctx.drawImage(sourceCanvas, 0, 0, sw, sh, 0, 0, PROBE_SIZE, PROBE_SIZE);
    const img = ctx.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE);
    const measured = averageLinearLuminanceFromRgba(img.data, PROBE_SIZE, PROBE_SIZE);
    /** Divide out user bias so metering tracks `M_auto` only (~L ∝ M_auto × bias). */
    const biasSafe = Math.max(biasMult, 1e-9);
    const lumAuto = Math.max(measured / biasSafe, opts.minMeasuredLum);

    const total = state.smoothedAutoMultiplier * biasMult;
    const desiredAuto =
      state.smoothedAutoMultiplier * (opts.targetLuminance / lumAuto);
    const nextAuto =
      state.smoothedAutoMultiplier + (desiredAuto - state.smoothedAutoMultiplier) * opts.smooth;

    let totalNext = nextAuto * biasMult;
    totalNext = Math.min(opts.max, Math.max(opts.min, totalNext));
    state.smoothedAutoMultiplier = totalNext / biasMult;

    const delta = Math.abs(totalNext - total);
    const shouldMarkDirty = delta > opts.dirtyEps;

    return {
      newTotalMultiplier: totalNext,
      shouldMarkDirty
    };
  } catch {
    return null;
  }
}
