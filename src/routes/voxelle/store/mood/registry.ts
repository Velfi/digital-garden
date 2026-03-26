/** Mood tools (sidebar Mood tab). */
export const MOOD_TOOLS = ['atmosphere', 'sunShafts', 'distanceTint', 'grain'] as const;

export type MoodToolId = (typeof MOOD_TOOLS)[number];

const MOOD_SET = new Set<string>(MOOD_TOOLS);

/** Face-click mood tools (none — mood tab uses Hand-style camera navigation). */
export const MOOD_FACE_CLICK_TOOLS = [] as const;

const MOOD_FACE_CLICK_SET = new Set<string>(MOOD_FACE_CLICK_TOOLS);

export function isMoodTool(tool: string): tool is MoodToolId {
  return MOOD_SET.has(tool);
}

export function isMoodFaceClickTool(tool: string): boolean {
  return MOOD_FACE_CLICK_SET.has(tool);
}
