import * as THREE from 'three';
import { createFlameMesh, type FlameMeshBundle } from './flameMesh';
import { createWick, type WickBundle } from './wick';
import type { PlumeParams } from './plumeSim';

export interface CandleSceneParams {
  windX: number;
  windY: number;
  windStrength: number;
  turbulence: number;
  flameHeight: number;
  exposure: number;
}

export type FlameResolution = 1 | 2 | 4 | 8;

export const FLAME_RESOLUTION_DETAIL: Record<FlameResolution, number> = {
  1: 2,
  2: 3,
  4: 4,
  8: 5
};

export interface CandleSceneRenderResult {
  /** Frames presented (matches what you see). */
  displayFps: number;
  /** Simulation substeps per second when unlocked; same as display when locked. */
  simHz: number;
}

export interface CandleScene {
  renderer: THREE.WebGLRenderer;
  resize: () => void;
  render: (time: number) => CandleSceneRenderResult;
  setParams: (params: CandleSceneParams) => void;
  setFlameResolution: (resolution: FlameResolution) => void;
  setWireframe: (enabled: boolean) => void;
  dispose: () => void;
}

/** Fixed sim tick — unlocked mode runs many of these per displayed frame. */
const SIM_STEP_SEC = 1 / 240;
const MAX_SIM_SUBSTEPS = 64;

export function createCandleScene(
  container: HTMLElement,
  flameResolution: FlameResolution = 2
): CandleScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x121018, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 10);
  camera.position.set(0.03, 0.11, 0.68);
  camera.lookAt(0, 0.17, 0);

  const waxMat = new THREE.MeshStandardMaterial({
    color: 0xd8c8aa,
    roughness: 0.62,
    metalness: 0.02
  });
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.136, 0.136, 1.1, 32), waxMat);
  wax.position.y = -0.55;
  scene.add(wax);

  const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.136, 0.024, 32), waxMat);
  pool.position.y = -0.012;
  scene.add(pool);

  const wick: WickBundle = createWick();
  scene.add(wick.group);

  let flame: FlameMeshBundle = createFlameMesh(FLAME_RESOLUTION_DETAIL[flameResolution]);
  scene.add(flame.glowMesh);
  scene.add(flame.mesh);
  scene.add(flame.coreMesh);
  let flameDetail = FLAME_RESOLUTION_DETAIL[flameResolution];
  let flameWireframe = false;

  scene.add(new THREE.AmbientLight(0x665040, 1.05));
  const key = new THREE.PointLight(0xffddaa, 0.85, 2.8);
  key.position.set(0.05, 0.25, 0.35);
  scene.add(key);

  const flameLight = new THREE.PointLight(0xffaa55, 2.6, 0.62);
  flameLight.position.set(0, 0.14, 0);
  scene.add(flameLight);

  const waxFill = new THREE.PointLight(0xffcc99, 0.45, 0.9);
  waxFill.position.set(0, 0.02, 0.25);
  scene.add(waxFill);

  let params: CandleSceneParams = {
    windX: 0,
    windY: 0,
    windStrength: 0.45,
    turbulence: 0.75,
    flameHeight: 0.34,
    exposure: 2.25
  };

  let lastFrameTime = 0;
  let simTime = 0;
  let simAccumulator = 0;
  let smoothedDisplayFps = 60;
  let smoothedSimHz = 60;

  function replaceFlame(detail: number) {
    if (detail === flameDetail) return;
    flameDetail = detail;
    scene.remove(flame.glowMesh);
    scene.remove(flame.mesh);
    scene.remove(flame.coreMesh);
    flame.dispose();
    flame = createFlameMesh(detail);
    flame.setWireframe(flameWireframe);
    scene.add(flame.glowMesh);
    scene.add(flame.mesh);
    scene.add(flame.coreMesh);
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function tickSimulation() {
    // Natural candle flicker — beating sines at incommensurate frequencies
    // create an irregular but smooth wobble on wind direction and strength.
    const t = simTime;
    const wobbleStr =
      1 +
      0.14 * Math.sin(t * 9.34 + 0.7) * Math.sin(t * 6.82) +
      0.09 * Math.sin(t * 13.17 + 2.1) * Math.sin(t * 5.43 + 1.3) +
      0.05 * Math.sin(t * 3.71 + 0.4);
    const wobbleX = 0.06 * Math.sin(t * 8.52) * Math.sin(t * 6.11 + 1.7);
    const wobbleY = 0.04 * Math.sin(t * 7.93 + 2.3) * Math.sin(t * 11.27 + 0.9);

    const plume: PlumeParams = {
      time: simTime,
      windX: params.windX + wobbleX,
      windY: params.windY + wobbleY,
      windStrength: Math.max(0, params.windStrength * wobbleStr),
      turbulence: params.turbulence,
      flameHeight: params.flameHeight
    };
    flame.update(plume, camera);
  }

  function render(time: number): CandleSceneRenderResult {
    let dt = 0;
    if (lastFrameTime > 0) {
      dt = (time - lastFrameTime) / 1000;
      if (dt > 0) {
        const instantDisplay = 1000 / dt;
        smoothedDisplayFps += (instantDisplay - smoothedDisplayFps) * 0.08;
      }
    }
    lastFrameTime = time;

    const dtClamped = Math.min(dt, 0.05);
    let simSteps = 0;

    simAccumulator += dtClamped;
    while (simAccumulator >= SIM_STEP_SEC && simSteps < MAX_SIM_SUBSTEPS) {
      simTime += SIM_STEP_SEC;
      tickSimulation();
      simAccumulator -= SIM_STEP_SEC;
      simSteps++;
    }

    wick.update({
      windX: params.windX,
      windY: params.windY,
      windStrength: params.windStrength,
      time: simTime,
      flameHeight: params.flameHeight
    });

    if (dt > 0) {
      const instantSimHz = simSteps / dt;
      smoothedSimHz += (instantSimHz - smoothedSimHz) * 0.08;
    }

    renderer.toneMappingExposure = params.exposure;
    renderer.render(scene, camera);

    return {
      displayFps: smoothedDisplayFps,
      simHz: smoothedSimHz
    };
  }

  function dispose() {
    flame.dispose();
    wick.dispose();
    wax.geometry.dispose();
    pool.geometry.dispose();
    waxMat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement);
    }
  }

  resize();

  return {
    renderer,
    resize,
    render,
    setParams(next) {
      params = next;
    },
    setFlameResolution(resolution) {
      replaceFlame(FLAME_RESOLUTION_DETAIL[resolution]);
    },
    setWireframe(enabled) {
      flameWireframe = enabled;
      flame.setWireframe(enabled);
    },
    dispose
  };
}
