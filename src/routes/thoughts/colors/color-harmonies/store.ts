import { writable } from 'svelte/store';

export type HarmonyType = 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'square';

export const harmonyType = writable<HarmonyType>('complementary');
export const baseHue = writable<number>(0);
export const saturation = writable<number>(80);
export const lightness = writable<number>(50); 