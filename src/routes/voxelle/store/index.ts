// Re-export coordUtils for compatibility
export {
  coordKey,
  parseCoordKey,
  getSelectionAnchor,
  getSelectionBounds,
  getBoundsFromPositions,
  getVoxelBounds,
  getVoxelCenter,
  getSelectionCenter
} from '../coordUtils';
export type { SelectionBounds } from '../coordUtils';

// Core
export {
  gridSize,
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
  clayMode,
  clayBrushRadius,
  branchTaper,
  puffRadius,
  puffRadiusRange,
  puffRadiusMin,
  puffRadiusMax,
  puffScatter,
  inflateStrength,
  ropeTension,
  ropeBrushShape,
  ropeBrushRadius,
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
  stampRotation,
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
  history,
  canUndoStore,
  canRedoStore,
  ensureGridFitsPositions,
  shiftVoxelsAndSelection,
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
  addShapeAt,
  initShape,
  getShapePositionsAt,
  rotatePositionAroundOrigin,
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
  DrawBrushShape,
  SprayDirection,
  FaceNormal,
  AddPanelState,
  StampRotation,
  StartShape,
  AddShapeParams
} from './core';

// canUndo, canRedo as aliases
export { canUndoStore as canUndo, canRedoStore as canRedo } from './core';

// Selection
export {
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
export {
  copySelection,
  cutSelection,
  pasteFromClipboard
} from './clipboard';
export type { VoxelleClipboard } from './clipboard';

// Storage
export { loadFromStorage, saveToStorage, getSkipStartup, setSkipStartup } from './storage';

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
