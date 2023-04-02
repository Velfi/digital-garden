import { process } from '$lib/markdown';
import fs from 'fs';
import type { RequestHandler } from '@sveltejs/kit';

export const GET = (() => {
  const posts = fs
    .readdirSync(`src/posts`)
    .filter((fileName) => /.+\.md$/.test(fileName))
    .map((fileName) => {
      const { metadata } = process(`src/posts/${fileName}`);

      return {
        metadata,
        slug: fileName.slice(0, -3)
      };
    });

  const body = JSON.stringify(posts);

  return new Response(String(body));
}) satisfies RequestHandler;
