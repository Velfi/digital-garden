# A simple dialog scripting format

## Example 1

The script
```
%START%
ZELDA: "Sometimes I wonder if I spend too much time on the computer."
%END%
```

The resulting object:
```ts
const script = {
    dialogues: {
        "%START%": {
            next: "%END%",
            subject: "ZELDA",
            text: '"Sometimes I wonder if I spend too much time on the computer."'
        },
    },
    choices: {}
}
```

## Example 2

The script
```
%START%
ASHLEY: "Did it work?"
ZELDA: "Well of course it did! Do you think I'm some two-bit hack?"
ASHLEY: "Well, no; But isn't this the first such system you've written?"
%END%
```

The resulting object:
```ts
const script = {
    dialogues: {
        "%START%": { next: "YhcsL", subject: "ZELDA", text: '"Did it work?"' },
        "YhcsL": { next: "zke1i", subject: "ALSO ZELDA", text: '"Well of course it did! Do you think I\'m some two-bit hack?"' },
        "zke1i": { next: "%END%", subject: "ZELDA", text: '"Well, no; But isn\'t this the first such system you\'ve written?"' },
    },
    choices: {}
}
```

## Example 3

The script
```
%START%
JIMI HENDRIX: "Excuse me while I kiss the sky."
    YOU: Wait patiently.
JIMI HENDRIX: Jimi kisses the sky before turning to you and saying "Thank you for your patience."
%END%
```

The resulting object:
```ts
const script = {
    dialogues: {
        "%START%": { next: ["Q25vH"], subject: "JIMI HENDRIX", text: '"Excuse me while I kiss the sky."' },
        "g0tq2": { next: '%END%', subject: "JIMI HENDRIX", text: 'Jimi kisses the sky before turning to you and saying "Thank you for your patience."' },
    },
    choices: {
        "Q25vH": { text: 'Wait patiently.', next: "g0tq2" }
    }
}
```

## Example 4

The script
```
%START%
DAISY: "This is a test."
DAISY: "You got that?"
    LUIGI: "Come again?"
    GOTO %START%

    LUIGI: "Ah, yes. Thank you."
DAISY: "You're welcome."
%END%
```

The resulting object:
```ts
const script = {
    dialogues: {
        "%START%": { next: "LnFgR", subject: "DAISY", text: '"This is a test."' },
        "LnFgR": { next: ["HWUvJ", "kr6LR"], subject: "DAISY", text: '"You got that?"' },
        "QUqp5": { next: "%END%", subject: "DAISY", text: '"You\'re welcome."' },
    },
    choices: {
        "HWUvJ": { text: '"Come again?"', next: "%START%" }
        "kr6LR": { text: '"Ah, yes. Thank you."', next: "QUqp5" }
    }
}
```

## Example 4

The script
```rs
%START%
STANDARDIZED TEST: What is the capital of Spain?
    YOU: A: Barcelona
    STANDARDIZED TEST: Incorrect!

    YOU: B: Madrid
    STANDARDIZED TEST: Correct!

    YOU: C: Bilbao
    STANDARDIZED TEST: Incorrect!

    YOU: D: Seville
    STANDARDIZED TEST: Incorrect!
STANDARDIZED TEST: Thank you for taking the test.
%END%
```

The resulting object:
```ts
const script = {
    dialogues: {
        "%START%": { next: [ "nPzzG", "mpbDf", "8849k", "QCldp" ], subject: "STANDARDIZED TEST", text: 'What is the capital of Spain?' },
        "XkUup": { next: "0l2wF", subject: "STANDARDIZED TEST", text: 'Incorrect!' },
        "8JGC6": { next: "0l2wF", subject: "STANDARDIZED TEST", text: 'Correct!' },
        "JLFkM": { next: "0l2wF", subject: "STANDARDIZED TEST", text: 'Incorrect!' },
        "cVbXv": { next: "0l2wF", subject: "STANDARDIZED TEST", text: 'Incorrect!' },
        "0l2wF": { next: "%END%", subject: "STANDARDIZED TEST", text: 'Thank you for taking the test.' },
    },
    choices: {
        "nPzzG": { text: 'A: Barcelona', next: "XkUup" }
        "mpbDf": { text: 'B: Madrid', next: "8JGC6" }
        "8849k": { text: 'C: Bilbao', next: "JLFkM" }
        "QCldp": { text: 'D: Seville', next: "cVbXv" }
    }
}
```

## The Task

Given the above input and output examples, complete the code below:

```
interface Dialogue {
    id: string;
    text: string;
    subject: string;
    // When this is a string, it's a dialog ID.
    // When this is an array, it's a list of choice IDs.
    next: string | string[];
}

export interface Choice {
    id: string;
    text: string;
    next: string;
}

interface DialogueTree {
    dialogues: Map<string, Dialogue>,
    choices: Map<string, Choice>,
}

export function randomId() {
  return nanoid(5);
}

export const DIALOGUE_START = '%START%';
export const DIALOGUE_END = '%END%';
export const DIALOGUE_GOTO = '%GOTO%';
export const DIALOGUE_DANGLING = '%DANGLING%';

export class TreeBuilder {
  public dialogues = new Map<string, Dialogue>();
  public choices = new Map<string, Choice>();

  public get root(): string {
    return DIALOGUE_START;
  }

  public get end(): string {
    return DIALOGUE_END;
  }

  constructor(subject: string, text: string) {
    const root: Dialogue = {
      id: DIALOGUE_START,
      text,
      subject,
      next: DIALOGUE_DANGLING
    };

    this.dialogues.set(DIALOGUE_START, root);
  }

  public addDialogue(subject: string, text: string): string {
    const dialogue: Dialogue = {
      id: randomId(),
      subject,
      text,
      next: DIALOGUE_DANGLING
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

  public build(): DialogueTree {
    return new DialogueTree(this.dialogues, this.choices);
  }
}

export function parseScript(input: string): DialogueTree {
    // Parse the script and use the tree builder to create a dialogue tree from it.
    // <Your code here>
    // Then call the `build` method and return the result.
}
```