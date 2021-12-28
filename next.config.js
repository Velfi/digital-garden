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
  webpack(config, options) {
    // TODO figure out how to fix broken wasm loading
    config.output.webassemblyModuleFilename = "static/wasm/[modulehash].wasm";
    config.experiments = { asyncWebAssembly: true };
    return config;
  },
});
module.exports = withMDX({
  pageExtensions: ["js", "jsx", "mdx", "md"],
});
