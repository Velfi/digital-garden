// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface Platform {}
  }
}

declare module 'svelte/elements' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mirrors Svelte's generic HTMLAttributes
  export interface HTMLAttributes<T> {
    anchor?: string;
  }
}

export {};
