/** Small string helpers for canvas overlay / HUD copy. */

export function formatSignedDelta(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
