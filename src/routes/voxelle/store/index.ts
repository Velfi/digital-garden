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
  selectedColors,
  palette,
  sidebarOpen,
  modalRequest,
  addPanelStore,
  selectionGizmoMode,
  stampRotation,
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
  enableShadows,
  aoStrength,
  backgroundColor,
  enableSky,
  roughness,
  metalness,
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
export { copySelection, cutSelection, pasteFromClipboard } from './clipboard';
export type { VoxelleClipboard } from './clipboard';

// Storage
export { loadFromStorage, saveToStorage, getSkipStartup, setSkipStartup } from './storage';

// Preferences (localStorage)
export { loadPreferences, savePreferences, voxellePreferences } from './preferences';
export type { VoxellePreferences } from './preferences';

// Voxelle file format
export {
  saveToFile,
  loadFromFile,
  loadFromBytes,
  encodeForTransport,
  serializeToVoxelleFormat,
  VOXELLE_FILE_VERSION
} from './voxelleFile';

// Import
export { importImageFromFile } from './importImage';
export type { VoxelleFileFormat } from './voxelleFile';

// Generators
export { generateRockVoxels, getRockPositions, generateAshlarVoxels, getAshlarPositions } from './generators/rock';
export { generateGrassVoxels, getGrassPositions } from './generators/grass';
