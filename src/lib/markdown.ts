import frontmatter from 'remark-frontmatter';
import gfm from 'remark-gfm';
import parse from 'remark-parse';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import { readSync } from 'to-vfile';
import yaml from 'js-yaml';
import { unified } from 'unified';

const parser = unified().use(parse).use(gfm).use(frontmatter, ['yaml']);

const runner = unified()
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeHighlight)
  .use(rehypeRaw)
  .use(rehypeSanitize, {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), 'br'],
    attributes: {
      ...defaultSchema.attributes,
      p: [...(defaultSchema.attributes?.p || []), 'className'],
      code: [
        ...(defaultSchema.attributes?.code || []),
        'className',
        // List of all allowed languages:
        'language-js',
        'language-css',
        'language-md',
        'language-rust'
      ],
      span: [
        ...(defaultSchema.attributes?.span || []),
        // List of all allowed tokens:
        [
          'className',
          'hljs-addition',
          'hljs-attr',
          'hljs-attribute',
          'hljs-built_in',
          'hljs-bullet',
          'hljs-char',
          'hljs-code',
          'hljs-comment',
          'hljs-deletion',
          'hljs-doctag',
          'hljs-emphasis',
          'hljs-formula',
          'hljs-keyword',
          'hljs-link',
          'hljs-literal',
          'hljs-meta',
          'hljs-name',
          'hljs-number',
          'hljs-operator',
          'hljs-params',
          'hljs-property',
          'hljs-punctuation',
          'hljs-quote',
          'hljs-regexp',
          'hljs-section',
          'hljs-selector-attr',
          'hljs-selector-class',
          'hljs-selector-id',
          'hljs-selector-pseudo',
          'hljs-selector-tag',
          'hljs-string',
          'hljs-strong',
          'hljs-subst',
          'hljs-symbol',
          'hljs-tag',
          'hljs-template-tag',
          'hljs-template-variable',
          'hljs-title',
          'hljs-type',
          'hljs-variable'
        ]
      ],
      div: [...(defaultSchema.attributes?.div || [], 'class')]
    }
  })
  .use(rehypeSlug)
  .use(rehypeStringify);

export function process(filename: string) {
  const tree = parser.parse(readSync(filename));
  let metadata = null;
  if (tree.children.length > 0 && tree.children[0].type == 'yaml') {
    metadata = yaml.load(tree.children[0].value);
    tree.children = tree.children.slice(1, tree.children.length);
  }
  let content = runner.stringify(runner.runSync(tree));

  if (!metadata) {
    metadata = {
      title: 'Error!',
      description: 'Missing Frontmatter! Expected a title!'
    };
    content = 'Missing Frontmatter! Expected a title!';
  }

  if (!content) {
    content = 'Missing Content!';
  }

  return { metadata, content };
}
