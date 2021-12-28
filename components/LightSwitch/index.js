import { useEffect, useRef, useState } from "react";

import styles from "./styles.module.css";

const lightMode = "lightMode";
const darkMode = "darkMode";

export const LightSwitch = () => {
  const domDocument = useRef(undefined);
  const [displayMode, setDisplayMode] = useLocalStorage(
    "displayMode",
    darkMode
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      domDocument.current = window.document;
    }
  }, []);

  useEffect(() => {
    if (domDocument.current === undefined) {
      return;
    }

    if (displayMode === lightMode) {
      domDocument.current.body.classList.add("light-mode");
    } else if (displayMode === darkMode) {
      domDocument.current.body.classList.remove("light-mode");
    }
  }, [displayMode, domDocument]);

  const onClick = () => {
    if (displayMode === darkMode) {
      setDisplayMode(lightMode);
    } else if (displayMode === lightMode) {
      setDisplayMode(darkMode);
    }
  };

  let contents = displayMode === lightMode ? "🌞" : "🌚";
  let title =
    displayMode === lightMode ? "Toggle dark mode" : "Toggle light mode";

  return (
    <button onClick={onClick} className={styles.lightSwitch} title={title}>
      {contents}
    </button>
  );
};

// credit to https://usehooks.com/useLocalStorage/
function useLocalStorage(key, initialValue) {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState(() => {
    try {
      if (typeof window !== "undefined") {
        // Get from local storage by key
        const item = window.localStorage.getItem(key);
        // Parse stored json or if none return initialValue
        return item ? JSON.parse(item) : initialValue;
      }
    } catch (error) {
      // If error also return initialValue
      console.log(error);
      return initialValue;
    }
  });

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value) => {
    try {
      if (typeof window !== "undefined") {
        // Allow value to be a function so we have same API as useState
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        // Save state
        setStoredValue(valueToStore);
        // Save to local storage
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      // A more advanced implementation would handle the error case
      console.log(error);
    }
  };

  return [storedValue, setValue];
}
