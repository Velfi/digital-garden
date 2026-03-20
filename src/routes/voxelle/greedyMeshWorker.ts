/**
 * Web Worker for greedy mesh computation.
 * Receives voxel data, runs processGreedyMeshMessage, returns raw typed arrays via Transferable.
 */
import { attachGreedyMeshWorker } from './greedyMeshWorker.bind';
import type { GreedyMeshWorkerInput, GreedyMeshWorkerOutput } from './greedyMeshWorkerLogic';

export type { GreedyMeshWorkerInput, GreedyMeshWorkerOutput };

attachGreedyMeshWorker(self);
