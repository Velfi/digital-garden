import { error } from '@sveltejs/kit';
import { get } from '@vercel/blob';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw error(400, 'Invalid badge ID');
  }

  const pathname = `badger/${id}`;
  const result = await get(pathname, { access: 'public' });

  if (!result || result.statusCode !== 200 || !result.stream) {
    throw error(404, 'Badge not found');
  }

  return new Response(result.stream, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
};
