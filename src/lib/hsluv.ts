import { Hsluv } from 'hsluv';

export const getRandomHsluv = (): Hsluv => {
  const color = newRgb([
    Math.floor(Math.random() * 255),
    Math.floor(Math.random() * 255),
    Math.floor(Math.random() * 255)
  ]);
  color.rgbToHsluv();

  return color;
};

export const newRgb = ([r, g, b]: number[]): Hsluv => {
  const color = new Hsluv();
  color.rgb_r = r;
  color.rgb_g = g;
  color.rgb_b = b;

  return color;
};

export const newHsluv = ([h, s, l]: number[]): Hsluv => {
  const color = new Hsluv();
  color.hsluv_h = h;
  color.hsluv_s = s;
  color.hsluv_l = l;

  return color;
};

export const hsluvToHex = ([h, s, l]: number[]): string => {
  const color = newHsluv([h, s, l]);
  color.hsluvToHex();

  return color.hex;
};
