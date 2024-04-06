import { error, type RequestHandler } from '@sveltejs/kit';
import OpenAI from 'openai';

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

const PROMPT = `
# Game Rules

This is a phrasal template word game. It consists of one player prompting others
for a list of words to substitute for blanks in a story. Then, the completed story
is read aloud, often with humorous results.

# Instructions

1. Create a short story with many key words replaced with blanks. Each blank has a category, such as "noun", "verb", "adjective", "place", etc.
2. Blanks are delimited by [square brackets]. For example: "I like to [verb] [noun]."
3. There should be no more than 10-15 blanks per story
4. The user will request a certain kind of story. For example: "I want a [storyType] story."
5. You must then generate a story of that type with blanks replacing key words.
6. When gender is uncertain, prefer "they" to "he/she". Even better is to refer to a character by their name.
7. Write "a" and "an" as "a/an".
8. When several blanks refer to the same name or word, make sure to link them with a number.

For example:

\`\`\`
Once upon a time, in a far-off [place], lived a [adjective] [noun] named [name 1].
[Name1] loved to [verb] more than anything else in the world. One day,
[name1] decided to visit the [place] to find the most [adjective] [noun] known to [noun].
\`\`\`

9. Do not mention Mad Libs.
10. Do not prefix the story with something like "Here is a short story template:".
11. The story should be no longer than three paragraphs. Paragraphs should be short.
12. End the story with the token [end] (all lowercase). Do not print anything after the [end].

Now create the story that the user asks for.
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
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: PROMPT
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
  console.log(msg);

  const story = msg.choices[0].message.content;

  return new Response(story);
};
