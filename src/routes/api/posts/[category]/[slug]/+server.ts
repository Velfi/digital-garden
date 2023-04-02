import { process } from '$lib/markdown';
import type { RequestHandler } from '@sveltejs/kit';

export const GET = (({ params }) => {
  const { slug, category } = params;
  const { metadata, content } = process(`src/posts/${category}/${slug}.md`);
  const body = JSON.stringify({ metadata, content });

  return new Response(String(body));
}) satisfies RequestHandler;
