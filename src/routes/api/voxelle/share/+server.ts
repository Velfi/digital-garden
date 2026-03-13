import { json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { nanoid } from 'nanoid';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { model } = (await request.json()) as { model?: string };
    if (typeof model !== 'string' || !model) {
      return json({ error: 'Missing model data' }, { status: 400 });
    }

    const id = nanoid(12);
    const pathname = `voxelle/${id}`;

    // Decode base64 to binary and store as gzipped BSON (same format as .voxelle files)
    const buffer = Buffer.from(model, 'base64');
    await put(pathname, buffer, {
      access: 'public',
      contentType: 'application/octet-stream'
    });

    return json({ id });
  } catch (e) {
    console.error('Voxelle share error:', e);
    return json({ error: 'Failed to store model' }, { status: 500 });
  }
};
