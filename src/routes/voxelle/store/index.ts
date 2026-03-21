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
  tool,
  toolPane,
  lastDrawTool,
  selection,
  selectionMode,
  fillSelectDiagonals,
  fillRespectsColor,
  fillConstrainToPlane,
  strokeMode,
  effectiveStrokeMode,
  lineAxisAlign,
  planeAxis,
  planeCuboidHollow,
  clayMode,
  clayBrushRadius,
  bulkBrushShape,
  branchTaper,
  branchTaperStartSize,
  branchTaperEndSize,
  inflateStrength,
  ropeTension,
  ropeBrushShape,
  ropeBrushRadius,
  ropeGravityDirection,
  airbrushRadius,
  airbrushScatter,
  airbrushRadiusRange,
  airbrushRadiusMin,
  airbrushRadiusMax,
  airbrushPlaneConstraint,
  sprayDirection,
  sprayStreakLength,
  wallWidth,
  wallHeight,
  wallLockStartHeight,
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
  selectionGizmoMode,
  stampRotation,
  stampOriginMode,
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
  showGrid,
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
  pushUndo,
  getUndoSnapshot,
  restoreUndoSnapshot,
  history,
  canUndoStore,
  canRedoStore,
  ensureGridFitsPositions,
  resizeGridToContent,
  shiftVoxelsAndSelection,
  scaleProjectBy2,
  shiftSelection,
  centerOriginOnObject,
  centerOriginOnSelection,
  getStampOffsetForFace,
  cloneVoxels,
  serializeVoxels,
  deserializeVoxels,
  initCanvas,
  resetCanvas,
  updateVoxels,
  beginStroke,
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

export type {
  GridSize,
  Tool,
  ToolPane,
  StrokeMode,
  SelectionMode,
  PlaneAxis,
  RenderingMode,
  ClayMode,
  RopeBrushShape,
  RopeGravityDirection,
  DrawBrushShape,
  SprayDirection,
  FaceNormal,
  AddPanelState,
  StampRotation,
  StampOriginMode,
  RockSinkDirection,
  StartShape,
  AddShapeParams,
  SelectionGizmoMode
} from './core';

// canUndo, canRedo as aliases
export { canUndoStore as canUndo, canRedoStore as canRedo } from './core';

// Selection
export type { FillSelectionResult, FillEmptyResult } from './selection';

export {
  SELECTION_BOUNDS_MARGIN,
  FILL_UNCONSTRAINED_LARGE_THRESHOLD,
  getFillSelectionAt,
  getFillEmptyAt,
  getCoplanarFacesSelectionAt,
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
export { copySelection, cutSelection, deleteSelectedVoxels, pasteFromClipboard } from './clipboard';
export type { VoxelleClipboard } from './clipboard';

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
  DEFAULT_RENDERER_BACKEND
} from './preferences';
export type { VoxellePreferences, RendererBackendPreference } from './preferences';

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
export { generateRockVoxels, getRockPositions, generateAshlarVoxels, getAshlarPositions } from './generators/rock';
export { generateGrassVoxels, getGrassPositions } from './generators/grass';
