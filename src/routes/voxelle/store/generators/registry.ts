/** Procedural / generator tools (sidebar Generators tab). */
export const GENERATOR_TOOLS = [
  'rocks',
  'grass',
  'ashlar',
  'roof',
  'flora',
  'piscina'
] as const;

export type GeneratorToolId = (typeof GENERATOR_TOOLS)[number];

const GENERATOR_SET = new Set<string>(GENERATOR_TOOLS);

/** Face-click generators: primary click applies on pointerup (no stroke drag). */
export const GENERATOR_FACE_CLICK_TOOLS = [
  'rocks',
  'grass',
  'ashlar',
  'flora',
  'piscina'
] as const;

const FACE_CLICK_SET = new Set<string>(GENERATOR_FACE_CLICK_TOOLS);

export function isGeneratorTool(tool: string): tool is GeneratorToolId {
  return GENERATOR_SET.has(tool);
}

export function isGeneratorFaceClickTool(tool: string): boolean {
  return FACE_CLICK_SET.has(tool);
}
