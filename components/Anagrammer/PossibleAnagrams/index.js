import Word from "../Word";
import styles from "./styles.module.css";

const PossibleAnagrams = ({ anagrams }) => {
  return (
    <div>
      <p>Possible Anagrams</p>
      {anagrams.length === 0 ? (
        <em>No more anagrams left</em>
      ) : (
        <div className={styles.anagrams}>
          {anagrams.map((word) => (
            <Word key={word} word={word} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PossibleAnagrams;
