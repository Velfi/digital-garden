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
  type FishSpeciesId,
  commitUndoAfter,
  mergeSelection,
  selection,
  selectionMode,
  voxels,
  updateVoxelsInStroke,
  runVoxelStroke,
  getPaintColorResolver,
  getSelectionCenter,
  getStampOffsetForFace,
  getPunchOffsetForFace,
  rotatePositionAroundOrigin,
  PUNCH_DEPTH_MAX,
  punchDepth,
  inflateStrength,
  ensureGridFitsPositions,
  generateRockVoxels,
  generateAshlarVoxels,
  generateGrassVoxels,
  generateFloraVoxels,
  generatePiscinaVoxels,
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
  piscinaFinPectoralSweep
} from '../store/index';
import { applySmooth, applyLevel, applyMelt, applyInflate } from '../clayOps';

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
    const getCol = getPaintColorResolver();
    const applyToMap = (v: Map<string, Voxel>) => {
      for (const [x, y, z] of effective) {
        if (!inBounds(x, y, z, boundSize)) continue;
        const key = coordKey(x, y, z);
        if (tool === 'remove') {
          v.delete(key);
        } else if (tool === 'voxel' || tool === 'clay') {
          if (!v.has(key)) v.set(key, getCol());
        } else if (tool === 'paint') {
          if (v.has(key)) v.set(key, getCol());
        }
      }
    };
    if (useCenteredShiftSymmetry) {
      voxels.update((existing) => {
        const next = new Map(existing);
        applyToMap(next);
        return next;
      });
      return;
    }
    updateVoxelsInStroke((v) => {
      applyToMap(v);
    });
  }

  function applyClayStroke(
    positions: [number, number, number][],
    clayModeVal:
      | 'bulk'
      | 'smooth'
      | 'level'
      | 'gouge'
      | 'branch'
      | 'melt'
      | 'rope'
      | 'wall'
      | 'inflate',
    levelY: number
  ) {
    ensureGridFitsPositions(positions);
    const clayBoundsOrSize = getEffectiveBounds(ctx.getLiveVoxels(), 512);
    const boundSize: number | undefined = undefined;
    const getCol = getPaintColorResolver();
    const v = ctx.getLiveVoxels();
    if (clayModeVal === 'melt') {
      const { toAdd, toRemove } = applyMelt(v, positions, clayBoundsOrSize);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'gouge') {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of positions) {
          if (!inBounds(x, y, z, boundSize)) continue;
          next.delete(coordKey(x, y, z));
        }
      });
      return;
    }
    if (
      clayModeVal === 'bulk' ||
      clayModeVal === 'branch' ||
      clayModeVal === 'rope' ||
      clayModeVal === 'wall'
    ) {
      updateVoxelsInStroke((next) => {
        for (const [x, y, z] of positions) {
          if (!inBounds(x, y, z, boundSize)) continue;
          const key = coordKey(x, y, z);
          if (!next.has(key)) next.set(key, getCol());
        }
      });
      return;
    }
    if (clayModeVal === 'smooth') {
      const { toAdd, toRemove } = applySmooth(v, positions, clayBoundsOrSize);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'inflate') {
      const { toAdd, toRemove } = applyInflate(
        v,
        positions,
        clayBoundsOrSize,
        get(inflateStrength)
      );
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
      return;
    }
    if (clayModeVal === 'level') {
      const { toAdd, toRemove } = applyLevel(v, positions, levelY, getCol, clayBoundsOrSize);
      updateVoxelsInStroke((next) => {
        for (const key of toRemove) next.delete(key);
        for (const [key, c] of toAdd) next.set(key, c);
      });
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
    const targetForStamp = getStampTargetForPlaceOnFace(
      place,
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
    const targetForPunch = getPunchTargetForPlaceOnFace(
      placeVoxel,
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
    const getCol = getPaintColorResolver();
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
      const rockMap = generateRockVoxels(placementSeed + i, size, roughness, getCol().color);
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
    const getCol = getPaintColorResolver();
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
      getCol().color,
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
    const getCol = getPaintColorResolver();
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
      getCol().color
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

  function placePiscina(
    place: [number, number, number],
    normal: FaceNormal,
    placementSeed: number
  ) {
    const getCol = getPaintColorResolver();
    const options = buildPiscinaOptionsFromStores();
    const map = generatePiscinaVoxels(placementSeed, place, normal, options, () => getCol());
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
    const getCol = getPaintColorResolver();
    const options = buildFloraOptionsFromStores();
    const floraMap = generateFloraVoxels(placementSeed, place, normal, options, () => getCol());
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
    const targetForPunch = getPunchTargetForPlaceOnFace(
      placeVoxel,
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
    const targetForStamp = getStampTargetForPlaceOnFace(
      place,
      normal,
      bounds,
      ctx.getStampOriginMode()
    );
    const [dx, dy, dz] = getStampOffsetForFace(targetForStamp, normal, bounds);
    return rotated.map(([x, y, z]) => [x + dx, y + dy, z + dz]);
  }

  return {
    applyLineStroke,
    applyClayStroke,
    applySelectStroke,
    placeStamp,
    placePunch,
    placeRocks,
    placeAshlar,
    placeGrass,
    placePiscina,
    placeFlora,
    getPunchPositionsForFace,
    getStampPositionsForFace
  };
}
