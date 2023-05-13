import { removeIndent } from './utils';
import { describe, it, expect } from 'vitest';

describe('removeIndent', () => {
  it('should remove indent', () => {
    const input = removeIndent(`
      %START%
      SAY Luigi and Daisy are talking.
      Ms. DAISY SAY "This is a test."
      Ms. DAISY SAY "You got that?"
      Ms. DAISY SAY Looks at Luigi expectantly.
          CHOICE No
          LUIGI SAY "Come again?"
          GOTO %START%

          CHOICE Yes
          LUIGI SAY "Ah, yes. Thank you."
      Ms. DAISY SAY "You're welcome."
      SAY With that, Daisy leaves.
      %END%`);
    expect(input).toBe(`
%START%
SAY Luigi and Daisy are talking.
Ms. DAISY SAY "This is a test."
Ms. DAISY SAY "You got that?"
Ms. DAISY SAY Looks at Luigi expectantly.
    CHOICE No
    LUIGI SAY "Come again?"
    GOTO %START%

    CHOICE Yes
    LUIGI SAY "Ah, yes. Thank you."
Ms. DAISY SAY "You're welcome."
SAY With that, Daisy leaves.
%END%`);
  });
});
