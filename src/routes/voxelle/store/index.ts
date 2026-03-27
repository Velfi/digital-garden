// Re-export coordUtils for compatibility
export {
  coordKey,
  parseCoordKey,
  getSelectionAnchor,
  getSelectionBounds,
  getBoundsFromPositions,
  getVoxelBounds,
  getVoxelCenter,
  defaultAddShapePlacementAnchor,
  getSelectionCenter,
  inBounds,
  inBoundsBox,
  getEffectiveBounds
} from '../coordUtils';
export type { SelectionBounds } from '../coordUtils';

// Core
export {
  gridSize,
  MAX_GRID_SIZE,
  MAX_BRUSH_SIZE,
  STROKE_TOOLS,
  voxels,
  hiddenVoxels,
  hasHiddenVoxels,
  tool,
  toolPane,
  lastDrawTool,
  toolBeforeEyedropper,
  selection,
  selectionMode,
  fillSelectDiagonals,
  fillRespectsColor,
  constrainToPlaneEnabled,
  constrainToPlaneRef,
  polygonOffsetFromNormal,
  strokeMode,
  effectiveStrokeMode,
  lineAxisAlign,
  planeAxis,
  planeCuboidHollow,
  PLANE_CUBOID_HOLLOW_WALL_MAX,
  planeCuboidHollowWallThickness,
  planeCylindroidCone,
  clayMode,
  clayBrushRadius,
  clayBrushShape,
  branchTaper,
  branchTaperStartSize,
  branchTaperEndSize,
  inflateStrength,
  smoothNeighborRadius,
  smoothAggressiveness,
  meltMaxPasses,
  meltStyle,
  terrainClayOp,
  terrainBaseY,
  terrainStrength,
  terrainSmoothRadius,
  ropeTension,
  ropeBrushShape,
  ropeBrushRadius,
  ropeGravityDirection,
  airbrushBrushShape,
  airbrushRadius,
  airbrushScatter,
  airbrushRadiusRange,
  airbrushRadiusMin,
  airbrushRadiusMax,
  sprayDirection,
  sprayStreakLength,
  wallWidth,
  wallHeight,
  wallLockStartHeight,
  wallAxisAlign,
  drawBrushShape,
  drawBrushSize,
  drawBrushSnapToSurface,
  color,
  voxelMaterial,
  selectedColors,
  palette,
  sidebarOpen,
  modalRequest,
  addPanelStore,
  closeAddPanel,
  selectionGizmoMode,
  stampRotation,
  stampOriginMode,
  stampPunchOffsetFromNormal,
  punchDepth,
  PUNCH_DEPTH_MAX,
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
  piscinaWidth,
  piscinaThickness,
  piscinaAnchorOffsetU,
  piscinaAnchorOffsetV,
  piscinaSpecies,
  piscinaPreset,
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
  type FloraPresetId,
  type PiscinaPresetId,
  roofStyle,
  roofHeight,
  roofThickness,
  roofShedEdgeIndex,
  roofGableOrientation,
  roofBreakRatio,
  roofWallHeight,
  roofParapetHeight,
  roofSaltSkew,
  roofWindingFlipTick,
  roofHollow,
  type RoofStyleId,
  showGrid,
  activeRendererIsWebGPU,
  renderingMode,
  lightAngle,
  lightElevation,
  lightColor,
  ambientIntensity,
  sunlightIntensity,
  sceneEnvironmentIntensity,
  enableShadows,
  aoStrength,
  backgroundColor,
  enableSky,
  focalLength,
  orthographic,
  symmetryX,
  symmetryY,
  symmetryZ,
  commitUndoAfter,
  runVoxelStroke,
  beginStroke,
  endStrokeUndo,
  getUndoSnapshot,
  restoreUndoSnapshot,
  history,
  canUndoStore,
  canRedoStore,
  ensureGridFitsPositions,
  resizeGridToContent,
  shiftVoxelsAndSelection,
  scaleProjectBy2,
  scaleProjectByHalf,
  rotateProjectQuarterTurns,
  shiftSelection,
  centerOriginOnObject,
  centerOriginOnSelection,
  getStampOffsetForFace,
  getPunchOffsetForFace,
  cloneVoxels,
  serializeVoxels,
  deserializeVoxels,
  initCanvas,
  resetCanvas,
  getAllVoxels,
  consumeDirtyVoxelKeys,
  hideSelectedVoxels,
  unhideAllVoxels,
  updateVoxels,
  updateVoxelsInStroke,
  applySelectionTranslationInStroke,
  applySelectionTranslationAlongAxis,
  applySelectionRotationInStroke,
  addShapeAt,
  initShape,
  getShapePositionsAt,
  rotatePositionAroundOrigin,
  rotateVectorByAxisQuarters,
  clampQuarterTurn,
  hexToInt,
  intToHex,
  getPaintColorResolver
} from './core';

export { glowVoxelCount, recomputeGlowVoxelCountFromMap } from './voxelDerivedStats';
export { projectPerfMetrics, markUndoRedoGestureStart } from './projectPerf';
export {
  projectOpenLoading,
  LARGE_PROJECT_OPEN_VOXEL_THRESHOLD,
  beginProjectOpenLoading,
  updateProjectOpenLoadingProgress,
  completeProjectOpenLoading
} from './projectLoad';

export {
  GENERATOR_TOOLS,
  GENERATOR_FACE_CLICK_TOOLS,
  isGeneratorTool,
  isGeneratorFaceClickTool,
  type GeneratorToolId
} from './generators/registry';

export {
  MOOD_TOOLS,
  MOOD_FACE_CLICK_TOOLS,
  isMoodTool,
  isMoodFaceClickTool,
  type MoodToolId
} from './mood/registry';

export {
  atmosphereEnabled,
  atmosphereColor,
  atmosphereThickness,
  atmosphereDensity,
  atmosphereMode,
  atmosphereSpatialMode,
  atmosphereHeightBias,
  atmosphereHeightFalloff,
  atmosphereDriftEnabled,
  atmosphereDriftAmount,
  atmosphereDriftScale,
  atmosphereDriftSpeed,
  atmospherePlane,
  atmospherePlaneValid,
  atmosphereActiveForRender,
  distanceTintEnabled,
  distanceTintNearColor,
  distanceTintMidColor,
  distanceTintFarColor,
  distanceTintNearDistance,
  distanceTintFarDistance,
  distanceTintStrength,
  distanceTintActiveForRender,
  grainEnabled,
  grainStrength,
  grainAnimated,
  grainSpeed,
  grainMode,
  grainActiveForRender,
  sunShaftsEnabled,
  sunShaftsStrength,
  sunShaftsDecay,
  sunShaftsDensity,
  sunShaftsWeight,
  sunShaftsSamples,
  sunShaftsActiveForRender,
  setAtmospherePlaneFromWorldPointAndNormal,
  clearAtmospherePlane
} from './atmosphere';

export type { AtmosphereMode, AtmospherePlane, AtmosphereSpatialMode, GrainMode } from './atmosphere';

export {
  getToolDescriptor,
  listToolDescriptors,
  listToolsInCategory,
  type ToolDescriptor,
  type ToolCategory
} from './toolRegistry';

export {
  canvasInteractionMode,
  shouldEnableOrbitControls,
  type VoxelleCanvasInteractionMode
} from './interactionMode';

export { commitSelectionMergeEdit, commitVoxelMapReplace } from './editCommands';

export type {
  GridSize,
  Tool,
  ToolPane,
  StrokeMode,
  SelectionMode,
  PlaneAxis,
  RenderingMode,
  ClayMode,
  TerrainClayOp,
  ClayBrushShape,
  RopeBrushShape,
  RopeGravityDirection,
  DrawBrushShape,
  SprayDirection,
  FaceNormal,
  AddPanelState,
  AddPanelMode,
  StampRotation,
  StampOriginMode,
  RockSinkDirection,
  StartShape,
  AddShapeParams,
  SelectionGizmoMode,
  ConstrainToPlaneRef,
  FishSpeciesId,
  VoxelUpdaterMap
} from './core';

// canUndo, canRedo as aliases
export { canUndoStore as canUndo, canRedoStore as canRedo } from './core';

// Selection
export type {
  FillSelectionResult,
  FillEmptyResult,
  FillPlaneSampleContext,
  FillProgress,
  FillAsyncOptions,
  FillSelectionAsyncResult,
  FillEmptyAsyncResult
} from './selection';

export {
  SELECTION_BOUNDS_MARGIN,
  FILL_UNCONSTRAINED_LARGE_THRESHOLD,
  getFillSelectionAt,
  getFillSelectionAtAsync,
  getFillEmptyAt,
  getFillEmptyAtAsync,
  getCoplanarFacesSelectionAt,
  getCoplanarEmptySelectionAt,
  mergeSelection,
  selectAll,
  deselectAll,
  deselectVoxels,
  deselectEmptySpaces,
  invertSelection,
  growSelection,
  shrinkSelection,
  deselectInnerVoxels,
  hollowOut,
  selectConnected
} from './selection';

// URL / Share
export { encodeModelForUrl } from './url';

// Clipboard
export {
  copySelection,
  cutSelection,
  deleteSelectedVoxels,
  pasteFromClipboard,
  placePastePatternAt,
  buildPastePlacementVoxelMap,
  clipboardEntryToVoxel
} from './clipboard';
export type { VoxelleClipboard } from './clipboard';

// Stamp book
export {
  bookStampPattern,
  selectionToStampEntries,
  entriesToSelectionMap,
  canSaveSelectionAsStamp,
  saveSelectionAsStamp,
  applyStampRecordToSelection,
  updateStampName,
  updateStampTags,
  removeStamp,
  reorderStamps,
  listStampsOrdered,
  normalizeStampTags,
  stampMatchesSearch,
  parseStampLibraryJson,
  stampRecordsToLibraryJson,
  importStampsFromParsed,
  downloadTextFile
} from './stampBook';
export type { ParsedStampImport, StampBookRecord, StampBookEntryTuple } from './stampBook';

// Storage
export {
  loadFromStorage,
  loadFromStorageAsync,
  saveToStorage,
  saveToStoragePromise,
  getSkipStartup,
  setSkipStartup,
  autosaveError
} from './storage';

// Preferences (localStorage)
export {
  loadPreferences,
  savePreferences,
  voxellePreferences,
  isRendererBackendPreference,
  isRayTraceBackendPreference,
  DEFAULT_RENDERER_BACKEND,
  DEFAULT_RAY_TRACE_BACKEND
} from './preferences';
export type {
  VoxellePreferences,
  RendererBackendPreference,
  RayTraceBackendPreference
} from './preferences';

export {
  DEFAULT_TONE_MAPPING_PREFERENCE,
  TONE_MAPPING_OPTIONS,
  isToneMappingPreference,
  toneMappingPreferenceToThree
} from '../toneMappingPreference';
export type { ToneMappingPreference } from '../toneMappingPreference';

// Voxelle file format
export {
  saveToFile,
  loadFromFile,
  loadFromBytes,
  encodeForTransport,
  serializeToVoxelleFormat,
  VOXELLE_FORMAT_VERSION
} from './voxelleFile';

// Import
export { importImageFromFile } from './importImage';
export type { VoxelleFileFormat } from './voxelleFile';

export type { Voxel, VoxelMaterialId } from '../voxelMaterial';
export { VOXEL_MATERIAL_IDS, sameVoxelColor } from '../voxelMaterial';

// Lighting presets
export { LIGHT_PRESETS, applyLightPreset } from './lightPresets';
export type { LightPresetId, LightPreset } from './lightPresets';

// Generators
export {
  generateRockVoxels,
  getRockPositions,
  generateAshlarVoxels,
  getAshlarPositions
} from './generators/rock';
export { generateGrassVoxels, getGrassPositions } from './generators/grass';
export {
  generateFloraVoxels,
  getFloraPositions,
  FLORA_PRESET_NUMERIC,
  FLORA_VOXEL_CAP
} from './generators/flora';
export type { GenerateFloraOptions, FloraNumericFields } from './generators/flora';
export {
  generatePiscinaVoxels,
  getPiscinaPositions,
  buildPiscinaFrame,
  widthThicknessFromGirth,
  computePiscinaVoxelCap,
  PISCINA_DV_HALF_MAX,
  PISCINA_DV_HALF_MIN,
  PISCINA_LATERAL_HALF_MAX,
  PISCINA_LATERAL_HALF_MIN,
  PISCINA_VOXEL_CAP,
  PISCINA_VOXEL_CAP_MAX,
  PISCINA_VOXEL_CAP_MIN,
  FISH_SPECIES_DEFAULT_FIN_MODES,
  FISH_SPECIES_DEFAULT_NUMERIC,
  PISCINA_PRESET_NUMERIC,
  SPECIES_OUTLINES
} from './generators/piscina';
export type { GeneratePiscinaOptions, PiscinaPresetNumericFields } from './generators/piscina';
export {
  generateInsectaVoxels,
  getInsectaPositions,
  INSECTA_SPECIES_DEFAULTS,
  INSECTA_VOXEL_CAP,
  clampInsectaOptions
} from './generators/insecta';
export type {
  ArticulatedLeg2,
  GenerateInsectaOptions,
  InsectaSpeciesId,
  LegFrameOffset
} from './generators/insecta';
export { cloneArticulatedLeg2 } from './generators/articulatedLeg';
export { generateRoofVoxels } from './generators/roof';
export type { GenerateRoofOptions } from './generators/roof';
