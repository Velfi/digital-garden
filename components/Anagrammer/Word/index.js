import React from "react";
import styles from "./styles.module.css";
import { useDrag } from "react-dnd";

// `onRemove` is only set for words in the "Current Words" area.
// We can use that to make some assumptions.
const Word = ({ isDragging, word, onRemove }) => {
  const isACurrentWord = onRemove != undefined;
  const typeOfWord = isACurrentWord ? "possible-word" : "current-word";
  const [{ opacity }, dragRef] = useDrag(
    () => ({
      type: typeOfWord,
      item: { word },
      collect: (monitor) => ({
        opacity: monitor.isDragging() ? 0.5 : 1,
      }),
    }),
    []
  );

  return (
    <div ref={dragRef} style={{ opacity }} className={styles.word}>
      {word}

      {isACurrentWord && (
        <button
          className={styles.buttonRemoveWord}
          onClick={() => onRemove(word)}
        >
          X
        </button>
      )}
    </div>
  );
};

export default Word;
