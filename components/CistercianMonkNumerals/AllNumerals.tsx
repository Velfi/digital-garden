import { Numeral } from "./Numeral";
import styles from "./styles.module.css";

const allDigits = Array.from(Array(10000).keys()).map((n) => n.toString());

export const AllNumerals = () => {
  const size = 30;

  return (
    <div className={styles.allNumerals}>
      {allDigits.map((d) => (
        <Numeral
          key={d}
          width={size}
          height={size * 1.25}
          scale={0.25}
          value={d}
          strokeWidth={10}
        />
      ))}
    </div>
  );
};
