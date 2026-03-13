import { error } from '@sveltejs/kit';
import { get } from '@vercel/blob';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw error(400, 'Invalid model ID');
  }

  const pathname = `voxelle/${id}`;
  const result = await get(pathname, { access: 'public' });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw error(404, 'Model not found');
  }

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
};
