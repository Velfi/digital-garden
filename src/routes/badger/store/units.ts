import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type DisplayUnit = 'mm' | 'in';

const UNIT_STORAGE_KEY = 'badger-display-unit';

function loadInitial(): DisplayUnit {
  if (!browser) return 'mm';
  try {
    const v = localStorage.getItem(UNIT_STORAGE_KEY);
    if (v === 'mm' || v === 'in') return v;
  } catch {
    /* ignore */
  }
  return 'mm';
}

export const displayUnit = writable<DisplayUnit>(loadInitial());

if (browser) {
  displayUnit.subscribe((u) => {
    try {
      localStorage.setItem(UNIT_STORAGE_KEY, u);
    } catch {
      /* ignore */
    }
  });
}

const SNAP_STORAGE_KEY = 'badger-snap-enabled';

function loadSnapInitial(): boolean {
  if (!browser) return true;
  try {
    const v = localStorage.getItem(SNAP_STORAGE_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

export const snapEnabled = writable<boolean>(loadSnapInitial());

if (browser) {
  snapEnabled.subscribe((s) => {
    try {
      localStorage.setItem(SNAP_STORAGE_KEY, s ? '1' : '0');
    } catch {
      /* ignore */
    }
  });
}

const MM_PER_INCH = 25.4;

export function mmToDisplay(mm: number, unit: DisplayUnit): number {
  return unit === 'mm' ? mm : mm / MM_PER_INCH;
}

export function displayToMm(value: number, unit: DisplayUnit): number {
  return unit === 'mm' ? value : value * MM_PER_INCH;
}

export function unitLabel(unit: DisplayUnit): string {
  return unit === 'mm' ? 'mm' : 'in';
}

// How many decimal places to show when rendering a value in the given unit.
// mm values are whole-ish; inches need more precision to stay useful.
export function unitPrecision(unit: DisplayUnit): number {
  return unit === 'mm' ? 2 : 3;
}

export function formatInUnit(mm: number, unit: DisplayUnit): string {
  const v = mmToDisplay(mm, unit);
  return v.toFixed(unitPrecision(unit));
}

// Step sizes for range inputs, expressed in the display unit. Picked so that
// users can nudge by visually useful amounts in either system.
export function displayStep(mmStep: number, unit: DisplayUnit): number {
  if (unit === 'mm') return mmStep;
  // Round to a reasonable inch step (e.g. 0.5mm ~ 0.02", 0.1mm ~ 0.005").
  const inchStep = mmStep / MM_PER_INCH;
  if (inchStep >= 0.01) return Math.round(inchStep * 1000) / 1000;
  return Math.round(inchStep * 10000) / 10000;
}
