import { attachVoxelleFileWorker } from './voxelleFileWorker.bind';
import type { VoxelleFileFormat } from './voxelleFormatCore';

export type { VoxelleFileFormat };

attachVoxelleFileWorker(self);
