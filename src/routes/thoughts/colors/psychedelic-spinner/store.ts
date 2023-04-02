import { writable } from 'svelte/store';

export const spinnerSpeed = writable(25);
export const steps = writable(7);
export const wobbleAmount = writable(25);
export const wobbleSpeed = writable(150);
export const lineWidth = writable(8);
export const hue = writable(Math.random() * 360.0);
export const hueScale = writable(60);
export const shouldClear = writable(false);
