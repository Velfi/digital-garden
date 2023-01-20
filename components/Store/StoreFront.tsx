import styles from "./StoreFront.module.css";

export default function StoreFront({ children }) {
  return <div className={styles.grid}>{children}</div>;
}
