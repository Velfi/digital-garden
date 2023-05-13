import { nanoid } from 'nanoid';
import {
  MARKER_START,
  MARKER_DANGLING,
  MARKER_END,
  DialogueTree,
  type Dialogue,
  type Choice
} from './dialogueTree';

export function randomId() {
  return nanoid(5);
}

// class ChoiceId {
//   id: string = randomId();

//   constructor(private tree: TreeBuilder) {}

//   public addChoice() {}

//   public addDialogue() {}
// }

// class DialogueId {
//   id: string = randomId();

//   constructor(private tree: TreeBuilder) {}

//   public addChoice(
//       text: string,
//       next: string,
//       options: { retryable?: boolean; skillCheck?: SkillCheck } = {}
//     ): DialogueId {
//       const dialogue = this.tree. (id);

//       const choice: Choice = {
//         id: nanoid(),
//         text,
//         next,
//         options
//       };

//       if (Array.isArray(parent.next)) {
//         parent.next.push(choice.id);
//       } else {
//         parent.next = [choice.id];
//       }

//       this.tree.addChoice(choice);
//       return this;
//     }
//   }

//   public addDialogue() {}
// }

export class TreeBuilder {
  public dialogues = new Map<string, Dialogue>();
  public choices = new Map<string, Choice>();

  public get root(): string {
    return MARKER_START;
  }

  public get end(): string {
    return MARKER_END;
  }

  constructor(subject: string, text: string) {
    const root: Dialogue = {
      id: MARKER_START,
      text,
      subject,
      next: MARKER_DANGLING
    };

    this.dialogues.set(MARKER_START, root);
  }

  public addDialogue(subject: string, text: string): string {
    const dialogue: Dialogue = {
      id: randomId(),
      subject,
      text,
      next: MARKER_DANGLING
    };

    this.dialogues.set(dialogue.id, dialogue);
    return dialogue.id;
  }

  public continueDialogForId(dialogueId: string, subject: string, text: string): string {
    const parent = this.dialogues.get(dialogueId);
    if (!parent) {
      throw new Error(
        `Failed to continueDialogForId: no dialogue entry found with ID ${dialogueId}`
      );
    }
    parent.next = this.addDialogue(subject, text);
    return parent.next;
  }

  public addChoice(
    text: string,
    next: string
    // options: { retryable?: boolean; skillCheck?: SkillCheck } = {}
  ): string {
    const choice: Choice = {
      id: randomId(),
      text,
      next
      // options
    };
    this.choices.set(choice.id, choice);
    return choice.id;
  }

  public addChoiceForId(
    dialogueId: string,
    text: string,
    next: string
    // options: { retryable?: boolean; skillCheck?: SkillCheck } = {}
  ): string {
    const parent = this.dialogues.get(dialogueId);
    if (!parent) {
      throw new Error(`Failed to addChoiceForId: no dialogue entry found with ID ${dialogueId}`);
    }

    const choiceId = this.addChoice(text, next);

    if (Array.isArray(parent.next)) {
      parent.next.push(choiceId);
    } else {
      parent.next = [choiceId];
    }

    return choiceId;
  }

  public addDialogueMarker(dialogueId: string): void {
    const dialogue: Dialogue = {
      id: dialogueId,
      subject: '',
      text: '',
      next: MARKER_DANGLING
    };
    this.dialogues.set(dialogueId, dialogue);
  }

  public addGotoMarker(dialogueId: string, destinationId: string): void {
    const dialogue = this.dialogues.get(dialogueId);
    if (!dialogue) {
      throw new Error(`Failed to addGotoMarker: no dialogue entry found with ID ${dialogueId}`);
    }
    if (Array.isArray(dialogue.next)) {
      throw new Error(
        `Failed to addGotoMarker: dialogue entry with ID ${dialogueId} already has choices`
      );
    }
    dialogue.next = destinationId;
  }

  public build(): DialogueTree {
    return new DialogueTree(this.dialogues, this.choices);
  }
}
