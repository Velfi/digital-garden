/**
 * Web Worker for voxel mesh computation.
 * Supports greedy mesh, marching cubes, and dual contouring output.
 */
import { attachVoxelMeshWorker } from './voxelMeshWorker.bind';
import type { VoxelMeshWorkerInput, VoxelMeshWorkerOutput } from './voxelMeshWorkerLogic';

export type { VoxelMeshWorkerInput, VoxelMeshWorkerOutput };

attachVoxelMeshWorker(self);
