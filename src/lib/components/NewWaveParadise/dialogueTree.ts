export type SubjectClass = 'intellect' | 'psyche' | 'physique' | 'motorics' | 'pc';

export interface Dialogue {
  id: string;
  text: string;
  subject?: string;
  subjectClass?: SubjectClass;
  // When this is a string, it's a reference to a dialogue entry. When it's an array, it's a list of
  // choice IDs.
  next: string | string[];
}

export function formatDialogue(dialogue: Dialogue): string {
  return `${dialogue.subject} - ${dialogue.text}`;
}

export interface SkillCheck {
  difficulty: string;
  skill: string;
  failNext: string;
}

export interface Choice {
  id: string;
  text: string;
  next: string;
  // options: {
  //   retryable?: boolean;
  //   skillCheck?: SkillCheck;
  // };
}

export function formatChoice(choice: Choice): string {
  return `YOU - ${choice.text}`;
}

export const MARKER_START = '%START%';
export const MARKER_END = '%END%';
export const MARKER_DANGLING = '%DANGLING%';
export const COMMAND_GOTO = 'GOTO';
export const COMMAND_CHOICE = 'CHOICE';
export const COMMAND_SAY = 'SAY';

export class DialogueTree {
  constructor(private dialogues: Map<string, Dialogue>, private choices: Map<string, Choice>) {}

  public getRoot(): Dialogue | undefined {
    return this.dialogues.get(MARKER_START);
  }

  public getDialogueById(id: string): Dialogue | undefined {
    return this.dialogues.get(id);
  }

  public getChoiceById(id: string): Choice | undefined {
    return this.choices.get(id);
  }
}

export class DialoguePlayer {
  protected dialogueId: string = MARKER_START;
  constructor(protected tree: DialogueTree) {}

  public advance() {
    const dialogue = this.getDialogue();
    if (!dialogue) {
      throw new Error(
        `Failed to advance dialogue: no dialogue entry found with ID ${this.dialogueId}`
      );
    }

    if (Array.isArray(dialogue.next)) {
      throw new Error(
        `Failed to advance dialogue: dialogue entry ${dialogue.id} has multiple choices`
      );
    }

    this.dialogueId = dialogue.next;
  }

  public choose(choiceId: string) {
    const dialogue = this.getDialogue();
    if (!dialogue) {
      throw new Error(
        `Failed to choose dialogue: no dialogue entry found with ID ${this.dialogueId}`
      );
    }

    if (!Array.isArray(dialogue.next)) {
      throw new Error(`Failed to choose dialogue: dialogue entry ${dialogue.id} has no choices`);
    }

    const choice = this.tree.getChoiceById(choiceId);
    if (!choice) {
      throw new Error(`Failed to choose dialogue: no choice found with ID ${choiceId}`);
    }

    if (!dialogue.next.includes(choiceId)) {
      throw new Error(
        `Failed to choose dialogue: dialogue entry ${dialogue.id} does not have choice ${choiceId}`
      );
    }

    this.dialogueId = choice.next;
  }

  public hasReachedItsEnd(): boolean {
    return this.dialogueId === MARKER_END;
  }

  public getDialogue(): Dialogue | undefined {
    // console.log('getDialogue', this.dialogueId, this.tree);
    return this.tree.getDialogueById(this.dialogueId);
  }

  public getChoices(): Choice[] {
    const dialogue = this.getDialogue();
    if (!dialogue || !Array.isArray(dialogue.next)) {
      return [];
    }

    return dialogue.next
      .map((id) => this.tree.getChoiceById(id))
      .filter((c) => c !== undefined) as Choice[];
  }

  public reset() {
    this.dialogueId = MARKER_START;
  }
}
