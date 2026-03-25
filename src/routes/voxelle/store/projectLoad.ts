import { writable } from 'svelte/store';

export const LARGE_PROJECT_OPEN_VOXEL_THRESHOLD = 50000;

export type ProjectOpenLoadingState = {
  active: boolean;
  message: string;
  progress: number;
};

const initialState: ProjectOpenLoadingState = {
  active: false,
  message: 'Opening project…',
  progress: 0
};

export const projectOpenLoading = writable<ProjectOpenLoadingState>({ ...initialState });

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function beginProjectOpenLoading(message = 'Opening project…'): void {
  projectOpenLoading.set({
    active: true,
    message,
    progress: 0.08
  });
}

export function updateProjectOpenLoadingProgress(progress: number, message?: string): void {
  projectOpenLoading.update((prev) => ({
    active: true,
    message: message ?? prev.message,
    progress: clamp01(Math.max(prev.progress, progress))
  }));
}

export function completeProjectOpenLoading(): void {
  projectOpenLoading.set({
    active: false,
    message: initialState.message,
    progress: 1
  });
}
