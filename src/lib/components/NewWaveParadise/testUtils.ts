import {
  MARKER_DANGLING,
  DialoguePlayer,
  DialogueTree,
  formatChoice,
  formatDialogue
} from './dialogueTree';

export type TestLine = 'advance' | ['choose', string];

export class TestDialoguePlayer extends DialoguePlayer {
  public log: string[] = [];

  constructor(tree: DialogueTree, private script: TestLine[]) {
    super(tree);
  }

  public advance() {
    if (this.hasReachedItsEnd()) {
      throw new Error("Can't advance: Dialogue has reached its end");
    }
    super.advance();

    if (this.hasReachedItsEnd()) {
      return;
    }

    // console.log('Zelda:', this.getDialogue()?.text || '');

    this.updateLog();
  }

  public choose(choiceId: string) {
    if (this.hasReachedItsEnd()) {
      throw new Error("Can't choose: Dialogue has reached its end");
    }

    const choice = this.getChoices().find((c) => c.id === choiceId);
    if (choice) {
      this.log.push(formatChoice(choice));
    } else {
      throw new Error(
        `Failed to choose: No choice found for choice ID ${choiceId}. This is probably because the dialogue tree is malformed.`
      );
    }

    super.choose(choiceId);
    if (!this.hasReachedItsEnd()) {
      this.updateLog();
    }
  }

  public run() {
    this.updateLog();

    for (const line of this.script) {
      if (line === 'advance') {
        this.advance();
      } else {
        this.choose(line[1]);
      }
    }
  }

  private updateLog() {
    const dialogue = this.getDialogue();
    if (dialogue) {
      this.log.push(formatDialogue(dialogue));
    } else if (this.dialogueId === MARKER_DANGLING) {
      throw new Error(
        `Failed to advance: Dialogue has reached a dangling node. This is probably because the dialogue tree is incomplete.\nTEST LOG:\n${this.log}`
      );
    } else {
      console.log('updateLog', this.log, this.dialogueId, this.tree);
      throw new Error(
        `Failed to choose: No dialogue found for dialogue ID ${this.dialogueId}. This is probably because the dialogue tree is malformed.`
      );
    }
  }

  public getTree(): DialogueTree {
    return this.tree;
  }
}
