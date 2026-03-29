/**
 * Voxel edits from strokes and generator placement (used by VoxelCanvas pointer flow).
 */
import { get } from 'svelte/store';
import {
  inBounds,
  getEffectiveBounds,
  getBoundsFromPositions,
  coordKey,
  parseCoordKey,
  type FaceNormal,
  type SelectionMode,
  type Tool,
  type Voxel,
  type GenerateFloraOptions,
  type GeneratePiscinaOptions,
  type GenerateInsectaOptions,
  type GenerateFaunaOptions,
  type FishSpeciesId,
  type VoxelUpdaterMap,
  commitUndoAfter,
  mergeSelection,
  selection,
  selectionMode,
  updateVoxelsInStroke,
  runVoxelStroke,
  getPaintColorResolver,
  getSelectionCenter,
  getStampOffsetForFace,
  getPunchOffsetForFace,
  rotatePositionAroundOrigin,
  PUNCH_DEPTH_MAX,
  punchDepth,
  stampPunchOffsetFromNormal,
  smoothNeighborRadius,
  smoothAggressiveness,
  sculptSmoothVariant,
  smoothLaplacianIterations,
  smoothLaplacianRelax,
  terrainSculptOp,
  terrainBaseY,
  terrainStrength,
  terrainSmoothRadius,
  sculptBrushRadius,
  sculptBrushStrength,
  sculptBrushFalloff,
  ensureGridFitsPositions,
  generateRockVoxels,
  generateAshlarVoxels,
  generateGrassVoxels,
  generateFloraVoxels,
  generatePiscinaVoxels,
  generateInsectaVoxels,
  generateFaunaVoxels,
  rockSize,
  rockRoughness,
  rockCount,
  rockClusterRadius,
  rockSinkDirection,
  rockSinkAmount,
  ashlarSize,
  ashlarRoughness,
  ashlarThickness,
  grassRadius,
  grassDensity,
  grassHeight,
  floraPreset,
  floraHeight,
  floraGirth,
  floraWobble,
  floraTaper,
  floraStemCount,
  floraClusterRadius,
  floraBranchCount,
  floraBranchDepth,
  floraBranchStart,
  floraBranchSpread,
  floraBraidStrands,
  floraBraidTwist,
  floraBarkJitter,
  piscinaLength,
  piscinaWidth,
  piscinaThickness,
  piscinaFinDorsal,
  piscinaFinAnal,
  piscinaFinCaudal,
  piscinaFinPectoral,
  piscinaFinPelvic,
  piscinaFinAdipose,
  piscinaShowFinDorsal,
  piscinaShowFinAnal,
  piscinaShowFinCaudal,
  piscinaShowFinPectoral,
  piscinaShowFinPelvic,
  piscinaShowFinAdipose,
  piscinaAnchorOffsetU,
  piscinaAnchorOffsetV,
  piscinaSpecies,
  piscinaSpineBend,
  piscinaSpineSCurve,
  piscinaFinDorsalPitch,
  piscinaFinDorsalSweep,
  piscinaFinAnalPitch,
  piscinaFinDorsalMode,
  piscinaFinAnalMode,
  piscinaFinCaudalMode,
  piscinaFinPectoralMode,
  piscinaFinPelvicMode,
  piscinaFinAdiposeMode,
  piscinaFinDorsalLength,
  piscinaFinAnalLength,
  piscinaFinDorsalPosition,
  piscinaFinCaudalSpread,
  piscinaFinPectoralCant,
  piscinaFinPectoralSweep,
  insectaSpecies,
  insectaTotalLength,
  insectaHeadRatio,
  insectaThoraxRatio,
  insectaAbdomenRatio,
  insectaBodyHalfWidth,
  insectaBodyHalfHeight,
  insectaAbdomenTaper,
  insectaHeadShape,
  insectaAnchorOffsetU,
  insectaAnchorOffsetV,
  insectaBodyYaw,
  insectaBodyArch,
  insectaLegFront,
  insectaLegMid,
  insectaLegHind,
  insectaAntennaLength,
  insectaAntennaSpread,
  insectaAntennaPitch,
  insectaAntennaRoot,
  insectaMandibleLength,
  insectaMandibleSpread,
  insectaMandibleForward,
  insectaWingShape,
  insectaShowWingFore,
  insectaWingForeLength,
  insectaWingForeWidth,
  insectaWingForeSpread,
  insectaWingForeForwardCant,
  insectaWingForePitch,
  insectaWingForeOffset,
  insectaShowWingHind,
  insectaWingHindLength,
  insectaWingHindWidth,
  insectaWingHindSpread,
  insectaWingHindPitch,
  insectaWingHindOffset,
  faunaStance,
  faunaArchetype,
  faunaAutoFootPlacement,
  faunaAnchorOffsetU,
  faunaAnchorOffsetV,
  faunaBodyYaw,
  faunaBodyArch,
  faunaSpineSegments,
  faunaBodyDims,
  faunaNeckDims,
  faunaHeadDims,
  faunaTailLength,
  faunaShoulderOffsetForward,
  faunaHipOffsetForward,
  faunaFrontUpperLength,
  faunaFrontLowerLength,
  faunaHindUpperLength,
  faunaHindLowerLength,
  faunaLimbTargets,
  faunaLimbPoles,
  faunaLimbMids,
  faunaLimbDistals,
  faunaSpinePose,
  type InsectaSpeciesId
} from '../store/index';
import { applySmooth } from '../sculptOps';
import { applyMeshLaplacianSmooth } from '../sculptMeshLaplacian';
import { computeSculptVoxelWeights, filterPositionsBySculptBrush } from '../sculptBrushWeights';

export type SculptStrokeBrushOptions = {
  /** Terrain raise/lower: radial falloff path (see terrainClayOps). */
  terrainFalloffPath?: [number, number, number][];
  /** Thin stroke before thickening; soft brush falloff uses distance to this polyline. */
  spinePath?: [number, number, number][];
  /** Seed for strength stochastic pass (preview/apply should use same value per stroke). */
  strokeSeed?: number;
};
import { applyTerrainStroke } from '../terrainClayOps';

function getStampTargetForPlaceOnFace(
  place: [number, number, number],
  normal: FaceNormal,
  bounds: NonNullable<ReturnType<typeof getBoundsFromPositions>>,
  originMode: 'center' | 'corner'
): [number, number, number] {
  const halfW = (bounds.maxX - bounds.minX) / 2;
  const halfH = (bounds.maxY - bounds.minY) / 2;
  const halfD = (bounds.maxZ - bounds.minZ) / 2;
  const surfaceTarget: [number, number, number] = [
    place[0] - normal[0],
    place[1] - normal[1],
    place[2] - normal[2]
  ];
  return [
    normal[0] ? surfaceTarget[0] : originMode === 'corner' ? place[0] : place[0] - halfW,
    normal[1] ? surfaceTarget[1] : originMode === 'corner' ? place[1] : place[1] - halfH,
    normal[2] ? surfaceTarget[2] : originMode === 'corner' ? place[2] : place[2] - halfD
  ];
}

function getPunchTargetForPlaceOnFace(
  placeVoxel: [number, number, number],
  normal: FaceNormal,
  bounds: NonNullable<ReturnType<typeof getBoundsFromPositions>>,
  originMode: 'center' | 'corner'
): [number, number, number] {
  const halfW = (bounds.maxX - bounds.minX) / 2;
  const halfH = (bounds.maxY - bounds.minY) / 2;
  const halfD = (bounds.maxZ - bounds.minZ) / 2;
  return [
    normal[0] ? placeVoxel[0] : originMode === 'corner' ? placeVoxel[0] : placeVoxel[0] - halfW,
    normal[1] ? placeVoxel[1] : originMode === 'corner' ? placeVoxel[1] : placeVoxel[1] - halfH,
    normal[2] ? placeVoxel[2] : originMode === 'corner' ? placeVoxel[2] : placeVoxel[2] - halfD
  ];
}

function inwardFaceNormal(normal: FaceNormal): FaceNormal {
  return [-normal[0], -normal[1], -normal[2]] as FaceNormal;
}

function applyNormalOffset(
  position: [number, number, number],
  normal: FaceNormal,
  steps: number
): [number, number, number] {
  if (steps === 0) return position;
  return [
    position[0] + normal[0] * steps,
    position[1] + normal[1] * steps,
    position[2] + normal[2] * steps
  ];
}

function expandPunchAlongDepth(
  base: [number, number, number][],
  inward: FaceNormal,
  depth: number
): [number, number, number][] {
  const d = Math.floor(depth);
  const layers = Math.max(1, Math.min(PUNCH_DEPTH_MAX, Number.isFinite(d) ? d : 1));
  const [ix, iy, iz] = inward;
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  for (const [x, y, z] of base) {
    for (let k = 0; k < layers; k++) {
      const px = x + k * ix;
      const py = y + k * iy;
      const pz = z + k * iz;
      const key = coordKey(px, py, pz);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([px, py, pz]);
    }
  }
  return out;
}

export type VoxelStrokeCommitContext = {
  getTool: () => Tool;
  getLiveSelection: () => Map<string, Voxel>;
  getLiveVoxels: () => Map<string, Voxel>;
  isShiftPlaneSymmetryActive: () => boolean;
  expandPositionsForActiveSymmetry: (
    positions: [number, number, number][]
  ) => [number, number, number][];
  getStampRotation: () => { rotX: number; rotY: number; rotZ: number };
  getStampOriginMode: () => 'center' | 'corner';
  getEffectiveStampPatternMap: () => Map<string, Voxel>;
  playPlaceSound: () => void;
  /** Current brush stroke seed (multi-color random-single / seeded resolvers). */
  getStrokeSeed: () => number;
};

export function getAshlarThicknessAxis(normal: FaceNormal): 0 | 1 | 2 {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  return ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
}

export function nextRockClusterRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFloraOptionsFromStores(): GenerateFloraOptions {
  return {
    preset: get(floraPreset),
    height: get(floraHeight) as number,
    girth: get(floraGirth) as number,
    wobble: get(floraWobble) as number,
    taper: get(floraTaper) as number,
    stemCount: get(floraStemCount) as number,
    clusterRadius: get(floraClusterRadius) as number,
    branchCount: get(floraBranchCount) as number,
    branchDepth: get(floraBranchDepth) as number,
    branchStart: get(floraBranchStart) as number,
    branchSpread: get(floraBranchSpread) as number,
    braidStrands: get(floraBraidStrands) as number,
    braidTwist: get(floraBraidTwist) as number,
    barkJitter: get(floraBarkJitter) as number
  };
}

export function buildInsectaOptionsFromStores(): GenerateInsectaOptions {
  return {
    species: get(insectaSpecies) as InsectaSpeciesId,
    totalLength: get(insectaTotalLength) as number,
    headRatio: get(insectaHeadRatio) as number,
    thoraxRatio: get(insectaThoraxRatio) as number,
    abdomenRatio: get(insectaAbdomenRatio) as number,
    bodyHalfWidth: get(insectaBodyHalfWidth) as number,
    bodyHalfHeight: get(insectaBodyHalfHeight) as number,
    abdomenTaper: get(insectaAbdomenTaper) as number,
    headShape: get(insectaHeadShape) as number,
    anchorOffsetU: get(insectaAnchorOffsetU) as number,
    anchorOffsetV: get(insectaAnchorOffsetV) as number,
    bodyYaw: get(insectaBodyYaw) as number,
    bodyArch: get(insectaBodyArch) as number,
    legFront: get(insectaLegFront),
    legMid: get(insectaLegMid),
    legHind: get(insectaLegHind),
    antennaLength: get(insectaAntennaLength) as number,
    antennaSpread: get(insectaAntennaSpread) as number,
    antennaPitch: get(insectaAntennaPitch) as number,
    antennaRoot: get(insectaAntennaRoot) as number,
    mandibleLength: get(insectaMandibleLength) as number,
    mandibleSpread: get(insectaMandibleSpread) as number,
    mandibleForward: get(insectaMandibleForward) as number,
    wingShape: get(insectaWingShape) as number,
    showWingFore: get(insectaShowWingFore) as boolean,
    wingForeLength: get(insectaWingForeLength) as number,
    wingForeWidth: get(insectaWingForeWidth) as number,
    wingForeSpread: get(insectaWingForeSpread) as number,
    wingForeForwardCant: get(insectaWingForeForwardCant) as number,
    wingForePitch: get(insectaWingForePitch) as number,
    wingForeOffset: get(insectaWingForeOffset) as number,
    showWingHind: get(insectaShowWingHind) as boolean,
    wingHindLength: get(insectaWingHindLength) as number,
    wingHindWidth: get(insectaWingHindWidth) as number,
    wingHindSpread: get(insectaWingHindSpread) as number,
    wingHindPitch: get(insectaWingHindPitch) as number,
    wingHindOffset: get(insectaWingHindOffset) as number
  };
}

export function buildFaunaOptionsFromStores(): GenerateFaunaOptions {
  return {
    stance: get(faunaStance),
    archetype: get(faunaArchetype),
    autoFootPlacement: get(faunaAutoFootPlacement),
    anchorOffsetU: get(faunaAnchorOffsetU) as number,
    anchorOffsetV: get(faunaAnchorOffsetV) as number,
    bodyYaw: get(faunaBodyYaw) as number,
    bodyArch: get(faunaBodyArch) as number,
    spineSegments: get(faunaSpineSegments) as number,
    bodyDims: get(faunaBodyDims),
    neckDims: get(faunaNeckDims),
    headDims: get(faunaHeadDims),
    tailLength: get(faunaTailLength) as number,
    shoulderOffsetForward: get(faunaShoulderOffsetForward) as number,
    hipOffsetForward: get(faunaHipOffsetForward) as number,
    frontUpperLength: get(faunaFrontUpperLength) as number,
    frontLowerLength: get(faunaFrontLowerLength) as number,
    hindUpperLength: get(faunaHindUpperLength) as number,
    hindLowerLength: get(faunaHindLowerLength) as number,
    limbTargets: get(faunaLimbTargets),
    limbPoles: get(faunaLimbPoles),
    limbMids: get(faunaLimbMids),
    limbDistals: get(faunaLimbDistals),
    spinePose: get(faunaSpinePose)
  };
}

export function buildPiscinaOptionsFromStores(): GeneratePiscinaOptions {
  return {
    species: get(piscinaSpecies) as FishSpeciesId,
    length: get(piscinaLength) as number,
    width: get(piscinaThickness) as number,
    thickness: get(piscinaWidth) as number,
    finDorsal: get(piscinaFinDorsal) as number,
    finAnal: get(piscinaFinAnal) as number,
    finCaudal: get(piscinaFinCaudal) as number,
    finPectoral: get(piscinaFinPectoral) as number,
    finPelvic: get(piscinaFinPelvic) as number,
    finAdipose: get(piscinaFinAdipose) as number,
    showFinDorsal: get(piscinaShowFinDorsal) as boolean,
    showFinAnal: get(piscinaShowFinAnal) as boolean,
    showFinCaudal: get(piscinaShowFinCaudal) as boolean,
    showFinPectoral: get(piscinaShowFinPectoral) as boolean,
    showFinPelvic: get(piscinaShowFinPelvic) as boolean,
    showFinAdipose: get(piscinaShowFinAdipose) as boolean,
    anchorOffsetU: get(piscinaAnchorOffsetU) as number,
    anchorOffsetV: get(piscinaAnchorOffsetV) as number,
    spineBend: get(piscinaSpineBend) as number,
    spineSCurve: get(piscinaSpineSCurve) as number,
    finDorsalPitch: get(piscinaFinDorsalPitch) as number,
    finDorsalSweep: get(piscinaFinDorsalSweep) as number,
    finAnalPitch: get(piscinaFinAnalPitch) as number,
    finDorsalMode: get(piscinaFinDorsalMode),
    finAnalMode: get(piscinaFinAnalMode),
    finCaudalMode: get(piscinaFinCaudalMode),
    finPectoralMode: get(piscinaFinPectoralMode),
    finPelvicMode: get(piscinaFinPelvicMode),
    finAdiposeMode: get(piscinaFinAdiposeMode),
    finDorsalLength: get(piscinaFinDorsalLength) as number,
    finAnalLength: get(piscinaFinAnalLength) as number,
    finDorsalPosition: get(piscinaFinDorsalPosition) as number,
    finCaudalSpread: get(piscinaFinCaudalSpread) as number,
    finPectoralCant: get(piscinaFinPectoralCant) as number,
    finPectoralSweep: get(piscinaFinPectoralSweep) as number
  };
}

export function defaultPlayPlaceSound(): void {
  const a = new Audio('/voxelle/pop.ogg');
  a.play().catch(() => {});
}

export function createVoxelCanvasStrokeCommit(ctx: VoxelStrokeCommitContext) {
  function applyLineStroke(positions: [number, number, number][]) {
    const useCenteredShiftSymmetry = ctx.isShiftPlaneSymmetryActive();
    const sourcePositions = useCenteredShiftSymmetry
      ? ctx.expandPositionsForActiveSymmetry(positions)
      : positions;
    const sel = ctx.getLiveSelection();
    const tool = ctx.getTool();
    const effective =
      sel.size > 0 && (tool === 'paint' || tool === 'remove')
        ? sourcePositions.filter(([x, y, z]) => sel.has(coordKey(x, y, z)))
        : sourcePositions;
    ensureGridFitsPositions(effective);
    const boundSize: number | undefined = undefined;
    const getCol = getPaintColorResolver({ strokeSeed: ctx.getStrokeSeed() >>> 0 });
    const applyToMap = (v: VoxelUpdaterMap) => {
      for (const [x, y, z] of effective) {
        if (!inBounds(x, y, z, boundSize)) continue;
        const key = coordKey(x, y, z);
        if (tool === 'remove') {
          v.delete(key);
        } else if (tool === 'voxel' || tool === 'sculpt') {
          if (!v.has(key)) v.set(key, getCol(x, y, z));
        } else if (tool === 'paint') {
          if (v.has(key)) v.set(key, getCol(x, y, z));
        }
      }
    };
    if (useCenteredShiftSymmetry) {
      updateVoxelsInStroke((m) => applyToMap(m));
      return;
    }
    updateVoxelsInStroke((v) => {
      applyToMap(v);
    });
  }

  function applySculptStroke(
    positions: [number, number, number][],
    sculptModeVal:
      | 'draw'
      | 'smooth'
      | 'gouge'
      | 'branch'
      | 'rope'
      | 'cloth'
      | 'wall'
      | 'terrain',
    brushOpts?: SculptStrokeBrushOptions
  ) {
    const terrainFalloffPath = brushOpts?.terrainFalloffPath;
    const fallW = get(sculptBrushFalloff) / 100;
    const strW = get(sculptBrushStrength) / 100;
    const brushR = get(sculptBrushRadius) * 0.5;
    const seed = (brushOpts?.strokeSeed ?? 0) >>> 0;

    let pos = positions;
    if (fallW > 1e-6 || strW < 1 - 1e-6) {
      let spine: [number, number, number][] =
        brushOpts?.spinePath && brushOpts.spinePath.length > 0
          ? brushOpts.spinePath
          : terrainFalloffPath && terrainFalloffPath.length > 0
            ? terrainFalloffPath
            : [];
      if (spine.length === 0 && pos.length > 0) {
        spine = [pos[0]!];
      }
      const weights = computeSculptVoxelWeights(pos, spine, brushR, fallW);
      pos = filterPositionsBySculptBrush(pos, weights, strW, seed);
    }

    ensureGridFitsPositions(pos);
    const sculptBoundsOrSize = getEffectiveBounds(ctx.getLiveVoxels(), 512);
    const boundSize: number | undefined = undefined;
    const strokeSeed = ((brushOpts?.strokeSeed ?? ctx.getStrokeSeed()) >>> 0) as number;
    const getCol = getPaintColorResolver({ strokeSeed });
    const v = ctx.getLiveVoxels();
    if (sculptModeVal === 'terrain') {
      const { toAdd, toRemove } = applyTerrainStroke(
        v,
        pos,
        sculptBoundsOrSize,
        {
          op: get(terrainSculptOp),
          terrainBaseY: get(terrainBaseY),
          strength: get(terrainStrength),
          smoothRadius: get(terrainSmoothRadius),
          brushRadius: get(sculptBrushRadius) * 0.5,
          falloffPath: terrainFalloffPath
        },
        getCol
      );
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (sculptModeVal === 'gouge') {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of pos) {
          if (!inBounds(x, y, z, boundSize)) continue;
          next.delete(coordKey(x, y, z));
        }
      });
      return;
    }
    if (
      sculptModeVal === 'draw' ||
      sculptModeVal === 'branch' ||
      sculptModeVal === 'rope' ||
      sculptModeVal === 'cloth' ||
      sculptModeVal === 'wall'
    ) {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of pos) {
          if (!inBounds(x, y, z, boundSize)) continue;
          const key = coordKey(x, y, z);
          if (!next.has(key)) next.set(key, getCol(x, y, z));
        }
      });
      return;
    }
    if (sculptModeVal === 'smooth') {
      const majorityOpts = {
        neighborRadius: get(smoothNeighborRadius),
        aggressiveness: get(smoothAggressiveness)
      };
      const { toAdd, toRemove } =
        get(sculptSmoothVariant) === 'meshLaplacian'
          ? applyMeshLaplacianSmooth(v, pos, sculptBoundsOrSize, {
              neighborMargin: get(smoothNeighborRadius) + 2,
              iterations: get(smoothLaplacianIterations),
              relaxPct: get(smoothLaplacianRelax),
              majorityNeighborRadius: majorityOpts.neighborRadius,
              majorityAggressiveness: majorityOpts.aggressiveness
            }, getCol)
          : applySmooth(v, pos, sculptBoundsOrSize, majorityOpts);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
  }

  function applySelectStroke(positions: [number, number, number][], mode?: SelectionMode) {
    const expandedPositions = ctx.isShiftPlaneSymmetryActive()
      ? ctx.expandPositionsForActiveSymmetry(positions)
      : positions;
    commitUndoAfter(() => {
      const v = ctx.getLiveVoxels();
      const boundSize: number | undefined = undefined;
      const modeToUse = mode ?? get(selectionMode);
      const incoming = new Map<string, Voxel>();
      for (const [x, y, z] of expandedPositions) {
        if (!inBounds(x, y, z, boundSize)) continue;
        const key = coordKey(x, y, z);
        const col = v.get(key);
        if (col !== undefined) incoming.set(key, col);
      }
      const next = mergeSelection(ctx.getLiveSelection(), incoming, modeToUse);
      selection.set(next);
    });
  }

  function placeStamp(place: [number, number, number], normal: FaceNormal) {
    const sel = ctx.getEffectiveStampPatternMap();
    const center = getSelectionCenter(sel);
    if (!center) return;
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = ctx.getStampRotation();
    const rotated: [number, number, number][] = [];
    const colors: Voxel[] = [];
    for (const [key, col] of sel) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
      colors.push(col);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return;
    ctx.playPlaceSound();
    const offsetSteps = get(stampPunchOffsetFromNormal);
    const offsetPlace = applyNormalOffset(place, normal, offsetSteps);
    const targetForStamp = getStampTargetForPlaceOnFace(
      offsetPlace,
      normal,
      bounds,
      ctx.getStampOriginMode()
    );
    const [dx, dy, dz] = getStampOffsetForFace(targetForStamp, normal, bounds);
    const stampPositions = rotated.map(
      ([x, y, z]) => [x + dx, y + dy, z + dz] as [number, number, number]
    );
    ensureGridFitsPositions(stampPositions);
    const stampBoundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        stampPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, stampBoundSize)) return;
          v.set(coordKey(x, y, z), colors[i]!);
        });
      });
    });
  }

  function placePunch(placeVoxel: [number, number, number], normal: FaceNormal) {
    const sel = ctx.getEffectiveStampPatternMap();
    const center = getSelectionCenter(sel);
    if (!center) return;
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = ctx.getStampRotation();
    const rotated: [number, number, number][] = [];
    for (const key of sel.keys()) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return;
    const offsetSteps = get(stampPunchOffsetFromNormal);
    const offsetPlace = applyNormalOffset(placeVoxel, normal, offsetSteps);
    const targetForPunch = getPunchTargetForPlaceOnFace(
      offsetPlace,
      normal,
      bounds,
      ctx.getStampOriginMode()
    );
    const inward = inwardFaceNormal(normal);
    const [dx, dy, dz] = getPunchOffsetForFace(targetForPunch, inward, bounds);
    const base = rotated.map(([x, y, z]) => [x + dx, y + dy, z + dz] as [number, number, number]);
    const punchPositions = expandPunchAlongDepth(base, inward, get(punchDepth));
    ensureGridFitsPositions(punchPositions);
    const punchBoundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        punchPositions.forEach(([x, y, z]) => {
          if (!inBounds(x, y, z, punchBoundSize)) return;
          v.delete(coordKey(x, y, z));
        });
      });
    });
  }

  function placeRocks(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver({ placementSeed: placementSeed >>> 0 });
    const size = get(rockSize) as number;
    const roughness = get(rockRoughness) as number;
    const count = get(rockCount) as number;
    const clusterR = get(rockClusterRadius) as number;
    const sinkDir = get(rockSinkDirection) as 'none' | 'under' | 'over';
    const sinkAmount = get(rockSinkAmount) as number;
    const allPositions: [number, number, number][] = [];
    const allVoxelsRock: Voxel[] = [];
    const N = sinkDir !== 'none' ? Math.min(5, Math.max(0, sinkAmount)) : 0;
    const surfaceTarget: [number, number, number] =
      sinkDir === 'under'
        ? [
            place[0] - (1 + N) * normal[0],
            place[1] - (1 + N) * normal[1],
            place[2] - (1 + N) * normal[2]
          ]
        : sinkDir === 'over'
          ? [
              place[0] + (N - 1) * normal[0],
              place[1] + (N - 1) * normal[1],
              place[2] + (N - 1) * normal[2]
            ]
          : [place[0] - normal[0], place[1] - normal[1], place[2] - normal[2]];

    for (let i = 0; i < count; i++) {
      const rng = nextRockClusterRng(placementSeed + i);
      const dx = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
      const dy = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
      const dz = clusterR > 0 ? Math.floor(rng() * (2 * clusterR + 1)) - clusterR : 0;
      const placeI: [number, number, number] = [place[0] + dx, place[1] + dy, place[2] + dz];
      const rockMap = generateRockVoxels(
        placementSeed + i,
        size,
        roughness,
        getCol(placeI[0], placeI[1], placeI[2]).color
      );
      const localPositions = [...rockMap.keys()].map(
        (k) => parseCoordKey(k) as [number, number, number]
      );
      const b = getBoundsFromPositions(localPositions);
      if (!b) continue;
      const halfW = (b.maxX - b.minX) / 2;
      const halfH = (b.maxY - b.minY) / 2;
      const halfD = (b.maxZ - b.minZ) / 2;
      const targetForStamp: [number, number, number] = [
        normal[0] ? surfaceTarget[0] : placeI[0] - halfW,
        normal[1] ? surfaceTarget[1] : placeI[1] - halfH,
        normal[2] ? surfaceTarget[2] : placeI[2] - halfD
      ];
      const [ox, oy, oz] = getStampOffsetForFace(targetForStamp, normal, b);
      for (const [key, vx] of rockMap) {
        const [lx, ly, lz] = parseCoordKey(key);
        allPositions.push([lx + ox, ly + oy, lz + oz]);
        allVoxelsRock.push(vx);
      }
    }

    if (allPositions.length === 0) return;
    ctx.playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsRock[i]!);
        });
      });
    });
  }

  function placeAshlar(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver({ placementSeed: placementSeed >>> 0 });
    const size = get(ashlarSize) as number;
    const roughness = get(ashlarRoughness) as number;
    const thickness = get(ashlarThickness) as number;
    const thicknessAxis = getAshlarThicknessAxis(normal);
    const surfaceTarget: [number, number, number] = [
      place[0] - normal[0],
      place[1] - normal[1],
      place[2] - normal[2]
    ];
    const ashlarMap = generateAshlarVoxels(
      placementSeed,
      size,
      roughness,
      getCol(place[0], place[1], place[2]).color,
      thickness,
      thicknessAxis
    );
    const localPositions = [...ashlarMap.keys()].map(
      (k) => parseCoordKey(k) as [number, number, number]
    );
    const bounds = getBoundsFromPositions(localPositions);
    if (!bounds) return;
    const halfW = (bounds.maxX - bounds.minX) / 2;
    const halfH = (bounds.maxY - bounds.minY) / 2;
    const halfD = (bounds.maxZ - bounds.minZ) / 2;
    const targetForStamp: [number, number, number] = [
      normal[0] ? surfaceTarget[0] : place[0] - halfW,
      normal[1] ? surfaceTarget[1] : place[1] - halfH,
      normal[2] ? surfaceTarget[2] : place[2] - halfD
    ];
    const [ox, oy, oz] = getStampOffsetForFace(targetForStamp, normal, bounds);
    const allPositions: [number, number, number][] = [];
    const allVoxelsAsh: Voxel[] = [];
    for (const [key, vx] of ashlarMap) {
      const [lx, ly, lz] = parseCoordKey(key);
      allPositions.push([lx + ox, ly + oy, lz + oz]);
      allVoxelsAsh.push(vx);
    }
    if (allPositions.length === 0) return;
    ctx.playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsAsh[i]!);
        });
      });
    });
  }

  function placeGrass(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver({ placementSeed: placementSeed >>> 0 });
    const radius = get(grassRadius) as number;
    const density = get(grassDensity) as number;
    const height = get(grassHeight) as number;
    const grassMap = generateGrassVoxels(
      placementSeed,
      place,
      normal,
      radius,
      density,
      height,
      getCol(place[0], place[1], place[2]).color
    );
    const allPositions: [number, number, number][] = [];
    const allVoxelsGrass: Voxel[] = [];
    for (const [key, vx] of grassMap) {
      allPositions.push(parseCoordKey(key) as [number, number, number]);
      allVoxelsGrass.push(vx);
    }
    if (allPositions.length === 0) return;
    ctx.playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsGrass[i]!);
        });
      });
    });
  }

  function placeInsecta(
    place: [number, number, number],
    normal: FaceNormal,
    placementSeed: number
  ) {
    const getCol = getPaintColorResolver({ placementSeed: placementSeed >>> 0 });
    const options = buildInsectaOptionsFromStores();
    const map = generateInsectaVoxels(placementSeed, place, normal, options, getCol);
    const allPositions: [number, number, number][] = [];
    const allVoxelsInsecta: Voxel[] = [];
    for (const [key, vx] of map) {
      allPositions.push(parseCoordKey(key) as [number, number, number]);
      allVoxelsInsecta.push(vx);
    }
    if (allPositions.length === 0) return;
    ctx.playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsInsecta[i]!);
        });
      });
    });
  }

  function placeFauna(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver({ placementSeed: placementSeed >>> 0 });
    const options = buildFaunaOptionsFromStores();
    const map = generateFaunaVoxels(placementSeed, place, normal, options, getCol);
    const allPositions: [number, number, number][] = [];
    const allVoxelsFauna: Voxel[] = [];
    for (const [key, vx] of map) {
      allPositions.push(parseCoordKey(key) as [number, number, number]);
      allVoxelsFauna.push(vx);
    }
    if (allPositions.length === 0) return;
    ctx.playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsFauna[i]!);
        });
      });
    });
  }

  function placePiscina(
    place: [number, number, number],
    normal: FaceNormal,
    placementSeed: number
  ) {
    const getCol = getPaintColorResolver({ placementSeed: placementSeed >>> 0 });
    const options = buildPiscinaOptionsFromStores();
    const map = generatePiscinaVoxels(placementSeed, place, normal, options, getCol);
    const allPositions: [number, number, number][] = [];
    const allVoxelsPiscina: Voxel[] = [];
    for (const [key, vx] of map) {
      allPositions.push(parseCoordKey(key) as [number, number, number]);
      allVoxelsPiscina.push(vx);
    }
    if (allPositions.length === 0) return;
    ctx.playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsPiscina[i]!);
        });
      });
    });
  }

  function placeFlora(place: [number, number, number], normal: FaceNormal, placementSeed: number) {
    const getCol = getPaintColorResolver({ placementSeed: placementSeed >>> 0 });
    const options = buildFloraOptionsFromStores();
    const floraMap = generateFloraVoxels(placementSeed, place, normal, options, getCol);
    const allPositions: [number, number, number][] = [];
    const allVoxelsFlora: Voxel[] = [];
    for (const [key, vx] of floraMap) {
      allPositions.push(parseCoordKey(key) as [number, number, number]);
      allVoxelsFlora.push(vx);
    }
    if (allPositions.length === 0) return;
    ctx.playPlaceSound();
    ensureGridFitsPositions(allPositions);
    const boundSize: number | undefined = undefined;
    runVoxelStroke(() => {
      updateVoxelsInStroke((v) => {
        allPositions.forEach(([x, y, z], i) => {
          if (!inBounds(x, y, z, boundSize)) return;
          v.set(coordKey(x, y, z), allVoxelsFlora[i]!);
        });
      });
    });
  }

  function getPunchPositionsForFace(
    placeVoxel: [number, number, number],
    normal: FaceNormal
  ): [number, number, number][] {
    const sel = ctx.getEffectiveStampPatternMap();
    const center = getSelectionCenter(sel);
    if (!center) return [];
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = ctx.getStampRotation();
    const rotated: [number, number, number][] = [];
    for (const key of sel.keys()) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return [];
    const offsetSteps = get(stampPunchOffsetFromNormal);
    const offsetPlace = applyNormalOffset(placeVoxel, normal, offsetSteps);
    const targetForPunch = getPunchTargetForPlaceOnFace(
      offsetPlace,
      normal,
      bounds,
      ctx.getStampOriginMode()
    );
    const inward = inwardFaceNormal(normal);
    const [dx, dy, dz] = getPunchOffsetForFace(targetForPunch, inward, bounds);
    const base = rotated.map(([x, y, z]) => [x + dx, y + dy, z + dz] as [number, number, number]);
    return expandPunchAlongDepth(base, inward, get(punchDepth));
  }

  function getStampPositionsForFace(
    place: [number, number, number],
    normal: FaceNormal
  ): [number, number, number][] {
    const sel = ctx.getEffectiveStampPatternMap();
    const center = getSelectionCenter(sel);
    if (!center) return [];
    const [cx, cy, cz] = center;
    const { rotX, rotY, rotZ } = ctx.getStampRotation();
    const rotated: [number, number, number][] = [];
    for (const key of sel.keys()) {
      const [x, y, z] = parseCoordKey(key);
      const centered: [number, number, number] = [x - cx, y - cy, z - cz];
      const r = rotatePositionAroundOrigin(centered, [rotX, rotY, rotZ]);
      rotated.push([r[0] + cx, r[1] + cy, r[2] + cz]);
    }
    const bounds = getBoundsFromPositions(rotated);
    if (!bounds) return [];
    const offsetSteps = get(stampPunchOffsetFromNormal);
    const offsetPlace = applyNormalOffset(place, normal, offsetSteps);
    const targetForStamp = getStampTargetForPlaceOnFace(
      offsetPlace,
      normal,
      bounds,
      ctx.getStampOriginMode()
    );
    const [dx, dy, dz] = getStampOffsetForFace(targetForStamp, normal, bounds);
    return rotated.map(([x, y, z]) => [x + dx, y + dy, z + dz]);
  }

  return {
    applyLineStroke,
    applySculptStroke,
    applySelectStroke,
    placeStamp,
    placePunch,
    placeRocks,
    placeAshlar,
    placeGrass,
    placePiscina,
    placeInsecta,
    placeFauna,
    placeFlora,
    getPunchPositionsForFace,
    getStampPositionsForFace
  };
}
