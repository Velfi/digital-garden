import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
  const { slug, category } = params;
  let title;
  let keywords;
  let description;
  let content;

  if (category) {
    const post = await import(`../../../posts/${category}/${slug}.md`);
    title = post.metadata.title;
    keywords = post.metadata.keywords;
    description = post.metadata.description;
    content = post.default;
  } else {
    const post = await import(`../../../posts/${slug}.md`);
    title = post.metadata.title;
    keywords = post.metadata.keywords;
    description = post.metadata.description;
    content = post.default;
  }

  return {
    content,
    title,
    keywords,
    description
  };
}) satisfies PageLoad;
