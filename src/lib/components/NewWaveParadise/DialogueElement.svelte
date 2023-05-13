<script lang="ts">
  import type { SubjectClass } from './dialogueTree';

  export let subject: string;
  export let subjectClass: SubjectClass | undefined = undefined;
  export let skillCheck:
    | {
        difficulty: string;
        result?: 'Success' | 'Failure';
      }
    | undefined = undefined;
</script>

<p>
  <span class={subjectClass}>{subject.toUpperCase()}</span>
  {#if skillCheck}<span class="difficulty">[{skillCheck.difficulty}: {skillCheck.result}]</span
    >{/if}
  &ndash; <slot />
</p>

<style>
  p {
    text-indent: -1.2rem;
    padding-left: 1.2rem;
    filter: brightness(0.6);
  }

  p:last-of-type {
    filter: unset;
  }

  p:has(> span.pc) {
    color: rgba(255, 255, 255, 0.95);
  }

  .intellect {
    color: #6de0f5;
  }

  .psyche {
    color: #7b5cd9;
  }

  .physique {
    color: #ae3c5a;
  }

  .motorics {
    color: #c49f2e;
  }

  .difficulty {
    font-weight: normal;
    color: #9f9f9f;
  }
</style>
