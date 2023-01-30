import nextMDX from '@next/mdx';
import rehypeHighlight from "rehype-highlight";
import remarkExternalLinks from "remark-external-links";
import remarkFootnote from "remark-numbered-footnote-labels";
import remarkImages from "remark-images";
import remarkReferenceLinks from "remark-reference-links";
import remarkSlug from "remark-slug";
import remarkUnwrapImages from "remark-unwrap-images";
import fauxRemarkEmbedder from '@remark-embedder/core'
import fauxOembedTransformer from '@remark-embedder/transformer-oembed'

const remarkEmbedder = fauxRemarkEmbedder.default
const oembedTransformer = fauxOembedTransformer.default

const withMDX = nextMDX({
  extension: /\.mdx?$/,
  options: {
    providerImportSource: "@mdx-js/react",
    remarkPlugins: [
      remarkExternalLinks,
      remarkFootnote,
      remarkImages,
      remarkReferenceLinks,
      remarkUnwrapImages,
      remarkSlug,
      [remarkEmbedder, { transformers: [oembedTransformer] }]
    ],
    rehypePlugins: [
      rehypeHighlight
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ["js", "jsx", "ts", "tsx", "md", "mdx"],
  transpilePackages: ['react-photo-sphere-viewer'],
}

export default withMDX(nextConfig);
