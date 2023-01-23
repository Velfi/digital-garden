import { useEffect, useRef, useState } from "react";

import CurrentWords from "./CurrentWords";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import PossibleAnagrams from "./PossibleAnagrams";
import styles from "./styles.module.css";

const Anagrammer = () => {
  const [isLoadingWasm, setIsLoadingWasm] = useState(true);
  const [anagramHasBeenStarted, setAnagramHasBeenStarted] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [currentWords, setCurrentWords] = useState([]);
  const [availableLetters, setAvailableLetters] = useState([]);
  const [anagrams, setAnagrams] = useState([]);

  const anagrammer = useRef(undefined);

  // Load our wasm asynchronously and hook it up
  useEffect(() => {
    async function loadWasm() {
      if (!isLoadingWasm) {
        return;
      }

      initialize_dictionary(anagrammer);
      setIsLoadingWasm(false);
    }
    loadWasm();
  }, [isLoadingWasm, setIsLoadingWasm, anagrammer]);

  const onSubmitOriginalTextForm = (event) => {
    event.preventDefault();
    anagrammer.current.new_anagram(originalText);
    // Sync component state with the wasm side of things
    syncStateWithWasm();
    // Remember that we've started creating an anagram
    setAnagramHasBeenStarted(true);
  };

  const onAdd = (word) => {
    anagrammer.current.add_word(word);
    syncStateWithWasm();
  };

  const onRemove = (word) => {
    anagrammer.current.remove_word(word);
    syncStateWithWasm();
  };

  const syncStateWithWasm = () => {
    setCurrentWords(anagrammer.current.get_anagram_current_words());
    setAnagrams(anagrammer.current.get_anagrams());
    setAvailableLetters(anagrammer.current.get_available_letters());
  };

  const onChangeOriginalText = (event) => {
    setOriginalText(event.target.value);
  };

  if (isLoadingWasm) {
    return <p>Anagrammer is loading, please be patient...</p>;
  } else {
    return (
      <>
        <form onSubmit={onSubmitOriginalTextForm}>
          <input
            type="text"
            name="originalText"
            value={originalText}
            onChange={onChangeOriginalText}
          />
          <button disabled={originalText == ""}>Submit</button>
        </form>

        {anagramHasBeenStarted ? (
          <DndProvider backend={HTML5Backend}>
            <CurrentWords
              words={currentWords}
              onAdd={onAdd}
              onRemove={onRemove}
            />
            <div>
              <p>Remaining Letters</p>
              {availableLetters.map((letter, index) => (
                <span
                  className={styles.remainingLetters}
                  key={`${letter}${index}`}
                >
                  {letter}
                </span>
              ))}
            </div>

            <PossibleAnagrams anagrams={anagrams} />
          </DndProvider>
        ) : (
          <p>Submit some text to get started</p>
        )}
      </>
    );
  }
};

export default Anagrammer;

const initialize_dictionary = async (mutableRefObject) => {
  try {
    let anagrammer_lib = await import("./lib/anagrammer_lib");
    console.log("Loaded wasm successfully");

    let dictionary_file_path = `/text/${encodeURIComponent(
      "Collins Scrabble Words (2019).txt"
    )}`;
    let dictionary = await (await fetch(dictionary_file_path)).text();
    console.log(
      `Successfully fetched dictionary file '${dictionary.slice(
        0,
        29
      )}', loading into wasm...`
    );

    anagrammer_lib.initialize_dictionary(dictionary);
    mutableRefObject.current = anagrammer_lib;
  } catch (err) {
    console.error("failed to initialize anagram dictionary with error:", err);
  }
};
