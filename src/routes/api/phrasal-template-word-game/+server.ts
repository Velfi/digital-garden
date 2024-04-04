import { error, type RequestHandler } from '@sveltejs/kit';
import OpenAI from 'openai';

const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
  throw new Error('OPENAI_API_KEY env var is required');
}

const openai = new OpenAI({ apiKey });

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

export const GET: RequestHandler = async ({ url }) => {
  const storyType = url.searchParams.get('storyType');

  if (!storyType) {
    return error(400, 'storyType query param is required');
  }

  if (isInvalidStoryType(storyType)) {
    return error(400, 'storyType is invalid, must be one of: ' + ACCEPTABLE_STORY_TYPES.join(', '));
  }
  
  const msg = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: PROMPT
      },
      {
        role: 'user',
        content: `I want a ${formatStoryType(storyType)} story`
      }
    ],
    temperature: 1.1,
    // Higher means longer stories but Vercel will time out this function if it runs longer than 10 seconds.
    max_tokens: 400,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0
  });

  // This way I can scan the logs later to see what was generated in case something fucky happens.
  console.log(msg);

  const story = msg.choices[0].message.content;

  return new Response(story);
};
