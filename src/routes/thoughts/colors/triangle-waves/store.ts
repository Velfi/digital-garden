import { writable } from 'svelte/store';

export const triangleSize = writable(90);
export const triangleSpacing = writable(0.25);
export const waveIntensity = writable(25);
export const waveScale = writable({ x: 0.1, y: 0.15 });
export const hue = writable(Math.random() * 360.0);
export const hueScale = writable(0.25);
