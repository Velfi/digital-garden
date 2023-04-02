import { base } from '$app/paths';
import type { Post } from '$lib/post';
import type { PageLoad } from './$types';

export const load = (async ({ params, fetch }) => {
  const { slug, category } = params;
  const post: Post = await fetch(`${base}/api/posts/${category}/${slug}`).then((r) => r.json());

  return {
    post
  };
}) satisfies PageLoad;
