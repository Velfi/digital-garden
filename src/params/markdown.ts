import type { ParamMatcher } from '@sveltejs/kit';

// Because of the way that SvelteKit handles routing, we filter out anything that's not a markdown post since
// I like to write some posts in Svelte.
const postsAllowlist = [
  '24-days-between-jobs',
  'atalanta-and-rudras',
  'canvas-animations-in-this-garden',
  'cellular-automata',
  'diffuser',
  'flow-field-interactive-visualizer',
  'fun-with-large-language-models',
  'iching',
  'manuals',
  'neat-internet',
  'patches',
  'piano-bookmarks',
  'plotlings',
  'reaction-diffusion',
  'slime-mold',
  'technopastoral',
  'typing',
  'vector-field-visualizer',
  'wrestler-markov'
];

export const match = ((param) => {
  return postsAllowlist.includes(param);
}) satisfies ParamMatcher;
