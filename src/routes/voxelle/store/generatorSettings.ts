/**
 * Writable stores for procedural generator tools (rocks, grass, ashlar, flora, piscina, roof).
 * Re-exported from core.ts for a stable public API.
 */
import { writable } from 'svelte/store';
import type { PiscinaCaudalTailModeSetting } from './generators/piscina/types';

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
/** Flora: cross-section radius in tangent plane (0–4, Chebyshev disk). */
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

/** Roof generator: profile style. */
export type RoofStyleId =
  | 'flat'
  | 'flat_parapet'
  | 'pyramid'
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
