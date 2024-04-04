import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources';
import { error, type RequestHandler } from '@sveltejs/kit';

const apiKey = process.env['ANTHROPIC_API_KEY'];
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY env var is required');
}

const anthropic = new Anthropic({ apiKey });

const ACCEPTABLE_STORY_TYPES = [
  'ai',
  'anime',
  'comedy',
  'current-events',
  'fantasy',
  'horror',
  'mystery',
  'romance',
  'sci-fi',
  'true-crime'
];

function isInvalidStoryType(storyType: string) {
  return !ACCEPTABLE_STORY_TYPES.includes(storyType);
}

function formatStoryType(storyType: string) {
  switch (storyType) {
    case 'current-events':
      return 'current events';
    case 'sci-fi':
      return 'science fiction';
    case 'true-crime':
      return 'true crime';
    default:
      return storyType;
  }
}

const PROMPT = `You are an AI responsible for generating a phrasal template word game.
These games consist of one player prompting others for a list of words to substitute for blanks in a story.
Then, the completed story is read aloud, often with humorous results.

Create a short story with many key words replaced with blanks.
Beneath each blank is specified a category, such as "noun", "verb", adjective", "place", etc.
There must be **no more than 10-15 blanks**. Blanks must be delimited by [square brackets].

Along with the user prompt below, create one such short story. Do not mention Mad Libs.
Do not prefix the story with something like "Here is a short story template about current events:".
`;

function newStoryRequest(storyType: string): MessageParam {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `I want a ${formatStoryType(storyType)} story`
      }
    ]
  };
}

export const GET: RequestHandler = async ({ url }) => {
  const storyType = url.searchParams.get('storyType');

  if (!storyType) {
    return error(400, 'storyType query param is required');
  }

  if (isInvalidStoryType(storyType)) {
    return error(400, 'storyType is invalid, must be one of: ' + ACCEPTABLE_STORY_TYPES.join(', '));
  }

  const msg = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 500,
    temperature: 0.2,
    system: PROMPT,
    stream: false,
    messages: [newStoryRequest(storyType)]
  });

  // This way I can scan the logs later to see what was generated in case something fucky happens.
  console.log(msg);

  const story = msg.content[0].text;

  return new Response(story);
};
