export interface PostMetadata {
  metadata: {
    title: string;
    excerpt: string;
  };
  slug: string;
}

export interface Post {
  metadata: {
    title: string;
  };
  content: string;
}
