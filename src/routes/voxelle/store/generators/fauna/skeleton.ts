import type { LocalBoneSpec } from '../creatureSkeleton';
import type { GenerateFaunaOptions } from './types';

export const FAUNA_BONE_IDS = {
  pelvis: 'fauna/pelvis',
  chest: 'fauna/chest',
  neck: 'fauna/neck',
  head: 'fauna/head'
} as const;

export function buildFaunaSpineSpecs(o: GenerateFaunaOptions): {
  specs: LocalBoneSpec[];
  spineIds: string[];
  chestId: string;
} {
  const segCount = Math.max(2, Math.floor(o.spineSegments));
  const step = Math.max(1, o.bodyDims.length / segCount);
  const isBiped = o.stance === 'biped';
  const specs: LocalBoneSpec[] = [
    {
      id: FAUNA_BONE_IDS.pelvis,
      parentId: null,
      localForward: 0,
      localSide: 0,
      localUp: 0
    }
  ];
  const spineIds: string[] = [FAUNA_BONE_IDS.pelvis];
  let prevId: string = FAUNA_BONE_IDS.pelvis;
  for (let i = 1; i <= segCount; i++) {
    const t = i / segCount;
    const id = i === segCount ? FAUNA_BONE_IDS.chest : `fauna/spine/${i}`;
    // Quadruped: arch mainly in vertical wiggle. Biped: very subtle forward S-curve to avoid hunching.
    const archQuad = o.bodyArch * Math.sin(Math.PI * t) * 2.2;
    const archBipedF = o.bodyArch * Math.sin(Math.PI * t) * 0.22;
    specs.push({
      id,
      parentId: prevId,
      localForward: isBiped ? step * 0.26 + archBipedF : step,
      localSide: 0,
      localUp: isBiped ? step : archQuad
    });
    spineIds.push(id);
    prevId = id;
  }

  // Quadruped: forward + up mix (tuned via neck/head length sliders). Biped: upright neck.
  const neckForward = isBiped
    ? Math.max(0.05, o.neckDims.length * 0.08)
    : Math.max(1, o.neckDims.length * 0.38);
  const neckUp = isBiped ? Math.max(2, o.neckDims.length * 1.45) : Math.max(2, o.neckDims.length * 0.9);
  specs.push({
    id: FAUNA_BONE_IDS.neck,
    parentId: FAUNA_BONE_IDS.chest,
    localForward: neckForward,
    localSide: 0,
    localUp: neckUp
  });
  const headForward = isBiped
    ? Math.max(1, o.headDims.length * 0.32)
    : Math.max(1, o.headDims.length * 0.52);
  const headUp = isBiped ? Math.max(0.7, o.headDims.length * 0.52) : Math.max(1, o.headDims.length * 0.42);
  specs.push({
    id: FAUNA_BONE_IDS.head,
    parentId: FAUNA_BONE_IDS.neck,
    localForward: headForward,
    localSide: 0,
    localUp: headUp
  });
  return { specs, spineIds, chestId: FAUNA_BONE_IDS.chest };
}

