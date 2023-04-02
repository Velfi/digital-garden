import type { ParamMatcher } from '@sveltejs/kit';

// Because of the way that SvelteKit handles routing, we filter out anything that's not a markdown post since
// I like to write some posts in Svelte.
const postsAllowlist = [
  'fun-with-large-language-models',
  'atalanta-and-rudras',
  'belltower-fight',
  'habanera',
  'piano-bookmarks',
  'canvas-animations-in-this-garden',
  'cellular-automata',
  'diffuser',
  'flow-field-interactive-visualizer',
  'iching',
  'plotlings',
  'reaction-diffusion',
  'slime-mold',
  'vector-field-visualizer',
  'wrestler-markov',
  'manuals',
  'patches',
  '24-days-between-jobs',
  'neat-internet',
  'technopastoral',
  'typing'
];

export const match = ((param) => {
  return postsAllowlist.includes(param);
}) satisfies ParamMatcher;
