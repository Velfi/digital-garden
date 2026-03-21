import {
  ambientIntensity,
  sunlightIntensity,
  lightColor,
  lightAngle,
  lightElevation,
  enableShadows,
  sceneEnvironmentIntensity
} from './core';

export type LightPresetId =
  | 'sunny'
  | 'cloudy'
  | 'incandescent'
  | 'fluorescent'
  | 'moonlight'
  | 'dark';

export type LightPreset = {
  id: LightPresetId;
  /** Short label for tooltips / a11y */
  title: string;
  ambientIntensity: number;
  sunlightIntensity: number;
  lightColor: string;
  lightAngle: number;
  lightElevation: number;
  enableShadows: boolean;
  sceneEnvironmentIntensity: number;
};

export const LIGHT_PRESETS: readonly LightPreset[] = [
  {
    id: 'sunny',
    title: 'Sunny day',
    ambientIntensity: 0.45,
    sunlightIntensity: 2.3,
    lightColor: '#fff8e8',
    lightAngle: 50,
    lightElevation: 55,
    enableShadows: true,
    sceneEnvironmentIntensity: 1
  },
  {
    id: 'cloudy',
    title: 'Cloudy day',
    ambientIntensity: 1.1,
    sunlightIntensity: 0.65,
    lightColor: '#d4dce2',
    lightAngle: 55,
    lightElevation: 45,
    enableShadows: true,
    sceneEnvironmentIntensity: 0.75
  },
  {
    id: 'incandescent',
    title: 'Incandescent',
    ambientIntensity: 0.35,
    sunlightIntensity: 1.2,
    lightColor: '#ffc080',
    lightAngle: 35,
    lightElevation: 55,
    enableShadows: true,
    sceneEnvironmentIntensity: 0.55
  },
  {
    id: 'fluorescent',
    title: 'Fluorescent',
    ambientIntensity: 0.88,
    sunlightIntensity: 0.9,
    lightColor: '#e0f0ea',
    lightAngle: 35,
    lightElevation: 55,
    enableShadows: true,
    sceneEnvironmentIntensity: 0.65
  },
  {
    id: 'moonlight',
    title: 'Moonlight',
    ambientIntensity: 0.08,
    sunlightIntensity: 0.18,
    lightColor: '#8aa8d8',
    lightAngle: 110,
    lightElevation: 26,
    enableShadows: true,
    sceneEnvironmentIntensity: 0.1
  },
  {
    id: 'dark',
    title: 'Total darkness',
    ambientIntensity: 0,
    sunlightIntensity: 0,
    lightColor: '#ffffff',
    lightAngle: 45,
    lightElevation: 40,
    enableShadows: false,
    sceneEnvironmentIntensity: 0
  }
] as const;

const byId = new Map<LightPresetId, LightPreset>(LIGHT_PRESETS.map((p) => [p.id, p]));

export function applyLightPreset(id: LightPresetId): void {
  const p = byId.get(id);
  if (!p) return;
  ambientIntensity.set(p.ambientIntensity);
  sunlightIntensity.set(p.sunlightIntensity);
  lightColor.set(p.lightColor);
  lightAngle.set(p.lightAngle);
  lightElevation.set(p.lightElevation);
  enableShadows.set(p.enableShadows);
  sceneEnvironmentIntensity.set(p.sceneEnvironmentIntensity);
}
