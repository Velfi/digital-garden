import { describe, it, expect } from 'vitest';
import { TreeBuilder } from './treeBuilder';
import { TestDialoguePlayer } from './testUtils';

const TEST_SUBJECT = 'TESTER';

describe('Dialogue Tree', () => {
  it('should build a simple dialogue tree', () => {
    const tb = new TreeBuilder(TEST_SUBJECT, `"I don't feel like talking to you"`);
    const cID = tb.addChoiceForId(tb.root, '"Very well then."', tb.end);
    const player = new TestDialoguePlayer(tb.build(), [['choose', cID]]);
    player.run();

    expect(player.log).toStrictEqual([
      `TESTER - "I don't feel like talking to you"`,
      'YOU - "Very well then."'
    ]);
  });

  it('should be possible to construct looping dialogue trees', () => {
    const tb = new TreeBuilder(TEST_SUBJECT, '"This is a test."');
    const dialogueId = tb.continueDialogForId(tb.root, TEST_SUBJECT, '"You got that?"');
    const cID1 = tb.addChoiceForId(dialogueId, '"Come again?"', tb.root);
    const cID2 = tb.addChoiceForId(dialogueId, '"Ah, yes. Thank you."', tb.end);
    const player = new TestDialoguePlayer(tb.build(), [
      'advance',
      ['choose', cID1],
      'advance',
      ['choose', cID2]
    ]);
    player.run();

    expect(player.log).toStrictEqual([
      'TESTER - "This is a test."',
      'TESTER - "You got that?"',
      'YOU - "Come again?"',
      'TESTER - "This is a test."',
      'TESTER - "You got that?"',
      'YOU - "Ah, yes. Thank you."'
    ]);
  });
});
