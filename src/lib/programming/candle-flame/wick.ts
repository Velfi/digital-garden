import * as THREE from 'three';
import { plumeAnchor, WICK_TOP, type PlumeParams } from './plumeSim';

const WICK_EMBED = -0.028;
const WICK_EXPOSED = WICK_TOP;

export interface WickParams {
  windX: number;
  windY: number;
  windStrength: number;
  time: number;
  flameHeight: number;
}

export interface WickBundle {
  group: THREE.Group;
  update: (params: WickParams) => void;
  dispose: () => void;
}

function toPlume(params: WickParams): PlumeParams {
  return {
    time: params.time,
    windX: params.windX,
    windY: params.windY,
    windStrength: params.windStrength,
    turbulence: 0,
    flameHeight: params.flameHeight
  };
}

function buildExposedGeometry(params: WickParams): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)];

  const plume = toPlume(params);
  const steps = 7;
  for (let i = 1; i <= steps; i++) {
    const y = (i / steps) * WICK_EXPOSED;
    const [ax, az] = plumeAnchor(y, plume);
    points.push(new THREE.Vector3(ax, y, az));
  }

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
  const geo = new THREE.TubeGeometry(curve, 12, 0.0021, 5, false);

  const positions = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const char = new THREE.Color(0.2, 0.13, 0.09);
  const hot = new THREE.Color(0.95, 0.42, 0.12);

  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const heat = Math.max(0, Math.min(1, y / WICK_EXPOSED));
    const col = char.clone().lerp(hot, heat * heat);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createWick(): WickBundle {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x120c0a,
    roughness: 0.98,
    metalness: 0
  });
  const baseHeight = -WICK_EMBED;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.0022, baseHeight, 6), baseMat);
  base.position.y = WICK_EMBED + baseHeight * 0.5;
  group.add(base);

  const exposedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    vertexColors: true,
    emissive: 0xff6622,
    emissiveIntensity: 0.28
  });

  const initial = { windX: 0, windY: 0, windStrength: 0, time: 0, flameHeight: 0.38 };
  const exposed = new THREE.Mesh(buildExposedGeometry(initial), exposedMat);
  exposed.renderOrder = 1;
  group.add(exposed);

  let lastWickKey = '';

  function update(params: WickParams) {
    const key = `${params.windX.toFixed(3)}:${params.windY.toFixed(3)}:${params.windStrength.toFixed(3)}:${params.flameHeight.toFixed(3)}:${params.time.toFixed(4)}`;
    if (key === lastWickKey) return;
    lastWickKey = key;

    exposed.geometry.dispose();
    exposed.geometry = buildExposedGeometry(params);
  }

  return {
    group,
    update,
    dispose() {
      base.geometry.dispose();
      baseMat.dispose();
      exposed.geometry.dispose();
      exposedMat.dispose();
    }
  };
}
