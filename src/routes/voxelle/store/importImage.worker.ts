self.onmessage = (e: MessageEvent<{ type: 'process'; bitmap: ImageBitmap }>) => {
  const { bitmap } = e.data;
  const w = bitmap.width;
  const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    self.postMessage({ type: 'done', entries: [] as [number, number, number][] });
    return;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, w, h);

  const entries: [number, number, number][] = [];
  const ox = Math.floor(w / 2);
  const oz = Math.floor(h / 2);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const a = data.data[i + 3]!;
      if (a < 128) continue;
      const r = data.data[i]!;
      const g = data.data[i + 1]!;
      const b = data.data[i + 2]!;
      const col = ((r << 16) | (g << 8) | b) >>> 0;
      entries.push([px - ox, py - oz, col]);
    }
  }
  self.postMessage({ type: 'done', entries });
};
