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
  strokeMode,
  planeAxis,
  clayMode,
  clayBrushRadius,
  branchTaper,
  puffRadius,
  puffRadiusRange,
  puffRadiusMin,
  puffRadiusMax,
  puffScatter,
  airbrushRadius,
  airbrushScatter,
  airbrushRadiusRange,
  airbrushRadiusMin,
  airbrushRadiusMax,
  color,
  selectedColors,
  palette,
  sidebarOpen,
  modalRequest,
  addPanelStore,
  stampRotation,
  showGrid,
  lightAngle,
  lightElevation,
  lightColor,
  ambientIntensity,
  enableShadows,
  enableAO,
  backgroundColor,
  enableSky,
  roughness,
  metalness,
  envMapIntensity,
  focalLength,
  orthographic,
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
  ClayMode,
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
  mergeSelection,
  selectAll,
  deselectAll,
  deselectVoxels,
  deselectEmptySpaces,
  invertSelection,
  growSelection,
  shrinkSelection,
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
export { loadFromStorage, saveToStorage } from './storage';

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
