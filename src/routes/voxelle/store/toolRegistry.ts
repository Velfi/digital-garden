/**
 * Central metadata for tools. Extend here when adding a tool so labels/panes stay consistent.
 * Pointer routing and Svelte components still need explicit wiring in VoxelCanvas / tool panels.
 */
import type { Tool, ToolPane } from './core';

export type ToolCategory =
  | 'draw'
  | 'selection'
  | 'stamp'
  | 'navigation'
  | 'utility'
  | 'sculpt'
  | 'generator'
  | 'mood';

export type ToolDescriptor = {
  id: Tool;
  category: ToolCategory;
  label: string;
  title: string;
  /** Primary sidebar pane for this tool */
  defaultPane: ToolPane;
};

const DESCRIPTORS: ToolDescriptor[] = [
  {
    id: 'voxel',
    category: 'draw',
    label: 'Add',
    title: 'Place voxels',
    defaultPane: 'draw'
  },
  {
    id: 'remove',
    category: 'draw',
    label: 'Remove',
    title: 'Remove voxels',
    defaultPane: 'draw'
  },
  {
    id: 'paint',
    category: 'draw',
    label: 'Paint',
    title: 'Paint voxels',
    defaultPane: 'draw'
  },
  {
    id: 'select',
    category: 'selection',
    label: 'Select',
    title: 'Select voxels for Stamp and Punch',
    defaultPane: 'draw'
  },
  {
    id: 'selectByColor',
    category: 'selection',
    label: 'By color',
    title: 'Select voxels matching color',
    defaultPane: 'draw'
  },
  {
    id: 'selectCoplanar',
    category: 'selection',
    label: 'Coplanar',
    title: 'Select coplanar voxels',
    defaultPane: 'draw'
  },
  {
    id: 'selectCoplanarEmpty',
    category: 'selection',
    label: 'Coplanar empty',
    title: 'Select coplanar empty cells',
    defaultPane: 'draw'
  },
  {
    id: 'stamp',
    category: 'stamp',
    label: 'Stamp',
    title: 'Place stamp pattern on click',
    defaultPane: 'draw'
  },
  {
    id: 'punch',
    category: 'stamp',
    label: 'Punch',
    title: 'Cut stamp shape into surface',
    defaultPane: 'draw'
  },
  {
    id: 'hand',
    category: 'navigation',
    label: 'Hand',
    title: 'Pan the view',
    defaultPane: 'hand'
  },
  {
    id: 'fly',
    category: 'navigation',
    label: 'Fly',
    title: 'First-person fly mode',
    defaultPane: 'fly'
  },
  {
    id: 'eyedropper',
    category: 'utility',
    label: 'Eyedropper',
    title: 'Pick voxel color from model',
    defaultPane: 'draw'
  },
  {
    id: 'sculpt',
    category: 'sculpt',
    label: 'Sculpt',
    title: 'Sculpt modes: draw, scrape, smooth, extrude, wall, terrain',
    defaultPane: 'sculpt'
  },
  {
    id: 'rope',
    category: 'generator',
    label: 'Rope',
    title: 'Pick two points, set tension, draw catenary with brush',
    defaultPane: 'generators'
  },
  {
    id: 'cloth',
    category: 'generator',
    label: 'Cloth',
    title: 'Place 3+ pins (closed boundary), Done, then tension; patch in the pin plane',
    defaultPane: 'generators'
  },
  {
    id: 'rocks',
    category: 'generator',
    label: 'Rocks',
    title: 'Place procedural rocks on a face',
    defaultPane: 'generators'
  },
  {
    id: 'grass',
    category: 'generator',
    label: 'Grass',
    title: 'Paint grass or fuzz on surface',
    defaultPane: 'generators'
  },
  {
    id: 'ashlar',
    category: 'generator',
    label: 'Ashlar',
    title: 'Place rough stone blocks for walls. Right-click to regenerate block.',
    defaultPane: 'generators'
  },
  {
    id: 'roof',
    category: 'generator',
    label: 'Roof',
    title: 'Click 4+ coplanar corners, then Done to build a roof',
    defaultPane: 'generators'
  },
  {
    id: 'flora',
    category: 'generator',
    label: 'Flora',
    title: 'Place procedural stems, trunks, and branches on a face',
    defaultPane: 'generators'
  },
  {
    id: 'piscina',
    category: 'generator',
    label: 'Piscina',
    title: 'Place procedural fish on a face; use sliders to shape',
    defaultPane: 'generators'
  },
  {
    id: 'insecta',
    category: 'generator',
    label: 'Insecta',
    title: 'Place procedural insects on a face; use sliders to shape',
    defaultPane: 'generators'
  },
  {
    id: 'atmosphere',
    category: 'mood',
    label: 'Atmosphere',
    title: 'Planar or aerial fog — adjust in the tool panel while navigating the view',
    defaultPane: 'mood'
  },
  {
    id: 'sunShafts',
    category: 'mood',
    label: 'Sun shafts',
    title: 'Add stylized light shafts from sun direction',
    defaultPane: 'mood'
  },
  {
    id: 'distanceTint',
    category: 'mood',
    label: 'Distance tint',
    title: 'Tint near/mid/far distances for cinematic depth',
    defaultPane: 'mood'
  },
  {
    id: 'grain',
    category: 'mood',
    label: 'Grain',
    title: 'Apply subtle film grain and shimmer',
    defaultPane: 'mood'
  }
];

const byId = new Map<Tool, ToolDescriptor>(DESCRIPTORS.map((d) => [d.id, d]));

export function getToolDescriptor(id: Tool): ToolDescriptor | undefined {
  return byId.get(id);
}

export function listToolDescriptors(): readonly ToolDescriptor[] {
  return DESCRIPTORS;
}

export function listToolsInCategory(category: ToolCategory): ToolDescriptor[] {
  return DESCRIPTORS.filter((d) => d.category === category);
}
