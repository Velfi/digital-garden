import * as THREE from 'three';

/**
 * Real high dynamic range output, for the displays that have it.
 *
 * The tank has always been rendered in radiance and then squashed into an
 * 8-bit buffer at the end, which means everything brighter than white has been
 * thrown away at the last possible moment. There is a lot of it: the lamp's
 * core in `ROOM_GLSL` is authored at seven times the ceiling bounce, on purpose,
 * because seen from underwater the whole room compresses into a 97-degree cone
 * and without a hot centre that cone is a grey disc. On an SDR display that
 * seven collapses to one and the hot centre is a flat white blob. On an HDR
 * display it does not have to.
 *
 * So this module changes nothing about how the scene is lit or shaded. It only
 * stops the last step from clipping:
 *
 *   1. Ask the canvas for extended-range compositing.
 *   2. Reformat the drawing buffer as RGBA16F, which can hold values above one.
 *   3. Tell the browser what those values mean — linear if it will take it, and
 *      sRGB-encoded (which extends perfectly well past 1.0) if it will not.
 *
 * Every step is checked, and any one of them failing leaves the scene exactly
 * as it was. That matters more than usual here: an HDR path that half-applies
 * would not fail loudly, it would just quietly change everyone's colours.
 */

/** Whether to use HDR where it is available, or never. */
export type HdrPreference = 'auto' | 'off';

/**
 * Where the shoulder starts, in scene-linear units. 1.0 is SDR white, so
 * everything the old 8-bit path could represent passes through untouched and
 * the extra range is spent purely on what used to clip.
 */
export const HDR_KNEE = 1;

/**
 * How far above SDR white the brightest pixel is allowed to go.
 *
 * Two stops. The temptation with headroom is to spend all of it — the lamp core
 * would happily sit at nine — but this is a moss ball in a jar on a desk, and a
 * specular pip that makes you squint is the wrong result even when it is the
 * physically honest one. Two stops is enough that the lamp reads as a source
 * rather than a shape, and little enough that the jar stays comfortable to
 * watch for as long as anyone actually watches it.
 *
 * This is a scene-referred ceiling, not a display one. Where the display has
 * less headroom than this the compositor's extended tone mapping brings it
 * down, which is its job and it is better placed to do it than we are.
 */
export const HDR_PEAK = 4;

/**
 * The shoulder, shared by the shader and the tests.
 *
 * Rolls off on the largest channel and rescales the other two to match, rather
 * than clamping per channel. Clamping per channel is what turns a warm lamp
 * white as it brightens — red hits the ceiling first and green and blue climb
 * up to meet it — and the lamp going colourless at its centre is exactly the
 * artefact HDR is supposed to be fixing.
 *
 * Hyperbolic above the knee, so it approaches the peak without ever reaching
 * it and stays monotone all the way up. Nothing here is allowed to be brighter
 * than the peak, however bright it was to begin with.
 */
export function hdrShoulder(
  colour: readonly [number, number, number],
  knee = HDR_KNEE,
  peak = HDR_PEAK
): [number, number, number] {
  const m = Math.max(colour[0], colour[1], colour[2]);
  if (m <= knee) return [colour[0], colour[1], colour[2]];

  const range = peak - knee;
  const over = m - knee;
  const mapped = knee + (range * over) / (over + range);
  const scale = mapped / m;
  return [colour[0] * scale, colour[1] * scale, colour[2] * scale];
}

/**
 * The GLSL half of the above, plus the single uniform that switches it on.
 *
 * `uHdrPeak` at 1.0 means SDR, and then this is a multiply and a return — the
 * same expression every one of these shaders used to end with, so the SDR image
 * is not merely close to what it was, it is the same arithmetic.
 */
export const HDR_GLSL = /* glsl */ `
uniform float uHdrPeak;   // 1.0 on an ordinary display; ${HDR_PEAK.toFixed(1)} with headroom

const float HDR_KNEE = ${HDR_KNEE.toFixed(4)};

/** Exposure, then the shoulder. Every material ends on this. */
vec3 tankOutput(vec3 radiance) {
  vec3 lit = radiance * uExposure;
  if (uHdrPeak <= 1.0) return lit;

  float m = max(max(lit.r, lit.g), lit.b);
  if (m <= HDR_KNEE) return lit;

  float range = uHdrPeak - HDR_KNEE;
  float over = m - HDR_KNEE;
  float mapped = HDR_KNEE + range * over / (over + range);
  return lit * (mapped / m);
}
`;

// --- what the browser and the display can actually do ----------------------

/** `configureHighDynamicRange` is the canvas-level form; the context-level one is older. */
interface HdrCanvas extends HTMLCanvasElement {
  configureHighDynamicRange?(options: { mode: 'standard' | 'extended' }): void;
}

interface HdrContext extends WebGL2RenderingContext {
  drawingBufferStorage?(sizedFormat: GLenum, width: number, height: number): void;
  drawingBufferToneMapping?(toneMapping: { mode: 'standard' | 'extended' }): void;
}

/**
 * Whether this browser has the APIs at all.
 *
 * Cheap and synchronous — no GL context — because the options modal needs to
 * decide whether to offer the control before any tank exists. It is a weaker
 * claim than "HDR will work": that is only known once the drawing buffer has
 * actually been reformatted, which is `enableHdr`'s answer.
 */
export function browserSupportsHdr(): boolean {
  if (typeof HTMLCanvasElement === 'undefined') return false;
  if ('configureHighDynamicRange' in HTMLCanvasElement.prototype) return true;
  return (
    typeof WebGL2RenderingContext !== 'undefined' &&
    'drawingBufferToneMapping' in WebGL2RenderingContext.prototype
  );
}

/** The media query, so the caller can also subscribe to it changing. */
export const HDR_DISPLAY_QUERY = '(dynamic-range: high)';

/** Whether the display in front of the visitor has any headroom to spend. */
export function displayIsHdr(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(HDR_DISPLAY_QUERY).matches;
}

/**
 * Whether to build the scene for HDR.
 *
 * Two-valued rather than three, unlike motion: there is no case for forcing HDR
 * on where the display cannot show it. The choice being offered is really "let
 * it get bright" versus "don't", and the second is worth offering — some people
 * find HDR content on a desktop uncomfortable next to SDR windows, and a jar
 * you are meant to leave open in a tab is exactly where that would grate.
 */
export function resolveHdr(
  preference: HdrPreference,
  capability: { browserSupports: boolean; displayIsHigh: boolean }
): boolean {
  if (preference === 'off') return false;
  return capability.browserSupports && capability.displayIsHigh;
}

// --- switching the drawing buffer over -------------------------------------

export interface HdrSurface {
  /** What the values in the drawing buffer are taken to mean. */
  colorSpace: 'srgb-linear' | 'srgb';
  /** The ceiling the shader should roll off toward. */
  peak: number;
  /** Re-establish the buffer after a resize. It does not track the canvas. */
  resize(width: number, height: number): void;
}

/** Drain the error queue so a later `getError` can only be about our own call. */
function clearGlErrors(gl: WebGL2RenderingContext) {
  let guard = 0;
  while (gl.getError() !== gl.NO_ERROR && guard++ < 16);
}

/**
 * Reformat a renderer's drawing buffer for extended range, or return null.
 *
 * Null is not a failure to report — it is the ordinary answer on most machines,
 * and it means the caller should carry on exactly as before.
 */
export function enableHdr(renderer: THREE.WebGLRenderer): HdrSurface | null {
  const canvas = renderer.domElement as HdrCanvas;
  const gl = renderer.getContext() as HdrContext;

  // WebGL 1 has no float drawing buffer to ask for, and without one there is
  // nowhere to put a value above 1.0 in the first place.
  if (typeof gl.drawingBufferStorage !== 'function') return null;

  // Extended compositing first: this is the switch that tells the browser
  // values above 1.0 are meant to be brighter than white rather than clipped.
  // Both spellings do the same thing; the canvas one is the one that stuck.
  if (typeof canvas.configureHighDynamicRange === 'function') {
    canvas.configureHighDynamicRange({ mode: 'extended' });
  } else if (typeof gl.drawingBufferToneMapping === 'function') {
    gl.drawingBufferToneMapping({ mode: 'extended' });
  } else {
    return null;
  }

  const width = Math.max(1, gl.drawingBufferWidth);
  const height = Math.max(1, gl.drawingBufferHeight);

  clearGlErrors(gl);
  gl.drawingBufferStorage(gl.RGBA16F, width, height);
  if (gl.getError() !== gl.NO_ERROR) {
    // Nothing to undo: without the float buffer the extended mode above has no
    // values out of range to composite, so the image is unchanged.
    return null;
  }

  // Linear is worth asking for. It is the space the shaders already work in, so
  // taking it means the last stage of the pipeline is a write with no transfer
  // function on either side of it — nothing to get subtly wrong past 1.0, where
  // the sRGB curve is an extrapolation and browsers need not agree on it.
  const colorSpace = tryColorSpace(gl, 'srgb-linear') ? 'srgb-linear' : 'srgb';

  // Setting this also writes `gl.drawingBufferColorSpace` from three's own
  // table, which does not know about linear buffers — so it goes first and we
  // assert what we actually want afterwards.
  renderer.outputColorSpace =
    colorSpace === 'srgb-linear' ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
  applyColorSpace(gl, colorSpace);

  // Belt and braces: the initial value is already unconstrained, but a page can
  // inherit a limit from an ancestor and this canvas should never take one.
  canvas.style.setProperty('dynamic-range-limit', 'no-limit');

  return {
    colorSpace,
    peak: HDR_PEAK,
    resize(w, h) {
      // `drawingBufferStorage` takes ownership of the buffer's size — setting
      // `canvas.width` no longer reallocates it — so every resize has to come
      // back through here or the tank ends up drawn at the size it started at.
      gl.drawingBufferStorage?.(gl.RGBA16F, Math.max(1, w), Math.max(1, h));
      applyColorSpace(gl, colorSpace);
    }
  };
}

/** Assign and read back: the property ignores values it does not know. */
function tryColorSpace(gl: HdrContext, value: string): boolean {
  const before = gl.drawingBufferColorSpace;
  applyColorSpace(gl, value);
  if (gl.drawingBufferColorSpace === value) return true;
  applyColorSpace(gl, before);
  return false;
}

function applyColorSpace(gl: HdrContext, value: string) {
  // Not in the DOM types: they list only the two predefined spaces, and the
  // linear one is exactly the case that is interesting here.
  (gl as unknown as { drawingBufferColorSpace: string }).drawingBufferColorSpace = value;
}
