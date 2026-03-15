import { imageDataToVoxelEntries } from './importImageLogic';

self.onmessage = (e: MessageEvent<{ type: 'process'; bitmap: ImageBitmap }>) => {
  const { bitmap } = e.data;
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    self.postMessage({ type: 'done', entries: [] });
    return;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, w, h);
  const entries = imageDataToVoxelEntries(imageData.data, w, h);
  self.postMessage({ type: 'done', entries });
};
