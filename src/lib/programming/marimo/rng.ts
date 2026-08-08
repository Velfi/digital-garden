/**
 * Seeded PRNG. The marimo needs randomness that is stable across reloads
 * (strand jitter, gravel layout, initial lumpiness) but never needs spatial
 * noise on the CPU — strand placement is a Fibonacci sphere, and everything
 * else spatial is written inline in GLSL.
 */

/** mulberry32 — small, fast, good enough, and stable across engines. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic uint32 from a string, for naming a marimo from a phrase. */
export function seedFromString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A fresh seed for a newly hatched marimo. */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 4294967296) ^ Date.now()) >>> 0;
}
