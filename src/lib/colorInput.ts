const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * `#rrggbb` only — required for `<input type="color">`; never returns `""`.
 * Pair with the same expression as `defaultValue` on the input so Svelte 5 skips
 * `remove_input_defaults` during hydration (avoids Chrome warnings on color inputs).
 */
export function safeColorInputValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const t = value.trim();
  return HEX6.test(t) ? t : fallback;
}
