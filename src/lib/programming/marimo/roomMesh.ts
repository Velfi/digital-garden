import * as THREE from 'three';
import { FLOOR_Y, TANK_HALF_X, TANK_HALF_Z } from './constants';
import { ROOM_GLSL, WATER_GLSL, type RoomUniforms, type WaterUniforms } from './waterShader';

/**
 * Everything outside the glass: the room the jar stands in, and the pedestal it
 * stands on.
 *
 * Both are driven by the same `roomRadiance` the water surface and the glass
 * already use, which is the point of the module. The far pane of the jar shows
 * the room through the whole width of the water, and the backdrop shows the same
 * room directly a few centimetres to either side of it — if those came from two
 * different models the jar would sit in front of the room rather than in it, and
 * the join at the glass edge is exactly where the eye looks.
 */

/** Radius of the backdrop shell. Well inside the camera's far plane of 3 m. */
const BACKDROP_RADIUS = 1.2;

/** Just under the glass, which reaches down to `FLOOR_Y - 0.005`. */
const PEDESTAL_TOP = FLOOR_Y - 0.0055;
/** Deep enough to leave the bottom of the frame at any camera height. */
const PEDESTAL_DEPTH = 0.4;
/** Overhang past the glass, as a multiple of the jar's footprint. */
const PEDESTAL_OVERHANG = 1.45;

const PLACE_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const BACKDROP_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${ROOM_GLSL}

varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  // The shell is only a way to get a direction per pixel; nothing about it is at
  // a distance, so it is the view ray that is looked up, not the surface.
  gl_FragColor = vec4(roomRadiance(normalize(vWorld - cameraPosition)) * uExposure, 1.0);
}
`;

const PEDESTAL_FRAGMENT = /* glsl */ `
precision highp float;

${WATER_GLSL}
${ROOM_GLSL}

uniform vec3  uPedestalColour;
uniform float uPedestalFalloff;
uniform float uTopY;

varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(vNormal);

  // Lit by nothing but the room, so the room *is* the irradiance: sample it
  // along the normal. The top of the plinth looks at the lamp and catches a
  // bright collar around the jar; the sides look at whatever the walls are, and
  // in a dark room get almost nothing. That contrast is the whole reason the
  // pedestal is here, and it is also why turning the walls cream changes this
  // surface more than it changes anything else in the frame.
  vec3 colour = uPedestalColour * roomRadiance(n);

  // And it falls off going down, because the source is above and, in an unlit
  // room, nothing bounces back up off the floor. Exponential rather than linear
  // so there is no visible edge where the plinth stops being lit — it just
  // stops, some way before the bottom of the frame. How far down that takes is
  // the room's business: uPedestalFalloff is authored per tone in waterShader.
  colour *= exp(-max(0.0, uTopY - vWorld.y) / uPedestalFalloff);

  gl_FragColor = vec4(colour * uExposure, 1.0);
}
`;

export interface RoomBundle {
  group: THREE.Group;
  dispose(): void;
}

export function createRoom(water: WaterUniforms, room: RoomUniforms): RoomBundle {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];

  // --- backdrop -------------------------------------------------------------
  const backdropGeometry = new THREE.SphereGeometry(BACKDROP_RADIUS, 32, 16);
  const backdropMaterial = new THREE.ShaderMaterial({
    uniforms: { ...water, ...room },
    vertexShader: PLACE_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    side: THREE.BackSide,
    // Neither tested nor written: it is a background, it goes down first and it
    // must never occlude anything. `renderOrder` is what puts it first, ahead of
    // the far pane of the glass at -1.
    depthTest: false,
    depthWrite: false
  });
  const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
  backdrop.renderOrder = -100;
  // The camera sits inside it, so the bounding-sphere test is meaningless here
  // and only costs a matrix update per frame.
  backdrop.frustumCulled = false;
  group.add(backdrop);
  disposables.push(backdropGeometry, backdropMaterial);

  // --- pedestal -------------------------------------------------------------
  const pedestalGeometry = new THREE.BoxGeometry(
    TANK_HALF_X * 2 * PEDESTAL_OVERHANG,
    PEDESTAL_DEPTH,
    TANK_HALF_Z * 2 * PEDESTAL_OVERHANG
  );
  const pedestalMaterial = new THREE.ShaderMaterial({
    // The colour and the fall-off come in with the room block and are re-written
    // whenever the lights change; only the geometry constant is local.
    uniforms: { ...water, ...room, uTopY: { value: PEDESTAL_TOP } },
    vertexShader: PLACE_VERTEX,
    fragmentShader: PEDESTAL_FRAGMENT,
    // Double-sided like everything else in the scene, so the mirrored reflection
    // pass — which inverts winding — does not turn it inside out.
    side: THREE.DoubleSide
  });
  const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
  pedestal.position.y = PEDESTAL_TOP - PEDESTAL_DEPTH / 2;
  group.add(pedestal);
  disposables.push(pedestalGeometry, pedestalMaterial);

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
    }
  };
}
