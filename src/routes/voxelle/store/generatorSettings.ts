/**
 * Writable stores for procedural generator tools (rocks, grass, ashlar, flora, piscina, insecta, roof).
 * Re-exported from core.ts for a stable public API.
 */
import { writable } from 'svelte/store';
import {
  normalizeRoofProfilePoints,
  ROOF_PROFILE_CURVE_DEFAULT,
  type RoofProfilePoint
} from './generators/roofProfileCurve';
import type { ArticulatedLeg2 } from './generators/articulatedLeg';
import { cloneArticulatedLeg2 } from './generators/articulatedLeg';
import { INSECTA_INITIAL_LEGS } from './generators/insecta/insectaInitialLegs';
import type { PiscinaCaudalTailModeSetting } from './generators/piscina/types';
import { FAUNA_DEFAULTS } from './generators/fauna/presets';
import type {
  FaunaArchetypeId,
  FaunaLimbId,
  FaunaPoseDistals,
  FaunaPoseMids,
  FaunaPosePoles,
  FaunaPoseTargets,
  FaunaSectionDims,
  FaunaSpinePose,
  FaunaStanceId
} from './generators/fauna';

/** Rocks generator: nominal radius (1–8 voxels). */
export const rockSize = writable<number>(3);
/** Rocks generator: surface irregularity 0–1. */
export const rockRoughness = writable<number>(0.4);
/** Rocks generator: number of rocks to place per click (1–5). */
export const rockCount = writable<number>(1);
/** Rocks generator: max voxel offset for cluster centers when rockCount > 1 (0–3). */
export const rockClusterRadius = writable<number>(1);
/** Rocks generator: sink direction – none, under (buried), or over (floating). */
export type RockSinkDirection = 'none' | 'under' | 'over';
export const rockSinkDirection = writable<RockSinkDirection>('none');
/** Rocks generator: sink amount in voxel layers (0–5). */
export const rockSinkAmount = writable<number>(0);

/** Ashlar generator: block scale (1–20 voxels per dimension). */
export const ashlarSize = writable<number>(3);
/** Ashlar generator: edge irregularity 0–1 (removes boundary voxels). */
export const ashlarRoughness = writable<number>(0.3);
/** Ashlar generator: thickness along surface normal (1–20 voxels) for thin walls. */
export const ashlarThickness = writable<number>(3);

/** Grass generator: patch radius on surface (2–20 voxels). */
export const grassRadius = writable<number>(4);
/** Grass generator: density 0–1 (blade placement probability). */
export const grassDensity = writable<number>(0.6);
/** Grass generator: max blade height in voxels (1–6). */
export const grassHeight = writable<number>(3);

/** Flora generator: preset bundle id (`custom` = sliders only). */
export type FloraPresetId =
  | 'custom'
  | 'stalk'
  | 'trunk'
  | 'contorted'
  | 'multi_stem'
  | 'branched'
  | 'braided'
  | 'tuft';
export const floraPreset = writable<FloraPresetId>('stalk');
/** Flora: segments along +face normal (4–48). */
export const floraHeight = writable<number>(12);
/** Flora: cross-section half-width in tangent plane (0–4, 0.5 step supports even sizes). */
export const floraGirth = writable<number>(1);
/** Flora: lateral wander 0–1. */
export const floraWobble = writable<number>(0.25);
/** Flora: girth falloff base→tip 0–1. */
export const floraTaper = writable<number>(0.35);
/** Flora: stems per click (1–8). */
export const floraStemCount = writable<number>(1);
/** Flora: max tangent-plane offset for stem roots when stemCount > 1 (0–4). */
export const floraClusterRadius = writable<number>(1);
/** Flora: number of side branches from main stem (0–6). */
export const floraBranchCount = writable<number>(0);
/** Flora: branch recursion depth (1–2). */
export const floraBranchDepth = writable<number>(1);
/** Flora: forks only from this fraction of height upward (0–0.9). */
export const floraBranchStart = writable<number>(0.45);
/** Flora: lateral reach of branches (0–3). */
export const floraBranchSpread = writable<number>(2);
/** Flora: braided strands (1 = off, 2–5). */
export const floraBraidStrands = writable<number>(1);
/** Flora: braid intertwine 0–1. */
export const floraBraidTwist = writable<number>(0.45);
/** Flora: bark color noise 0–1 (per voxel). */
export const floraBarkJitter = writable<number>(0);

/** Piscina: body length along surface tangent (nose–tail, voxels). */
export const piscinaLength = writable<number>(42);
/** Piscina: per-fin scales 1…8 (pectoral / pelvic = paired fins together). */
export const piscinaFinDorsal = writable<number>(2);
export const piscinaFinAnal = writable<number>(1);
export const piscinaFinCaudal = writable<number>(2);
export const piscinaFinPectoral = writable<number>(1);
export const piscinaFinPelvic = writable<number>(1);
/** Small adipose fin (dorsal, behind main dorsal). */
export const piscinaFinAdipose = writable<number>(1);
export const piscinaShowFinDorsal = writable<boolean>(true);
export const piscinaShowFinAnal = writable<boolean>(true);
export const piscinaShowFinCaudal = writable<boolean>(true);
export const piscinaShowFinPectoral = writable<boolean>(true);
export const piscinaShowFinPelvic = writable<boolean>(true);
export const piscinaShowFinAdipose = writable<boolean>(false);
/**
 * Piscina body half-extents (voxels): lateral is `piscinaThickness`, dorsoventral is `piscinaWidth`
 * (names kept for persistence; UI labels and `buildPiscinaOptions` map them to generator width/thickness).
 */
export const piscinaWidth = writable<number>(14);
export const piscinaThickness = writable<number>(11);
/** Piscina: anchor slide along first tangent (integer voxel steps). */
export const piscinaAnchorOffsetU = writable<number>(0);
/** Piscina: anchor slide along second tangent (integer voxel steps). */
export const piscinaAnchorOffsetV = writable<number>(0);
/** Piscina / fish species outline (dropdown); body params can still be edited independently. */
export type FishSpeciesId = 'bass' | 'trout' | 'goldfish' | 'tuna' | 'eel';
export const piscinaSpecies = writable<FishSpeciesId>('trout');
/** @deprecated Use FishSpeciesId */
export type PiscinaPresetId = FishSpeciesId;
/** @deprecated Use piscinaSpecies */
export const piscinaPreset = piscinaSpecies;
/** Piscina: spine lateral bend (-1…1). */
export const piscinaSpineBend = writable<number>(0);
/** Piscina: secondary S / vertical wave (-1…1). */
export const piscinaSpineSCurve = writable<number>(0);
/** Fin tilt in sagittal plane (deg -45…45). */
export const piscinaFinDorsalPitch = writable<number>(0);
export const piscinaFinDorsalSweep = writable<number>(0);
export const piscinaFinAnalPitch = writable<number>(0);
export type PiscinaMedianFinMode = 'pointed' | 'rounded' | 'ribbon';
export type { PiscinaCaudalTailModeSetting };
export const piscinaFinDorsalMode = writable<PiscinaMedianFinMode>('rounded');
export const piscinaFinAnalMode = writable<PiscinaMedianFinMode>('rounded');
/** Caudal tail silhouette: `species` = use table per FishSpeciesId; else override fork/depth profile only. */
export const piscinaFinCaudalMode = writable<PiscinaCaudalTailModeSetting>('species');
export const piscinaFinPectoralMode = writable<PiscinaMedianFinMode>('rounded');
export const piscinaFinPelvicMode = writable<PiscinaMedianFinMode>('rounded');
export const piscinaFinAdiposeMode = writable<PiscinaMedianFinMode>('pointed');
/** Dorsal fin front-to-back base length multiplier (0.5–2.5). */
export const piscinaFinDorsalLength = writable<number>(1);
/** Anal fin front-to-back base length multiplier (0.5–2.5). */
export const piscinaFinAnalLength = writable<number>(1);
/** Dorsal fin head↔tail center shift (-0.45…0.45 in normalized t space). */
export const piscinaFinDorsalPosition = writable<number>(0);
/** Caudal fork spread (deg 0…45). */
export const piscinaFinCaudalSpread = writable<number>(0);
/** Pectoral rotation in body plane (deg -45…45). */
export const piscinaFinPectoralCant = writable<number>(0);
/** Pectoral sweep: yaw around body up, tips fin toward head (−) or tail (+) (deg -45…45). */
export const piscinaFinPectoralSweep = writable<number>(0);

/** Insecta: preset species (body + appendage defaults). */
import type { InsectaSpeciesId } from './generators/insecta/types';
export type { InsectaSpeciesId };
export const insectaSpecies = writable<InsectaSpeciesId>('bee');
/** Total body length along head→abdomen axis (voxels). */
export const insectaTotalLength = writable<number>(30);
/** Segment length shares (0–100); normalized in generator. */
export const insectaHeadRatio = writable<number>(17);
export const insectaThoraxRatio = writable<number>(28);
export const insectaAbdomenRatio = writable<number>(55);
/** Half-width along lateral tangent. */
export const insectaBodyHalfWidth = writable<number>(4);
/** Half-height along surface normal (dorsal). */
export const insectaBodyHalfHeight = writable<number>(4);
/** Abdomen taper 0 = cylinder, 1 = strong tip narrow. */
export const insectaAbdomenTaper = writable<number>(0.48);
/** 0 = squarish head, 100 = narrow snout / triangular profile. */
export const insectaHeadShape = writable<number>(60);
export const insectaAnchorOffsetU = writable<number>(0);
export const insectaAnchorOffsetV = writable<number>(0);
/** Yaw in the placement plane (−45…45°). */
export const insectaBodyYaw = writable<number>(0);
/** Lateral S-bend along body (−1…1). */
export const insectaBodyArch = writable<number>(0.05);

/** Two-segment legs: hip (U,V on body) + knee/foot offsets in body frame (f,s,u). */
export const insectaLegFront = writable<ArticulatedLeg2>(
  cloneArticulatedLeg2(INSECTA_INITIAL_LEGS.front)
);
export const insectaLegMid = writable<ArticulatedLeg2>(
  cloneArticulatedLeg2(INSECTA_INITIAL_LEGS.mid)
);
export const insectaLegHind = writable<ArticulatedLeg2>(
  cloneArticulatedLeg2(INSECTA_INITIAL_LEGS.hind)
);

export const insectaAntennaLength = writable<number>(5);
export const insectaAntennaSpread = writable<number>(12);
export const insectaAntennaPitch = writable<number>(18);
/** Root shift toward head along body axis (voxels). */
export const insectaAntennaRoot = writable<number>(2);

export const insectaMandibleLength = writable<number>(2);
export const insectaMandibleSpread = writable<number>(9);
export const insectaMandibleForward = writable<number>(1);
/** 0 = box wing outline, 100 = tapered ellipse toward tip (both wing pairs). */
export const insectaWingShape = writable<number>(85);

export const insectaShowWingFore = writable<boolean>(true);
export const insectaWingForeLength = writable<number>(15);
export const insectaWingForeWidth = writable<number>(4);
export const insectaWingForeSpread = writable<number>(78);
/** Fore wing span tilt toward the head (−f), 0–35° (dragonfly uses a high value). */
export const insectaWingForeForwardCant = writable<number>(5);
export const insectaWingForePitch = writable<number>(5);
export const insectaWingForeOffset = writable<number>(1);

export const insectaShowWingHind = writable<boolean>(true);
export const insectaWingHindLength = writable<number>(12);
export const insectaWingHindWidth = writable<number>(3);
export const insectaWingHindSpread = writable<number>(72);
export const insectaWingHindPitch = writable<number>(4);
export const insectaWingHindOffset = writable<number>(-1);

/** Fauna: biped / quadruped mammal-style generator. */
export type {
  FaunaArchetypeId,
  FaunaStanceId,
  FaunaLimbId,
  FaunaPoseTargets,
  FaunaPosePoles,
  FaunaPoseMids,
  FaunaPoseDistals
};
export const faunaStance = writable<FaunaStanceId>('quadruped');
export const faunaArchetype = writable<FaunaArchetypeId>(FAUNA_DEFAULTS.quadruped.archetype);
export const faunaAutoFootPlacement = writable<boolean>(FAUNA_DEFAULTS.quadruped.autoFootPlacement);
export const faunaAnchorOffsetU = writable<number>(0);
export const faunaAnchorOffsetV = writable<number>(0);
export const faunaBodyYaw = writable<number>(0);
export const faunaBodyArch = writable<number>(FAUNA_DEFAULTS.quadruped.bodyArch);
export const faunaSpineSegments = writable<number>(FAUNA_DEFAULTS.quadruped.spineSegments);
export const faunaBodyDims = writable<FaunaSectionDims>({ ...FAUNA_DEFAULTS.quadruped.bodyDims });
export const faunaNeckDims = writable<FaunaSectionDims>({ ...FAUNA_DEFAULTS.quadruped.neckDims });
export const faunaHeadDims = writable<FaunaSectionDims>({ ...FAUNA_DEFAULTS.quadruped.headDims });
export const faunaTailLength = writable<number>(FAUNA_DEFAULTS.quadruped.tailLength);
export const faunaShoulderOffsetForward = writable<number>(FAUNA_DEFAULTS.quadruped.shoulderOffsetForward);
export const faunaHipOffsetForward = writable<number>(FAUNA_DEFAULTS.quadruped.hipOffsetForward);
export const faunaFrontUpperLength = writable<number>(FAUNA_DEFAULTS.quadruped.frontUpperLength);
export const faunaFrontLowerLength = writable<number>(FAUNA_DEFAULTS.quadruped.frontLowerLength);
export const faunaHindUpperLength = writable<number>(FAUNA_DEFAULTS.quadruped.hindUpperLength);
export const faunaHindLowerLength = writable<number>(FAUNA_DEFAULTS.quadruped.hindLowerLength);
export const faunaLimbTargets = writable<FaunaPoseTargets>({
  ...FAUNA_DEFAULTS.quadruped.limbTargets
});
export const faunaLimbPoles = writable<FaunaPosePoles>({
  ...FAUNA_DEFAULTS.quadruped.limbPoles
});
export const faunaLimbMids = writable<FaunaPoseMids>({
  ...FAUNA_DEFAULTS.quadruped.limbMids
});
export const faunaLimbDistals = writable<FaunaPoseDistals>({
  ...FAUNA_DEFAULTS.quadruped.limbDistals
});
export const faunaSpinePose = writable<FaunaSpinePose>({ ...FAUNA_DEFAULTS.quadruped.spinePose });

/** Roof generator: how the footprint is chosen on the voxel surface. */
export type RoofSelectionMethodId = 'polygon' | 'circle' | 'square';
export const roofSelectionMethod = writable<RoofSelectionMethodId>('polygon');

/** Roof generator: profile style. */
export type RoofStyleId =
  | 'flat'
  | 'flat_parapet'
  | 'pyramid'
  | 'custom_profile'
  | 'cone'
  | 'shed'
  | 'saltbox'
  | 'gable'
  | 'hip'
  | 'barrel'
  | 'mansard'
  | 'gambrel'
  | 'pavilion'
  | 'dutch_gable';
export const roofStyle = writable<RoofStyleId>('pyramid');

export type { RoofProfilePoint };
/** Normalized control points: x from eave (0) inward to ridge/center (1), y = relative height (0–1). */
export const roofProfileCurve = writable<RoofProfilePoint[]>(
  normalizeRoofProfilePoints([...ROOF_PROFILE_CURVE_DEFAULT])
);
/** Roof generator: rise in voxels (pyramid, shed, gable). */
export const roofHeight = writable<number>(4);
/** Roof generator: slab depth for flat style (voxels). */
export const roofThickness = writable<number>(2);
/** Roof generator: low eave along vertex edge index → (i+1) for shed. */
export const roofShedEdgeIndex = writable<number>(0);
/** Gable: 0 = auto ridge (longer bbox axis), 1 = ridge along U, 2 = along V (plane UV). */
export const roofGableOrientation = writable<number>(0);
/** Mansard / gambrel: normalized break between lower and upper slope (0.2–0.8). */
export const roofBreakRatio = writable<number>(0.5);
/** Dutch gable: vertical wall layers before roof pitch (1–16). */
export const roofWallHeight = writable<number>(3);
/** Flat + parapet: extra layers on the footprint boundary ring (1–8). */
export const roofParapetHeight = writable<number>(2);
/** Saltbox: skew along shed ramp (-50…50, scaled in generator). */
export const roofSaltSkew = writable<number>(0);
/** Incremented from UI to reverse roof corner order (polygon winding). */
export const roofWindingFlipTick = writable<number>(0);
/** Roof generator: keep only surface voxels (6-neighbor shell). */
export const roofHollow = writable<boolean>(false);
