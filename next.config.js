const remarkExternalLinks = require("remark-external-links");
const remarkFootnote = require("remark-numbered-footnote-labels");
const remarkImages = require("remark-images");
const remarkReferencLinks = require("remark-reference-links");
const remarkSlug = require("remark-slug");
const remarkUnwrapImages = require("remark-unwrap-images");

const withMDX = require("@next/mdx")({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      remarkExternalLinks,
      remarkFootnote,
      remarkImages,
      remarkReferencLinks,
      remarkUnwrapImages,
      remarkSlug,
    ],
  },
});
module.exports = withMDX({
  pageExtensions: ["js", "jsx", "mdx", "md"],
});
