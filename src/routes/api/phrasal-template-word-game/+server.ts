import { error, type RequestHandler } from '@sveltejs/kit';
import OpenAI from 'openai';

const cannedStoryMode = true;
const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
  throw new Error('OPENAI_API_KEY env var is required');
}

const openai = new OpenAI({ apiKey });

const cannedStory = `
Once upon a time in a/an [adjective 1] land, far beyond the reach of the average [noun 1], there was a/an [adjective 2] tower that soared into the clouds. Within this tower, a/an [noun 2] named [name 1] spent their days and nights studying the [adjective 3] arts of [noun 3]. [Name 1] had a/an [adjective 4] companion, a/an [noun 4] named [name 2] that could [verb 1] in ways no other creature of its kind could.

One fateful evening, [name 1] discovered a/an [adjective 5] [noun 5] hidden in the depths of an ancient [noun 6]. This [noun 5] was said to hold the power to [verb 2] the very fabric of [noun 7]. Knowing the dangers, [name 1] and [name 2] embarked on a quest to the [place], where the [noun 8] of [noun 9] could reveal the [noun 5]'s true purpose. Along their journey, they encountered a/an [adjective 6] [noun 10] who promised to [verb 3] them, but only if they could solve the [adjective 7] riddle of the [noun 11].

With their minds as sharp as a/an [noun 12]'s edge, [name 1] and [name 2] unraveled the mysteries before them, only to learn that the true power of the [noun 5] was not to [verb 2], but to [verb 4] the [noun 7] in ways they had never imagined. In the end, the [adjective 1] land was forever changed, but so too were our heroes, who returned to the tower, wiser.[end]
`;

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
3. There should be a few blanks per story. This is very important. Too many blanks will make the story too long.
4. The user will request a certain kind of story. For example: "I want a [storyType] story."
5. You must then generate a story of that type with blanks replacing key words.
6. When gender is uncertain, prefer "they" to "he/she". Even better is to refer to a character by their name.
7. Write "a" and "an" as "a/an".
8. When several blanks refer to the same person's name, make sure to link them with a number.

For example:

\`\`\`
Once upon a time, in a far-off [place], lived a [adjective] [noun] named [name 1].
[Name 1] loved to [verb] more than anything else in the world. One day,
[name 1] decided to visit the [place] to find the most [adjective] [noun] known to [noun].
\`\`\`

9. Do not mention Mad Libs.
10. Do not prefix the story with something like "Here is a short story template:".
11. The story should be no longer than three paragraphs. Paragraphs should be short.
12. End the story with the token [end] (all lowercase). Do not print anything after the [end].

Now create the story that the user asks for.
`;

export const GET: RequestHandler = async ({ url }) => {
  if (cannedStoryMode) {
    return new Response(cannedStory);
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
