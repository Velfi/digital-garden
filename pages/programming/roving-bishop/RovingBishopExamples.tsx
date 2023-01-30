import styles from "./RovingBishopExamples.module.css";

const EXAMPLE_A = `╬═════════════════╬
║                 ║
║             . o ║
║      .       + .║
║     o o       o ║
║    . o S   . . E║
║   . . o + ..oo. ║
║    o .   +. ++. ║
║     .    .. .oo ║
║           .. .. ║
╬═════════════════╬`;

const EXAMPLE_B = `╬═════════════════╬
║         ...   . ║
║         ........║
║          = o.. o║
║         * =   . ║
║        S + .    ║
║        .  .     ║
║       ..E.      ║
║      ..=o.      ║
║      .+.oo.     ║
╬═════════════════╬`;

const EXAMPLE_C = `╬═════════════════╬
║                 ║
║              E  ║
║             .   ║
║          . o    ║
║        So = .   ║
║        +.* + .  ║
║       ..O = o . ║
║       oo O o .  ║
║      .ooo . .   ║
╬═════════════════╬`;

const EXAMPLE_D = `╬═════════════════╬
║    .            ║
║   . o           ║
║    + = o . E    ║
║   o . O + .     ║
║    o . S o      ║
║   . . O *       ║
║      o * .      ║
║         .       ║
║                 ║
╬═════════════════╬`;

export const RovingBishopExamples: React.FC = () => {
  return (
    <div className={styles.container}>
      <pre className={styles.example}>{EXAMPLE_A}</pre>
      <pre className={styles.example}>{EXAMPLE_B}</pre>
      <pre className={styles.example}>{EXAMPLE_C}</pre>
      <pre className={styles.example}>{EXAMPLE_D}</pre>
    </div>
  );
};
