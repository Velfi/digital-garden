export interface PostMetadata {
  metadata: {
    title: string;
    description: string;
    keywords: string;
    excerpt: string;
  };
  slug: string;
}

export interface Post {
  metadata: {
    title: string;
    description: string;
    keywords: string;
  };
  content: string;
}
