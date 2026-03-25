/**
 * Single source for draw-tool-panel visibility derived from tool pane, active tool, and stroke mode.
 * Used by ToolPanel.svelte and DrawToolOptions.svelte.
 */
import type { StrokeMode, Tool, ToolPane } from '../store/core';
import { STROKE_TOOLS } from '../store/core';
import { isGeneratorTool } from '../store/generators/registry';

export function isStrokeTool(t: string): boolean {
  return STROKE_TOOLS.includes(t as (typeof STROKE_TOOLS)[number]);
}

export function drawBrushVisible(toolPane: ToolPane, tool: string): boolean {
  return toolPane === 'draw' && isStrokeTool(tool);
}

export function planeAxisVisible(strokeMode: StrokeMode, tool: string): boolean {
  return (
    (strokeMode === 'plane' || strokeMode === 'circle' || strokeMode === 'cuboid') &&
    isStrokeTool(tool)
  );
}

export function lineAxisAlignVisible(strokeMode: StrokeMode, tool: string): boolean {
  return strokeMode === 'line' && isStrokeTool(tool);
}

export function airbrushVisible(strokeMode: StrokeMode, tool: string): boolean {
  return strokeMode === 'airbrush' && isStrokeTool(tool);
}

export function fillVisible(strokeMode: StrokeMode, tool: string): boolean {
  return strokeMode === 'fill' && isStrokeTool(tool);
}

export function polygonVisible(strokeMode: StrokeMode, tool: string): boolean {
  return strokeMode === 'polygon' && isStrokeTool(tool);
}

export function planeOrCuboidStroke(strokeMode: StrokeMode): boolean {
  return strokeMode === 'plane' || strokeMode === 'cuboid';
}

export function constrainPlaneSectionVisible(strokeMode: StrokeMode, tool: string): boolean {
  return fillVisible(strokeMode, tool) || airbrushVisible(strokeMode, tool);
}

export function showBrushSection(
  toolPane: ToolPane,
  strokeMode: StrokeMode,
  tool: string
): boolean {
  return (
    drawBrushVisible(toolPane, tool) &&
    !airbrushVisible(strokeMode, tool) &&
    !fillVisible(strokeMode, tool) &&
    !polygonVisible(strokeMode, tool)
  );
}

export function stampVisible(tool: Tool): boolean {
  return tool === 'stamp' || tool === 'punch';
}

export function clayVisible(tool: Tool): boolean {
  return tool === 'clay';
}

export function generatorOptionsVisible(tool: string): boolean {
  return isGeneratorTool(tool);
}

/** Wide tool panel layout for multi-card generator UIs. */
export function piscinaWide(tool: Tool): boolean {
  return tool === 'piscina' || tool === 'insecta';
}

export function gizmoTabsVisible(
  tool: Tool,
  selectionSize: number,
  addPanelOpen: boolean
): boolean {
  return tool !== 'fly' && tool !== 'hand' && (selectionSize > 0 || addPanelOpen);
}

/** Whether the floating tool panel should render at all. */
export function toolPanelShellVisible(opts: {
  tool: Tool;
  toolPane: ToolPane;
  strokeMode: StrokeMode;
  selectionSize: number;
  addPanelOpen: boolean;
}): boolean {
  const { tool, toolPane, strokeMode, selectionSize, addPanelOpen } = opts;
  return (
    gizmoTabsVisible(tool, selectionSize, addPanelOpen) ||
    drawBrushVisible(toolPane, tool) ||
    planeAxisVisible(strokeMode, tool) ||
    lineAxisAlignVisible(strokeMode, tool) ||
    airbrushVisible(strokeMode, tool) ||
    fillVisible(strokeMode, tool) ||
    polygonVisible(strokeMode, tool) ||
    stampVisible(tool) ||
    clayVisible(tool) ||
    generatorOptionsVisible(tool)
  );
}
