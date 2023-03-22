import styles from "./styles.module.css";
import { SVGAttributes, useCallback, useEffect, useState } from "react";
import { Numeral } from "./Numeral";
export { AllNumerals } from "./AllNumerals";

const NUMBER_REGEX = /^\d{1,4}$/;

const randomNumber = (): string =>
  Math.floor(Math.random() * 9999 + 1).toString();

export const CistercianMonkNumerals = () => {
  const size = 120;
  const [strokeWidth, setStrokeWidth] = useState(10);
  const [strokeLinecap, setStrokeLinecap] =
    useState<SVGAttributes<unknown>["strokeLinecap"]>("round");
  // Any value they type in the input field
  const [value, setValue] = useState("1111");
  //  The value of the input field, but only if it's a valid number
  const [digit, setDigit] = useState("1111");

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const v = event.target.value;
      setValue(v);

      if (NUMBER_REGEX.test(v)) {
        setDigit(v);
      }
    },
    [setDigit]
  );

  const onClickRng = useCallback(() => {
    const v = randomNumber();
    setValue(v);
    setDigit(v);
  }, [setDigit]);

  useEffect(() => {
    onClickRng();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nazisCanSuckMyDick = (
    <p className={styles.antiNazi}>
      The one looks too much like a swastika for my tastes
    </p>
  );

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <label htmlFor="number">Enter a number between 1 and 9999:</label>
        <input
          name="number"
          type="text"
          value={value}
          onChange={handleChange}
          maxLength={4}
          size={4}
          tabIndex={0}
        />
        <button
          className={styles.rng}
          type="button"
          title="Generate a random number"
          onClick={onClickRng}
          tabIndex={0}
        >
          🎲
        </button>
        <label htmlFor="stroke-width">Stroke width:</label>
        <input
          name="stroke-width"
          type="range"
          min={1}
          max={35}
          value={strokeWidth}
          onChange={(event) => setStrokeWidth(Number(event.target.value))}
          tabIndex={0}
        />
        <label htmlFor="stroke-linecap">Stroke linecap:</label>
        <select
          name="stroke-linecap"
          onChange={(event) =>
            setStrokeLinecap(
              event.target.value as SVGAttributes<unknown>["strokeLinecap"]
            )
          }
          tabIndex={0}
        >
          <option value="round">Round</option>
          <option value="square">Square</option>
        </select>
      </div>
      {value === "1881" ? (
        nazisCanSuckMyDick
      ) : (
        <div className={styles.number}>
          <Numeral
            value={digit}
            strokeLinecap={strokeLinecap}
            strokeWidth={strokeWidth}
            height={size * 1.25}
            width={size}
          />
        </div>
      )}
    </div>
  );
};
