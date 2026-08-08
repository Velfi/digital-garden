import * as THREE from 'three';
import { FRAGMENT_MAX_RADIUS_MM, FRAGMENT_MIN_RADIUS_MM, ICOSPHERE_DETAIL } from './constants';
import { deepestFacet, shapeFrom, type Facet, type MarimoShape } from './facets';
import {
  createShapeUniforms,
  writeShapeUniforms,
  type MarimoShapeUniforms
} from './marimoMaterial';
import { createPreviewBodyMaterial } from './previewMaterial';
import { extremeDirection } from './sphericalHarmonics';

/**
 * The turntable behind the fragment chooser.
 *
 * Three previews share **one** WebGL context. Each frame the rig draws a ball
 * into a corner of its own offscreen canvas and blits that rectangle onto the
 * visitor's 2D canvas with `drawImage`. Three contexts would also work, but
 * they would be three copies of every shader, three sets of buffers, and three
 * slots out of a browser-wide budget of about sixteen — spent, at that, on a
 * modal most visitors see exactly once.
 *
 * One context also means one of everything else: one mesh, one material. What
 * makes each preview its own marimo is the uniform block, rewritten immediately
 * before its draw. Nothing is rebuilt when the chooser opens and nothing is
 * rebuilt per frame.
 */

/** Everything a preview needs about the piece it is drawing. */
export interface PreviewSubject {
  seed: number;
  radiusMm: number;
  bias: number[];
  facets: Facet[];
}

export interface FragmentPreviewOptions {
  /** Turn it slowly, so the shape reads. Off under reduced motion. */
  spin?: boolean;
}

export interface FragmentPreviewHandle {
  /** Take a fresh subject without tearing anything down. */
  update(subject: PreviewSubject, options?: FragmentPreviewOptions): void;
  dispose(): void;
}

/**
 * The smallest fragment is drawn noticeably smaller than the largest, so the
 * three options are comparable at a glance — but not to true scale. A 6 mm
 * piece next to a 13 mm one at true scale is a dot.
 */
const MIN_DRAW_SCALE = 0.66;

/** Where the dominant feature is put, in view space: down, and toward us. */
const FEATURE_DIRECTION = new THREE.Vector3(0, -0.72, 0.69).normalize();
const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
/** Radians per second. About sixteen seconds a turn — a drift, not a spin. */
const SPIN_RATE = 0.4;

/**
 * Camera placement, for a ball of mean radius 1 at the origin. Far enough back
 * that the roughest fragment the grades can produce still clears the frame,
 * close enough that the smallest is not a speck. Slightly above the equator, so
 * a flat underside is visible as a flat underside.
 */
const CAMERA_FOV = 30;
const CAMERA_POSITION = new THREE.Vector3(0, 0.95, 5.35);

/** Drawing buffer scale. Capped: this is a 96 px square, not the tank. */
const MAX_PIXEL_RATIO = 2;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** How large this fragment is drawn, relative to the largest one on offer. */
export function previewDrawScale(radiusMm: number): number {
  const span = FRAGMENT_MAX_RADIUS_MM - FRAGMENT_MIN_RADIUS_MM;
  const t = span > 0 ? (radiusMm - FRAGMENT_MIN_RADIUS_MM) / span : 1;
  return MIN_DRAW_SCALE + (1 - MIN_DRAW_SCALE) * clamp01(t);
}

/**
 * The rotation that puts the shape's biggest feature where it can be seen.
 *
 * Same choice the 2D outline makes, and for the same reason: a flat face wins
 * outright when there is one, because it is the most the piece has to say about
 * itself. It is aimed down and forward rather than straight down, so the spin
 * carries it across the front of the ball instead of hiding it underneath.
 */
export function previewOrientation(shape: MarimoShape): THREE.Quaternion {
  const facet = deepestFacet(shape);
  const feature = facet ? facet.d : extremeDirection(shape.coeffs);
  const from = new THREE.Vector3(feature[0], feature[1], feature[2]);
  if (from.lengthSq() < 1e-12) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromUnitVectors(from.normalize(), FEATURE_DIRECTION);
}

interface Entry {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  observer: ResizeObserver;
  shape: MarimoShape;
  /** Per-seed surface character, kept here and pushed at draw time. */
  lumpOffset: THREE.Vector3;
  lumpCharacter: THREE.Vector4;
  drawScale: number;
  orientation: THREE.Quaternion;
  spin: boolean;
  /** Set when something other than the spin means the pixels are stale. */
  dirty: boolean;
}

interface Rig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  shape: MarimoShapeUniforms;
  dispose(): void;
}

const entries = new Set<Entry>();
let rig: Rig | null = null;
/** Latched once: a browser without WebGL will not grow it on the next try. */
let rigUnavailable = false;
let frameId = 0;
let started = 0;

const spinQuaternion = new THREE.Quaternion();

function buildRig(): Rig | null {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  // The drawing buffer is sized in device pixels by hand, so three must not
  // apply a ratio of its own on top.
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);

  const shape = createShapeUniforms(0);
  const bodyMaterial = createPreviewBodyMaterial(shape);

  const bodyGeometry = new THREE.IcosahedronGeometry(1, ICOSPHERE_DETAIL);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  // The shader puts every vertex somewhere three cannot predict.
  body.frustumCulled = false;

  const group = new THREE.Group();
  group.add(body);

  const scene = new THREE.Scene();
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 40);

  return {
    renderer,
    scene,
    camera,
    group,
    shape,
    dispose() {
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}

function getRig(): Rig | null {
  if (rig || rigUnavailable) return rig;
  try {
    rig = buildRig();
  } catch {
    // No WebGL, or no context to spare. The caller falls back to the drawing.
    rigUnavailable = true;
    rig = null;
  }
  if (rig) {
    const canvas = rig.renderer.domElement;
    canvas.addEventListener('webglcontextrestored', markAllDirty);
  }
  return rig;
}

function markAllDirty() {
  for (const entry of entries) entry.dirty = true;
  wake();
}

/** Grow the offscreen canvas to cover the largest preview asked for so far. */
function ensureRigSize(active: Rig, width: number, height: number): void {
  const canvas = active.renderer.domElement;
  if (canvas.width >= width && canvas.height >= height) return;
  active.renderer.setSize(Math.max(canvas.width, width), Math.max(canvas.height, height), false);
}

/** Match the drawing buffer to the element's box. True if anything moved. */
function sizeEntry(entry: Entry): boolean {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const width = Math.max(1, Math.round(entry.canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(entry.canvas.clientHeight * ratio));
  if (entry.canvas.width === width && entry.canvas.height === height) return false;
  entry.canvas.width = width;
  entry.canvas.height = height;
  return true;
}

function drawEntry(active: Rig, entry: Entry, elapsedSec: number): void {
  const width = entry.canvas.width;
  const height = entry.canvas.height;
  if (width < 1 || height < 1) return;

  ensureRigSize(active, width, height);

  writeShapeUniforms(active.shape, entry.shape, entry.drawScale);
  active.shape.uLumpOffset.value.copy(entry.lumpOffset);
  active.shape.uLumpCharacter.value.copy(entry.lumpCharacter);

  spinQuaternion.setFromAxisAngle(SPIN_AXIS, entry.spin ? elapsedSec * SPIN_RATE : 0);
  active.group.quaternion.copy(spinQuaternion).multiply(entry.orientation);

  const aspect = width / height;
  active.camera.aspect = aspect;
  // A frame narrower than it is tall fits the ball to the width instead.
  active.camera.position.copy(CAMERA_POSITION).multiplyScalar(aspect < 1 ? 1 / aspect : 1);
  active.camera.lookAt(0, 0, 0);
  active.camera.updateProjectionMatrix();

  // Draw into the top-left of the offscreen canvas. GL counts rows from the
  // bottom, so the viewport is offset by whatever headroom the canvas has;
  // `drawImage` then reads the same rectangle in its own top-left coordinates.
  const buffer = active.renderer.domElement;
  const bottom = buffer.height - height;
  active.renderer.setViewport(0, bottom, width, height);
  active.renderer.setScissor(0, bottom, width, height);
  active.renderer.render(active.scene, active.camera);

  entry.context.clearRect(0, 0, width, height);
  entry.context.drawImage(buffer, 0, 0, width, height, 0, 0, width, height);
}

function frame(nowMs: number) {
  frameId = 0;
  const active = getRig();
  if (!active) return;

  if (started === 0) started = nowMs;
  const elapsedSec = (nowMs - started) / 1000;

  let wanted = false;
  for (const entry of entries) {
    const resized = sizeEntry(entry);
    if (entry.spin || entry.dirty || resized) {
      drawEntry(active, entry, elapsedSec);
      entry.dirty = false;
    }
    // A still preview is drawn once and then left alone, so the chooser is not
    // holding a repaint open for three pictures that are not changing.
    if (entry.spin) wanted = true;
  }

  if (wanted) frameId = requestAnimationFrame(frame);
}

function wake() {
  if (frameId === 0 && entries.size > 0) frameId = requestAnimationFrame(frame);
}

function releaseRig() {
  if (entries.size > 0 || !rig) return;
  rig.renderer.domElement.removeEventListener('webglcontextrestored', markAllDirty);
  rig.dispose();
  rig = null;
  started = 0;
}

function applySubject(entry: Entry, subject: PreviewSubject, options?: FragmentPreviewOptions) {
  // Borrowed rather than reimplemented: the lump offset and character are how a
  // seed becomes a particular surface, and the tank and the preview have to
  // agree about that or the piece changes the moment it is chosen.
  const uniforms = createShapeUniforms(subject.seed);

  entry.shape = shapeFrom(subject.bias, subject.facets);
  entry.lumpOffset = uniforms.uLumpOffset.value;
  entry.lumpCharacter = uniforms.uLumpCharacter.value;
  entry.drawScale = previewDrawScale(subject.radiusMm);
  entry.orientation = previewOrientation(entry.shape);
  entry.spin = options?.spin ?? true;
  entry.dirty = true;
}

/**
 * Start drawing `subject` into `canvas`.
 *
 * Returns null when there is no WebGL to be had, which is the caller's cue to
 * draw the flat version instead. Nothing else here can fail: a preview that
 * cannot be rendered must not be allowed to block the chooser, because the
 * chooser is the only way to get a marimo at all.
 */
export function attachFragmentPreview(
  canvas: HTMLCanvasElement,
  subject: PreviewSubject,
  options?: FragmentPreviewOptions
): FragmentPreviewHandle | null {
  const context = canvas.getContext('2d');
  if (!context || !getRig()) return null;

  const entry: Entry = {
    canvas,
    context,
    observer: new ResizeObserver(() => {
      // The size itself is picked up in the frame; this only has to make sure
      // there is a frame to pick it up in.
      wake();
    }),
    shape: { coeffs: [], facets: [], facetCount: 0 },
    lumpOffset: new THREE.Vector3(),
    lumpCharacter: new THREE.Vector4(),
    drawScale: 1,
    orientation: new THREE.Quaternion(),
    spin: true,
    dirty: true
  };
  applySubject(entry, subject, options);

  entries.add(entry);
  entry.observer.observe(canvas);
  wake();

  return {
    update(next, nextOptions) {
      applySubject(entry, next, nextOptions);
      wake();
    },
    dispose() {
      entry.observer.disconnect();
      entries.delete(entry);
      if (entries.size === 0 && frameId !== 0) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      releaseRig();
    }
  };
}
