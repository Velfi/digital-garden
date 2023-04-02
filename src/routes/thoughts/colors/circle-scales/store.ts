import { writable } from 'svelte/store';

export const circleSize = writable(90);
export const circleSpacing = writable(0.85);
export const Eccentricity = writable(0);
export const waveScale = writable({ x: 0.1, y: 0.25 });
export const hue = writable(Math.random() * 360.0);
export const hueScale = writable(10);
