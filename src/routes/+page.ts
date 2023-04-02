import { base } from '$app/paths';
import type { PageLoad } from './$types';

export const load = (async ({ fetch }) => {
  const posts = await fetch(`${base}/api/posts`).then((r) => r.json());

  return {
    posts
  };
}) satisfies PageLoad;
