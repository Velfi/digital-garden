import { browser } from '$app/environment';
import { readable, readonly, writable } from 'svelte/store';

export const lightMode = 'lightMode';
export const darkMode = 'darkMode';

export const displayMode = (function createDisplayModeStore() {
  if (browser) {
    const previouslyStoredMode = localStorage.displayMode as 'lightMode' | 'darkMode';
    const displayMode = writable<'lightMode' | 'darkMode'>(previouslyStoredMode ?? darkMode);

    displayMode.subscribe((value) => (localStorage.displayMode = value));

    return {
      mode: readonly(displayMode),
      toggle: () => displayMode.update((value) => (value === lightMode ? darkMode : lightMode))
    };
  } else {
    return {
      mode: readable(darkMode),
      toggle: () => console.error("Can't toggle display mode on the server.")
    };
  }
})();
