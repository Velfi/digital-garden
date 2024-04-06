import { error, type RequestHandler } from '@sveltejs/kit';
import OpenAI from 'openai';

const cannedStoryMode = false;
const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
  throw new Error('OPENAI_API_KEY env var is required');
}

const openai = new OpenAI({ apiKey });

const ACCEPTABLE_STORY_TYPES = [
  'adventure',
  'ai',
  'anime',
  'comedy',
  'current-events',
  'esoteric',
  'fantasy',
  'heist',
  'historical',
  'horror',
  'mystery',
  'rhyming',
  'romance',
  'sci-fi',
  'sports',
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
      if (
        storyType.startsWith('a') ||
        storyType.startsWith('e') ||
        storyType.startsWith('i') ||
        storyType.startsWith('o') ||
        storyType.startsWith('u')
      ) {
        return `an ${storyType}`;
      } else {
        return `a ${storyType}`;
      }
  }
}

let prompt: string | undefined;

export const GET: RequestHandler = async ({ url, fetch }) => {
  if (cannedStoryMode) {
    const cannedStory = await fetch('/text/canned-story-esoteric.txt').then((response) =>
      response.text()
    );
    return new Response(cannedStory);
  }

  // This convoluted way of fetching the prompt is a way to avoid packing too much text into the bundle files.
  // The Vercel build process doesn't like when it uses too much memory.
  if (!prompt) {
    prompt = await fetch('/text/phrasal-template-word-game-prompt.txt').then((response) =>
      response.text()
    );

    if (!prompt) {
      return error(500, 'Failed to fetch prompt, this is a bug.');
    }
  }

  const storyType = url.searchParams.get('storyType');

  if (!storyType) {
    return error(400, 'storyType query param is required');
  }

  if (isInvalidStoryType(storyType)) {
    return error(400, 'storyType is invalid, must be one of: ' + ACCEPTABLE_STORY_TYPES.join(', '));
  }

  const msg = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: prompt
      },
      {
        role: 'user',
        content: `I want ${formatStoryType(storyType)} story`
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
  console.log('msg', msg);

  let story = msg.choices[0].message.content?.trim();
  if (story == null) {
    return error(500, "The server didn't respond with a story. Please try again later.");
  }

  // Trim off an "[end]" if the story string ends with one before returning it.
  while (story.endsWith('[end]')) {
    story = story.slice(0, -5);
  }

  console.log('story', story);

  return new Response(story);
};
