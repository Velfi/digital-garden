/**
 * Opt-in perf logging: `localStorage.setItem('voxellePerf','1')` then reload.
 * Logs phase timings for mesh pack, worker completion, grid rebuild, ray GPU rebuild.
 */

function readVoxellePerfFlag(): boolean {
  try {
    const ls = globalThis.localStorage as Storage | undefined;
    if (!ls || typeof ls.getItem !== 'function') return false;
    return ls.getItem('voxellePerf') === '1';
  } catch {
    return false;
  }
}

const enabled = readVoxellePerfFlag();

export function voxellePerfEnabled(): boolean {
  return enabled;
}

export function perfNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export function perfLog(label: string, ms: number): void {
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log(`[voxelle perf] ${label}: ${ms.toFixed(2)}ms`);
}
