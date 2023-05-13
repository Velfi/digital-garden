import {
  MARKER_START,
  MARKER_END,
  DialoguePlayer
} from '$lib/components/NewWaveParadise/dialogueTree';
import { TreeBuilder } from '$lib/components/NewWaveParadise/treeBuilder';

const SUBJECT = {
  you: 'You',
  zelda: 'Zelda'
};

const tb = new TreeBuilder(
  "Have you ever played Disco Elysium? It's an isometric RPG.",
  SUBJECT.zelda
);

export const dialoguePlayer = new DialoguePlayer(tb.build());

const script = [
  ['dialogue', SUBJECT.zelda, "Have you ever played Disco Elysium? It's an isometric RPG."],
  [
    'choices',
    [
      [
        'choice',
        "No, I haven't played it.",
        [
          'dialogue',
          SUBJECT.zelda,
          "It's a wonderful game. I'd certainly recommend it. At the very least, you should consider watching a Let's Play of it."
        ]
      ],
      [
        'choice',
        'I prefer to spend my time doing things other than gaming.',
        [
          'dialogue',
          SUBJECT.zelda,
          "Ah, well then I suppose you won't be interested in my opinion of it then.",
          tb.end
        ]
      ],
      [
        'choice',
        "Yes, I've played it. I may have even enjoyed it.",
        ['dialogue', SUBJECT.zelda, 'Ah! Then you probably recognize this UI from the game']
      ]
    ]
  ],
  [
    'dialogue',
    SUBJECT.zelda,
    'I wrote this dialogue system to work similar to the one in the game.'
  ]
];
