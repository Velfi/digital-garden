import Word from "../Word";
import styles from "./styles.module.css";
import { useDrop } from "react-dnd";

const CurrentWords = ({ words, onAdd, onRemove }) => {
  const onDrop = (item) => {
    onAdd(item.word);
  };

  const [collectedProps, drop] = useDrop(() => ({
    accept: ["possible-word", "current-word"],
    drop: onDrop,
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  return (
    <div ref={drop}>
      <p>Current Words</p>
      <div className={styles.words}>
        {words.length === 0 ? (
          <em>Click and drag an anagram here to begin building a phrase</em>
        ) : (
          words.map((word) => (
            <Word key={word} word={word} onRemove={onRemove} />
          ))
        )}
      </div>
    </div>
  );
};

export default CurrentWords;
