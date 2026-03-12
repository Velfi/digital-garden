import { error, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
  const slug = params.slug;
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    throw error(400, 'Invalid palette slug');
  }

  const res = await fetch(`https://lospec.com/palette-list/${slug}.json`);
  if (!res.ok) {
    if (res.status === 404) {
      throw error(404, 'Palette not found');
    }
    throw error(502, 'Failed to fetch palette from Lospec');
  }

  const data = await res.json();
  if (data.error) {
    throw error(404, 'Palette not found');
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};
